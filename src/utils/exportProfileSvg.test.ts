import { describe, expect, it } from "vitest";
import type { Borehole } from "../types/borehole";
import { DEFAULT_BAR_WIDTH_SETTINGS } from "./barWidth";
import { computeElevationRange } from "./boreholeElevation";
import { buildProfileSvg, type ProfileSvgInput } from "./exportProfileSvg";

const H = (name: string, x: number, ground: number, depths: [string, number][]): Borehole => {
  let top = 0;
  const layers = depths.map(([soilType, th]) => {
    const l = { topDepth: top, bottomDepth: top + th, soilType, color: "#e0c068" };
    top += th;
    return l;
  });
  return { id: name, name, x, y: 0, groundElevation: ground, layers };
};

const BASE: ProfileSvgInput = {
  boreholes: [
    H("BH-01", 0, 2.2, [["SF", 3], ["CL", 5], ["SM", 12], ["ML", 5]]),
    H("BH-02", 120, 1.6, [["non", 2], ["SM", 14], ["CL", 8], ["SM", 15], ["ML", 6]]),
    H("BH-03", 260, 3.0, [["SF", 4], ["SM", 16], ["CL", 7], ["SM", 20], ["ML", 6], ["SM", 7]]),
  ],
  profileLines: [],
  axisMode: "projected",
  soilStyles: {},
  barWidthSettings: DEFAULT_BAR_WIDTH_SETTINGS,
  drawX: 10, drawY: 10, drawW: 333, drawH: 277,
};

function attrs(markup: string, tag: string, name: string): number[] {
  // (?<!-) 避免 `\b${name}` 誤配到 `stroke-${name}`(連字號在正則 \b 判定下算單字邊界,
  // 沒有這個否定回顧的話 `\bwidth=` 會連 `stroke-width=` 都吃到,且因 [^>]* 貪婪回溯,
  // 命中的還會是標籤內最後一個、也就是錯的那個屬性)。
  const re = new RegExp(`<${tag}\\b[^>]*(?<!-)\\b${name}="([-\\d.]+)"`, "g");
  const out: number[] = [];
  for (const m of markup.matchAll(re)) out.push(Number(m[1]));
  return out;
}

// 只抓孔名 <text>(內容為 BH-\d+)的 y 值,避免混到高程標值的 <text>
function nameYs(markup: string): number[] {
  const re = /<text\b[^>]*(?<!-)\by="([-\d.]+)"[^>]*>(BH-\d+)<\/text>/g;
  return [...markup.matchAll(re)].map((m) => Number(m[1]));
}

// 抓所有孔名 <text>(排除高程標值的 "Xm" 內容),回傳 {name, x, y}
function nameTexts(markup: string): { name: string; x: number; y: number }[] {
  const re = /<text\b[^>]*(?<!-)\bx="([-\d.]+)"[^>]*(?<!-)\by="([-\d.]+)"[^>]*>([^<]+)<\/text>/g;
  return [...markup.matchAll(re)]
    .filter((m) => !/^-?\d+m$/.test(m[3]))
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]), name: m[3] }));
}

// 抓指定內容(如 "5m")的高程標值 <text> y 值(雙側同高,取第一個即可)
function elevLabelYByText(markup: string, text: string): number | undefined {
  const re = new RegExp(`<text\\b[^>]*(?<!-)\\by="([-\\d.]+)"[^>]*>${text}</text>`);
  const m = markup.match(re);
  return m ? Number(m[1]) : undefined;
}

// 只抓引線(stroke="#666" 虛線)的 <line> 標籤,個別解析 x1/y1/x2/y2
function leaderLines(markup: string): { x1: number; y1: number; x2: number; y2: number }[] {
  const tagRe = /<line\b[^>]*stroke="#666"[^>]*\/>/g;
  const getAttr = (tag: string, name: string) => {
    const m = tag.match(new RegExp(`(?<!-)\\b${name}="([-\\d.]+)"`));
    return m ? Number(m[1]) : NaN;
  };
  return (markup.match(tagRe) ?? []).map((tag) => ({
    x1: getAttr(tag, "x1"),
    y1: getAttr(tag, "y1"),
    x2: getAttr(tag, "x2"),
    y2: getAttr(tag, "y2"),
  }));
}

describe("buildProfileSvg", () => {
  it("V 依 70% 目標向下取 0.5 步進、至少 1", () => {
    const { verticalScale } = buildProfileSvg(BASE);
    expect(verticalScale).toBeGreaterThanOrEqual(1);
    expect(verticalScale * 2).toBeCloseTo(Math.round(verticalScale * 2)); // 0.5 步進
    // 手算:worldH≈66(±5 邊距)、驗證帶高 = worldH×V×sx 落在 (0.7-0.5步)×drawH ~ 0.7×drawH
  });
  it("剖面帶不超過繪圖區,且以 70% 為上限目標", () => {
    const { markup, verticalScale } = buildProfileSvg(BASE);
    const ys = attrs(markup, "rect", "y");
    const hs = attrs(markup, "rect", "height");
    const bottoms = ys.map((y, i) => y + hs[i]);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(BASE.drawY - 1e-6);
    expect(Math.max(...bottoms)).toBeLessThanOrEqual(BASE.drawY + BASE.drawH + 1e-6);
    expect(verticalScale).toBeGreaterThan(1); // 這組資料必然需要放大
  });
  it("雙側粗體高程標值存在,格線端點不進入標值欄", () => {
    const { markup } = buildProfileSvg(BASE);
    expect((markup.match(/font-weight="bold"[^>]*>-?\d+m</g) ?? []).length).toBeGreaterThan(10);
    const x1s = attrs(markup, "line", "x1");
    const x2s = attrs(markup, "line", "x2");
    expect(Math.min(...x1s)).toBeGreaterThanOrEqual(BASE.drawX + 9 - 1e-6);
    expect(Math.max(...x2s)).toBeLessThanOrEqual(BASE.drawX + BASE.drawW - 9 + 1e-6);
  });
  it("最外側柱緣與標值欄之間 ≥ 1 柱寬", () => {
    const { markup } = buildProfileSvg(BASE);
    const xs = attrs(markup, "rect", "x");
    const ws = attrs(markup, "rect", "width");
    const barW = Math.max(...ws); // 未疊合時全部同寬
    const leftEdge = Math.min(...xs);
    const rightEdge = Math.max(...xs.map((x, i) => x + ws[i]));
    expect(leftEdge - (BASE.drawX + 9)).toBeGreaterThanOrEqual(barW - 1e-6);
    expect(BASE.drawX + BASE.drawW - 9 - rightEdge).toBeGreaterThanOrEqual(barW - 1e-6);
  });
  it("疊合鑽孔沿用並排規則(兩支近孔 → 全寬並排、緊鄰不重疊,不再變細)", () => {
    // BH-03(x=260)與新增的 BH-04(x=262)距離 2,遠小於這組資料的基準柱寬
    // (count=4、span=262 → baseWidth = 262×min(2%, 0.35/4) = 262×2% = 5.24),
    // 會觸發 computeBarLayout 疊合並排。全寬規則下群內每支仍是「全」基準寬,
    // 不再除以 k——所以全部 rect(含疊合的這兩支)寬度應該完全相等。
    const input = { ...BASE, boreholes: [...BASE.boreholes, H("BH-04", 262, 2.0, [["SM", 20]])] };
    const { markup } = buildProfileSvg(input);
    const xs = attrs(markup, "rect", "x");
    const ws = attrs(markup, "rect", "width");
    const wMax = Math.max(...ws);
    const wMin = Math.min(...ws);
    // 全寬並排:全部 rect 同寬(不再有 half-width 的疊合 rect)
    expect(wMax - wMin).toBeLessThan(1e-6);
    // 找出疊合的那一對:BH-03/BH-04 的柱子中心 x 應落在其餘(未疊合)柱子的
    // 右側附近、彼此的 x-extent 緊鄰(左緣/右緣相接、容差內)、不重疊。
    const rectEntries = xs.map((x, i) => ({ x, w: ws[i], right: x + ws[i] }));
    const sortedByX = [...rectEntries].sort((a, b) => a.x - b.x);
    // 疊合對是最右邊那兩支(BH-03/BH-04 的層數各為 6/1,但都在 x 座標最右側區塊);
    // 用「x 最接近」的相鄰兩個 rect 來找疊合對更穩健。
    let minGap = Infinity;
    let gapPair: [number, number] = [0, 0];
    for (let i = 1; i < sortedByX.length; i++) {
      const gap = sortedByX[i].x - sortedByX[i - 1].right;
      if (Math.abs(gap) < minGap) {
        minGap = Math.abs(gap);
        gapPair = [sortedByX[i - 1].right, sortedByX[i].x];
      }
    }
    // 緊鄰不重疊:相接處縫隙接近 0(不是重疊的負值、也不是隔了一個柱寬的正值)
    expect(minGap).toBeLessThan(wMax * 0.05);
    expect(gapPair[1]).toBeGreaterThanOrEqual(gapPair[0] - 1e-6);
  });
  it("鑽孔名粗體且經 XML 逃逸;覆寫色生效", () => {
    const input = {
      ...BASE,
      boreholes: [H("B<H>1", 0, 2, [["SM", 20]]), H("BH-02", 100, 2, [["SM", 25]])],
      soilStyles: { SM: { color: "#ff0000" } },
    };
    const { markup } = buildProfileSvg(input);
    expect(markup).toContain("B&lt;H&gt;1");
    expect(markup).toContain('fill="#ff0000"');
  });
  it("剖面線以繪製中心相連、用線自身顏色", () => {
    const input = {
      ...BASE,
      profileLines: [{
        id: "l1", name: "L1", color: "#3355ff", visible: true,
        points: [{ boreholeId: "BH-01", depth: 8 }, { boreholeId: "BH-03", depth: 10 }],
      }],
    };
    const { markup } = buildProfileSvg(input);
    expect(markup).toContain('stroke="#3355ff"');
    expect(markup).toContain("<polyline");
  });
  it("高瘦內容:V 壓到下限 1 後仍超高 → 以高度反推、不超出繪圖區", () => {
    const tall = {
      ...BASE,
      drawW: 60, drawH: 277, // 窄繪圖區逼出高瘦情境
    };
    const { markup, verticalScale } = buildProfileSvg(tall);
    expect(verticalScale).toBeGreaterThanOrEqual(1);
    const ys = attrs(markup, "rect", "y");
    const hs = attrs(markup, "rect", "height");
    const bottoms = ys.map((y, i) => y + hs[i]);
    expect(Math.max(...bottoms)).toBeLessThanOrEqual(tall.drawY + tall.drawH + 1e-6);
  });
  it("密集孔群 → 孔名交錯分層並附虛線引線", () => {
    const dense: ProfileSvgInput = {
      ...BASE,
      boreholes: [
        H("BH-01", 0, 2, [["SM", 20]]),
        H("BH-02", 2, 2, [["SM", 20]]),
        H("BH-03", 4, 2, [["SM", 20]]),
        H("BH-04", 6, 2, [["SM", 20]]),
        H("BH-05", 200, 2, [["SM", 20]]),
        H("BH-06", 400, 2, [["SM", 20]]),
      ],
    };
    const { markup } = buildProfileSvg(dense);
    // 引線存在:#666 虛線
    expect(markup).toMatch(/<line\b[^>]*stroke="#666"[^>]*stroke-dasharray="1 0\.8"[^>]*\/>/);
    // 孔名 y 值出現至少 2 種(代表分層生效)
    const ys = nameYs(markup);
    expect(new Set(ys).size).toBeGreaterThanOrEqual(2);
  });
  it("稀疏排列(3 孔距離遠、地表齊平)→ 無引線、全部孔名同一列", () => {
    // 用齊平地表(而非 BASE 原本 2.2/1.6/3.0 的緩坡)隔離「水平分層」與 I2
    // 「地形起伏觸發引線」這兩個獨立行為——BASE 的緩坡在新的逐孔引線判定下
    // 會讓最低的那支孔(BH-02)觸發引線(見下面 sloping-terrain 測試),不代表
    // 這裡要驗證的「單純距離遠、不分層」情境壞了。
    const flat = {
      ...BASE,
      boreholes: BASE.boreholes.map((b) => ({ ...b, groundElevation: 2 })),
    };
    const { markup } = buildProfileSvg(flat);
    expect(leaderLines(markup).length).toBe(0);
    const ys = nameYs(markup);
    expect(new Set(ys).size).toBe(1);
  });
  it("引線端點:x1 對齊孔名 x、y2 對齊該孔柱頂(groundElevation)", () => {
    const dense: ProfileSvgInput = {
      ...BASE,
      boreholes: [
        H("BH-01", 0, 2, [["SM", 20]]),
        H("BH-02", 2, 2, [["SM", 20]]),
        H("BH-03", 4, 2, [["SM", 20]]),
        H("BH-04", 6, 2, [["SM", 20]]),
        H("BH-05", 200, 2, [["SM", 20]]),
        H("BH-06", 400, 2, [["SM", 20]]),
      ],
    };
    const { markup } = buildProfileSvg(dense);
    const lines = leaderLines(markup);
    expect(lines.length).toBeGreaterThan(0);
    // 每支孔只有一層、topDepth=0,所以該孔 <rect> 的 y 即為 Y(groundElevation)、
    // rect 中心 x(=x+width/2)即為孔名/引線共用的 drawnX——用實際渲染出的柱子
    // 幾何當 ground-truth,交叉比對引線端點,不需要重算整條 X/Y 公式。
    const xs = attrs(markup, "rect", "x");
    const ws = attrs(markup, "rect", "width");
    const rys = attrs(markup, "rect", "y");
    const centers = xs.map((x, i) => ({ cx: x + ws[i] / 2, y: rys[i] }));
    for (const line of lines) {
      const match = centers.some(
        (c) => Math.abs(c.cx - line.x1) < 1e-6 && Math.abs(c.y - line.y2) < 1e-6
      );
      expect(match).toBe(true);
    }
  });
  it("最外側孔名(長名)不與高程標值欄橫向相撞(即使 row0 與最上層高程標值同高)", () => {
    // 沿用 BASE 三孔的 x 位置(BH-01/BH-03 位於繪圖區左右極端),把兩端孔名換成較長
    // 字串,讓其估計半寬足以在未修正前與高程標值欄(LABEL_W=9)重疊;中間孔的地表
    // 高程調整到 3.6(=> row0 名稱列 y 與最上層「5m」標值 y 幾乎重合,D≈0),確保
    // 一旦被擠到下一列(y 位移 NAME_ROW_H=5)也能明確脫離 3.8 的重疊判定帶,
    // 避免這個邊界情境本身干擾「row0 與高程標值相撞」這個待測情境。
    const input: ProfileSvgInput = {
      ...BASE,
      boreholes: [
        { ...BASE.boreholes[0], id: "CH-2200A", name: "CH-2200A" },
        { ...BASE.boreholes[1], groundElevation: 3.6 },
        { ...BASE.boreholes[2], id: "CH-2200B", name: "CH-2200B" },
      ],
    };
    const { markup } = buildProfileSvg(input);
    const range = computeElevationRange(input.boreholes);
    const eMajTop = Math.floor(range.max / 5) * 5;
    const elevLabelY = elevLabelYByText(markup, `${eMajTop}m`);
    expect(elevLabelY).toBeDefined();
    const FONT_NAME = 3.8;
    const texts = nameTexts(markup);
    expect(texts.length).toBe(3);
    let checkedAny = false;
    for (const t of texts) {
      if (Math.abs(t.y - elevLabelY!) < 3.8) {
        checkedAny = true;
        const halfWidth = (t.name.length * FONT_NAME * 0.55) / 2;
        expect(t.x - halfWidth).toBeGreaterThanOrEqual(BASE.drawX + 9 + 1 - 1e-6);
        expect(t.x + halfWidth).toBeLessThanOrEqual(BASE.drawX + BASE.drawW - 9 - 1 + 1e-6);
      }
    }
    expect(checkedAny).toBe(true); // 確保這個測試真的驗證到了 row0 vs 高程標值重疊的情境
  });

  // ---- I1:高度 clamp 分支必須「橫向壓縮」而非垂直壓扁(下限 1×、V 誠實) ----
  it("高瘦內容(緊窄又深)→ clamp 分支真的觸發:V 在 0.5 格、≥1,以橫向壓縮讓剖面帶完全落在繪圖區內", () => {
    const tight: ProfileSvgInput = {
      ...BASE,
      boreholes: [
        H("BH-01", 0, 2, [["SM", 90]]),
        H("BH-02", 15, 2, [["SM", 90]]),
        H("BH-03", 30, 2, [["SM", 90]]),
      ],
    };
    const { markup, verticalScale } = buildProfileSvg(tight);
    expect(verticalScale).toBeGreaterThanOrEqual(1);
    expect(verticalScale * 2).toBeCloseTo(Math.round(verticalScale * 2)); // 0.5 步進
    const ys = attrs(markup, "rect", "y");
    const hs = attrs(markup, "rect", "height");
    const bottoms = ys.map((y, i) => y + hs[i]);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(tight.drawY - 1e-6);
    expect(Math.max(...bottoms)).toBeLessThanOrEqual(tight.drawY + tight.drawH + 1e-6);
    // 探針:確認這個 fixture 真的觸發了 clamp 分支(不是碰巧沒超高)——內容寬度
    // (rect 最左緣到最右緣)應該遠小於兩欄標值之間的可用寬度,因為是被高度
    // 反推壓窄的,不是天生就窄(3 孔僅相距 15m,不壓縮的話柱子會塞滿整個寬度)。
    const xs = attrs(markup, "rect", "x");
    const ws = attrs(markup, "rect", "width");
    const contentWidth = Math.max(...xs.map((x, i) => x + ws[i])) - Math.min(...xs);
    const availableWidth = tight.drawW - 9 * 2; // 9 = LABEL_W(高程標值欄寬,見 exportProfileSvg.ts)
    expect(contentWidth).toBeLessThan(availableWidth / 2);
  });

  // ---- I3:closed-form inset 在退化輸入(兩孔完全重合)下不能噴 NaN/Infinity ----
  it("兩支鑽孔座標完全重合 → markup 不出現 NaN/Infinity,verticalScale 為有限值", () => {
    const coincident: ProfileSvgInput = {
      ...BASE,
      boreholes: [
        H("BH-01", 50, 2, [["SM", 20]]),
        H("BH-02", 50, 2, [["SM", 20]]),
      ],
    };
    const { markup, verticalScale } = buildProfileSvg(coincident);
    expect(markup).not.toMatch(/NaN/);
    expect(markup).not.toMatch(/Infinity/);
    expect(Number.isFinite(verticalScale)).toBe(true);
    const ws = attrs(markup, "rect", "width");
    expect(ws.length).toBeGreaterThan(0);
  });

  // ---- axisMode: "sequential" 目前覆蓋率是 0,補基本渲染健全性 ----
  it('axisMode: "sequential" → 基本渲染健全(有柱子、無 NaN/Infinity)', () => {
    const seq: ProfileSvgInput = { ...BASE, axisMode: "sequential" };
    const { markup, verticalScale } = buildProfileSvg(seq);
    expect(markup).not.toMatch(/NaN/);
    expect(markup).not.toMatch(/Infinity/);
    expect(Number.isFinite(verticalScale)).toBe(true);
    const ws = attrs(markup, "rect", "width");
    expect(ws.length).toBeGreaterThan(0);
  });

  // ---- I2:起伏地形上,row0 的孔名也可能離自己的柱頂很遠,要有引線 ----
  it("起伏地形(兩孔地表高程差 20m)→ 較低那支孔的 row0 孔名有引線,連回它自己的柱頂", () => {
    const sloped: ProfileSvgInput = {
      ...BASE,
      boreholes: [
        H("BH-01", 0, 20, [["SM", 20]]),
        H("BH-02", 200, 0, [["SM", 20]]),
      ],
    };
    const { markup } = buildProfileSvg(sloped);
    const texts = nameTexts(markup);
    expect(texts.length).toBe(2);
    const higher = texts.find((t) => t.name === "BH-01")!;
    const lower = texts.find((t) => t.name === "BH-02")!;
    const xs = attrs(markup, "rect", "x");
    const ws = attrs(markup, "rect", "width");
    const rys = attrs(markup, "rect", "y");
    // 兩孔都只有一層、topDepth=0,各自唯一的 rect 的 y 即為 Y(groundElevation)(柱頂)
    const centers = xs.map((x, i) => ({ cx: x + ws[i] / 2, y: rys[i] }));
    const lowerHoleTopY = centers.find((c) => Math.abs(c.cx - lower.x) < 1e-6)!.y;
    const lines = leaderLines(markup);
    const lowerLine = lines.find(
      (l) => Math.abs(l.x1 - lower.x) < 1e-6 && Math.abs(l.y2 - lowerHoleTopY) < 1e-6
    );
    expect(lowerLine).toBeDefined();
    expect(lowerLine!.y1).toBeLessThan(lowerHoleTopY); // 標籤下緣在柱頂上方(SVG y 較小)
    // 較高的那支孔(定義 baseNameY 的那支)本身不需要引線
    const higherHoleTopY = centers.find((c) => Math.abs(c.cx - higher.x) < 1e-6)!.y;
    const higherLine = lines.find(
      (l) => Math.abs(l.x1 - higher.x) < 1e-6 && Math.abs(l.y2 - higherHoleTopY) < 1e-6
    );
    expect(higherLine).toBeUndefined();
  });
});
