import { useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { QuickInsertPlacement } from "../utils/sitePlanQuickInsert";

interface SitePlanPlacementProps {
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  /** 真實高程(EL 欄值),預覽平面貼在這個高度 */
  elevation: number;
  /** 初始圖寬(m):鑽孔分布外接矩形寬度,下限 10(Scene 算好傳入) */
  initialWidthMeters: number;
  /** 場景局部座標原點(場地中心),與 SitePlanPlane 同一套轉換 */
  origin: { x: number; z: number };
  onPlace: (p: QuickInsertPlacement) => void;
}

// 快速插入的放置模式:半透明圖片跟著滑鼠在地面(y=elevation)上移動,
// 左鍵點擊呼叫 onPlace(真實世界座標);Esc 由 App 層處理(直接清 state 卸載本元件)。
// 「點擊」與 OrbitControls 的旋轉拖曳靠位移距離區分:pointerdown→pointerup
// 移動超過 5px 視為在轉鏡頭,不觸發放置。
export function SitePlanPlacement({
  imageDataUrl,
  imageWidth,
  imageHeight,
  elevation,
  initialWidthMeters,
  origin,
  onPlace,
}: SitePlanPlacementProps) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; z: number } | null>(null); // 場景局部座標
  const { camera, gl } = useThree();

  const groundPlane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 1, 0), -elevation),
    [elevation],
  );
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  useEffect(() => {
    let cancelled = false;
    new THREE.TextureLoader().load(imageDataUrl, (loaded) => {
      if (!cancelled) setTexture(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [imageDataUrl]);

  useEffect(() => {
    const el = gl.domElement;

    function pointerToLocalGround(clientX: number, clientY: number): THREE.Vector3 | null {
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const target = new THREE.Vector3();
      return raycaster.ray.intersectPlane(groundPlane, target) ? target : null;
    }

    let downAt: { x: number; y: number } | null = null;

    function handleMove(e: PointerEvent) {
      const p = pointerToLocalGround(e.clientX, e.clientY);
      if (p) setGhostPos({ x: p.x, z: p.z });
    }
    function handleDown(e: PointerEvent) {
      if (e.button === 0) downAt = { x: e.clientX, y: e.clientY };
    }
    function handleUp(e: PointerEvent) {
      if (e.button !== 0 || !downAt) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      downAt = null;
      if (moved > 5) return; // 是在轉鏡頭,不是點擊放置
      const p = pointerToLocalGround(e.clientX, e.clientY);
      if (!p) return;
      // 局部 → 真實世界:x 加回原點偏移;北座標 = origin.z - 局部 z(Z 軸幾何上朝南)
      onPlace({
        centerX: p.x + origin.x,
        centerY: origin.z - p.z,
        widthMeters: initialWidthMeters,
        rotationDeg: 0,
      });
    }

    el.addEventListener("pointermove", handleMove);
    el.addEventListener("pointerdown", handleDown);
    el.addEventListener("pointerup", handleUp);
    gl.domElement.style.cursor = "crosshair";
    return () => {
      el.removeEventListener("pointermove", handleMove);
      el.removeEventListener("pointerdown", handleDown);
      el.removeEventListener("pointerup", handleUp);
      gl.domElement.style.cursor = "auto";
    };
  }, [camera, gl, raycaster, groundPlane, origin.x, origin.z, initialWidthMeters, onPlace]);

  if (!texture || !ghostPos) return null;
  const height = (imageHeight / imageWidth) * initialWidthMeters;
  return (
    <group position={[ghostPos.x, elevation, ghostPos.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[initialWidthMeters, height]} />
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}
