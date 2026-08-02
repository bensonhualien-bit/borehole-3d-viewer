import type { SoilLayer } from "../types/borehole";

// 邊界吸附模式:找 layers 清單裡所有 topDepth/bottomDepth 中離 rawDepth 最近的一個;
// 自由模式,或這支鑽孔根本沒有地層資料時,退回吸附到 0.01m(1cm)格線——真實工程判定
// 到公分級已經足夠精細,不需要更細。3D(BoreholeColumn.tsx)與 2D(ProfileSection2D.tsx)
// 共用同一份邏輯,避免兩邊各自實作後行為不小心跑掉。
export function snapDepth(rawDepth: number, layers: SoilLayer[], mode: "boundary" | "free"): number {
  if (mode === "free" || layers.length === 0) {
    return Math.round(rawDepth / 0.01) * 0.01;
  }
  const candidates = layers.flatMap((l) => [l.topDepth, l.bottomDepth]);
  let best = candidates[0];
  let bestDiff = Math.abs(rawDepth - candidates[0]);
  for (const c of candidates) {
    const diff = Math.abs(rawDepth - c);
    if (diff < bestDiff) {
      best = c;
      bestDiff = diff;
    }
  }
  return best;
}
