import { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { computeSimilarityTransform, pixelToWorld, type SitePlanCalibration } from "../utils/sitePlanStorage";
import {
  applyHandleDrag,
  calibrationToPlacement,
  placementToCalibration,
  type QuickInsertPlacement,
} from "../utils/sitePlanQuickInsert";

// 把手圖示(0807A 回饋、Benson 選定 A 款):深灰圓角方塊 + 白色旋轉環 + 中央方塊。
// 以 canvas 同步繪製成貼圖(96 座標系,輸出 256px 抗鋸齒),module 層級只建一次共用。
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function createHandleTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(size / 96, size / 96);
  ctx.fillStyle = "#2f353b";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  roundRectPath(ctx, 4, 4, 88, 88, 20);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  roundRectPath(ctx, 36, 36, 24, 24, 5);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(48, 48, 32, -Math.PI / 2, -0.26); // 上方弧(頂部往右下)
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(72, 46); ctx.lineTo(80, 42); ctx.lineTo(74, 34); ctx.closePath(); // 右箭頭
  ctx.fill();
  ctx.beginPath();
  ctx.arc(48, 48, 32, Math.PI / 2, Math.PI - 0.26); // 下方弧(底部往左上)
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(24, 50); ctx.lineTo(16, 54); ctx.lineTo(22, 62); ctx.closePath(); // 左箭頭
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

const HANDLE_TEXTURE = createHandleTexture();

interface SitePlanPlaneProps {
  calibration: SitePlanCalibration;
  onPositionChange: (x: number, z: number) => void;
  onCalibrationChange: (c: SitePlanCalibration) => void;
  // 場景已整個搬移到以場地中心為原點渲染(見 Scene.tsx),校準資料/manualPosition
  // 仍是真實世界絕對座標,這裡收到偏移量後在渲染與滑鼠回拋座標時做加減轉換。
  origin: { x: number; z: number };
}

export function SitePlanPlane({ calibration, onPositionChange, onCalibrationChange, origin }: SitePlanPlaneProps) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<{ x: number; z: number } | null>(null);
  const [handleHovered, setHandleHovered] = useState(false);
  // 右下角把手拖曳:以圖片中心為錨,起始向量 vs 目前向量 → 縮放+旋轉。
  // 過程中只更新本地 preview(dataUrl 很大,不能每 mousemove 寫 localStorage),
  // pointerup 才合成 calibration 交給 onCalibrationChange——與平移拖曳同一套節奏。
  const [handleDrag, setHandleDrag] = useState<{
    startVec: { x: number; y: number };
    startPlacement: QuickInsertPlacement;
    preview: QuickInsertPlacement;
  } | null>(null);
  // handleUp 的射線 miss fallback 要用「最新」preview——effect 閉包裡的 state 是
  // 拖曳開始那一刻的快照(dep 刻意用 handleDrag !== null 避免拖曳中重掛監聽器),
  // 直接讀 state.preview 會拿到過期值、把整次拖曳悄悄還原。ref 與 setHandleDrag
  // 的 functional update 同步更新,永遠指向畫面上正在顯示的 preview。
  const latestPreviewRef = useRef<QuickInsertPlacement | null>(null);
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

  useEffect(() => {
    if (!handleDrag) return;
    const state = handleDrag;

    function pointerToWorld(clientX: number, clientY: number): { x: number; y: number } | null {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      const target = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, target)) return null;
      return { x: target.x + origin.x, y: origin.z - target.z }; // 真實世界(x=東, y=北)
    }

    function currentVecOf(world: { x: number; y: number }) {
      return { x: world.x - state.startPlacement.centerX, y: world.y - state.startPlacement.centerY };
    }

    function handleMove(e: PointerEvent) {
      const world = pointerToWorld(e.clientX, e.clientY);
      if (!world) return;
      setHandleDrag((prev) => {
        if (!prev) return prev;
        const preview = applyHandleDrag(prev.startVec, currentVecOf(world), prev.startPlacement);
        latestPreviewRef.current = preview;
        return { ...prev, preview };
      });
    }

    function handleUp(e: PointerEvent) {
      const world = pointerToWorld(e.clientX, e.clientY);
      const finalPlacement = world
        ? applyHandleDrag(state.startVec, currentVecOf(world), state.startPlacement)
        : latestPreviewRef.current ?? state.startPlacement;
      setHandleDrag(null);
      if (controls) (controls as unknown as { enabled: boolean }).enabled = true;
      gl.domElement.style.cursor = "auto";
      onCalibrationChange(
        placementToCalibration(
          finalPlacement,
          { dataUrl: calibration.imageDataUrl, width: calibration.imageWidth, height: calibration.imageHeight },
          calibration.groundElevation,
          calibration.locked
        )
      );
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      if (controls) (controls as unknown as { enabled: boolean }).enabled = true;
      gl.domElement.style.cursor = "auto";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleDrag !== null, camera, gl, raycaster, groundPlane, controls, origin.x, origin.z]);

  if (!texture) return null;

  const transform = computeSimilarityTransform(calibration.pointA, calibration.pointB);
  const preview = handleDrag?.preview ?? null;
  const previewRotation = preview ? (preview.rotationDeg * Math.PI) / 180 : transform.rotation;
  const width = preview ? preview.widthMeters : calibration.imageWidth * transform.scale;
  const height = (calibration.imageHeight / calibration.imageWidth) * width;
  const calibratedCenter = pixelToWorld(
    { px: calibration.imageWidth / 2, py: calibration.imageHeight / 2 },
    transform
  );
  // 這幾個來源(拖曳中的暫存點/已存的手動位置/校準推算出的中心點)全部都是真實世界絕對座標,
  // 只有實際傳給 <group> 的 position 才減掉場地中心偏移量,渲染在局部座標系裡。
  const centerX = preview?.centerX ?? dragPosition?.x ?? calibration.manualPosition?.x ?? calibratedCenter.x;
  const centerZ = preview?.centerY ?? dragPosition?.z ?? calibration.manualPosition?.z ?? calibratedCenter.y;

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
      rotation={[0, previewRotation, 0]}
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

      {!calibration.locked && (() => {
        // 把手尺寸隨圖片比例,夾在絕對範圍內避免小圖看不見/大圖太笨重
        const handleSize = Math.min(Math.max(Math.min(width, height) * 0.08, 1.5), 10);
        return (
          <sprite
            position={[width / 2, 0.05, height / 2]} // 圖片右下角(群組局部座標,跟著旋轉)
            scale={handleHovered ? [handleSize * 1.2, handleSize * 1.2, 1] : [handleSize, handleSize, 1]}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (!controls) return;
              (controls as unknown as { enabled: boolean }).enabled = false;
              const startPlacement = calibrationToPlacement(calibration);
              // e.point 是世界(場景局部)座標的把手命中點,轉真實世界後對中心取向量
              const world = { x: e.point.x + origin.x, y: origin.z - e.point.z };
              latestPreviewRef.current = null;
              setHandleDrag({
                startVec: { x: world.x - startPlacement.centerX, y: world.y - startPlacement.centerY },
                startPlacement,
                preview: startPlacement,
              });
              gl.domElement.style.cursor = "nwse-resize";
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHandleHovered(true);
              if (!handleDrag) gl.domElement.style.cursor = "nwse-resize";
            }}
            onPointerOut={() => {
              setHandleHovered(false);
              if (!handleDrag) gl.domElement.style.cursor = "auto";
            }}
          >
            <spriteMaterial map={HANDLE_TEXTURE} transparent depthTest={false} />
          </sprite>
        );
      })()}
    </group>
  );
}
