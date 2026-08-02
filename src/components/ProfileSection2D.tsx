import { useEffect, useRef, useState } from "react";
import type { Borehole } from "../types/borehole";
import type { ProfileLine } from "../utils/profileStorage";
import { computeProfileAxis, computeSequentialDistanceAxis } from "../utils/profileAxis";
import { snapDepth } from "../utils/depthSnap";
import { screenToWorld, zoomViewBox, type ViewBox } from "../utils/svgCoords";
import { boreholeMaxDepth, computeElevationRange } from "../utils/boreholeElevation";
import { effectiveLayerColor, type SoilStyles } from "../utils/soilStyles";
import { computeBaseBarWidth, computeBarLayout, type BarWidthSettings } from "../utils/barWidth";

// 幾何(柱位/柱寬/點錨)一律走 barLayout(computeBarLayout 算出的疊合並排結果),
// 視覺比例(字級、線寬、圓半徑、標籤偏移、自動置中邊距)一律走 baseBarWidth——
// 疊合群內每支柱子維持「全」基準寬並排(除以 k 變細規則已廢除,見 barWidth.ts),
// 字級與線寬本來就不會被疊合影響,這裡只是統一視覺比例的計算基準。
// 垂直(高程)方向的可視範圍,拆出來獨立於水平方向管理——多剖面比對畫面
// (ProfileComparisonView)需要讓多個面板共用同一份垂直捲動/縮放狀態,水平方向
// 則各自獨立,所以水平(minX/width)固定是這個元件的內部 state,垂直
// (minY/height)則可以選擇性地由外部受控。
export interface VerticalViewBox {
  minY: number;
  height: number;
}

interface ProfileSection2DProps {
  boreholes: Borehole[];
  selectedBoreholeIds: Set<string>;
  profileLines: ProfileLine[];
  profileModeEnabled: boolean;
  activeLineId: string | null;
  depthSnapMode: "boundary" | "free";
  axisMode: "projected" | "sequential";
  showGrid: boolean;
  onAppendPoint: (lineId: string, boreholeId: string, depth: number) => void;
  onDragPointDepth: (lineId: string, pointIndex: number, depth: number) => void;
  // 選填:外部受控的垂直可視範圍 + 變更回呼。不傳時(既有單一 2D 畫面的用法)
  // 垂直範圍跟水平範圍一樣是元件內部 state,行為與這個 prop 加入前完全相同。
  verticalViewBox?: VerticalViewBox;
  onVerticalViewBoxChange?: (next: VerticalViewBox) => void;
  soilStyles: SoilStyles;
  barWidthSettings: BarWidthSettings;
}

interface PositionedBorehole {
  borehole: Borehole;
  distance: number;
  maxDepth: number;
}

// 垂直軸是真實高程(elevation),不是單純深度——不同鑽孔地表高程不同時,地表線會
// 隨地形起伏,不會被拉平對齊,這是傳統地質剖面圖的慣例。SVG 的 y 座標往下遞增,
// 跟「高程越高越往上」的直覺相反,所以世界座標用 worldY = depth - groundElevation
// (負的高程)來讓數學運算跟 SVG 座標系一致:高程越高 -> worldY 越小 -> 畫面越上面。
function computeAutoFitViewBox(positioned: PositionedBorehole[], baseBarWidth: number): ViewBox {
  const distances = positioned.map((p) => p.distance);
  const minX = Math.min(...distances) - baseBarWidth * 2;
  const maxX = Math.max(...distances) + baseBarWidth * 2;
  const groundWorldYs = positioned.map((p) => -p.borehole.groundElevation);
  const bottomWorldYs = positioned.map((p) => p.maxDepth - p.borehole.groundElevation);
  const allWorldYs = [...groundWorldYs, ...bottomWorldYs];
  const minWorldY = Math.min(...allWorldYs);
  const maxWorldY = Math.max(...allWorldYs);
  const marginY = Math.max((maxWorldY - minWorldY) * 0.15, baseBarWidth);
  const labelSpace = marginY;
  return {
    minX,
    minY: minWorldY - marginY - labelSpace,
    width: maxX - minX,
    height: maxWorldY - minWorldY + marginY * 2 + labelSpace,
  };
}

interface DragState {
  lineId: string;
  pointIndex: number;
  boreholeId: string;
}

interface PanState {
  clientX: number;
  clientY: number;
  viewBox: ViewBox;
}

export function ProfileSection2D({
  boreholes,
  selectedBoreholeIds,
  profileLines,
  profileModeEnabled,
  activeLineId,
  depthSnapMode,
  axisMode,
  showGrid,
  onAppendPoint,
  onDragPointDepth,
  verticalViewBox,
  onVerticalViewBoxChange,
  soilStyles,
  barWidthSettings,
}: ProfileSection2DProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // 水平(minX/width)永遠是這個元件的內部 state。垂直(minY/height)在沒有外部
  // 受控(verticalViewBox prop 未提供)時也是內部 state(internalVertical);有提供
  // 時改用外部傳入的值,忽略 internalVertical——effectiveVertical 是實際渲染/計算
  // 用的那一份。
  const [horizontal, setHorizontal] = useState<{ minX: number; width: number }>({ minX: 0, width: 100 });
  const [internalVertical, setInternalVertical] = useState<VerticalViewBox>({ minY: 0, height: 100 });
  const effectiveVertical = verticalViewBox ?? internalVertical;
  const viewBox: ViewBox = {
    minX: horizontal.minX,
    width: horizontal.width,
    minY: effectiveVertical.minY,
    height: effectiveVertical.height,
  };
  const viewBoxRef = useRef(viewBox);
  const fitWidthRef = useRef(100);
  const [previewPoint, setPreviewPoint] = useState<{ boreholeId: string; depth: number } | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragDepthRef = useRef<number | null>(null);
  const [dragDepth, setDragDepth] = useState<number | null>(null);
  const [panState, setPanState] = useState<PanState | null>(null);

  // 套用一個完整的新 viewBox:水平部分永遠寫回這個元件自己的 state;垂直部分則視
  // 有沒有外部受控,分別走 onVerticalViewBoxChange(多剖面比對共用狀態)或
  // internalVertical(既有單一 2D 畫面,行為不變)。滾輪縮放、右鍵拖曳平移都共用
  // 這個函式,確保兩種操作的「水平獨立、垂直可能共用」規則一致。
  function applyViewBox(next: ViewBox) {
    setHorizontal({ minX: next.minX, width: next.width });
    const nextVertical: VerticalViewBox = { minY: next.minY, height: next.height };
    if (onVerticalViewBoxChange) onVerticalViewBoxChange(nextVertical);
    else setInternalVertical(nextVertical);
  }

  const selected = boreholes.filter((b) => selectedBoreholeIds.has(b.id));
  const coords = selected.map((b) => ({ id: b.id, x: b.x, y: b.y }));
  const axis = axisMode === "sequential" ? computeSequentialDistanceAxis(coords) : computeProfileAxis(coords);
  const positioned: PositionedBorehole[] = axis.flatMap((entry) => {
    const borehole = selected.find((b) => b.id === entry.boreholeId);
    return borehole ? [{ borehole, distance: entry.distance, maxDepth: boreholeMaxDepth(borehole) }] : [];
  });
  // 柱子寬度、視野縮放範圍(自動置中的 viewBox)固定用「投影剖面距離」的比例計算,
  // 不受目前選擇的距離模式影響——「鑽孔間直線距離」模式下,只要選中的鑽孔裡剛好有
  // 一對距離很近或很遠,整體比例就會被拉得忽大忽小、難以判讀;柱子實際畫的位置
  // (positioned,上面那份)仍然照選中的模式算,只有「畫面要縮多開才看得到全部」
  // 這件事固定參考投影剖面距離的比例。axisMode 已經是 "projected" 時直接重用 axis,
  // 不用重算一次一樣的東西。
  const projectedAxis = axisMode === "sequential" ? computeProfileAxis(coords) : axis;
  const projectedPositioned: PositionedBorehole[] = projectedAxis.flatMap((entry) => {
    const borehole = selected.find((b) => b.id === entry.boreholeId);
    return borehole ? [{ borehole, distance: entry.distance, maxDepth: boreholeMaxDepth(borehole) }] : [];
  });
  const projectedDistances = projectedPositioned.map((p) => p.distance);
  const projectedSpan =
    projectedDistances.length > 0 ? Math.max(...projectedDistances) - Math.min(...projectedDistances) : 0;
  const baseBarWidth = computeBaseBarWidth(projectedSpan, projectedPositioned.length, barWidthSettings);
  // 疊合並排版面:用「繪製位置」(隨距離模式)算;index 與 positioned 對齊
  const barLayout = computeBarLayout(positioned.map((p) => p.distance), baseBarWidth);
  const layoutById = new Map(positioned.map((p, i) => [p.borehole.id, barLayout[i]]));
  const selectionKey = [...selectedBoreholeIds].sort().join(",");

  // 高程網格:範圍是目前顯示的鑽孔中,最高地表高程 +5m 到最低鑽孔底部高程 -5m,
  // 每 1m 一條線,5m 倍數的算主要線(實線+標籤),其餘算次要線(虛線)
  const elevationRange = computeElevationRange(selected);
  const elevationLevels: number[] = [];
  for (let e = Math.ceil(elevationRange.min); e <= Math.floor(elevationRange.max); e++) {
    elevationLevels.push(e);
  }

  useEffect(() => {
    viewBoxRef.current = viewBox;
  }, [viewBox]);

  // 選中的鑽孔子集改變時,重新依投影剖面距離的比例自動置中/縮放到看得到全部——舊的
  // 縮放/平移狀態沒有意義了(舊的視野範圍是給另一組位置算的)。這裡固定用
  // projectedPositioned(不是 positioned),所以單純切換距離模式不會觸發重新置中
  // ——因為視野縮放範圍本來就不受距離模式影響,不需要因為模式切換就重新算一次。
  // 垂直部分只有在沒有外部受控時才會被這裡重設——多剖面比對畫面的垂直範圍是由
  // ProfileComparisonView 統一管理,不應該因為單一面板自己選中的鑽孔子集改變
  // 就被打斷。
  // baseBarWidth 也是這個 effect 的 dep:柱寬設定(BarWidthSettingsPanel 的滑桿)
  // 改變時要重新 fit,理由是 computeAutoFitViewBox 的邊距(minX = 最小投影距離 −
  // 2×baseBarWidth,見上面該函式)直接用 baseBarWidth 算——若不重新 fit,原本 fit
  // 時算好的邊距是舊柱寬的,拉大柱寬(例如柱寬上限 0.5%→5%,超過 4 倍)會讓兩端的
  // 柱子超出邊距、被 viewBox 裁掉一截,不符合 spec「柱寬設定改動即生效」的預期。
  // baseBarWidth 由投影跨距(projectedSpan/projectedPositioned.length)算出、
  // 不受 axisMode 影響,所以加這個 dep 不會重新引入「切換距離模式就重置視野」的
  // 問題——baseBarWidth 本身在切換距離模式時不會變。
  // 這個 refit 是每一格滑桿變動就會跑一次(不是只在放開滑桿時跑一次)——拖曳
  // 中途也會連續重算好幾次;同時也會刻意蓋掉使用者當下手動平移/縮放過的視野,
  // 直接跳回自動置中的結果。這是刻意的取捨,不是沒注意到的副作用:spec 明講
  // 「柱寬設定改動即生效」,視野必須跟著新柱寬重新算才能保證兩端不被裁掉(見上
  // 一段),沒有辦法只保留使用者手動平移過的位置又同時保證不裁切。
  useEffect(() => {
    if (projectedPositioned.length < 2) return;
    const fit = computeAutoFitViewBox(projectedPositioned, baseBarWidth);
    setHorizontal({ minX: fit.minX, width: fit.width });
    fitWidthRef.current = fit.width;
    if (!verticalViewBox) {
      setInternalVertical({ minY: fit.minY, height: fit.height });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, baseBarWidth]);

  // 換了另一條正在加點的線(或離開繪製模式)時,舊的預覽狀態就沒意義了
  useEffect(() => {
    setPreviewPoint(null);
  }, [activeLineId]);

  // React 註冊的 onWheel 是 passive 的,e.preventDefault() 攔不住原生捲動——比照
  // SitePlanUploader.tsx 的做法,額外用原生、非 passive 的監聽器蓋掉這個限制。掛在
  // svg 本身(而不是外層 div)上。這個 svg 元素本身在元件的整個生命週期都不會被卸載
  // 重掛(「請選擇至少 2 支鑽孔」的提示是畫在 svg 內部的 <text>,不是整個 svg 被換
  // 掉,ref 不會失效),但這裡把 onVerticalViewBoxChange 放進 deps——如果外部傳進來
  // 的是每次 render 都重新建立的 inline 函式,沒有這個 dep 監聽器會捕捉到舊版本、
  // 呼叫到過期的 setState。
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const next = zoomViewBox(viewBoxRef.current, e.deltaY, fitWidthRef.current * 0.1, fitWidthRef.current * 10);
      applyViewBox(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onVerticalViewBoxChange]);

  // 拖動既有點:監聽整個 window(比照 3D ProfileLines.tsx),因為拖曳時滑鼠常常會
  // 移出 SVG 範圍。水平位置固定不變(拖動只能改深度),且比照 3D 的拖曳行為不做
  // 深度吸附(只有「新增點」的點擊會吸附,拖曳維持自由深度調整)。
  useEffect(() => {
    if (!dragState) return;
    const state = dragState;

    function handleMove(e: PointerEvent) {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const world = screenToWorld(rect, viewBoxRef.current, e.clientX, e.clientY);
      const borehole = boreholes.find((b) => b.id === state.boreholeId);
      if (!borehole) return;
      const depth = world.y + borehole.groundElevation;
      dragDepthRef.current = depth;
      setDragDepth(depth);
    }

    function handleUp() {
      if (dragDepthRef.current !== null) {
        onDragPointDepth(state.lineId, state.pointIndex, dragDepthRef.current);
      }
      setDragState(null);
      setDragDepth(null);
      dragDepthRef.current = null;
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragState, boreholes, onDragPointDepth]);

  // 滑鼠右鍵拖曳平移視野(水平、垂直皆可),比照 3D 場景 OrbitControls 預設的右鍵
  // 平移行為。用「拖曳開始當下的 viewBox」當基準,每次 pointermove 都重新用同一個
  // 起始 viewBox 算世界座標差距後套用,不是用上一幀的 viewBox 疊加——避免浮點數
  // 誤差隨拖曳時間累積。
  useEffect(() => {
    if (!panState) return;
    const start = panState;

    function handleMove(e: PointerEvent) {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const worldStart = screenToWorld(rect, start.viewBox, start.clientX, start.clientY);
      const worldNow = screenToWorld(rect, start.viewBox, e.clientX, e.clientY);
      applyViewBox({
        ...start.viewBox,
        minX: start.viewBox.minX - (worldNow.x - worldStart.x),
        minY: start.viewBox.minY - (worldNow.y - worldStart.y),
      });
    }

    function handleUp() {
      setPanState(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [panState]);

  function pointerToColumn(clientX: number, clientY: number): { boreholeId: string; depth: number } | null {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const world = screenToWorld(rect, viewBox, clientX, clientY);
    const column = positioned.find((p) => {
      const lay = layoutById.get(p.borehole.id);
      return lay !== undefined && Math.abs(world.x - lay.x) <= lay.w / 2;
    });
    if (!column) return null;
    const rawDepth = world.y + column.borehole.groundElevation;
    const depth = snapDepth(rawDepth, column.borehole.layers, depthSnapMode);
    return { boreholeId: column.borehole.id, depth };
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!profileModeEnabled || !activeLineId || dragState || panState) {
      if (previewPoint) setPreviewPoint(null);
      return;
    }
    setPreviewPoint(pointerToColumn(e.clientX, e.clientY));
  }

  function handleClick() {
    if (!profileModeEnabled || !activeLineId || dragState || !previewPoint) return;
    onAppendPoint(activeLineId, previewPoint.boreholeId, previewPoint.depth);
    setPreviewPoint(null);
  }

  function handleSvgMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (e.button !== 2 || dragState) return;
    e.preventDefault();
    setPanState({ clientX: e.clientX, clientY: e.clientY, viewBox });
  }

  const edges: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];
  const pointCircles: { lineId: string; pointIndex: number; boreholeId: string; x: number; y: number; color: string }[] = [];
  for (const line of profileLines.filter((l) => l.visible)) {
    const linePoints = line.points.flatMap((p, pointIndex) => {
      const pos = positioned.find((entry) => entry.borehole.id === p.boreholeId);
      if (!pos) return [];
      const isDragged = dragState?.lineId === line.id && dragState.pointIndex === pointIndex;
      const depth = isDragged && dragDepth !== null ? dragDepth : p.depth;
      const y = depth - pos.borehole.groundElevation;
      const x = layoutById.get(p.boreholeId)?.x ?? pos.distance;
      pointCircles.push({ lineId: line.id, pointIndex, boreholeId: p.boreholeId, x, y, color: line.color });
      return [{ x, y }];
    });
    // 2D 只依水平位置連相鄰兩點(一條折線),不是 3D 那種所有點兩兩相連的完全圖——
    // 3D 的完全圖是為了後續空間地層建置,2D 只是想呈現一條乾淨的傳統剖面圖
    const sortedPoints = [...linePoints].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      edges.push({
        x1: sortedPoints[i].x,
        y1: sortedPoints[i].y,
        x2: sortedPoints[i + 1].x,
        y2: sortedPoints[i + 1].y,
        color: line.color,
      });
    }
  }

  const previewPosition = previewPoint ? positioned.find((p) => p.borehole.id === previewPoint.boreholeId) : undefined;

  return (
    <svg
      ref={svgRef}
      viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
      style={{
        width: "100%",
        height: "100%",
        background: "#e9eff5",
        cursor: profileModeEnabled && activeLineId ? "crosshair" : "default",
      }}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      onMouseDown={handleSvgMouseDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {selected.length < 2 ? (
        <text
          x={viewBox.minX + viewBox.width / 2}
          y={viewBox.minY + viewBox.height / 2}
          textAnchor="middle"
          fontSize={Math.max(viewBox.height * 0.05, 4)}
          fill="#666"
        >
          請選擇至少 2 支鑽孔
        </text>
      ) : (
        <>
          {showGrid &&
            elevationLevels.map((elevation) => {
              const isMajor = elevation % 5 === 0;
              const y = -elevation;
              return (
                <g key={elevation}>
                  <line
                    x1={viewBox.minX}
                    y1={y}
                    x2={viewBox.minX + viewBox.width}
                    y2={y}
                    stroke={isMajor ? "#999999" : "#cccccc"}
                    strokeWidth={viewBox.width * (isMajor ? 0.001 : 0.0006)}
                    strokeDasharray={isMajor ? undefined : `${viewBox.width * 0.006} ${viewBox.width * 0.004}`}
                  />
                  {isMajor && (
                    <text
                      x={viewBox.minX}
                      y={y}
                      fontSize={Math.max(viewBox.height * 0.02, baseBarWidth * 0.4)}
                      fill="#999999"
                      textAnchor="start"
                      dy="-2"
                    >
                      {`${elevation}m`}
                    </text>
                  )}
                </g>
              );
            })}
          {positioned.map(({ borehole }) => {
            const lay = layoutById.get(borehole.id)!;
            return (
              <g key={borehole.id}>
                {borehole.layers.map((layer, i) => (
                  <rect
                    key={i}
                    x={lay.x - lay.w / 2}
                    y={layer.topDepth - borehole.groundElevation}
                    width={lay.w}
                    height={layer.bottomDepth - layer.topDepth}
                    fill={effectiveLayerColor(layer, soilStyles)}
                    stroke="#333"
                    strokeWidth={viewBox.width * 0.001}
                  />
                ))}
                <text
                  x={lay.x}
                  y={-borehole.groundElevation - Math.max(viewBox.height * 0.02, baseBarWidth * 0.4)}
                  fontSize={Math.max(viewBox.height * 0.025, baseBarWidth * 0.5)}
                  textAnchor="middle"
                  fill="#222"
                >
                  {borehole.name}
                </text>
              </g>
            );
          })}
          {edges.map((edge, i) => (
            <line
              key={i}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              stroke={edge.color}
              strokeWidth={Math.max(viewBox.width * 0.0015, baseBarWidth * 0.02)}
            />
          ))}
          {profileModeEnabled &&
            pointCircles.map((pt) => (
              <circle
                key={`${pt.lineId}-${pt.pointIndex}`}
                cx={pt.x}
                cy={pt.y}
                r={baseBarWidth * 0.25}
                fill={pt.color}
                stroke="#fff"
                strokeWidth={baseBarWidth * 0.03}
                style={{ cursor: "grab" }}
                onMouseDown={(e) => {
                  if (e.button !== 0 || panState) return;
                  e.stopPropagation();
                  setDragState({ lineId: pt.lineId, pointIndex: pt.pointIndex, boreholeId: pt.boreholeId });
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ))}
          {previewPosition && previewPoint && (() => {
            const previewY = previewPoint.depth - previewPosition.borehole.groundElevation;
            const previewX = layoutById.get(previewPosition.borehole.id)?.x ?? previewPosition.distance;
            return (
              <>
                <circle
                  cx={previewX}
                  cy={previewY}
                  r={baseBarWidth * 0.25}
                  fill="none"
                  stroke={profileLines.find((l) => l.id === activeLineId)?.color ?? "#ff6b6b"}
                  strokeWidth={baseBarWidth * 0.05}
                />
                {/* 準備新增點時就先顯示深度數字,比照 3D 自由深度模式的浮動輸入框——
                    不分吸附/自由模式,previewPoint.depth 在 pointerToColumn 裡已經
                    套用過 snapDepth,兩種模式看到的數字本來就已經是正確、吸附後的值 */}
                <text
                  x={previewX + baseBarWidth * 0.6}
                  y={previewY}
                  fontSize={Math.max(viewBox.height * 0.03, baseBarWidth * 0.6)}
                  fill="#fff"
                  stroke="#000"
                  strokeWidth={baseBarWidth * 0.03}
                  paintOrder="stroke"
                >
                  {`${previewPoint.depth.toFixed(2)}m`}
                </text>
              </>
            );
          })()}
          {dragState && dragDepth !== null && (() => {
            // 拖動既有點時,在點旁邊即時顯示目前深度——跟 3D ProfileLines.tsx 拖曳時的
            // 浮動文字提示對應,paintOrder="stroke" + stroke 做出文字描邊效果,取代
            // 3D 那邊 drei <Text> 的 outlineWidth/outlineColor,在任何背景色塊上都看得清楚。
            const draggedPos = positioned.find((p) => p.borehole.id === dragState.boreholeId);
            if (!draggedPos) return null;
            const draggedX = layoutById.get(draggedPos.borehole.id)?.x ?? draggedPos.distance;
            return (
              <text
                x={draggedX + baseBarWidth * 0.6}
                y={dragDepth - draggedPos.borehole.groundElevation}
                fontSize={Math.max(viewBox.height * 0.03, baseBarWidth * 0.6)}
                fill="#fff"
                stroke="#000"
                strokeWidth={baseBarWidth * 0.03}
                paintOrder="stroke"
              >
                {`${dragDepth.toFixed(2)}m`}
              </text>
            );
          })()}
        </>
      )}
    </svg>
  );
}
