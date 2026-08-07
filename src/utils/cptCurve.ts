import type { Borehole, CptSample } from "../types/borehole";

// CPT qc 曲線的顯示幾何,3D(CptCurveLine)/2D(ProfileSection2D)/PDF(exportProfileSvg)
// 三處共用同一份,避免各自實作跑掉。顯示層一律把 qc<0 夾成 0(量測異常),
// 原始 cptCurve 資料保持原樣不修改——資料是證據,修圖不修數。

/** 全場 qc 最大值(夾 0 後);沒有任何正值樣本時回傳 null,呼叫端不畫曲線 */
export function globalQcMax(boreholes: Borehole[]): number | null {
  let max = 0;
  for (const b of boreholes) {
    for (const s of b.cptCurve ?? []) {
      if (s.qc > max) max = s.qc;
    }
  }
  return max > 0 ? max : null;
}

export interface CptPolylinePoint {
  /** 距孔位基準線的水平偏移,0=qc<=0、maxWidth=qc=qcMax */
  offset: number;
  depth: number;
}

export function buildCptPolyline(
  curve: CptSample[],
  qcMax: number,
  maxWidth: number,
): CptPolylinePoint[] {
  if (qcMax <= 0) return [];
  return curve.map((s) => ({ offset: (Math.max(0, s.qc) / qcMax) * maxWidth, depth: s.depth }));
}

export interface DepthRun {
  topDepth: number;
  bottomDepth: number;
}

/**
 * 連續 qc<0 樣本合併成深度區段,給紅色「qc<0→0」標註用(逐樣本標會蓋住曲線)。
 * 前置條件:curve 依深度遞增排序(xlsx 匯入保證)——「相鄰樣本」即「深度相鄰」,
 * 亂序輸入會安靜產生錯誤的區段邊界。
 */
export function negativeQcRuns(curve: CptSample[]): DepthRun[] {
  const runs: DepthRun[] = [];
  let current: DepthRun | null = null;
  for (const s of curve) {
    if (s.qc < 0) {
      if (current) current.bottomDepth = s.depth;
      else current = { topDepth: s.depth, bottomDepth: s.depth };
    } else if (current) {
      runs.push(current);
      current = null;
    }
  }
  if (current) runs.push(current);
  return runs;
}

/** hover 數值標籤的字級係數:樣本越多字越小(0807 回饋),回傳相對 radius 的倍率 */
export function qcLabelFontScale(sampleCount: number): number {
  if (sampleCount <= 30) return 1;
  if (sampleCount <= 60) return 0.8;
  return 0.6;
}

/** 每隔幾個樣本標一個數值:保證標籤垂直間距 >= 1.15 倍字高,絕不重疊。
 *  sampleSpacing = 相鄰樣本的深度間距(m),fontSize = 字高(world 單位)。
 *  前提:呼叫端傳的是「平均」間距(首末深度差/段數)——CPT 匯入格式是固定
 *  間距取樣(0.2m),平均即實際;若未來出現非等距取樣資料,局部密集區段的
 *  標籤間距可能低於保證值,屆時要改成逐段實際間距計算。 */
export function qcLabelStep(sampleSpacing: number, fontSize: number): number {
  if (!(sampleSpacing > 0)) return 1;
  return Math.max(1, Math.ceil((fontSize * 1.15) / sampleSpacing));
}
