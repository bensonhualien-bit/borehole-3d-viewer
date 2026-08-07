import { describe, expect, it } from "vitest";
import type { KnownPoint } from "../contour/types";
import { buildLayerSolidGrid } from "./solidGrid";

// 4 個角落點,value 全部同高 → Kriging 內插結果必為常數面,方便斷言厚度。
function flatSquare(value: number): KnownPoint[] {
  return [
    { x: 0, z: 0, value },
    { x: 100, z: 0, value },
    { x: 0, z: 100, value },
    { x: 100, z: 100, value },
  ];
}

describe("buildLayerSolidGrid", () => {
  it("returns null when either surface has fewer than 3 points", () => {
    expect(buildLayerSolidGrid(flatSquare(10).slice(0, 2), flatSquare(0), 0)).toBeNull();
    expect(buildLayerSolidGrid(flatSquare(10), [], 0)).toBeNull();
  });

  it("builds a shared grid spec from the union of both point sets", () => {
    // 頂線只涵蓋左半 (x 0~50)、底線只涵蓋右半 (x 50~100):聯集 bbox 應為 0~100。
    const top: KnownPoint[] = [
      { x: 0, z: 0, value: 10 },
      { x: 50, z: 0, value: 10 },
      { x: 0, z: 100, value: 10 },
    ];
    const bottom: KnownPoint[] = [
      { x: 50, z: 100, value: 0 },
      { x: 100, z: 0, value: 0 },
      { x: 100, z: 100, value: 0 },
    ];
    const grid = buildLayerSolidGrid(top, bottom, 0);
    expect(grid).not.toBeNull();
    expect(grid!.minX).toBe(0);
    expect(grid!.minX + (grid!.cols - 1) * grid!.cellSize).toBeGreaterThanOrEqual(100);
    // 頂/底共用同一個規格:兩個陣列長度一致,可逐格配對
    expect(grid!.top.length).toBe(grid!.bottom.length);
    expect(grid!.top.length).toBe(grid!.cols * grid!.rows);
  });

  it("expands the bbox by diagonal * extrapolationRatio", () => {
    const zero = buildLayerSolidGrid(flatSquare(10), flatSquare(0), 0)!;
    const expanded = buildLayerSolidGrid(flatSquare(10), flatSquare(0), 0.2)!;
    // 對角線 = sqrt(100^2+100^2) ≈ 141.42,外插 20% ≈ 28.28,每側都要往外推
    expect(zero.minX).toBe(0);
    expect(expanded.minX).toBeCloseTo(-Math.hypot(100, 100) * 0.2, 5);
    expect(expanded.cols).toBeGreaterThan(zero.cols);
    expect(expanded.rows).toBeGreaterThan(zero.rows);
  });

  it("interpolates top above bottom with zero pinch-out for well-separated flat surfaces", () => {
    const grid = buildLayerSolidGrid(flatSquare(10), flatSquare(0), 0)!;
    expect(grid.pinchOutRatio).toBe(0);
    for (let i = 0; i < grid.top.length; i++) {
      const top = grid.top[i];
      const bottom = grid.bottom[i];
      expect(top).not.toBeNull();
      expect(bottom).not.toBeNull();
      expect(top!).toBeCloseTo(10, 3);
      expect(bottom!).toBeCloseTo(0, 3);
    }
  });

  it("collapses cells where top < bottom to their midpoint and reports pinchOutRatio", () => {
    // 頂面全 0、底面全 10:每一格都尖滅,合併到中點 5,pinchOutRatio 應為 1。
    const grid = buildLayerSolidGrid(flatSquare(0), flatSquare(10), 0)!;
    expect(grid.pinchOutRatio).toBe(1);
    for (let i = 0; i < grid.top.length; i++) {
      expect(grid.top[i]).not.toBeNull();
      expect(grid.top[i]!).toBeCloseTo(grid.bottom[i]!, 10);
      expect(grid.top[i]!).toBeCloseTo(5, 3);
    }
  });

  it("follows the contour grid resolution rule (diagonal/60 clamped to 0.5~5m)", () => {
    const grid = buildLayerSolidGrid(flatSquare(10), flatSquare(0), 0)!;
    // 對角線 141.42/60 ≈ 2.36,落在 0.5~5 之間
    expect(grid.cellSize).toBeCloseTo(Math.hypot(100, 100) / 60, 5);
    const tiny = buildLayerSolidGrid(
      [
        { x: 0, z: 0, value: 1 },
        { x: 1, z: 0, value: 1 },
        { x: 0, z: 1, value: 1 },
      ],
      [
        { x: 0, z: 0, value: 0 },
        { x: 1, z: 0, value: 0 },
        { x: 0, z: 1, value: 0 },
      ],
      0,
    )!;
    expect(tiny.cellSize).toBe(0.5); // clamp 下限
  });

  it("with TIN, the extrapolation margin extends the solid using flat boundary values", () => {
    const noMargin = buildLayerSolidGrid(flatSquare(10), flatSquare(0), 0, "tin")!;
    expect(noMargin).not.toBeNull();
    expect(noMargin.pinchOutRatio).toBe(0);
    expect(noMargin.top.some((v) => v !== null)).toBe(true);

    // 有外插邊距時,凸包外的格子用邊界值平推——撐開後的角落也要有值,
    // 且值等於邊界高程(頂面全 10、底面全 0)
    const withMargin = buildLayerSolidGrid(flatSquare(10), flatSquare(0), 0.2, "tin")!;
    expect(withMargin.top[0]).not.toBeNull();
    expect(withMargin.top[0]!).toBeCloseTo(10, 4);
    expect(withMargin.bottom[0]!).toBeCloseTo(0, 4);
    const validNoMargin = noMargin.top.filter((v) => v !== null).length;
    const validWithMargin = withMargin.top.filter((v) => v !== null).length;
    expect(validWithMargin).toBeGreaterThan(validNoMargin);
  });

  it("with TIN, non-overlapping hulls still pair through boundary extension", () => {
    // 頂面凸包在左、底面凸包在右,互不重疊:兩面都靠邊界平推補值,
    // 中間地帶頂=10、底=0,厚度為正、不觸發尖滅
    const top: KnownPoint[] = [
      { x: 0, z: 0, value: 10 },
      { x: 10, z: 0, value: 10 },
      { x: 0, z: 100, value: 10 },
    ];
    const bottom: KnownPoint[] = [
      { x: 90, z: 0, value: 0 },
      { x: 100, z: 0, value: 0 },
      { x: 100, z: 100, value: 0 },
    ];
    const grid = buildLayerSolidGrid(top, bottom, 0, "tin")!;
    expect(grid).not.toBeNull();
    expect(grid.top.every((v, i) => (v === null) === (grid.bottom[i] === null))).toBe(true);
    expect(grid.pinchOutRatio).toBe(0);
  });

  it("defaults to kriging when the interpolator argument is omitted", () => {
    // 既有呼叫端(未傳第 4 參數)行為必須完全不變
    const grid = buildLayerSolidGrid(flatSquare(10), flatSquare(0), 0.2)!;
    expect(grid.top[0]).not.toBeNull(); // Kriging 外插:撐開後的角落也有值
  });

  it("passes manual kriging params through so solids match a manually-tuned contour surface", () => {
    // 有手動參數跟沒有(自動擬合)時都要能建出值——參數本身的數學已在
    // krigingInterpolator.test.ts 驗證,這裡只固定「參數有被接受」的介面行為
    const grid = buildLayerSolidGrid(flatSquare(10), flatSquare(0), 0, "kriging", {
      range: 50,
      sill: 2,
      nugget: 0.1,
    })!;
    expect(grid).not.toBeNull();
    expect(grid.top.some((v) => v !== null)).toBe(true);
  });

  it("dedupes same-position points per surface so a duplicated borehole cannot break kriging", () => {
    // krigingInterpolator 內部已做位置去重;這裡固定「重複點不會讓整面變 null」的行為
    const top = [...flatSquare(10), { x: 0, z: 0, value: 12 }];
    const grid = buildLayerSolidGrid(top, flatSquare(0), 0);
    expect(grid).not.toBeNull();
    expect(grid!.top.some((v) => v !== null)).toBe(true);
  });
});
