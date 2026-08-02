import { describe, expect, it } from "vitest";
import {
  DEFAULT_BAR_WIDTH_SETTINGS,
  computeBarLayout,
  computeBaseBarWidth,
  normalizeBarWidthSettings,
} from "./barWidth";

const S = DEFAULT_BAR_WIDTH_SETTINGS;

describe("computeBaseBarWidth", () => {
  it("少孔吃上限:4 支、跨距 300 → 300×2% = 6", () => {
    expect(computeBaseBarWidth(300, 4, S)).toBeCloseTo(6);
  });
  it("多孔吃 f÷N:48 支、跨距 700 → 700×(0.35/48)", () => {
    expect(computeBaseBarWidth(700, 48, S)).toBeCloseTo(700 * (0.35 / 48));
  });
  it("分界點:恰在 maxFraction = spacingFactor/N 時兩者相等", () => {
    const n = S.spacingFactor / S.maxFraction; // 17.5
    expect(computeBaseBarWidth(100, n, S)).toBeCloseTo(100 * S.maxFraction);
  });
  it("span<=0 或 count<1 回退固定 5", () => {
    expect(computeBaseBarWidth(0, 4, S)).toBe(5);
    expect(computeBaseBarWidth(-1, 4, S)).toBe(5);
    expect(computeBaseBarWidth(100, 0, S)).toBe(5);
  });
});

describe("computeBarLayout", () => {
  it("無疊合:每支原位、原寬,輸出順序對應輸入", () => {
    const out = computeBarLayout([0, 100, 200], 6);
    expect(out).toEqual([
      { x: 0, w: 6 },
      { x: 100, w: 6 },
      { x: 200, w: 6 },
    ]);
  });
  it("兩支疊合:全寬、並排、置中於平均位置(除以 k 變細規則已廢除)", () => {
    const out = computeBarLayout([100, 101.5], 6);
    // 群中心 100.75,footprint = k×W = 12 → 左支中心 100.75-6+3=97.75,右支
    // 100.75-6+9=103.75
    expect(out[0]).toEqual({ x: 97.75, w: 6 });
    expect(out[1]).toEqual({ x: 103.75, w: 6 });
  });
  it("三支鏈式合併:各全寬,依位置排序並排,中心間距恰為一個柱寬", () => {
    const out = computeBarLayout([100.5, 100, 100.2], 6);
    // 排序後 100, 100.2, 100.5;群中心 (100+100.2+100.5)/3=100.233333…;
    // footprint=k×W=18;j=0(x=100)→100.233333-9+3=94.233333、
    // j=1(x=100.2)→100.233333、j=2(x=100.5)→100.233333-9+15=106.233333
    expect(out.map((o) => o.w)).toEqual([6, 6, 6]);
    // 輸出順序對應「輸入」順序:輸入[0]=100.5 是群內第 3 支(最右)
    const center = 100.2333333333333;
    expect(out[1].x).toBeCloseTo(center - 6); // 輸入[1]=100 最左
    expect(out[2].x).toBeCloseTo(center); // 輸入[2]=100.2 置中
    expect(out[0].x).toBeCloseTo(center + 6); // 輸入[0]=100.5 最右
    // 相鄰恰好貼齊(中心距 = 柱寬,零重疊零縫隙)
    const sortedX = [...out].map((o) => o.x).sort((a, b) => a - b);
    expect(sortedX[1] - sortedX[0]).toBeCloseTo(6);
    expect(sortedX[2] - sortedX[1]).toBeCloseTo(6);
  });
  it("群置中後 footprint(隨 k 成長)碰到鄰居 → 再合併,單輪內完成", () => {
    // [0, 5, 8]、寬 6(全寬規則下手算):
    // 第一輪掃描 0 與 5 的 footprint([-3,3] 與 [2,8])已相交(1 支 vs 1 支,
    // 跟舊規則相同,因為 k=1 時 footprint 就是一根柱寬,新舊規則在這一步沒有
    // 差異),併群後群中心 2.5、k=2、footprint = 2×6=12 → [-3.5, 8.5];緊接著
    // 同一輪掃到 8,它的 footprint(k=1)[5,11] 左緣 5 落在 [-3.5,8.5] 之內
    // (5 < 8.5)仍相交,同一輪內直接吸收,三支合併成一群,群中心
    // (0+5+8)/3=4.333333…,k=3,footprint=18,各全寬 6。
    // 這個案例在第一輪掃描(outer while 迴圈第 1 次 pass)就完成,不依賴「第
    // 二輪確認」——真正需要第二輪才能收斂的案例見下一個測試
    // (「兩組各自先合併、footprint 長大後才碰到彼此」)。
    const out = computeBarLayout([0, 5, 8], 6);
    expect(out.map((o) => o.w)).toEqual([6, 6, 6]);
    const center = (0 + 5 + 8) / 3; // 4.333333…
    expect(out[0].x).toBeCloseTo(center - 9 + 3); // -1.666667
    expect(out[1].x).toBeCloseTo(center - 9 + 9); // 4.333333
    expect(out[2].x).toBeCloseTo(center - 9 + 15); // 10.333333
  });
  it("兩組各自先合併、footprint 長大後才碰到彼此 → 需要第二輪 while pass", () => {
    // [0, 5, 11.9, 16.9]、寬 6。手算第一輪掃描(依 x 升冪逐一處理):
    //   c=[0]:      無 prev,直接放入
    //   c=[5]:      prev=[0](center 0,k=1,右緣 3);cur center 5,k=1,左緣 2;
    //               2<3 → 合併成 [0,5]
    //   c=[11.9]:   prev=[0,5](center 2.5,k=2,右緣 2.5+6=8.5);cur center
    //               11.9,k=1,左緣 11.9-3=8.9;8.9 不小於 8.5 → 不合併,
    //               [11.9] 自成一群
    //   c=[16.9]:   prev=[11.9](center 11.9,k=1,右緣 14.9);cur center
    //               16.9,k=1,左緣 13.9;13.9<14.9 → 合併成 [11.9,16.9]
    // 第一輪掃描結束,clusters = [[0,5], [11.9,16.9]],兩群都因為本輪發生過
    // 合併,merged=true,進入第二輪掃描:
    //   prev=[0,5](center 2.5,k=2,右緣 2.5+6=8.5);cur=[11.9,16.9]
    //   (center 14.4,k=2,左緣 14.4-6=8.4);8.4<8.5 → 合併成一整群
    //   [0,5,11.9,16.9]——這一步只有在 footprint 已經隨 k=2 成長之後才會
    //   相交(第一輪掃到 11.9 時 prev 的 footprint 右緣還是舊值 8.5 沒錯,但
    //   cur 當時還是 k=1 左緣 8.9,不相交;要等 16.9 併入 11.9 讓右側那組也
    //   長成 k=2、左緣從 8.9 縮到 8.4,兩組才碰上),證明外層 while 迴圈的
    //   「再一輪」是這個案例 genuinely 需要、而非防禦性安全網。
    // 第三輪掃描:clusters = [[0,5,11.9,16.9]] 只剩一群,無合併對象,穩定。
    // 最終:k=4,center=(0+5+11.9+16.9)/4=8.45,footprint=24,各全寬 6:
    //   j=0(x=0)   → 8.45-12+3 = -0.55
    //   j=1(x=5)   → 8.45-12+9 = 5.45
    //   j=2(x=11.9)→ 8.45-12+15 = 11.45
    //   j=3(x=16.9)→ 8.45-12+21 = 17.45
    const out = computeBarLayout([0, 5, 11.9, 16.9], 6);
    expect(out.map((o) => o.w)).toEqual([6, 6, 6, 6]);
    expect(out[0].x).toBeCloseTo(-0.55);
    expect(out[1].x).toBeCloseTo(5.45);
    expect(out[2].x).toBeCloseTo(11.45);
    expect(out[3].x).toBeCloseTo(17.45);
    // 中心間距恰為一個柱寬(零重疊零縫隙)
    expect(out[1].x - out[0].x).toBeCloseTo(6);
    expect(out[2].x - out[1].x).toBeCloseTo(6);
    expect(out[3].x - out[2].x).toBeCloseTo(6);
  });
  it("空陣列回空", () => {
    expect(computeBarLayout([], 6)).toEqual([]);
  });
});

describe("normalizeBarWidthSettings", () => {
  it("非物件/壞值回預設", () => {
    expect(normalizeBarWidthSettings(null)).toEqual(S);
    expect(normalizeBarWidthSettings("x")).toEqual(S);
    expect(normalizeBarWidthSettings({ maxFraction: "a", spacingFactor: NaN })).toEqual(S);
  });
  it("超出範圍 clamp:maxFraction 0.005~0.05、spacingFactor 0.1~0.8", () => {
    // 0 是有限數字 → 不回預設,而是被 clamp 到下限 0.1
    expect(normalizeBarWidthSettings({ maxFraction: 0.5, spacingFactor: 0 })).toEqual({
      maxFraction: 0.05,
      spacingFactor: 0.1,
    });
  });
  it("合法值原樣保留", () => {
    expect(normalizeBarWidthSettings({ maxFraction: 0.03, spacingFactor: 0.5 })).toEqual({
      maxFraction: 0.03,
      spacingFactor: 0.5,
    });
  });
});
