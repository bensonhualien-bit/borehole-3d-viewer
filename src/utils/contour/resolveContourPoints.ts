import type { Borehole } from "../../types/borehole";
import type { ProfileLine } from "../profileStorage";
import type { KnownPoint } from "./types";
import { hasEnoughPointsForContour } from "./delaunayInterpolator";
import { fitVariogramParams, type VariogramParams } from "./variogram";

// 共用給下面兩個「不需要平移座標」的 UI 判斷函式:點數/共線性、變異函數擬合結果都是
// 平移不變的性質,直接用真實(未平移的)座標即可,不需要 centerX/centerZ。
function resolveRawPoints(line: ProfileLine, boreholes: Borehole[]): KnownPoint[] {
  return line.points.flatMap((p) => {
    const borehole = boreholes.find((b) => b.id === p.boreholeId);
    if (!borehole) return [];
    return [{ x: borehole.x, z: borehole.y, value: borehole.groundElevation - p.depth }];
  });
}

// 沿用 Scene.tsx 既有的局部座標慣例(含 5ede1b7 修正過的南北鏡射問題):
// Three.js 是右手座標系,X=東、Y=上,Z 軸幾何上代表南,所以真實北座標(borehole.y)
// 要取「centerZ - borehole.y」,不能直接塞正值。
export function resolveContourPoints(
  line: ProfileLine,
  boreholes: Borehole[],
  centerX: number,
  centerZ: number,
): KnownPoint[] {
  return line.points.flatMap((p) => {
    const borehole = boreholes.find((b) => b.id === p.boreholeId);
    if (!borehole) return []; // 對應鑽孔已被刪除/未匯入,跳過,沿用既有容錯慣例
    return [
      {
        x: borehole.x - centerX,
        z: centerZ - borehole.y,
        value: borehole.groundElevation - p.depth,
      },
    ];
  });
}

// 給 UI(ProfileDrawer)在顯示等高線切換鈕旁判斷要不要提示「點數不足」。
export function lineHasEnoughPointsForContour(line: ProfileLine, boreholes: Borehole[]): boolean {
  return hasEnoughPointsForContour(resolveRawPoints(line, boreholes));
}

// 給 UI(ProfileDrawer)在使用者第一次自訂變異函數參數時,算出「這條線」實際會自動
// 擬合出來的 range/sill/nugget 當初始值——不能寫死 1/1/0,那跟實際自動擬合出來的值
// 通常差很多,會讓使用者只改一個欄位就悄悄動到其他兩個欄位背後代表的實際行為。
// 點數不足時回傳 null,呼叫端自行決定 fallback。
export function resolveVariogramPreview(line: ProfileLine, boreholes: Borehole[]): VariogramParams | null {
  const points = resolveRawPoints(line, boreholes);
  if (points.length < 3) return null;
  return fitVariogramParams(points);
}

// 圖例只顯示「目前第一條開等高線的線」的範圍,跟 resolveVariogramPreview 同一個
// 「多線時取第一條開等高線的線當代表」規則一致。
export function pickLegendLine(lines: ProfileLine[]): ProfileLine | null {
  return lines.find((line) => line.showContour) ?? null;
}
