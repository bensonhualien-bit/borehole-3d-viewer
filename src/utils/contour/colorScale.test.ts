import { describe, expect, it } from "vitest";
import { elevationToColor, colorStopsAsCss, computeLegendTicks } from "./colorScale";

describe("elevationToColor", () => {
  it("returns the low-end (blue) color at the minimum value", () => {
    const [r, g, b] = elevationToColor(0, 0, 100);
    expect(r).toBeCloseTo(0.1, 5);
    expect(g).toBeCloseTo(0.2, 5);
    expect(b).toBeCloseTo(0.8, 5);
  });

  it("returns the high-end (red) color at the maximum value", () => {
    const [r, g, b] = elevationToColor(100, 0, 100);
    expect(r).toBeCloseTo(0.85, 5);
    expect(g).toBeCloseTo(0.15, 5);
    expect(b).toBeCloseTo(0.1, 5);
  });

  it("clamps values below the minimum to the low-end color", () => {
    expect(elevationToColor(-50, 0, 100)).toEqual(elevationToColor(0, 0, 100));
  });

  it("clamps values above the maximum to the high-end color", () => {
    expect(elevationToColor(150, 0, 100)).toEqual(elevationToColor(100, 0, 100));
  });

  it("returns the low-end color without dividing by zero when min equals max", () => {
    expect(elevationToColor(42, 42, 42)).toEqual(elevationToColor(0, 0, 100));
  });

  it("returns a value partway between the middle stops for a middle value", () => {
    const [r] = elevationToColor(50, 0, 100);
    // 50 剛好在漸層中點,應該落在第二段(綠)跟第三段(黃)的交界附近,
    // 紅色分量介於綠色(0.10)跟黃色(0.95)之間
    expect(r).toBeGreaterThan(0.1);
    expect(r).toBeLessThan(0.95);
  });
});

describe("colorStopsAsCss", () => {
  it("returns 4 CSS rgb() strings matching the STOPS definition", () => {
    const stops = colorStopsAsCss();
    expect(stops).toHaveLength(4);
    expect(stops[0]).toBe("rgb(26, 51, 204)"); // [0.1, 0.2, 0.8] * 255,四捨五入
    expect(stops[3]).toBe("rgb(217, 38, 26)"); // [0.85, 0.15, 0.1] * 255,四捨五入
  });
});

describe("computeLegendTicks", () => {
  it("returns 5 evenly-spaced values from min to max", () => {
    expect(computeLegendTicks(0, 100)).toEqual([0, 25, 50, 75, 100]);
  });

  it("returns the same value 5 times when min equals max", () => {
    expect(computeLegendTicks(42, 42)).toEqual([42, 42, 42, 42, 42]);
  });

  it("works with negative ranges", () => {
    const ticks = computeLegendTicks(-8.4, -3.2);
    expect(ticks[0]).toBeCloseTo(-8.4, 6);
    expect(ticks[4]).toBeCloseTo(-3.2, 6);
    expect(ticks[2]).toBeCloseTo(-5.8, 6); // 中點
  });
});
