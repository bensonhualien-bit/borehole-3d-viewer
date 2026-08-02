import { describe, expect, it } from "vitest";
import { extractContours } from "./marchingSquares";
import type { ContourGrid } from "./grid";

// 5x5 網格,cellSize=1,值 = x+z(嚴格線性平面)。等值線理論上應該是一組
// 45 度對角直線(從一個網格邊界切到另一個),不會封閉。
function buildPlaneGrid(): ContourGrid {
  const cols = 5;
  const rows = 5;
  const cellSize = 1;
  const values: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) values.push(col * cellSize + row * cellSize);
  }
  return { cellSize, cols, rows, minX: 0, minZ: 0, values };
}

// 8x8 網格,值 = 半徑 6 減去到中心(4,4)的距離(圓錐狀)。level=3(遠離邊界)
// 的等值線理論上應該是一圈完整的封閉圓。
function buildConeGrid(): ContourGrid {
  const cols = 9;
  const rows = 9;
  const cellSize = 1;
  const centerX = 4;
  const centerZ = 4;
  const values: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      values.push(6 - Math.hypot(col - centerX, row - centerZ));
    }
  }
  return { cellSize, cols, rows, minX: 0, minZ: 0, values };
}

describe("extractContours", () => {
  it("extracts open diagonal lines from a linear plane, all points near the correct level", () => {
    const grid = buildPlaneGrid();
    const rings = extractContours(grid, { minorInterval: 1, majorInterval: 5, colorMode: "lines", interpolator: "tin" });
    expect(rings.length).toBeGreaterThan(0);
    const level4Ring = rings.find((r) => r.level === 4);
    expect(level4Ring).toBeDefined();
    expect(level4Ring!.closed).toBe(false);
    for (const p of level4Ring!.points) {
      expect(p.x + p.z).toBeCloseTo(4, 1);
    }
  });

  it("marks levels that are multiples of majorInterval as major", () => {
    const grid = buildPlaneGrid();
    const rings = extractContours(grid, { minorInterval: 1, majorInterval: 5, colorMode: "lines", interpolator: "tin" });
    const level5Ring = rings.find((r) => r.level === 5);
    expect(level5Ring?.isMajor).toBe(true);
    const level4Ring = rings.find((r) => r.level === 4);
    expect(level4Ring?.isMajor).toBe(false);
  });

  it("extracts a closed ring roughly centered on the cone's peak", () => {
    const grid = buildConeGrid();
    const rings = extractContours(grid, { minorInterval: 1, majorInterval: 5, colorMode: "lines", interpolator: "tin" });
    const level3Ring = rings.find((r) => r.level === 3 && r.closed);
    expect(level3Ring).toBeDefined();
    const avgX = level3Ring!.points.reduce((s, p) => s + p.x, 0) / level3Ring!.points.length;
    const avgZ = level3Ring!.points.reduce((s, p) => s + p.z, 0) / level3Ring!.points.length;
    expect(avgX).toBeCloseTo(4, 0);
    expect(avgZ).toBeCloseTo(4, 0);
  });

  it("returns an empty array when the grid has no data (all null)", () => {
    const grid: ContourGrid = { cellSize: 1, cols: 3, rows: 3, minX: 0, minZ: 0, values: new Array(9).fill(null) };
    expect(extractContours(grid, { minorInterval: 1, majorInterval: 5, colorMode: "lines", interpolator: "tin" })).toEqual([]);
  });

  it("uses the asymptotic decider (not the corner average) to pair saddle-cell crossings", () => {
    // 2x2 網格,單一鞍點方塊,角值刻意設得懸殊:
    // v00=1(0,0)  v10=-95(1,0)
    // v01=-2(0,1) v11=100(1,1)
    // 用格內平均數判斷會算出 average = (1-95+100-2)/4 = 1 > 0,配對成
    // {left,bottom} + {right,top}(錯誤)。
    // 用漸近判別式算出 (1*100 - (-95)*(-2)) / (1+100-(-95)-(-2)) = -90/198 ≈ -0.4545,
    // 不 > 0,應該配對成 {left,top} + {bottom,right}(正確)。
    const grid: ContourGrid = {
      cellSize: 1,
      cols: 2,
      rows: 2,
      minX: 0,
      minZ: 0,
      values: [1, -95, -2, 100],
    };
    const rings = extractContours(grid, { minorInterval: 1, majorInterval: 5, colorMode: "lines", interpolator: "tin" });
    const level0Rings = rings.filter((r) => r.level === 0);
    expect(level0Rings.length).toBeGreaterThan(0);

    // left crossing ≈ (0, 0.333) 所在的那個 ring,另一個點應該是 top≈(0.0196, 1)
    const leftRing = level0Rings.find((r) =>
      r.points.some((p) => Math.abs(p.x - 0) < 0.01 && Math.abs(p.z - 0.333) < 0.01),
    );
    expect(leftRing).toBeDefined();
    const otherPoint = leftRing!.points.find((p) => !(Math.abs(p.x - 0) < 0.01 && Math.abs(p.z - 0.333) < 0.01));
    expect(otherPoint).toBeDefined();
    expect(otherPoint!.x).toBeCloseTo(0.0196, 2);
    expect(otherPoint!.z).toBeCloseTo(1, 2);

    // 確認錯誤配對(left 和 bottom≈(0.0104,0)同屬一 ring)沒有發生
    const wouldBeBuggyPartner = leftRing!.points.find(
      (p) => Math.abs(p.x - 0.0104) < 0.01 && Math.abs(p.z - 0) < 0.01,
    );
    expect(wouldBeBuggyPartner).toBeUndefined();
  });

  it("does not emit degenerate zero-length-segment rings when a corner value equals the level exactly", () => {
    const grid = buildPlaneGrid();
    // buildPlaneGrid 的值 = col+row,5x5 網格,level=4 時多個角點正好等於 4
    // (例如 col=4,row=0 或 col=0,row=4),會讓相鄰兩邊都內插到同一個角點。
    const rings = extractContours(grid, { minorInterval: 1, majorInterval: 5, colorMode: "lines", interpolator: "tin" });
    const level4Rings = rings.filter((r) => r.level === 4);
    for (const ring of level4Rings) {
      if (ring.points.length === 2) {
        const [p0, p1] = ring.points;
        const dist = Math.hypot(p0.x - p1.x, p0.z - p1.z);
        expect(dist).toBeGreaterThan(1e-9);
      }
    }
  });
});
