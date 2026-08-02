import { describe, expect, it } from "vitest";
import { buildContourGrid } from "./grid";
import type { KnownPoint } from "./types";

const SQUARE_POINTS: KnownPoint[] = [
  { x: 0, z: 0, value: 0 },
  { x: 10, z: 0, value: 0 },
  { x: 10, z: 10, value: 0 },
  { x: 0, z: 10, value: 0 },
];

describe("buildContourGrid", () => {
  it("covers the bounding box of the input points and matches a trivial query function", () => {
    const grid = buildContourGrid(SQUARE_POINTS, (x, z) => x + z);
    expect(grid.minX).toBe(0);
    expect(grid.minZ).toBe(0);
    expect(grid.values.length).toBe(grid.cols * grid.rows);
    expect(grid.values[0]).toBeCloseTo(0, 6); // (minX, minZ)
    const lastIndex = grid.values.length - 1;
    const lastCol = grid.cols - 1;
    const lastRow = grid.rows - 1;
    const expectedLast = grid.minX + lastCol * grid.cellSize + (grid.minZ + lastRow * grid.cellSize);
    expect(grid.values[lastIndex]).toBeCloseTo(expectedLast, 6);
  });

  it("clamps cell size to at most 5m for a very large bounding box", () => {
    const bigPoints: KnownPoint[] = [
      { x: 0, z: 0, value: 0 },
      { x: 10000, z: 0, value: 0 },
      { x: 10000, z: 10000, value: 0 },
    ];
    const grid = buildContourGrid(bigPoints, () => 0);
    expect(grid.cellSize).toBeLessThanOrEqual(5);
  });

  it("clamps cell size to at least 0.5m for a very small bounding box", () => {
    const smallPoints: KnownPoint[] = [
      { x: 0, z: 0, value: 0 },
      { x: 1, z: 0, value: 0 },
      { x: 1, z: 1, value: 0 },
    ];
    const grid = buildContourGrid(smallPoints, () => 0);
    expect(grid.cellSize).toBeGreaterThanOrEqual(0.5);
  });

  it("never produces fewer than 2 columns/rows even for a degenerate (single-point-like) bounding box", () => {
    const grid = buildContourGrid(
      [
        { x: 5, z: 5, value: 0 },
        { x: 5, z: 5, value: 0 },
        { x: 5, z: 5, value: 0 },
      ],
      () => 0,
    );
    expect(grid.cols).toBeGreaterThanOrEqual(2);
    expect(grid.rows).toBeGreaterThanOrEqual(2);
  });
});
