import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { resolveContourPoints } from "../utils/contour/resolveContourPoints";
import { buildLayerSolidGrid } from "../utils/model/solidGrid";
import { buildLayerSolidGeometry } from "./layerSolidGeometry";
import type { ProfileLayer, ProfileLine } from "../utils/profileStorage";
import type { Borehole } from "../types/borehole";
import type { ContourSettings } from "../utils/contour/contourSettings";

interface LayerSolidProps {
  layer: ProfileLayer;
  topLine: ProfileLine;
  bottomLine: ProfileLine;
  boreholes: Borehole[];
  centerX: number;
  centerZ: number;
  opacity: number;
  extrapolationRatio: number;
  /** 沿用等高線的全域設定(interpolator + krigingParams),讓實體跟等高線曲面對齊 */
  contourSettings: ContourSettings;
  /** 尖滅比例回報(0~1);null = 目前無法建模(點數不足等)。給面板顯示提示用 */
  onPinchOutChange?: (ratio: number | null) => void;
}

// 單一地層的 3D 實體:頂/底界面各自 Kriging 內插,封成半透明地層塊。
// 結構比照 ContourSurface.tsx:資料 → 網格 → geometry 逐層 useMemo,
// GPU 緩衝手動 dispose,對上回報用 ref 值比對防無窮迴圈。
export function LayerSolid({
  layer,
  topLine,
  bottomLine,
  boreholes,
  centerX,
  centerZ,
  opacity,
  extrapolationRatio,
  contourSettings,
  onPinchOutChange,
}: LayerSolidProps) {
  const topPoints = useMemo(
    () => resolveContourPoints(topLine, boreholes, centerX, centerZ),
    [topLine, boreholes, centerX, centerZ],
  );
  const bottomPoints = useMemo(
    () => resolveContourPoints(bottomLine, boreholes, centerX, centerZ),
    [bottomLine, boreholes, centerX, centerZ],
  );
  const grid = useMemo(
    () =>
      buildLayerSolidGrid(
        topPoints,
        bottomPoints,
        extrapolationRatio,
        contourSettings.interpolator,
        contourSettings.krigingParams,
      ),
    [topPoints, bottomPoints, extrapolationRatio, contourSettings.interpolator, contourSettings.krigingParams],
  );
  const geometry = useMemo(() => (grid ? buildLayerSolidGeometry(grid) : null), [grid]);

  // BufferGeometry 的 GPU 緩衝不會隨 React 元件卸載自動釋放(比照 ContourSurface.tsx
  // 既有的作法),props 變動時上一份沒人再參照,手動 dispose 避免累積。
  useEffect(() => () => geometry?.dispose(), [geometry]);

  // 尖滅比例回報:App 是父層,inline callback 每次 render 都是新參照,若直接把
  // onPinchOutChange 放進 deps 並無條件呼叫,會形成「回報 → App setState → 重渲染 →
  // 新參照 → effect 再跑 → 再回報」的無窮迴圈。比照 ContourSurface.tsx 的作法:
  // callback 用 ref 讀最新值,另用 ref 記住「上一次真正回報出去的數值」,數值沒變
  // 就不回報,從源頭切斷迴圈。
  const onPinchOutChangeRef = useRef(onPinchOutChange);
  onPinchOutChangeRef.current = onPinchOutChange;
  const lastReportedRef = useRef<number | null | undefined>(undefined);
  const pinchOutRatio = grid ? grid.pinchOutRatio : null;
  useEffect(() => {
    if (lastReportedRef.current === pinchOutRatio) return;
    lastReportedRef.current = pinchOutRatio;
    onPinchOutChangeRef.current?.(pinchOutRatio);
  }, [pinchOutRatio]);
  // 卸載時(使用者關掉這個地層的實體開關)回報 null,讓面板清掉殘留的尖滅提示。
  // 必須同時重置 lastReportedRef:dev 的 StrictMode 會在掛載後立刻模擬「卸載→重掛」
  // 跑一輪 cleanup→setup(ref 不會被重置,這是 React 的既定行為)。若這裡只回報 null
  // 不重置 ref,重掛後上面的 effect 會誤判「數值沒變」跳過回報,面板就永遠卡在
  // 「無法建模」——實體其實好端端畫在場景上(真實發生過:0804A 專案兩個地層的
  // 幾何都建成了,面板卻同時掛著錯誤警告)。重置後重掛必定重新回報一次正確值;
  // 真正卸載時 ref 隨元件消滅,重置動作無副作用。
  useEffect(
    () => () => {
      lastReportedRef.current = undefined;
      onPinchOutChangeRef.current?.(null);
    },
    [],
  );

  if (!geometry) return null; // 點數不足等;LayerModelPanel 另外顯示提示,這裡單純不畫

  return (
    <mesh geometry={geometry}>
      {/* depthWrite=false:多個半透明地層與鑽孔柱交疊時,避免半透明面寫入深度緩衝
          擋住後面的物件造成排序破綻(與 GroundGrid 關深度寫入是同一類考量)。 */}
      <meshStandardMaterial
        color={layer.color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
