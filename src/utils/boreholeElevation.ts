import type { Borehole } from "../types/borehole";

// CPT 測點(layers 為空陣列)也要能貢獻一個深度範圍,不能整孔被當成 0 深度畫成一條線
export function boreholeMaxDepth(borehole: Borehole): number {
  const layerMax = borehole.layers.reduce((max, l) => Math.max(max, l.bottomDepth), 0);
  const cptMax = borehole.cptCurve?.length ? borehole.cptCurve[borehole.cptCurve.length - 1].depth : 0;
  return Math.max(layerMax, cptMax);
}

// 高程網格(2D 橫線 / 3D 立體網格牆)共用的範圍計算:上界是目前顯示的鑽孔裡最高的
// 地表高程 +5m,下界是最低的鑽孔底部高程 -5m。空陣列時回傳一個安全預設範圍,
// 避免 Math.max/min 在空陣列上算出 Infinity/-Infinity。
export function computeElevationRange(boreholes: Borehole[]): { min: number; max: number } {
  if (boreholes.length === 0) return { min: -10, max: 10 };
  const groundElevations = boreholes.map((b) => b.groundElevation);
  const bottomElevations = boreholes.map((b) => b.groundElevation - boreholeMaxDepth(b));
  return {
    max: Math.max(...groundElevations) + 5,
    min: Math.min(...bottomElevations) - 5,
  };
}
