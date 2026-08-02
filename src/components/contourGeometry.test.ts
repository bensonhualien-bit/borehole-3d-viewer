import { describe, expect, it } from "vitest";
import { buildSurfaceGeometry, buildContourLineGeometry, gridExtent } from "./contourGeometry";
import type { ContourGrid } from "../utils/contour/grid";
import type { ContourRing } from "../utils/contour/marchingSquares";

const GRID: ContourGrid = {
  cellSize: 1,
  cols: 2,
  rows: 2,
  minX: 0,
  minZ: 0,
  values: [0, 1, 2, 3], // (0,0)=0 (1,0)=1 (0,1)=2 (1,1)=3
};

describe("buildSurfaceGeometry", () => {
  it("builds 2 triangles (6 vertices) for a single fully-populated cell", () => {
    const geometry = buildSurfaceGeometry(GRID, false);
    expect(geometry).not.toBeNull();
    expect(geometry!.attributes.position.count).toBe(6);
    expect(geometry!.attributes.color).toBeUndefined();
  });

  it("adds a color attribute when colored is true", () => {
    const geometry = buildSurfaceGeometry(GRID, true);
    expect(geometry!.attributes.color).toBeDefined();
    expect(geometry!.attributes.color.count).toBe(6);
  });

  it("returns null when any corner of the only cell is missing data", () => {
    const sparseGrid: ContourGrid = { ...GRID, values: [0, 1, null, 3] };
    expect(buildSurfaceGeometry(sparseGrid, false)).toBeNull();
  });
});

describe("buildContourLineGeometry", () => {
  const RINGS: ContourRing[] = [
    { level: 1, isMajor: false, closed: false, points: [{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 0 }] },
    { level: 5, isMajor: true, closed: false, points: [{ x: 0, z: 5 }, { x: 1, z: 5 }] },
  ];

  it("builds one 2-point segment per adjacent pair of ring points, for the requested major/minor filter", () => {
    const minorGeometry = buildContourLineGeometry(RINGS, false);
    expect(minorGeometry!.attributes.position.count).toBe(4); // 3 點的 ring -> 2 段 -> 4 個頂點

    const majorGeometry = buildContourLineGeometry(RINGS, true);
    expect(majorGeometry!.attributes.position.count).toBe(2); // 2 點的 ring -> 1 段 -> 2 個頂點
  });

  it("returns null when there are no rings matching the requested filter", () => {
    const noMajor = buildContourLineGeometry(
      RINGS.filter((r) => !r.isMajor),
      true,
    );
    expect(noMajor).toBeNull();
  });
});

describe("gridExtent", () => {
  it("returns the min and max of the non-null values in the grid", () => {
    expect(gridExtent(GRID)).toEqual({ min: 0, max: 3 });
  });

  it("ignores null values when computing the range", () => {
    const sparseGrid: ContourGrid = { ...GRID, values: [0, 1, null, 100] };
    expect(gridExtent(sparseGrid)).toEqual({ min: 0, max: 100 });
  });

  it("returns Infinity/-Infinity when every value is null", () => {
    const emptyGrid: ContourGrid = { ...GRID, values: [null, null, null, null] };
    const { min, max } = gridExtent(emptyGrid);
    expect(min).toBe(Infinity);
    expect(max).toBe(-Infinity);
  });
});
