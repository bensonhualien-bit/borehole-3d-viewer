import type { SoilLayer } from "../types/borehole";

function nearest(rawDepth: number, candidates: number[]): number {
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

// 邊界吸附模式:BH 孔吸最近的 topDepth/bottomDepth;CPT 孔(沒有土層)吸最近的
// qc 樣本深度——點到的位置就是曲線上真實量到的點,跟 BH 吸地層邊界的精神一致。
// 自由模式,或兩種候選都沒有時,退回吸附到 0.01m(1cm)格線。3D(BoreholeColumn)
// 與 2D(ProfileSection2D)共用同一份邏輯。
export function snapDepth(
  rawDepth: number,
  layers: SoilLayer[],
  mode: "boundary" | "free",
  cptSampleDepths?: number[],
): number {
  if (mode === "boundary" && layers.length > 0) {
    return nearest(rawDepth, layers.flatMap((l) => [l.topDepth, l.bottomDepth]));
  }
  if (mode === "boundary" && cptSampleDepths && cptSampleDepths.length > 0) {
    return nearest(rawDepth, cptSampleDepths);
  }
  return Math.round(rawDepth / 0.01) * 0.01;
}
