import { describe, expect, it } from "vitest";
import type { Borehole } from "../types/borehole";
import {
  buildCptPolyline,
  globalQcMax,
  negativeQcRuns,
  qcLabelFontScale,
  qcLabelStep,
} from "./cptCurve";

const hole = (id: string, qcs: number[]): Borehole => ({
  id, name: id, x: 0, y: 0, groundElevation: 10, layers: [],
  cptCurve: qcs.map((qc, i) => ({ depth: (i + 1) / 5, qc })),
});

describe("globalQcMax", () => {
  it("takes the max qc across all boreholes' curves", () => {
    expect(globalQcMax([hole("a", [1, 5]), hole("b", [3])])).toBe(5);
  });
  it("returns null when no borehole has a curve", () => {
    expect(globalQcMax([{ ...hole("a", []), cptCurve: undefined }])).toBeNull();
    expect(globalQcMax([])).toBeNull();
  });
  it("ignores negative values (clamped view drives the scale)", () => {
    expect(globalQcMax([hole("a", [-9, 2])])).toBe(2);
    expect(globalQcMax([hole("a", [-9, -1])])).toBeNull(); // 全負=夾 0 後無正值,無比例尺
  });
});

describe("buildCptPolyline", () => {
  it("maps qc linearly into [0, maxWidth]", () => {
    const pts = buildCptPolyline(hole("a", [0, 5, 10]).cptCurve!, 10, 6);
    expect(pts).toEqual([
      { offset: 0, depth: 0.2 },
      { offset: 3, depth: 0.4 },
      { offset: 6, depth: 0.6 },
    ]);
  });
  it("clamps negative qc to 0 offset", () => {
    const pts = buildCptPolyline(hole("a", [-3, 10]).cptCurve!, 10, 6);
    expect(pts[0].offset).toBe(0);
    expect(pts[1].offset).toBe(6);
  });
  it("returns [] for empty curve or non-positive qcMax", () => {
    expect(buildCptPolyline([], 10, 6)).toEqual([]);
    expect(buildCptPolyline(hole("a", [1]).cptCurve!, 0, 6)).toEqual([]);
  });
});

describe("negativeQcRuns", () => {
  const curve = (qcs: number[]) => hole("a", qcs).cptCurve!;
  it("merges consecutive negative samples into one depth run", () => {
    expect(negativeQcRuns(curve([1, -1, -2, 1]))).toEqual([{ topDepth: 0.4, bottomDepth: 0.6 }]);
  });
  it("handles runs at head and tail and multiple runs", () => {
    expect(negativeQcRuns(curve([-1, 2, -3, -4]))).toEqual([
      { topDepth: 0.2, bottomDepth: 0.2 },
      { topDepth: 0.6, bottomDepth: 0.8 },
    ]);
  });
  it("returns [] when nothing is negative; whole-negative curve is one run", () => {
    expect(negativeQcRuns(curve([1, 2]))).toEqual([]);
    expect(negativeQcRuns(curve([-1, -2]))).toEqual([{ topDepth: 0.2, bottomDepth: 0.4 }]);
  });
});

describe("qcLabelFontScale", () => {
  it("stays at full scale (1) at and below the 30-sample threshold", () => {
    expect(qcLabelFontScale(1)).toBe(1);
    expect(qcLabelFontScale(30)).toBe(1);
  });
  it("drops to 0.8 between 31 and 60 samples", () => {
    expect(qcLabelFontScale(31)).toBe(0.8);
    expect(qcLabelFontScale(60)).toBe(0.8);
  });
  it("drops to 0.6 above 60 samples", () => {
    expect(qcLabelFontScale(61)).toBe(0.6);
    expect(qcLabelFontScale(200)).toBe(0.6);
  });
});

describe("qcLabelStep", () => {
  it("never lets labels overlap: step * spacing >= fontSize * 1.15", () => {
    const cases: [number, number][] = [
      [0.2, 0.3],
      [0.1, 0.6],
      [0.05, 1],
      [1, 0.5],
    ];
    for (const [spacing, fontSize] of cases) {
      const step = qcLabelStep(spacing, fontSize);
      expect(step * spacing).toBeGreaterThanOrEqual(fontSize * 1.15 - 1e-9);
    }
  });
  it("returns 1 when spacing is zero or negative", () => {
    expect(qcLabelStep(0, 0.5)).toBe(1);
    expect(qcLabelStep(-0.2, 0.5)).toBe(1);
  });
  it("returns 1 when spacing already gives enough clearance", () => {
    expect(qcLabelStep(1, 0.5)).toBe(1);
  });
});
