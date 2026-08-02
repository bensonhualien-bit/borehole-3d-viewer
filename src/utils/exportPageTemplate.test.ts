import { describe, expect, it } from "vitest";
import type { Borehole } from "../types/borehole";
import { buildExportPageSvg, collectLegendItems, legendSwatchFragment, wrapBoreholeNames, formatVerticalScale } from "./exportPageTemplate";

const BH = (id: string, soilTypes: string[]): Borehole => ({
  id,
  name: id,
  x: 0,
  y: 0,
  groundElevation: 10,
  layers: soilTypes.map((t, i) => ({ topDepth: i, bottomDepth: i + 1, soilType: t, color: "#e0c068" })),
});

describe("collectLegendItems", () => {
  it("只列實際出現的代碼,依 USCS 表順序,label 取表內中文名", () => {
    const items = collectLegendItems([BH("A", ["SM", "CL"]), BH("B", ["SM"])], {});
    expect(items.map((i) => i.code)).toEqual(["CL", "SM"]);
    expect(items.find((i) => i.code === "SM")?.label).toBe("粉土質砂");
  });
  it("覆寫色生效;不在 USCS 表的代碼 label 用代碼本身", () => {
    const items = collectLegendItems([BH("A", ["SM", "黏土"])], { SM: { color: "#ff0000" } });
    expect(items.find((i) => i.code === "SM")?.color).toBe("#ff0000");
    expect(items.find((i) => i.code === "黏土")?.label).toBe("黏土");
  });
});

describe("legendSwatchFragment", () => {
  it("輸出帶 fill 的 rect 片段", () => {
    const frag = legendSwatchFragment({ code: "SM", label: "粉土質砂", color: "#ff0000" }, 5, 7, 4);
    expect(frag).toContain("<rect");
    expect(frag).toContain('fill="#ff0000"');
    expect(frag).toContain('x="5"');
  });
});

describe("buildExportPageSvg", () => {
  const page = buildExportPageSvg({
    profileSvgMarkup: '<svg data-profile="1"></svg>',
    title: "地質剖面圖 — 測試群組",
    dateText: "2026-08-01",
    boreholeCount: 3,
    legendItems: [{ code: "SM", label: "粉土質砂", color: "#e0c068" }],
  });
  it("是 420x297 viewBox 的完整 svg,含 xmlns", () => {
    expect(page).toContain('viewBox="0 0 420 297"');
    expect(page).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
  it("內嵌傳入的剖面 svg、圖名、日期、鑽孔數、圖例代碼與名稱", () => {
    expect(page).toContain('<svg data-profile="1"></svg>');
    expect(page).toContain("地質剖面圖 — 測試群組");
    expect(page).toContain("2026-08-01");
    expect(page).toContain("3");
    expect(page).toContain("SM");
    expect(page).toContain("粉土質砂");
  });
  it("有外框與內框兩個圖框 rect", () => {
    expect((page.match(/data-frame=/g) ?? []).length).toBe(2);
  });
});

describe("XML escaping", () => {
  it("title 內的 <、&、\" 會被逃逸,不會弄壞 markup", () => {
    const page = buildExportPageSvg({
      profileSvgMarkup: "<svg></svg>",
      title: 'A<B & "C"',
      dateText: "2026-08-01",
      boreholeCount: 1,
      legendItems: [],
    });
    expect(page).toContain("A&lt;B &amp; &quot;C&quot;");
    expect(page).not.toContain('A<B');
  });
  it("圖例 label 也會被逃逸", () => {
    const page = buildExportPageSvg({
      profileSvgMarkup: "<svg></svg>",
      title: "t",
      dateText: "d",
      boreholeCount: 1,
      legendItems: [{ code: "X<Y", label: "砂 & 土", color: "#123456" }],
    });
    expect(page).toContain("X&lt;Y");
    expect(page).toContain("砂 &amp; 土");
  });
  it("圖例色塊的 color(手改專案檔、只做形狀驗證)含雙引號時也會被逃逸,不會弄壞 fill 屬性", () => {
    const page = buildExportPageSvg({
      profileSvgMarkup: "<svg></svg>",
      title: "t",
      dateText: "d",
      boreholeCount: 1,
      legendItems: [{ code: "X", label: "y", color: '"onload=alert(1)' }],
    });
    expect(page).toContain('fill="&quot;onload=alert(1)"');
    expect(page).not.toContain('fill=""onload=alert(1)"');
  });
});

describe("wrapBoreholeNames", () => {
  it("少量名稱單行(以、連接)", () => {
    expect(wrapBoreholeNames(["BH-01", "BH-02"])).toEqual(["BH-01、BH-02"]);
  });
  it("超過每行字數自動換行,不拆名稱", () => {
    const lines = wrapBoreholeNames(["BH-01", "BH-02", "BH-03", "BH-04"], 12);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toContain("BH-04");
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(13); // 行尾頓號容差 1
  });
  it("超過行數上限截斷為 …等 N 孔", () => {
    const names = Array.from({ length: 60 }, (_, i) => `BH-${String(i + 1).padStart(2, "0")}`);
    const lines = wrapBoreholeNames(names, 16, 8);
    expect(lines.length).toBeLessThanOrEqual(8);
    expect(lines[lines.length - 1]).toContain("等 60 孔");
  });
});

describe("formatVerticalScale", () => {
  it("整數不帶小數、非整數一位小數", () => {
    expect(formatVerticalScale(3)).toBe("3×");
    expect(formatVerticalScale(2.5)).toBe("2.5×");
  });
});

describe("buildExportPageSvg 新欄位", () => {
  const base = {
    profileSvgMarkup: "<g data-profile=\"1\"></g>",
    title: "t",
    dateText: "2026-08-01",
    boreholeCount: 3,
    legendItems: [],
  };
  it("有 verticalScale 時輸出「縱向放大」註記", () => {
    expect(buildExportPageSvg({ ...base, verticalScale: 2.5 })).toContain("縱向放大:2.5×");
  });
  it("有 boreholeNames 時輸出換行後的編號清單(且逃逸)", () => {
    const page = buildExportPageSvg({ ...base, boreholeNames: ["BH-01", "B<H>2"] });
    expect(page).toContain("鑽孔:");
    expect(page).toContain("B&lt;H&gt;2");
  });
  it("沒有新欄位時輸出與舊版相容(不出現註記與清單)", () => {
    const page = buildExportPageSvg(base);
    expect(page).not.toContain("縱向放大");
    expect(page).not.toContain("鑽孔:");
  });
});
