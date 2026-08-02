import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { tinInterpolator } from "../utils/contour/delaunayInterpolator";
import { createKrigingInterpolator } from "../utils/contour/krigingInterpolator";
import { buildContourGrid } from "../utils/contour/grid";
import { extractContours, type ContourRing } from "../utils/contour/marchingSquares";
import { smoothPolyline } from "../utils/contour/smoothing";
import { buildContourLineGeometry, buildSurfaceGeometry, gridExtent } from "./contourGeometry";
import { resolveContourPoints } from "../utils/contour/resolveContourPoints";
import type { ContourSettings } from "../utils/contour/contourSettings";
import type { ProfileLine } from "../utils/profileStorage";
import type { Borehole } from "../types/borehole";

interface ContourSurfaceProps {
  line: ProfileLine;
  boreholes: Borehole[];
  centerX: number;
  centerZ: number;
  settings: ContourSettings;
  onExtentChange?: (extent: { min: number; max: number } | null) => void;
}

const MAJOR_LINE_COLOR = "#663300";
const MINOR_LINE_COLOR = "#b38659";

export function ContourSurface({ line, boreholes, centerX, centerZ, settings, onExtentChange }: ContourSurfaceProps) {
  const points = useMemo(
    () => resolveContourPoints(line, boreholes, centerX, centerZ),
    [line, boreholes, centerX, centerZ],
  );
  const query = useMemo(
    () =>
      settings.interpolator === "kriging"
        ? createKrigingInterpolator(settings.krigingParams).build(points)
        : tinInterpolator.build(points),
    [points, settings.interpolator, settings.krigingParams],
  );
  const grid = useMemo(
    () => (points.length >= 3 ? buildContourGrid(points, query) : null),
    [points, query],
  );
  const rings = useMemo(() => (grid ? extractContours(grid, settings) : []), [grid, settings]);
  const smoothedRings = useMemo<ContourRing[]>(
    () =>
      rings.map((ring) => {
        const inputPoints = ring.closed ? ring.points.slice(0, -1) : ring.points;
        return { ...ring, points: smoothPolyline(inputPoints, ring.closed) };
      }),
    [rings],
  );

  const extent = useMemo(
    () => (grid && settings.colorMode === "colored" ? gridExtent(grid) : null),
    [grid, settings.colorMode],
  );
  const surfaceGeometry = useMemo(
    () => (grid && settings.colorMode === "colored" ? buildSurfaceGeometry(grid, true) : null),
    [grid, settings.colorMode],
  );
  const majorGeometry = useMemo(() => buildContourLineGeometry(smoothedRings, true), [smoothedRings]);
  const minorGeometry = useMemo(() => buildContourLineGeometry(smoothedRings, false), [smoothedRings]);

  // BufferGeometry 的 GPU 緩衝不會隨 React 元件卸載自動釋放(比照 ElevationGrid.tsx
  // 既有的作法),props 變動時上一份沒人再參照,手動 dispose 避免累積不會被回收的緩衝。
  useEffect(() => () => surfaceGeometry?.dispose(), [surfaceGeometry]);
  useEffect(() => () => majorGeometry?.dispose(), [majorGeometry]);
  useEffect(() => () => minorGeometry?.dispose(), [minorGeometry]);

  // 圖例(ContourLegend)需要跟畫面上曲面完全同一份數值範圍,不是另外重算——
  // 這裡只是把 surfaceGeometry 用的同一份 extent 往上回報給 Scene/App。
  //
  // onExtentChange 額外用 ref 讀取(而不是只靠 deps 讓 effect 拿到最新值):Scene 是
  // 非 memo 元件,父層(App)只要重新渲染,Scene 每次都會建立一個全新的 inline
  // callback 參照。onExtentChange 目前雖然也在下面 effect 的 deps 裡(見下方「第三種
  // 狀態」的說明——這是為了讓「不是回報線」這件事本身能觸發 effect 重新執行,才把它
  // 加回 deps),但真正擋住無窮迴圈的不是「要不要把 onExtentChange 放進 deps」,而是
  // 下面的 lastReportedExtentRef 值比對(changed):即使 effect 因為 onExtentChange
  // 參照改變而重新執行,只要數值沒變就會在 `if (!changed) return;` 提早結束,不會呼叫
  // setState,「Scene 重渲染 → effect 觸發 → setState → App 重渲染」的迴圈就在這裡被
  // 切斷,而不是靠減少 effect 執行次數。
  const onExtentChangeRef = useRef(onExtentChange);
  onExtentChangeRef.current = onExtentChange;
  // extent 的物件參照本身並不穩定:App.tsx 的 visibleBoreholes3D 曾是每次 render 都
  // 重新 filter() 出來的新陣列(2026-08-01 起已改用 useMemo 穩定,但其他參照不穩定
  // 的來源仍在——例如 Scene 每次 render 都傳新的 inline onExtentChange——所以這層
  // 數值級防護「不可」因為那個 useMemo 而被移除),新參照會沿著
  // boreholes prop 一路傳到這裡的 points/grid useMemo,連帶讓 extent 每次都拿到
  // 新物件——即使 min/max 數值完全沒變。若只單純把 extent 放進這個 effect 的
  // deps,effect 依然會在數值沒變的情況下每次重新觸發、每次都呼叫一次
  // onExtentChange(新 spread 出來的物件),讓 App 的 setContourExtent 永遠不會
  // bail out,一樣會形成無窮迴圈(這點已經用暫時性計數器實測驗證過:只做「用 ref
  // 讀 onExtentChange」那一步不夠,計數器仍然會持續等速成長)。這裡額外用 ref
  // 記住「上一次真正回報出去的數值」,只有 min/max(或有無 extent)實際改變時才
  // 呼叫 onExtentChange,把「數值沒變」的情況擋在回報之前,從源頭切斷迴圈,而不是
  // 只解決其中一個觸發來源。
  //
  // undefined 是第三種狀態,代表「目前不是負責回報的線,追蹤狀態未初始化」,跟
  // null(「已確認回報過『沒有資料』」)要分開。Scene 只把真正的 onExtentChange
  // callback 傳給目前的圖例線(pickLegendLine 選出的第一條),其餘同時可見的
  // contour 線都拿到 onExtentChange={undefined}——但這些線的 extent 仍然照常
  // 算、這個 effect 仍然照常跑。如果不是回報線時仍然把 lastReportedExtentRef
  // 更新成自己的 extent,等到之後真的輪到它變成回報線時,若它自己的 extent 數值
  // 沒有變(只是「有沒有回報資格」變了),changed 會誤判成 false,導致這次真正該
  // 送出的回報被吃掉——上層(App）就會繼續顯示前一條線的舊名稱/舊數值,對工程數據
  // 而言是會誤導判讀的錯誤。所以只要目前沒有 onExtentChange(不是回報線),就把
  // ref 重置回 undefined,確保下次真的變成回報線時 changed 一定為 true,強制送出
  // 一次新的回報。
  const lastReportedExtentRef = useRef<{ min: number; max: number } | null | undefined>(undefined);
  useEffect(() => {
    if (!onExtentChange) {
      lastReportedExtentRef.current = undefined;
      return;
    }
    const prev = lastReportedExtentRef.current;
    const changed =
      prev === undefined ||
      (prev === null) !== (extent === null) ||
      (prev !== null && extent !== null && (prev.min !== extent.min || prev.max !== extent.max));
    if (!changed) return;
    lastReportedExtentRef.current = extent;
    onExtentChangeRef.current?.(extent);
  }, [extent, onExtentChange]);

  if (!grid) return null; // 點數不足/共線;ProfileDrawer 另外顯示提示訊息,這裡單純不畫

  return (
    <group>
      {settings.colorMode === "colored" && surfaceGeometry && (
        <mesh geometry={surfaceGeometry}>
          <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
        </mesh>
      )}
      {majorGeometry && (
        <lineSegments geometry={majorGeometry}>
          <lineBasicMaterial color={MAJOR_LINE_COLOR} />
        </lineSegments>
      )}
      {minorGeometry && (
        <lineSegments geometry={minorGeometry}>
          <lineBasicMaterial color={MINOR_LINE_COLOR} transparent opacity={0.7} />
        </lineSegments>
      )}
    </group>
  );
}
