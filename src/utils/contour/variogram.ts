import type { KnownPoint } from "./types";

export interface VariogramParams {
  range: number;
  sill: number;
  nugget: number;
}

// 球形模型(spherical variogram):地質統計最常用的預設模型。γ(0) 固定回傳 0
// (一個點跟自己比較,變異為 0),h>0 時即使趨近 0 也會跳到接近 nugget 的值
// (這個不連續正是「nugget effect」的定義,不是浮點數誤差)。
export function sphericalVariogram(h: number, params: VariogramParams): number {
  if (h <= 0) return 0;
  if (h >= params.range) return params.nugget + params.sill;
  const ratio = h / params.range;
  return params.nugget + params.sill * (1.5 * ratio - 0.5 * ratio ** 3);
}

// 從實際點位自動估計 range/sill/nugget(簡化的經驗估計,不是嚴謹的非線性最小平方
// 擬合——對這裡「單一剖面線幾到十幾個點」的資料量已經夠用):
// - range:點位分布的最大兩兩距離的 1/3(距離太遠的點對彼此的空間相關性通常已經很弱)
// - sill:各點 value 的母體變異數(除以 N,不是 N-1——樣本數通常很少,N-1 在只有
//   3 個點時分母只剩 2,會不必要地放大變異數估計)
// - nugget:固定取 sill 的 5%
export function fitVariogramParams(points: KnownPoint[]): VariogramParams {
  let maxDistance = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z);
      if (d > maxDistance) maxDistance = d;
    }
  }
  const range = maxDistance > 0 ? maxDistance / 3 : 1;
  const meanValue = points.reduce((sum, p) => sum + p.value, 0) / points.length;
  const variance = points.reduce((sum, p) => sum + (p.value - meanValue) ** 2, 0) / points.length;
  const sill = variance > 0 ? variance : 1;
  return { range, sill, nugget: sill * 0.05 };
}
