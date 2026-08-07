import { describe, expect, it } from "vitest";
import type { SolidGrid } from "../utils/model/solidGrid";
import { buildLayerSolidGeometry } from "./layerSolidGeometry";

// 手工建一個最小網格:cols=2, rows=2 = 單一 cell,頂面 10、底面 0。
function singleCellGrid(): SolidGrid {
  return {
    cellSize: 1,
    cols: 2,
    rows: 2,
    minX: 0,
    minZ: 0,
    top: [10, 10, 10, 10],
    bottom: [0, 0, 0, 0],
    pinchOutRatio: 0,
  };
}

describe("buildLayerSolidGeometry", () => {
  it("returns null when no cell has all four corners valid", () => {
    const grid = singleCellGrid();
    grid.top[0] = null;
    grid.bottom[0] = null;
    expect(buildLayerSolidGeometry(grid)).toBeNull();
  });

  it("builds top + bottom + 4 skirt sides for a single isolated cell", () => {
    const geometry = buildLayerSolidGeometry(singleCellGrid())!;
    expect(geometry).not.toBeNull();
    // 頂面 2 三角 + 底面 2 三角 + 四側裙邊各 2 三角 = 12 三角 = 36 頂點 = 108 floats
    expect(geometry.getAttribute("position").count).toBe(36);
    geometry.dispose();
  });

  it("gives the top face upward normals and the bottom face downward normals", () => {
    const geometry = buildLayerSolidGeometry(singleCellGrid())!;
    const normal = geometry.getAttribute("normal");
    // 頂面頂點排在最前面(先 push 頂面再 push 底面):第 0 個頂點屬於頂面
    expect(normal.getY(0)).toBeGreaterThan(0.9);
    // 單一 cell 的頂面共 6 個頂點,第 6 個起是底面
    expect(normal.getY(6)).toBeLessThan(-0.9);
    geometry.dispose();
  });

  it("adds a skirt along edges facing an invalid neighbor cell", () => {
    // 3x2 網格 = 水平兩個 cell,右側 cell 的右緣兩角為 null → 只有左 cell 有效。
    // 左 cell 的右鄰(右 cell)無效,右緣一樣要有裙邊 → 仍是 4 側 = 36 頂點。
    const grid: SolidGrid = {
      cellSize: 1,
      cols: 3,
      rows: 2,
      minX: 0,
      minZ: 0,
      top: [10, 10, null, 10, 10, null],
      bottom: [0, 0, null, 0, 0, null],
      pinchOutRatio: 0,
    };
    const geometry = buildLayerSolidGeometry(grid)!;
    expect(geometry.getAttribute("position").count).toBe(36);
    geometry.dispose();
  });

  it("omits the skirt between two adjacent valid cells", () => {
    // 3x2 全有效 = 兩個相鄰 cell:頂 4 三角 + 底 4 三角 + 外圍裙邊(左右各1邊、
    // 上下各2邊 = 6 邊)* 2 三角 = 20 三角 = 60 頂點;中間共用邊不得有裙邊。
    const grid: SolidGrid = {
      cellSize: 1,
      cols: 3,
      rows: 2,
      minX: 0,
      minZ: 0,
      top: [10, 10, 10, 10, 10, 10],
      bottom: [0, 0, 0, 0, 0, 0],
      pinchOutRatio: 0,
    };
    const geometry = buildLayerSolidGeometry(grid)!;
    expect(geometry.getAttribute("position").count).toBe(60);
    geometry.dispose();
  });

  it("places vertices at real grid coordinates (minX/minZ offset + cellSize)", () => {
    const grid = singleCellGrid();
    grid.minX = 100;
    grid.minZ = -50;
    grid.cellSize = 2;
    const geometry = buildLayerSolidGeometry(grid)!;
    const position = geometry.getAttribute("position");
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < position.count; i++) {
      minX = Math.min(minX, position.getX(i));
      maxX = Math.max(maxX, position.getX(i));
    }
    expect(minX).toBe(100);
    expect(maxX).toBe(102);
    geometry.dispose();
  });
});
