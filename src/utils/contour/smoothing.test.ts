import { describe, expect, it } from "vitest";
import { smoothPolyline } from "./smoothing";

const OPEN_SQUARE = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 10, z: 10 },
  { x: 0, z: 10 },
];

describe("smoothPolyline", () => {
  it("keeps the first and last point fixed for an open polyline", () => {
    const result = smoothPolyline(OPEN_SQUARE, false, 1);
    expect(result[0]).toEqual(OPEN_SQUARE[0]);
    expect(result[result.length - 1]).toEqual(OPEN_SQUARE[OPEN_SQUARE.length - 1]);
  });

  it("roughly doubles the point count minus 2 for an open polyline after one iteration", () => {
    const result = smoothPolyline(OPEN_SQUARE, false, 1);
    expect(result.length).toBe(2 * OPEN_SQUARE.length - 2);
  });

  it("roughly doubles the point count for a closed polyline after one iteration", () => {
    const result = smoothPolyline(OPEN_SQUARE, true, 1);
    expect(result.length).toBe(2 * OPEN_SQUARE.length);
  });

  it("moves interior points toward the corner-cut positions, not left at the original corner", () => {
    const result = smoothPolyline(OPEN_SQUARE, false, 1);
    // 原始第二個點(10,0)這個角,平滑後不應該再出現在結果裡(角被切掉了)
    expect(result).not.toContainEqual({ x: 10, z: 0 });
  });

  it("returns the input unchanged when fewer than 3 points are given", () => {
    const twoPoints = [{ x: 0, z: 0 }, { x: 1, z: 1 }];
    expect(smoothPolyline(twoPoints, false, 2)).toEqual(twoPoints);
  });
});
