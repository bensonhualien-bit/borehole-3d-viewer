import { describe, expect, it } from "vitest";
import type { SoilLayer } from "../types/borehole";
import { effectiveCodeColor, effectiveLayerColor, normalizeSoilStyles } from "./soilStyles";

const smLayer: SoilLayer = { topDepth: 0, bottomDepth: 5, soilType: "SM", color: "#e0c068" };

describe("effectiveLayerColor", () => {
  it("無覆寫時回傳該層匯入時烙定的顏色", () => {
    expect(effectiveLayerColor(smLayer, {})).toBe("#e0c068");
  });
  it("有覆寫時回傳覆寫色", () => {
    expect(effectiveLayerColor(smLayer, { SM: { color: "#ff0000" } })).toBe("#ff0000");
  });
  it("覆寫項只有 patternId 沒有 color 時,仍回傳該層原色", () => {
    expect(effectiveLayerColor(smLayer, { SM: { patternId: "dots" } })).toBe("#e0c068");
  });
  it("覆寫別的代碼不影響查詢中的代碼", () => {
    expect(effectiveLayerColor(smLayer, { CL: { color: "#ff0000" } })).toBe("#e0c068");
  });
});

describe("effectiveCodeColor", () => {
  it("有覆寫時回傳覆寫色", () => {
    expect(effectiveCodeColor("SM", { SM: { color: "#ff0000" } })).toBe("#ff0000");
  });
  it("無覆寫、代碼在 USCS 固定表時回傳固定表色", () => {
    expect(effectiveCodeColor("SM", {})).toBe("#e0c068");
  });
  it("無覆寫、代碼不在固定表時回傳 hash 色(hsl 字串)", () => {
    expect(effectiveCodeColor("黏土", {})).toMatch(/^hsl\(/);
  });
});

describe("normalizeSoilStyles", () => {
  it("非物件輸入(null/陣列/字串)回傳空表", () => {
    expect(normalizeSoilStyles(null)).toEqual({});
    expect(normalizeSoilStyles([1])).toEqual({});
    expect(normalizeSoilStyles("x")).toEqual({});
  });
  it("保留合法的 color 與 patternId,丟棄不合法 value", () => {
    expect(
      normalizeSoilStyles({
        SM: { color: "#ff0000" },
        CL: { patternId: "dots" },
        ML: { color: 123 },
        SF: "bad",
        non: null,
      })
    ).toEqual({ SM: { color: "#ff0000" }, CL: { patternId: "dots" } });
  });
  it("value 是物件但 color/patternId 都不合法時整項丟棄", () => {
    expect(normalizeSoilStyles({ SM: { color: 5, patternId: 7 } })).toEqual({});
  });
});
