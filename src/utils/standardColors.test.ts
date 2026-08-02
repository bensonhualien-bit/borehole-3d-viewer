import { describe, expect, it } from "vitest";
import { STANDARD_SOIL_COLORS } from "./standardColors";

describe("STANDARD_SOIL_COLORS", () => {
  it("恰好 50 色", () => {
    expect(STANDARD_SOIL_COLORS).toHaveLength(50);
  });
  it("全部是合法的小寫 #rrggbb hex", () => {
    for (const c of STANDARD_SOIL_COLORS) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
  it("沒有重複色", () => {
    expect(new Set(STANDARD_SOIL_COLORS).size).toBe(50);
  });
});
