import { describe, expect, it } from "vitest";
import { tinInterpolator, hasEnoughPointsForContour } from "./delaunayInterpolator";
import type { KnownPoint } from "./types";

// value = 2x + 3z + 5,一個嚴格線性的平面。TIN 線性內插對任何三角剖分方式,
// 只要查詢點落在凸包內,理論上都會精確重現這個平面(不是近似值)。
function planeValue(x: number, z: number): number {
  return 2 * x + 3 * z + 5;
}

const PLANE_POINTS: KnownPoint[] = [
  { x: 0, z: 0, value: planeValue(0, 0) },
  { x: 10, z: 0, value: planeValue(10, 0) },
  { x: 10, z: 10, value: planeValue(10, 10) },
  { x: 0, z: 10, value: planeValue(0, 10) },
  { x: 5, z: 5, value: planeValue(5, 5) },
];

describe("tinInterpolator", () => {
  it("exactly reproduces a linear plane for a query point inside the convex hull", () => {
    const query = tinInterpolator.build(PLANE_POINTS);
    expect(query(3, 7)).toBeCloseTo(planeValue(3, 7), 6);
    expect(query(8, 2)).toBeCloseTo(planeValue(8, 2), 6);
  });

  it("returns null for a query point outside the convex hull", () => {
    const query = tinInterpolator.build(PLANE_POINTS);
    expect(query(100, 100)).toBeNull();
    expect(query(-50, -50)).toBeNull();
  });

  it("returns a function that always returns null when given fewer than 3 points", () => {
    const query = tinInterpolator.build([
      { x: 0, z: 0, value: 1 },
      { x: 10, z: 10, value: 2 },
    ]);
    expect(query(5, 5)).toBeNull();
    expect(query(0, 0)).toBeNull();
  });

  it("returns a function that always returns null when all points are collinear", () => {
    const query = tinInterpolator.build([
      { x: 0, z: 0, value: 1 },
      { x: 5, z: 5, value: 2 },
      { x: 10, z: 10, value: 3 },
    ]);
    expect(query(5, 5)).toBeNull();
  });

  it("returns a function that always returns null when all points are coincident (degenerate)", () => {
    const query = tinInterpolator.build([
      { x: 5, z: 5, value: 1 },
      { x: 5, z: 5, value: 2 },
      { x: 5, z: 5, value: 3 },
    ]);
    expect(query(5, 5)).toBeNull();
    expect(query(0, 0)).toBeNull();
    expect(query(100, 100)).toBeNull();
  });
});

describe("hasEnoughPointsForContour", () => {
  it("is true for 3+ non-collinear points", () => {
    expect(hasEnoughPointsForContour(PLANE_POINTS)).toBe(true);
  });

  it("is false for fewer than 3 points", () => {
    expect(hasEnoughPointsForContour([{ x: 0, z: 0, value: 1 }])).toBe(false);
  });

  it("is false for collinear points", () => {
    expect(
      hasEnoughPointsForContour([
        { x: 0, z: 0, value: 1 },
        { x: 5, z: 5, value: 2 },
        { x: 10, z: 10, value: 3 },
      ])
    ).toBe(false);
  });

  it("is false for coincident points (degenerate)", () => {
    expect(
      hasEnoughPointsForContour([
        { x: 5, z: 5, value: 1 },
        { x: 5, z: 5, value: 2 },
        { x: 5, z: 5, value: 3 },
      ])
    ).toBe(false);
  });
});
