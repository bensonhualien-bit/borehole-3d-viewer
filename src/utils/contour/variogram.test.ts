import { describe, expect, it } from "vitest";
import { sphericalVariogram, fitVariogramParams } from "./variogram";

describe("sphericalVariogram", () => {
  it("returns 0 at h=0 (a point compared to itself has zero variance)", () => {
    expect(sphericalVariogram(0, { range: 10, sill: 5, nugget: 1 })).toBe(0);
  });

  it("approaches nugget as h approaches 0 from above (the nugget discontinuity)", () => {
    const value = sphericalVariogram(0.0001, { range: 10, sill: 5, nugget: 1 });
    expect(value).toBeGreaterThan(0.99);
    expect(value).toBeLessThan(1.01);
  });

  it("returns nugget + sill at h >= range (the sill plateau)", () => {
    expect(sphericalVariogram(10, { range: 10, sill: 5, nugget: 1 })).toBe(6);
    expect(sphericalVariogram(20, { range: 10, sill: 5, nugget: 1 })).toBe(6);
  });

  it("is monotonically increasing between 0 and range", () => {
    const params = { range: 10, sill: 5, nugget: 1 };
    const a = sphericalVariogram(2, params);
    const b = sphericalVariogram(5, params);
    const c = sphericalVariogram(8, params);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

describe("fitVariogramParams", () => {
  it("estimates range as 1/3 of the maximum pairwise distance", () => {
    const points = [
      { x: 0, z: 0, value: 10 },
      { x: 30, z: 0, value: 20 },
      { x: 0, z: 40, value: 15 },
    ];
    // 兩兩距離:(0,0)-(30,0)=30,(0,0)-(0,40)=40,(30,0)-(0,40)=hypot(30,40)=50 -> 最大 50
    const params = fitVariogramParams(points);
    expect(params.range).toBeCloseTo(50 / 3, 5);
  });

  it("estimates sill as the population variance of the values", () => {
    const points = [
      { x: 0, z: 0, value: 10 },
      { x: 10, z: 0, value: 20 },
      { x: 20, z: 0, value: 30 },
    ];
    // mean=20, variance = ((10-20)^2+(20-20)^2+(30-20)^2)/3 = 200/3
    const params = fitVariogramParams(points);
    expect(params.sill).toBeCloseTo(200 / 3, 5);
  });

  it("estimates nugget as 5% of the sill", () => {
    const points = [
      { x: 0, z: 0, value: 10 },
      { x: 10, z: 0, value: 20 },
      { x: 20, z: 0, value: 30 },
    ];
    const params = fitVariogramParams(points);
    expect(params.nugget).toBeCloseTo(params.sill * 0.05, 10);
  });

  it("falls back to a safe non-zero sill when all values are identical", () => {
    const points = [
      { x: 0, z: 0, value: 5 },
      { x: 10, z: 0, value: 5 },
      { x: 20, z: 0, value: 5 },
    ];
    const params = fitVariogramParams(points);
    expect(params.sill).toBeGreaterThan(0);
  });
});
