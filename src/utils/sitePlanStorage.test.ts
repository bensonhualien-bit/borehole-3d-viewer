import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSitePlan,
  computeSimilarityTransform,
  getSitePlanBounds,
  loadSitePlan,
  pixelToWorld,
  saveSitePlan,
  type SitePlanCalibration,
} from "./sitePlanStorage";

describe("computeSimilarityTransform", () => {
  it("computes scale 1, rotation 0 for an axis-aligned identity-ish case", () => {
    const a = { px: 0, py: 0, x: 0, y: 0 };
    const b = { px: 10, py: 0, x: 10, y: 0 };
    const t = computeSimilarityTransform(a, b);
    expect(t.scale).toBeCloseTo(1);
    expect(t.rotation).toBeCloseTo(0);
    const mid = pixelToWorld({ px: 5, py: 0 }, t);
    expect(mid.x).toBeCloseTo(5);
    expect(mid.y).toBeCloseTo(0);
  });

  it("computes a scale factor when world distance differs from pixel distance", () => {
    const a = { px: 0, py: 0, x: 0, y: 0 };
    const b = { px: 10, py: 0, x: 20, y: 0 };
    const t = computeSimilarityTransform(a, b);
    expect(t.scale).toBeCloseTo(2);
    const mid = pixelToWorld({ px: 5, py: 0 }, t);
    expect(mid.x).toBeCloseTo(10);
    expect(mid.y).toBeCloseTo(0);
  });

  it("round-trips both calibration points back to their exact real-world coordinates", () => {
    const a = { px: 37, py: 142, x: 181717.7, y: 2493191.8 };
    const b = { px: 401, py: 88, x: 181850.2, y: 2493255.4 };
    const t = computeSimilarityTransform(a, b);
    const worldA = pixelToWorld({ px: a.px, py: a.py }, t);
    const worldB = pixelToWorld({ px: b.px, py: b.py }, t);
    expect(worldA.x).toBeCloseTo(a.x, 6);
    expect(worldA.y).toBeCloseTo(a.y, 6);
    expect(worldB.x).toBeCloseTo(b.x, 6);
    expect(worldB.y).toBeCloseTo(b.y, 6);
  });

  it("throws when the two reference points are too close together", () => {
    const a = { px: 10, py: 10, x: 5, y: 5 };
    const b = { px: 10.0000001, py: 10, x: 5.0000001, y: 5 };
    expect(() => computeSimilarityTransform(a, b)).toThrow();
  });
});

describe("getSitePlanBounds", () => {
  const CALIBRATION: SitePlanCalibration = {
    imageDataUrl: "data:image/png;base64,AAAA",
    imageWidth: 400,
    imageHeight: 300,
    pointA: { px: 37, py: 142, x: 181717.7, y: 2493191.8 },
    pointB: { px: 401, py: 88, x: 181850.2, y: 2493255.4 },
    groundElevation: 100,
  };

  it("matches the min/max of the four image corners computed directly via pixelToWorld", () => {
    const transform = computeSimilarityTransform(CALIBRATION.pointA, CALIBRATION.pointB);
    const corners = [
      { px: 0, py: 0 },
      { px: CALIBRATION.imageWidth, py: 0 },
      { px: 0, py: CALIBRATION.imageHeight },
      { px: CALIBRATION.imageWidth, py: CALIBRATION.imageHeight },
    ].map((c) => pixelToWorld(c, transform));

    const bounds = getSitePlanBounds(CALIBRATION);
    expect(bounds.minX).toBeCloseTo(Math.min(...corners.map((c) => c.x)), 6);
    expect(bounds.maxX).toBeCloseTo(Math.max(...corners.map((c) => c.x)), 6);
    expect(bounds.minY).toBeCloseTo(Math.min(...corners.map((c) => c.y)), 6);
    expect(bounds.maxY).toBeCloseTo(Math.max(...corners.map((c) => c.y)), 6);
  });

  it("shifts every corner by the same amount when manualPosition overrides the calibrated center", () => {
    const withoutManual = getSitePlanBounds(CALIBRATION);
    const withManual = getSitePlanBounds({ ...CALIBRATION, manualPosition: { x: 100, z: 50 } });

    const transform = computeSimilarityTransform(CALIBRATION.pointA, CALIBRATION.pointB);
    const calibratedCenter = pixelToWorld(
      { px: CALIBRATION.imageWidth / 2, py: CALIBRATION.imageHeight / 2 },
      transform
    );
    const shiftX = 100 - calibratedCenter.x;
    const shiftY = 50 - calibratedCenter.y;

    expect(withManual.minX).toBeCloseTo(withoutManual.minX + shiftX, 6);
    expect(withManual.maxX).toBeCloseTo(withoutManual.maxX + shiftX, 6);
    expect(withManual.minY).toBeCloseTo(withoutManual.minY + shiftY, 6);
    expect(withManual.maxY).toBeCloseTo(withoutManual.maxY + shiftY, 6);
  });

  it("gives a strictly positive width and height (image never collapses to a point/line)", () => {
    const bounds = getSitePlanBounds(CALIBRATION);
    expect(bounds.maxX - bounds.minX).toBeGreaterThan(0);
    expect(bounds.maxY - bounds.minY).toBeGreaterThan(0);
  });
});

function stubLocalStorage() {
  const store: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  });
  return store;
}

const SAMPLE: SitePlanCalibration = {
  imageDataUrl: "data:image/png;base64,AAAA",
  imageWidth: 400,
  imageHeight: 300,
  pointA: { px: 0, py: 300, x: -15, y: 0 },
  pointB: { px: 400, py: 300, x: 15, y: 0 },
  groundElevation: 100,
};

describe("site plan persistence", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it("returns null when nothing has been saved", () => {
    expect(loadSitePlan()).toBeNull();
  });

  it("saves and loads back an equal object", () => {
    saveSitePlan(SAMPLE);
    expect(loadSitePlan()).toEqual(SAMPLE);
  });

  it("returns null when the stored value is corrupted JSON", () => {
    localStorage.setItem("sitePlanCalibration", "{not json");
    expect(loadSitePlan()).toBeNull();
  });

  it("removes the stored value on clear", () => {
    saveSitePlan(SAMPLE);
    clearSitePlan();
    expect(loadSitePlan()).toBeNull();
  });

  it("propagates errors thrown by localStorage.setItem", () => {
    const store = stubLocalStorage();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: () => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
    expect(() => saveSitePlan(SAMPLE)).toThrow("quota exceeded");
  });
});
