import { describe, expect, it } from "vitest";
import {
  applyHandleDrag,
  calibrationToPlacement,
  MIN_WIDTH_METERS,
  normalizeAngleDeg,
  placementToCalibration,
  type QuickInsertPlacement,
} from "./sitePlanQuickInsert";

const IMAGE = { dataUrl: "data:image/png;base64,AAAA", width: 1000, height: 600 };

const basePlacement: QuickInsertPlacement = {
  centerX: 181700,
  centerY: 2493100,
  widthMeters: 250,
  rotationDeg: 0,
};

describe("placementToCalibration", () => {
  it("synthesizes edge-midpoint anchors A(left) / B(right) on the horizontal midline", () => {
    const c = placementToCalibration(basePlacement, IMAGE, 2.5);
    expect(c.pointA).toEqual({ px: 0, py: 300, x: 181700 - 125, y: 2493100 });
    expect(c.pointB).toEqual({ px: 1000, py: 300, x: 181700 + 125, y: 2493100 });
    expect(c.groundElevation).toBe(2.5);
    expect(c.imageWidth).toBe(1000);
    expect(c.imageHeight).toBe(600);
    expect(c.manualPosition).toBeUndefined();
  });
  it("rotates the anchor pair around the center (30° CCW)", () => {
    const c = placementToCalibration({ ...basePlacement, rotationDeg: 30 }, IMAGE, 0);
    const half = 125;
    const dx = half * Math.cos(Math.PI / 6);
    const dy = half * Math.sin(Math.PI / 6);
    expect(c.pointB.x).toBeCloseTo(181700 + dx, 6);
    expect(c.pointB.y).toBeCloseTo(2493100 + dy, 6);
    expect(c.pointA.x).toBeCloseTo(181700 - dx, 6);
    expect(c.pointA.y).toBeCloseTo(2493100 - dy, 6);
  });
  it("preserves the locked flag when given", () => {
    expect(placementToCalibration(basePlacement, IMAGE, 0, true).locked).toBe(true);
    expect(placementToCalibration(basePlacement, IMAGE, 0).locked).toBeUndefined();
  });
});

describe("round trip placement -> calibration -> placement", () => {
  for (const p of [
    basePlacement,
    { ...basePlacement, rotationDeg: 30 },
    { ...basePlacement, rotationDeg: -170 },
    { centerX: -50, centerY: -80, widthMeters: 12.5, rotationDeg: 91 },
  ]) {
    it(`restores ${JSON.stringify({ w: p.widthMeters, r: p.rotationDeg })}`, () => {
      const back = calibrationToPlacement(placementToCalibration(p, IMAGE, 0));
      expect(back.centerX).toBeCloseTo(p.centerX, 6);
      expect(back.centerY).toBeCloseTo(p.centerY, 6);
      expect(back.widthMeters).toBeCloseTo(p.widthMeters, 6);
      expect(back.rotationDeg).toBeCloseTo(normalizeAngleDeg(p.rotationDeg), 6);
    });
  }
});

describe("calibrationToPlacement", () => {
  it("uses manualPosition as the center when present (post-drag state)", () => {
    const c = { ...placementToCalibration(basePlacement, IMAGE, 0), manualPosition: { x: 999, z: 888 } };
    const p = calibrationToPlacement(c);
    expect(p.centerX).toBe(999);
    expect(p.centerY).toBe(888);
    expect(p.widthMeters).toBeCloseTo(250, 6); // 平移不改形狀
  });
  it("also decodes a two-point-calibrated plan (not quick-inserted)", () => {
    // 兩點校準存的任意參考點:px 相距 400 對應世界 100m → scale 0.25 → 寬 250m
    const c = {
      imageDataUrl: IMAGE.dataUrl, imageWidth: 1000, imageHeight: 600,
      pointA: { px: 100, py: 100, x: 0, y: 0 },
      pointB: { px: 500, py: 100, x: 100, y: 0 },
      groundElevation: 0,
    };
    const p = calibrationToPlacement(c);
    expect(p.widthMeters).toBeCloseTo(250, 6);
    expect(p.rotationDeg).toBeCloseTo(0, 6);
  });
});

describe("applyHandleDrag", () => {
  const start = { ...basePlacement, rotationDeg: 10 };
  it("scales width by the vector length ratio", () => {
    const out = applyHandleDrag({ x: 10, y: 0 }, { x: 20, y: 0 }, start);
    expect(out.widthMeters).toBeCloseTo(500, 6);
    expect(out.rotationDeg).toBeCloseTo(10, 6);
    expect(out.centerX).toBe(start.centerX); // 中心錨定不動
  });
  it("rotates by the vector angle delta (CCW positive)", () => {
    const out = applyHandleDrag({ x: 10, y: 0 }, { x: 0, y: 10 }, start);
    expect(out.rotationDeg).toBeCloseTo(100, 6);
    expect(out.widthMeters).toBeCloseTo(250, 6);
  });
  it("clamps width to MIN_WIDTH_METERS and survives a degenerate start vector", () => {
    const tiny = applyHandleDrag({ x: 10, y: 0 }, { x: 0.001, y: 0 }, start);
    expect(tiny.widthMeters).toBe(MIN_WIDTH_METERS);
    expect(applyHandleDrag({ x: 0, y: 0 }, { x: 5, y: 5 }, start)).toEqual(start);
  });
});

describe("normalizeAngleDeg", () => {
  it("maps into (-180, 180]", () => {
    expect(normalizeAngleDeg(190)).toBeCloseTo(-170, 9);
    expect(normalizeAngleDeg(-190)).toBeCloseTo(170, 9);
    expect(normalizeAngleDeg(180)).toBeCloseTo(180, 9);
    expect(normalizeAngleDeg(540)).toBeCloseTo(180, 9);
  });
});
