import { useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { computeSimilarityTransform, pixelToWorld, type SitePlanCalibration } from "../utils/sitePlanStorage";

interface SitePlanPlaneProps {
  calibration: SitePlanCalibration;
  onPositionChange: (x: number, z: number) => void;
  // 場景已整個搬移到以場地中心為原點渲染(見 Scene.tsx),校準資料/manualPosition
  // 仍是真實世界絕對座標,這裡收到偏移量後在渲染與滑鼠回拋座標時做加減轉換。
  origin: { x: number; z: number };
}

export function SitePlanPlane({ calibration, onPositionChange, origin }: SitePlanPlaneProps) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<{ x: number; z: number } | null>(null);
  const { camera, gl, controls } = useThree();

  const groundPlane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 1, 0), -calibration.groundElevation),
    [calibration.groundElevation]
  );
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(calibration.imageDataUrl, (loaded) => {
      if (!cancelled) setTexture(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [calibration.imageDataUrl]);

  useEffect(() => {
    if (!dragging) return;

    // 用射線對地面高程那個數學平面求交點,不依賴滑鼠是否還停留在圖片網格範圍內,
    // 所以就算拖曳速度快、滑鼠暫時移出圖片本身的範圍,拖曳仍然能持續跟著移動
    function pointerToGroundPoint(clientX: number, clientY: number): THREE.Vector3 | null {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      const target = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, target)) return null;
      // 場景是以場地中心為原點渲染,射線交點是局部座標,轉回真實世界絕對座標再回拋出去,
      // 這樣 manualPosition 存的仍然是跟校準資料一致的絕對座標。
      // Three.js 是右手座標系,X=東、Y=上,Z 軸幾何上代表南;局部 z = origin.z(北)-
      // 真實北座標,所以反推真實北座標要用 origin.z - target.z,不是 target.z + origin.z。
      target.x += origin.x;
      target.z = origin.z - target.z;
      return target;
    }

    function handlePointerMove(e: PointerEvent) {
      const point = pointerToGroundPoint(e.clientX, e.clientY);
      if (point) setDragPosition({ x: point.x, z: point.z });
    }

    function handlePointerUp(e: PointerEvent) {
      const point = pointerToGroundPoint(e.clientX, e.clientY);
      setDragging(false);
      if (controls) (controls as unknown as { enabled: boolean }).enabled = true;
      gl.domElement.style.cursor = "auto";
      if (point) {
        onPositionChange(point.x, point.z);
      }
      setDragPosition(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      // 確保就算元件在拖曳中被卸載(例如拖曳到一半時按下「清除」),
      // 鏡頭控制與游標樣式仍會被還原,不會卡在停用狀態
      if (controls) (controls as unknown as { enabled: boolean }).enabled = true;
      gl.domElement.style.cursor = "auto";
    };
  }, [dragging, camera, gl, raycaster, groundPlane, controls, onPositionChange, origin.x, origin.z]);

  if (!texture) return null;

  const transform = computeSimilarityTransform(calibration.pointA, calibration.pointB);
  const width = calibration.imageWidth * transform.scale;
  const height = calibration.imageHeight * transform.scale;
  const calibratedCenter = pixelToWorld(
    { px: calibration.imageWidth / 2, py: calibration.imageHeight / 2 },
    transform
  );
  // 這幾個來源(拖曳中的暫存點/已存的手動位置/校準推算出的中心點)全部都是真實世界絕對座標,
  // 只有實際傳給 <group> 的 position 才減掉場地中心偏移量,渲染在局部座標系裡。
  const centerX = dragPosition?.x ?? calibration.manualPosition?.x ?? calibratedCenter.x;
  const centerZ = dragPosition?.z ?? calibration.manualPosition?.z ?? calibratedCenter.y;

  return (
    <group
      // Three.js 是右手座標系,X=東、Y=上,Z 軸幾何上代表南——這裡的 z 要用
      // 「origin.z(北)- centerZ(北)」換算,不是「centerZ - origin.z」,才會跟鑽孔柱子
      // (Scene.tsx 的 localBorehole)用同一套南北方向,兩者才會對齊。
      position={[centerX - origin.x, calibration.groundElevation, origin.z - centerZ]}
      // mesh 用 -π/2(正面朝上)時,平面局部 XY 恰好等於「東/北」座標系,
      // 群組旋轉要用 +rotation 才是把圖片逆時針轉到校準方位;兩個符號必須成對。
      // 之前是 [+π/2] 搭 [-rotation]:從上方看到的是背面,整張圖變成南北鏡像,
      // 圖上文字反過來、建物南北顛倒(位置校準仍對,所以一直沒被發現)。
      rotation={[0, transform.rotation, 0]}
    >
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (calibration.locked) return;
          if (!controls) return;
          (controls as unknown as { enabled: boolean }).enabled = false;
          setDragging(true);
          gl.domElement.style.cursor = "grabbing";
        }}
        onPointerOver={() => {
          if (calibration.locked) return;
          if (!dragging) gl.domElement.style.cursor = "grab";
        }}
        onPointerOut={() => {
          if (!dragging) gl.domElement.style.cursor = "auto";
        }}
      >
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} transparent opacity={0.45} />
      </mesh>
    </group>
  );
}
