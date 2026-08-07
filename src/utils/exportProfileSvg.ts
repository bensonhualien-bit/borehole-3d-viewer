// 匯出 PDF 的剖面繪圖區產生器(純字串,頁面 mm 座標)。
// 縱向誇張:自動填繪圖區高的 70%,向下取 0.5 步進,下限 1×;高瘦內容以
// 高度反推橫向縮。左右各 9mm 高程標值欄(粗體),格線只畫在兩欄之間,
// 柱狀整體內縮 1 柱寬不遮高程字。
import type { Borehole } from "../types/borehole";
import type { ProfileLine } from "./profileStorage";
import { computeProfileAxis, computeSequentialDistanceAxis } from "./profileAxis";
import { computeBaseBarWidth, computeBarLayout, type BarWidthSettings } from "./barWidth";
import { computeElevationRange, boreholeMaxDepth } from "./boreholeElevation";
import { effectiveLayerColor, type SoilStyles } from "./soilStyles";
import { escapeXml } from "./exportPageTemplate";
import { buildCptPolyline, negativeQcRuns } from "./cptCurve";

const LABEL_W = 9;
const TARGET_FILL = 0.7;
const FONT_ELEV = 3.2;
const FONT_NAME = 3.8;

export interface ProfileSvgInput {
  boreholes: Borehole[];
  profileLines: ProfileLine[];
  axisMode: "projected" | "sequential";
  soilStyles: SoilStyles;
  barWidthSettings: BarWidthSettings;
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
  qcMax: number | null;
}
export interface ProfileSvgResult {
  markup: string;
  verticalScale: number;
}

export function buildProfileSvg(input: ProfileSvgInput): ProfileSvgResult {
  const { boreholes, profileLines, axisMode, soilStyles, barWidthSettings, drawX, drawY, drawW, drawH, qcMax } = input;
  const coords = boreholes.map((b) => ({ id: b.id, x: b.x, y: b.y }));
  const axis = axisMode === "sequential" ? computeSequentialDistanceAxis(coords) : computeProfileAxis(coords);
  const projectedAxis = axisMode === "sequential" ? computeProfileAxis(coords) : axis;
  const positioned = axis.flatMap((e) => {
    const b = boreholes.find((x) => x.id === e.boreholeId);
    return b ? [{ borehole: b, distance: e.distance }] : [];
  });
  const projDistances = projectedAxis.map((e) => e.distance);
  const projSpan = Math.max(...projDistances) - Math.min(...projDistances);
  const baseBarWorld = computeBaseBarWidth(projSpan, positioned.length, barWidthSettings);
  const layout = computeBarLayout(positioned.map((p) => p.distance), baseBarWorld);

  // 世界 x 範圍取「柱緣」極值(疊合置中可能超出孔位範圍)
  const xMinW = Math.min(...layout.map((l) => l.x - l.w / 2));
  const xMaxW = Math.max(...layout.map((l) => l.x + l.w / 2));
  const worldSpanX = Math.max(xMaxW - xMinW, 1e-9);

  // 水平配置:兩側標值欄 → 收斂型(closed-form)內縮,取代舊的兩階段估算
  // (舊版用未內縮寬度粗估柱寬 mm 留隙,兩孔重合等退化情況下會讓 plotW 算出
  // 0、sx 算出 0,後面 vRaw 除以 0 得 Infinity,再乘 0 得 NaN)。
  const innerX0 = drawX + LABEL_W;
  const innerW0 = drawW - LABEL_W * 2;
  // k = baseBarWorld / worldSpanX(恆 > 0),plotW = innerW0 / (1 + 2k)。
  // 代數驗證「gap 恰好 = 一個最終柱寬(baseBarWorld × 最終 sx)」:
  //   innerW0 - plotW = innerW0 × (1 − 1/(1+2k)) = innerW0 × 2k/(1+2k) = 2k × plotW
  //   ⇒ gapMM = (innerW0 − plotW) / 2 = k × plotW
  //           = (baseBarWorld / worldSpanX) × plotW = baseBarWorld × (plotW / worldSpanX)
  //           = baseBarWorld × sx                                    ∎
  // plotW 恆正(k>0 恆成立,不再有兩孔重合等退化情況下 plotW/sx 算出 0 或負值的問題)。
  const plotW = innerW0 / (1 + (2 * baseBarWorld) / worldSpanX);
  const gapMM = (innerW0 - plotW) / 2;
  let plotX = innerX0 + gapMM;
  let sx = plotW / worldSpanX;
  const X = (wx: number) => plotX + (wx - xMinW) * sx;

  // 垂直:70% 目標、0.5 步進、下限 1(spec:下限 1×,不縮小)。若在這個 V 之下
  // 剖面帶仍超出繪圖區高度,不縮小 V(那樣會讓 verticalScale 標示不誠實、也
  // 違反下限承諾)——改成反推壓縮橫向 sx,內容變窄後重新置中於兩欄標值之間
  // (新的兩側空隙只會比 gapMM 更寬,見下方 plotX 調整)。
  const range = computeElevationRange(boreholes); // 已含 ±5m 邊距
  const eTop = range.max, eBot = range.min;
  const worldH = eTop - eBot;
  const vRaw = (TARGET_FILL * drawH) / (worldH * sx);
  const v = Math.max(1, Math.floor(vRaw * 2) / 2);
  if (!Number.isFinite(v)) {
    throw new Error("剖面縱向比例計算異常(非有限值),請檢查鑽孔資料是否有效");
  }
  let sy = v * sx;
  if (worldH * sy > drawH) {
    const newSx = drawH / (worldH * v);
    const newPlotW = worldSpanX * newSx;
    plotX = plotX + (plotW - newPlotW) / 2; // 內容變窄 → 重新置中(兩側留白只會更多)
    sx = newSx;
    sy = v * sx;
  }
  const bandH = worldH * sy;
  const bandY = drawY + (drawH - bandH) / 2;
  const Y = (e: number) => bandY + (eTop - e) * sy;

  const parts: string[] = [];
  // 高程格線與雙側標值(主 5m 實線+標值、次 1m 虛線)
  const lineX1 = innerX0, lineX2 = drawX + drawW - LABEL_W;
  for (let e = Math.ceil(eBot); e <= Math.floor(eTop); e++) {
    const major = e % 5 === 0;
    parts.push(`<line x1="${lineX1}" y1="${Y(e)}" x2="${lineX2}" y2="${Y(e)}" stroke="${major ? "#9a9a9a" : "#dcdcdc"}" stroke-width="${major ? 0.25 : 0.1}"${major ? "" : ' stroke-dasharray="1.6 1.1"'} />`);
    if (major) {
      parts.push(`<text x="${innerX0 - 1.5}" y="${Y(e) + 1.2}" font-size="${FONT_ELEV}" font-weight="bold" font-family="sans-serif" text-anchor="end" fill="#444">${e}m</text>`);
      parts.push(`<text x="${lineX2 + 1.5}" y="${Y(e) + 1.2}" font-size="${FONT_ELEV}" font-weight="bold" font-family="sans-serif" text-anchor="start" fill="#444">${e}m</text>`);
    }
  }
  // 鑽孔柱
  positioned.forEach((p, i) => {
    const lay = layout[i];
    const g = p.borehole.groundElevation;
    for (const layer of p.borehole.layers) {
      parts.push(`<rect x="${X(lay.x) - (lay.w * sx) / 2}" y="${Y(g - layer.topDepth)}" width="${lay.w * sx}" height="${(layer.bottomDepth - layer.topDepth) * sy}" fill="${escapeXml(effectiveLayerColor(layer, soilStyles))}" fill-opacity="0.85" stroke="#333" stroke-width="0.2" />`);
    }
    if (p.borehole.layers.length === 0 && p.borehole.cptCurve && p.borehole.cptCurve.length >= 2 && qcMax !== null) {
      const maxD = boreholeMaxDepth(p.borehole);
      parts.push(`<line x1="${X(lay.x)}" y1="${Y(g)}" x2="${X(lay.x)}" y2="${Y(g - maxD)}" stroke="#999999" stroke-width="0.2" />`);
      const pts = buildCptPolyline(p.borehole.cptCurve, qcMax, lay.w)
        .map((pt) => `${X(lay.x + pt.offset)},${Y(g - pt.depth)}`)
        .join(" ");
      parts.push(`<polyline points="${pts}" fill="none" stroke="#0e7490" stroke-width="0.3" />`);
      for (const r of negativeQcRuns(p.borehole.cptCurve)) {
        parts.push(`<text x="${X(lay.x + lay.w * 0.15)}" y="${Y(g - (r.topDepth + r.bottomDepth) / 2)}" font-size="${FONT_ELEV}" font-family="sans-serif" fill="#cc2222">${escapeXml("0")}</text>`);
      }
    }
  });
  // 孔名:置中於柱頂 x,由左至右貪婪分層避免水平重疊,放上層者附虛線引線回柱頂
  const nameLabels = positioned.map((p, i) => ({
    drawnX: X(layout[i].x),
    halfWidth: (p.borehole.name.length * FONT_NAME * 0.55) / 2,
    name: p.borehole.name,
    groundElevation: p.borehole.groundElevation,
  }));
  const NAME_ROW_H = 5;
  const NAME_ROW_PAD = 1;
  const MAX_NAME_ROWS = 6;
  const baseNameY = Math.min(...positioned.map((p) => Y(p.borehole.groundElevation))) - 2;

  // 某一列是否與最上層高程標值("Xm")的文字帶垂直重疊 → 是則該列加入左右
  // 兩個靜態障礙區間(標值欄寬度 + 1mm 安全隙),避免孔名與它橫向相撞。逐列
  // (不只 row0)判斷:貪婪分層時較密的孔群可能把孔名擠到 row1、row2……那些
  // 列一樣可能落在高程標值的文字帶高度上,需要各自檢查。
  const eMajTop = Math.floor(eTop / 5) * 5;
  const elevLabelY = Y(eMajTop) + 1.2;
  const rowObstacles = (row: number): [number, number][] =>
    Math.abs(baseNameY - row * NAME_ROW_H - elevLabelY) < 3.8
      ? [
          [drawX, drawX + LABEL_W + 1],
          [drawX + drawW - LABEL_W - 1, drawX + drawW],
        ]
      : [];

  const rowRightEdge: number[] = [];
  const rowOfLabel = new Map<(typeof nameLabels)[number], number>();
  for (const label of [...nameLabels].sort((a, b) => a.drawnX - b.drawnX)) {
    let row = 0;
    for (; row < MAX_NAME_ROWS; row++) {
      const rightEdge = rowRightEdge[row];
      const clearsPriorLabel = rightEdge === undefined || label.drawnX - label.halfWidth >= rightEdge + NAME_ROW_PAD;
      const clearsObstacles = rowObstacles(row).every(
        ([oStart, oEnd]) => label.drawnX + label.halfWidth <= oStart || label.drawnX - label.halfWidth >= oEnd
      );
      if (clearsPriorLabel && clearsObstacles) break;
    }
    if (row >= MAX_NAME_ROWS) row = MAX_NAME_ROWS - 1;
    rowRightEdge[row] = label.drawnX + label.halfWidth;
    rowOfLabel.set(label, row);
  }
  for (const label of nameLabels) {
    const row = rowOfLabel.get(label)!;
    const rowY = baseNameY - row * NAME_ROW_H;
    // 引線不再只看「是否放到 row>=1」——baseNameY 是錨定在「最上層地表線」,
    // 起伏地形上 row0 的孔名也可能離「自己那支柱子」的柱頂很遠(row0 是相對
    // 其他孔名的分層結果,不代表這支孔本身的地表就在 row0 附近)。改成直接比
    // 這個孔名列與它自己柱頂的垂直距離,超過 4mm 才畫引線,任何列都適用。
    const holeTopY = Y(label.groundElevation);
    if (holeTopY - (rowY + 1) > 4) {
      parts.push(`<line x1="${label.drawnX}" y1="${rowY + 1}" x2="${label.drawnX}" y2="${holeTopY}" stroke="#666" stroke-width="0.15" stroke-dasharray="1 0.8" />`);
    }
    parts.push(`<text x="${label.drawnX}" y="${rowY}" font-size="${FONT_NAME}" font-weight="bold" font-family="sans-serif" text-anchor="middle" fill="#111">${escapeXml(label.name)}</text>`);
  }
  // 剖面線(可見者;點依繪製中心 x 排序後折線相連)
  const layoutById = new Map(positioned.map((p, i) => [p.borehole.id, layout[i]]));
  for (const line of profileLines.filter((l) => l.visible)) {
    const pts = line.points.flatMap((pt) => {
      const p = positioned.find((e) => e.borehole.id === pt.boreholeId);
      const lay = layoutById.get(pt.boreholeId);
      if (!p || !lay) return [];
      return [{ x: X(lay.x), y: Y(p.borehole.groundElevation - pt.depth) }];
    }).sort((a, b) => a.x - b.x);
    if (pts.length >= 2) {
      parts.push(`<polyline points="${pts.map((q) => `${q.x},${q.y}`).join(" ")}" fill="none" stroke="${escapeXml(line.color)}" stroke-width="0.6" />`);
    }
  }
  return { markup: `<g>${parts.join("")}</g>`, verticalScale: v };
}
