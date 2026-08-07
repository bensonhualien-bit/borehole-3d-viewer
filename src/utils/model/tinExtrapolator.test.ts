import { describe, expect, it } from "vitest";
import type { KnownPoint } from "../contour/types";
import { createExtendedTinInterpolator } from "./tinExtrapolator";

// 4 個角落點組成 100x100 正方形凸包
function square(): KnownPoint[] {
  return [
    { x: 0, z: 0, value: 10 },
    { x: 100, z: 0, value: 20 },
    { x: 0, z: 100, value: 10 },
    { x: 100, z: 100, value: 20 },
  ];
}

describe("createExtendedTinInterpolator", () => {
  it("matches plain TIN inside the convex hull", () => {
    const query = createExtendedTinInterpolator.build(square());
    // 中心點:x=50 介於 value 10(x=0)與 20(x=100)之間,線性內插 = 15
    expect(query(50, 50)).toBeCloseTo(15, 5);
    // 已知點上直接還原
    expect(query(0, 0)).toBeCloseTo(10, 5);
  });

  it("extends boundary values flat outside the hull instead of returning null", () => {
    const query = createExtendedTinInterpolator.build(square());
    // 左緣(x=0)外側:投影到左邊界,值 = 邊界值 10
    expect(query(-30, 50)).toBeCloseTo(10, 4);
    // 右緣(x=100)外側:值 = 邊界值 20
    expect(query(130, 50)).toBeCloseTo(20, 4);
    // 對角外側(左下角外):最近邊界點是 (0,0),值 = 10
    expect(query(-20, -20)).toBeCloseTo(10, 4);
  });

  it("returns null when there are fewer than 3 points", () => {
    const query = createExtendedTinInterpolator.build(square().slice(0, 2));
    expect(query(0, 0)).toBeNull();
    expect(query(-10, -10)).toBeNull();
  });

  it("returns null everywhere for degenerate (collinear) point sets", () => {
    const collinear: KnownPoint[] = [
      { x: 0, z: 0, value: 1 },
      { x: 50, z: 0, value: 2 },
      { x: 100, z: 0, value: 3 },
    ];
    const query = createExtendedTinInterpolator.build(collinear);
    // 共線退化:內插與外插都不應該假裝有面,回 null 讓呼叫端顯示「無法建模」
    expect(query(50, 10)).toBeNull();
  });
});
