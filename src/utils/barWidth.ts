// 2D 剖面柱寬規則(螢幕與匯出 PDF 共用;spec:2026-08-01-bar-width-settings,
// 全寬並排規則更新見 spec 2026-08-01-export-layout-design 樣張檢查點回饋 2)。
// 基準柱寬 = 跨距 × min(上限%, f÷N):少孔時視覺寬度固定(上限%),孔多時
// ≈ 平均間距 × f 平滑變細。疊合(中心距 < 基準寬)以「並排錯開」處理:
// 鏈式合併成群,群內每支維持「全」基準寬、依位置排序並排、整群置中於成員
// 平均位置——群總佔寬 = k × 基準寬(除以 k 變細規則已廢除:48 孔實測太細
// 不可判讀),零重疊、群外柱子不受影響。並排會讓群內成員的繪製位置偏離
// 真實位置:k 支一群時,單支柱子中心與「群中心(成員平均位置)」的最大
// 偏移量是 (k−1)·W/2(W = 基準柱寬,出現在群兩端的成員上;相對各自真實
// 位置的偏移另加上該成員與群中心的原始距離)。

export interface BarWidthSettings {
  /** 柱寬佔跨距的上限(比例值) */
  maxFraction: number;
  /** 孔多時柱寬 ≈ 平均間距 × 此係數 */
  spacingFactor: number;
}

export const DEFAULT_BAR_WIDTH_SETTINGS: BarWidthSettings = {
  maxFraction: 0.02,
  spacingFactor: 0.35,
};

// span<=0(全部重合)或 count<1 時回退固定 5——沿用舊規則對退化輸入的
// 回退值;實務上元件要求 >=2 支才渲染剖面,這只是除零保險。
export function computeBaseBarWidth(span: number, count: number, s: BarWidthSettings): number {
  if (!(span > 0) || count < 1) return 5;
  return span * Math.min(s.maxFraction, s.spacingFactor / count);
}

export function computeBarLayout(positions: number[], baseWidth: number): { x: number; w: number }[] {
  const idx = positions.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  // 每群的 footprint = k(群內支數)× 基準寬,置中於成員平均位置;相鄰群
  // footprint 相交就再合併,迭代到穩定。跟舊規則(footprint 固定 = 基準寬)
  // 不同的是:這裡合併會讓 footprint 隨 k 成長變寬,群「長腳」因此可能碰到
  // 原本不相交、甚至上一輪都還沒碰到的鄰居——外層 while 迴圈的「再一輪掃描」
  // 現在是真正 load-bearing 的邏輯,不是安全網,務必保留、不可假設一輪掃描
  // 就會收斂(見 barWidth.test.ts 的第二輪合併案例)。
  let clusters: { x: number; i: number }[][] = idx.map((e) => [e]);
  let merged = true;
  while (merged) {
    merged = false;
    const next: { x: number; i: number }[][] = [];
    for (const c of clusters) {
      const prev = next[next.length - 1];
      if (prev) {
        const prevCenter = prev.reduce((s, e) => s + e.x, 0) / prev.length;
        const curCenter = c.reduce((s, e) => s + e.x, 0) / c.length;
        // footprint 邊緣:prev 群右緣 = prevCenter + prev.length×baseWidth/2、
        // cur 群左緣 = curCenter - cur.length×baseWidth/2。邊緣相交(縫隙 < 0)
        // 才合併。
        const prevRightEdge = prevCenter + (prev.length * baseWidth) / 2;
        const curLeftEdge = curCenter - (c.length * baseWidth) / 2;
        if (curLeftEdge < prevRightEdge) {
          prev.push(...c);
          merged = true;
          continue;
        }
      }
      next.push(c);
    }
    clusters = next;
  }
  const out = new Array<{ x: number; w: number }>(positions.length);
  for (const c of clusters) {
    const center = c.reduce((s, e) => s + e.x, 0) / c.length;
    const k = c.length;
    const w = baseWidth; // 全寬並排:除以 k 變細規則已廢除
    // c 的元素順序繼承自最初對 positions 的全域 x 排序(合併只會拼接相鄰、
    // 已排序的連續片段),因此 c 本身就是群內由左至右的順序,不需要再排序。
    c.forEach((e, j) => {
      out[e.i] = { x: center - (k * baseWidth) / 2 + w * (j + 0.5), w };
    });
  }
  return out;
}

// localStorage 與專案檔共用的驗證:壞值回預設、超界 clamp(0 或負的柱寬
// 會讓整個剖面消失,不能放行)。
export function normalizeBarWidthSettings(input: unknown): BarWidthSettings {
  const clampNum = (x: unknown, min: number, max: number, dflt: number) =>
    typeof x === "number" && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : dflt;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ...DEFAULT_BAR_WIDTH_SETTINGS };
  }
  const v = input as Record<string, unknown>;
  return {
    maxFraction: clampNum(v.maxFraction, 0.005, 0.05, DEFAULT_BAR_WIDTH_SETTINGS.maxFraction),
    spacingFactor: clampNum(v.spacingFactor, 0.1, 0.8, DEFAULT_BAR_WIDTH_SETTINGS.spacingFactor),
  };
}
