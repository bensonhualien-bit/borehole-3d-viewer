export interface ProfileAxisEntry {
  boreholeId: string;
  distance: number; // 沿最佳擬合線的投影距離(以選中鑽孔的平均座標為 0),可能為負
}

// 用 total least squares(不是簡單線性回歸,避免鑽孔接近垂直排列時線性回歸的
// y=f(x) 假設失效)算一條最能代表這些鑽孔平面分布的直線,再把每支鑽孔投影到
// 這條線上,得到它在剖面圖上的水平座標。只有 0~1 支鑽孔時方向退化,回傳距離 0,
// 不會噴錯。
export function computeProfileAxis(
  boreholes: { id: string; x: number; y: number }[]
): ProfileAxisEntry[] {
  if (boreholes.length === 0) return [];
  const meanX = boreholes.reduce((s, b) => s + b.x, 0) / boreholes.length;
  const meanY = boreholes.reduce((s, b) => s + b.y, 0) / boreholes.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const b of boreholes) {
    const dx = b.x - meanX;
    const dy = b.y - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dirX = Math.cos(theta);
  const dirY = Math.sin(theta);
  return boreholes
    .map((b) => ({ boreholeId: b.id, distance: (b.x - meanX) * dirX + (b.y - meanY) * dirY }))
    .sort((a, b) => a.distance - b.distance);
}

// 「鑽孔間直線距離」模式:順序沿用 computeProfileAxis 的投影排序結果(由左到右),
// 但水平位置改成跟前一支鑽孔的實際 2D 直線距離累加起來(從 0 開始),取代投影後的
// 座標——確保任兩支不同鑽孔的間距一定 > 0,不會因為投影方向剛好讓兩孔重疊在同一點。
export function computeSequentialDistanceAxis(
  boreholes: { id: string; x: number; y: number }[]
): ProfileAxisEntry[] {
  const projected = computeProfileAxis(boreholes);
  if (projected.length === 0) return [];
  const byId = new Map(boreholes.map((b) => [b.id, b]));
  let cumulative = 0;
  const result: ProfileAxisEntry[] = [];
  for (let i = 0; i < projected.length; i++) {
    if (i > 0) {
      const prev = byId.get(projected[i - 1].boreholeId)!;
      const curr = byId.get(projected[i].boreholeId)!;
      cumulative += Math.hypot(curr.x - prev.x, curr.y - prev.y);
    }
    result.push({ boreholeId: projected[i].boreholeId, distance: cumulative });
  }
  return result;
}
