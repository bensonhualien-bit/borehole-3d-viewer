import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";
import type { Mesh } from "three";
import type { Borehole, SoilLayer } from "../types/borehole";
import { getSitePlanBounds, type SitePlanCalibration } from "../utils/sitePlanStorage";
import type { ProfileLine } from "../utils/profileStorage";
import { BoreholeColumn, HoverTooltip, type ProfilePicking } from "./BoreholeColumn";
import { BoreholePoint } from "./BoreholePoint";
import { SitePlanPlane } from "./SitePlanPlane";
import { ProfileLines } from "./ProfileLines";
import { ElevationGrid } from "./ElevationGrid";
import { computeElevationRange } from "../utils/boreholeElevation";
import { ContourSurface } from "./ContourSurface";
import { pickLegendLine } from "../utils/contour/resolveContourPoints";
import type { ContourSettings } from "../utils/contour/contourSettings";
import type { SoilStyles } from "../utils/soilStyles";

// <Canvas camera={{ position: [...] }}> 只在 Canvas 第一次掛載時套用一次相機位置;
// 之後 boreholes 資料變了(例如匯入新檔案),camera 的實際 position 不會被動更新。
// 這裡用 useThree 拿到真正的相機實例,在座標範圍改變時強制重新定位相機本身。
function CameraController({ position }: { position: [number, number, number] }) {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(position[0], position[1], position[2]);
    camera.updateProjectionMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position[0], position[1], position[2]]);
  return null;
}

// drei 的 Grid 不是實心平面,是靠 shader 判斷每個像素在不在格線上,不在格線上的地方會
// discard(完全不畫、不佔用深度緩衝)。但它的 discard 門檻是 alpha<=0,只要 alpha 大於 0
// (哪怕淡到幾乎看不見),那個像素還是會把深度寫進緩衝區,擋住後面/下面的東西。視角越平、
// 越貼近地平線時,大量格線會壓縮到同一批螢幕像素上,幾乎每個像素都會有一點點 alpha,於是
// 網格「看起來」稀疏,深度緩衝上卻幾乎整片都在隱形地佔用,把地下的鑽孔柱體擋住。網格本質
// 上只是參考輔助線,不該真的遮蔽場景裡的資料,所以直接關掉它的深度寫入——這樣不管視角多平,
// 網格永遠不會遮蔽任何東西,格線本身的畫面(顏色/淡出效果)完全不受影響。
function GroundGrid(props: ComponentProps<typeof Grid>) {
  const ref = useRef<Mesh>(null);
  useEffect(() => {
    const material = ref.current?.material;
    if (material && !Array.isArray(material)) material.depthWrite = false;
  }, []);
  return <Grid ref={ref} {...props} />;
}

// near/far 原本是依初次掛載時的 horizontalSpread 算一次固定值,套進 Canvas 的 camera prop
// ——但那個 prop 跟相機 position 一樣,只有第一次建立相機時生效,之後使用者用滾輪拉近/拉遠
// (只改變相機的實際 position,不會觸發 React 重新渲染、也不會更新這個固定值)完全不會被
// 重新套用。結果是拉得夠近會撞到 near 平面把畫面裁掉,拉得夠遠又會超出 far 平面讓整個場景
// 消失——這裡改成每一幀都依「相機到 target 的即時距離」重新算 near/far,不管使用者滾輪滾到
// 多近或多遠都能保持合理範圍,不會被凍結在初始那個距離算出來的值卡死。
function DynamicClipPlanes({
  target,
  horizontalSpread,
}: {
  target: [number, number, number];
  horizontalSpread: number;
}) {
  const { camera } = useThree();
  useFrame(() => {
    const dx = camera.position.x - target[0];
    const dy = camera.position.y - target[1];
    const dz = camera.position.z - target[2];
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const near = Math.max(distance / 100, 0.05);
    const far = Math.max(distance * 3, horizontalSpread * 2);
    if (camera.near !== near || camera.far !== far) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

// TEMP DEV-ONLY DEBUG HOOK — exposes live three.js state on window for
// Playwright-driven debugging so we don't need manual screenshots each round.
declare global {
  interface Window {
    __debugScene?: {
      camPos: [number, number, number];
      target: [number, number, number] | null;
      sceneChildren: number;
      frames: number;
      near: number;
      far: number;
    };
  }
}
function WindowDebugHook() {
  useFrame((state) => {
    const controls = state.controls as { target?: { x: number; y: number; z: number } } | null;
    const prev = window.__debugScene?.frames ?? 0;
    const cam = state.camera as unknown as { near: number; far: number };
    window.__debugScene = {
      camPos: [state.camera.position.x, state.camera.position.y, state.camera.position.z],
      target: controls?.target ? [controls.target.x, controls.target.y, controls.target.z] : null,
      sceneChildren: state.scene.children.length,
      frames: prev + 1,
      near: cam.near,
      far: cam.far,
    };
  });
  return null;
}

// 找出資料集裡「最近的一對鑽孔」之間的距離——柱子粗細與標籤字級用這個當基準,
// 而不是整個場地的範圍,才能反映鑽孔實際夠不夠密集,即使場地整體很大。
function nearestNeighborDistance(boreholes: Borehole[]): number {
  let min = Infinity;
  for (let i = 0; i < boreholes.length; i++) {
    for (let j = i + 1; j < boreholes.length; j++) {
      const d = Math.hypot(boreholes[i].x - boreholes[j].x, boreholes[i].y - boreholes[j].y);
      if (d < min) min = d;
    }
  }
  return min;
}

interface SceneProps {
  boreholes: Borehole[];
  sitePlan: SitePlanCalibration | null;
  onSitePlanMove: (x: number, z: number) => void;
  displayMode: "full" | "points";
  showGrid: boolean;
  profileLines: ProfileLine[];
  profileModeEnabled: boolean;
  activeLineId: string | null;
  depthSnapMode: "boundary" | "free";
  onAppendPoint: (lineId: string, boreholeId: string, depth: number) => void;
  onDragPointDepth: (lineId: string, pointIndex: number, depth: number) => void;
  contourSettings: ContourSettings;
  onContourExtentChange?: (extent: { min: number; max: number; lineName: string } | null) => void;
  soilStyles: SoilStyles;
}

export function Scene({
  boreholes,
  sitePlan,
  onSitePlanMove,
  displayMode,
  showGrid,
  profileLines,
  profileModeEnabled,
  activeLineId,
  depthSnapMode,
  onAppendPoint,
  onDragPointDepth,
  contourSettings,
  onContourExtentChange,
  soilStyles,
}: SceneProps) {
  const [hoverInfo, setHoverInfo] = useState<{ layer: SoilLayer | null; borehole: string } | null>(null);
  // 這支鑽孔目前正在被剖面點選預覽(尚未確定的深度),以及自由深度模式下使用者
  // 手動輸入的覆寫文字——都是暫時性的互動狀態,不需要持久化,所以放在 Scene 本地,
  // 不像 profileLines 那樣往上提到 App.tsx。
  const [profilePreview, setProfilePreview] = useState<{
    boreholeId: string;
    depth: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const [manualDepthText, setManualDepthText] = useState<string | null>(null);

  useEffect(() => {
    setHoverInfo(null);
  }, [displayMode]);

  // 換了另一條正在加點的線(或離開繪製模式)時,舊的預覽/手動輸入狀態就沒意義了
  useEffect(() => {
    setProfilePreview(null);
    setManualDepthText(null);
  }, [activeLineId]);

  // 目前開著等高線的線一個都不剩時(使用者關掉最後一條),上面 map 不會再呼叫
  // onExtentChange,圖例會殘留舊資料——這裡明確清掉。
  const contourVisibleCount = profileLines.filter((line) => line.showContour).length;
  const legendLine = pickLegendLine(profileLines);
  useEffect(() => {
    if (contourVisibleCount === 0) onContourExtentChange?.(null);
  }, [contourVisibleCount, onContourExtentChange]);

  const avgGroundElevation = boreholes.reduce((s, b) => s + b.groundElevation, 0) / boreholes.length;
  // Math.max(0, ...) 保底:如果目前顯示的鑽孔全部都是 CPT 測點(layers 為空陣列,
  // 例如透過新的 3D 勾選清單只留下 CPT 測點時),flatMap 出來的陣列會是空的,
  // Math.max(...[]) 會是 -Infinity,連帶讓 verticalCenter/cameraPosition/target
  // 全部變成 NaN,整個 3D 畫面直接壞掉、卻不會噴出任何錯誤——用 0 當下限避免這個情況。
  const maxDepth = Math.max(0, ...boreholes.flatMap((b) => b.layers.map((l) => l.bottomDepth)));
  const verticalCenter = avgGroundElevation - maxDepth / 2;

  // 全圖框景範圍:改用「鑽孔 + 已上傳配置圖」實際涵蓋的外接矩形,而不是用單一中心點
  // 算半徑再加一個固定margin——固定margin對小場地太寬鬆、對大場地又太窄,矩形分佈
  // 不對稱(例如一長條)時單一半徑也會抓不準。外接矩形每邊再乘上 (1+marginRatio) 外擴,
  // 讓邊界跟資料範圍成比例縮放,不論場地大小/形狀都能穩定把所有東西框進初始視角。
  let minX = Math.min(...boreholes.map((b) => b.x));
  let maxX = Math.max(...boreholes.map((b) => b.x));
  let minY = Math.min(...boreholes.map((b) => b.y));
  let maxY = Math.max(...boreholes.map((b) => b.y));
  if (sitePlan) {
    const bounds = getSitePlanBounds(sitePlan);
    minX = Math.min(minX, bounds.minX);
    maxX = Math.max(maxX, bounds.maxX);
    minY = Math.min(minY, bounds.minY);
    maxY = Math.max(maxY, bounds.maxY);
  }
  const centerX = (minX + maxX) / 2;
  const centerZ = (minY + maxY) / 2;
  const marginRatio = 0.5;
  const halfWidth = Math.max((maxX - minX) / 2, 10) * (1 + marginRatio);
  const halfDepth = Math.max((maxY - minY) / 2, 10) * (1 + marginRatio);
  const horizontalSpread = Math.max(halfWidth, halfDepth);
  // 真實世界座標(例如 TWD97)數值高達數百萬,WebGL 頂點運算用單精度浮點數,在這個量級下
  // 精度只剩下 0.1~0.25m 左右,比格線本身的間距還粗,導致格線在鏡頭移動時逐幀跳動出現
  // 閃爍/摩爾紋。修法是把整個場景「搬到」原點附近渲染——鑽孔、格線、配置圖都改成相對
  // 於場地中心(centerX/centerZ)的局部座標,只有相機位置/目標點跟著少掉這個偏移量;
  // 原始的真實世界座標仍完整保留在 Borehole.x/y 與配置圖校準資料中,不受影響。
  const cameraPosition: [number, number, number] = [horizontalSpread, verticalCenter + maxDepth, horizontalSpread];
  const target: [number, number, number] = [0, verticalCenter, 0];
  // 場景可能涵蓋真實世界的大座標(例如 TWD97),預設 near/far(0.1/1000)相對場景本身的
  // 尺度比例過大,會讓遠處的格線出現深度緩衝精度不足的閃爍;依實際場景範圍動態收斂。
  const near = Math.max(horizontalSpread / 100, 0.1);
  const far = Math.max(horizontalSpread, maxDepth) * 6;
  // 資料的座標範圍變了(例如匯入新檔案)時,OrbitControls 內部快取的球座標會對不上
  // 剛剛重新定位的相機,用 key 強制整個 OrbitControls 重新掛載、重新從目前的相機
  // 位置與這個 target 建立乾淨的內部狀態,避免舊狀態每一幀又把相機拉回錯的地方。
  const controlsKey = `${boreholes.length}-${centerX.toFixed(3)}-${centerZ.toFixed(3)}`;
  // 柱子/點位的粗細不能只看場地整體範圍(horizontalSpread)——一個大場地裡鑽孔可能
  // 局部很密集(例如 20 公尺內好幾支),用整體範圍算出來的粗細會撐爆這些密集區,
  // 柱體和跟著柱體粗細等比放大的名稱標籤會彼此重疊擋住看不清楚。改成以資料集中
  // 「最近兩支鑽孔的間距」為基準,粗細等於這個間距的一部分,兩端夾在合理範圍內:
  // 下限維持舊有小範圍範例資料的能見度,上限則避免鑽孔稀疏時柱子反而過粗。
  const columnRadius = Math.min(Math.max(nearestNeighborDistance(boreholes) * 0.125, 0.6), 4);
  const pointRadius = columnRadius * (0.8 / 0.6);

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <Canvas
        camera={{
          position: cameraPosition,
          fov: 50,
          near,
          far,
        }}
      >
        <color attach="background" args={["#e9eff5"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[20, 30, 10]} intensity={0.8} />

        {showGrid && (
          <GroundGrid
            position={[0, avgGroundElevation, 0]}
            args={[horizontalSpread * 2, horizontalSpread * 2]}
            cellSize={1}
            cellColor="#cccccc"
            sectionSize={5}
            sectionColor="#999999"
            fadeDistance={horizontalSpread * 3}
          />
        )}
        {showGrid &&
          (() => {
            // 高程網格用目前顯示的鑽孔(boreholes prop,已經是 App.tsx 過濾後的子集)
            // 算範圍,跟這個檔案原本就有的、給相機框景用的 maxDepth/verticalCenter 是
            // 兩回事、互不影響——那組是用「所有鑽孔的地層 bottomDepth 最大值」算相機
            // 該退多遠,這裡是用「每支鑽孔各自的地表高程/最深深度」算高程網格該畫多高,
            // 沒有理由、也不需要合併成同一份計算。
            const elevationRange = computeElevationRange(boreholes);
            return (
              <ElevationGrid
                minX={minX - centerX}
                maxX={maxX - centerX}
                // Three.js 是右手座標系,X=東、Y=上,所以 Z 軸幾何上代表南——minZ/maxZ
                // 要用「centerZ - 北座標」換算(不是「北座標 - centerZ」),同時 min/max
                // 也要對調(北座標的最大值換算後變成 Z 最小值)。
                minZ={centerZ - maxY}
                maxZ={centerZ - minY}
                minElevation={elevationRange.min}
                maxElevation={elevationRange.max}
              />
            );
          })()}
        <axesHelper args={[Math.max(horizontalSpread / 2, 10)]} />

        {sitePlan && (
          <SitePlanPlane calibration={sitePlan} onPositionChange={onSitePlanMove} origin={{ x: centerX, z: centerZ }} />
        )}

        <ProfileLines
          lines={profileLines}
          boreholes={boreholes}
          columnRadius={columnRadius}
          centerX={centerX}
          centerZ={centerZ}
          profileModeEnabled={profileModeEnabled}
          onDragPointDepth={onDragPointDepth}
        />

        {profileLines
          .filter((line) => line.showContour)
          .map((line) => (
            <ContourSurface
              key={line.id}
              line={line}
              boreholes={boreholes}
              centerX={centerX}
              centerZ={centerZ}
              settings={contourSettings}
              onExtentChange={
                line.id === legendLine?.id
                  ? (extent) =>
                      onContourExtentChange?.(extent ? { ...extent, lineName: line.name } : null)
                  : undefined
              }
            />
          ))}

        {boreholes.map((b) => {
          // 渲染用的局部座標:實際 Borehole.x/y 保持真實世界座標不變,只有傳給 3D 元件
          // 的這份副本減掉場地中心偏移量,讓幾何頂點的數值維持在小範圍內。
          // Three.js 是右手座標系(X×Y=Z);這裡 X=東、Y=上,所以 Z 在幾何上代表南,不是北
          // ——直接塞真實北座標(b.y)會讓「北」被畫在南邊,整個南北顛倒,取負號才對。
          const localBorehole = { ...b, x: b.x - centerX, y: centerZ - b.y };
          const profilePicking: ProfilePicking | undefined =
            profileModeEnabled && activeLineId
              ? {
                  depthSnapMode,
                  activeLineColor: profileLines.find((l) => l.id === activeLineId)?.color ?? "#ff6b6b",
                  previewDepth: profilePreview?.boreholeId === b.id ? profilePreview.depth : null,
                  onPreview: (boreholeId, depth, clientX, clientY) =>
                    setProfilePreview((prev) =>
                      manualDepthText !== null ? prev : { boreholeId, depth, clientX, clientY }
                    ),
                  onPick: (boreholeId) => {
                    const overrideValue =
                      manualDepthText !== null &&
                      manualDepthText.trim() !== "" &&
                      !Number.isNaN(Number(manualDepthText))
                        ? Number(manualDepthText)
                        : null;
                    const depth = overrideValue ?? profilePreview?.depth;
                    if (depth == null || !activeLineId) return;
                    onAppendPoint(activeLineId, boreholeId, depth);
                    setManualDepthText(null);
                    setProfilePreview(null);
                  },
                }
              : undefined;
          return displayMode === "full" ? (
            <BoreholeColumn
              key={b.id}
              borehole={localBorehole}
              radius={columnRadius}
              onHover={setHoverInfo}
              profilePicking={profilePicking}
              soilStyles={soilStyles}
            />
          ) : (
            <BoreholePoint key={b.id} borehole={localBorehole} radius={pointRadius} onHover={setHoverInfo} />
          );
        })}

        <CameraController position={cameraPosition} />
        <DynamicClipPlanes target={target} horizontalSpread={horizontalSpread} />
        <OrbitControls key={controlsKey} target={target} makeDefault />
        {import.meta.env.DEV && <WindowDebugHook />}
      </Canvas>

      <HoverTooltip info={hoverInfo} />

      {profilePreview && depthSnapMode === "free" && (
        <div
          style={{
            position: "fixed",
            left: profilePreview.clientX + 12,
            top: profilePreview.clientY + 12,
            background: "rgba(30,30,30,0.9)",
            padding: "4px 6px",
            borderRadius: 4,
            zIndex: 10,
            color: "#fff",
            fontSize: 12,
            fontFamily: "sans-serif",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span>深度</span>
          <input
            type="number"
            step={0.01}
            value={manualDepthText ?? profilePreview.depth.toFixed(2)}
            onChange={(e) => setManualDepthText(e.target.value)}
            style={{ width: 70, fontSize: 12 }}
          />
          <span>m</span>
        </div>
      )}
    </div>
  );
}
