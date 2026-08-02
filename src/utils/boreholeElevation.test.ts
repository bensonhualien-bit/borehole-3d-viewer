import { describe, expect, it } from "vitest";
import { boreholeMaxDepth, computeElevationRange } from "./boreholeElevation";
import type { Borehole } from "../types/borehole";

const WITH_LAYERS: Borehole = {
  id: "BH-01",
  name: "BH-01",
  x: 0,
  y: 0,
  groundElevation: 100,
  layers: [
    { topDepth: 0, bottomDepth: 5, soilType: "CL", color: "#8a9a5b" },
    { topDepth: 5, bottomDepth: 12, soilType: "SM", color: "#c2b280" },
  ],
};

const CPT_ONLY: Borehole = {
  id: "CH-01",
  name: "CH-01",
  x: 10,
  y: 10,
  groundElevation: 90,
  layers: [],
  cptCurve: [
    { depth: 1, qc: 10 },
    { depth: 8, qc: 20 },
  ],
};

const NO_DATA: Borehole = {
  id: "BH-02",
  name: "BH-02",
  x: 20,
  y: 20,
  groundElevation: 80,
  layers: [],
};

describe("boreholeMaxDepth", () => {
  it("returns the deepest layer bottom for a borehole with soil layers", () => {
    expect(boreholeMaxDepth(WITH_LAYERS)).toBe(12);
  });

  it("returns the last CPT curve depth for a CPT-only borehole", () => {
    expect(boreholeMaxDepth(CPT_ONLY)).toBe(8);
  });

  it("returns 0 for a borehole with neither layers nor a CPT curve", () => {
    expect(boreholeMaxDepth(NO_DATA)).toBe(0);
  });
});

describe("computeElevationRange", () => {
  it("returns a safe default range for an empty array", () => {
    expect(computeElevationRange([])).toEqual({ min: -10, max: 10 });
  });

  it("computes max as the highest ground elevation + 5", () => {
    const { max } = computeElevationRange([WITH_LAYERS, CPT_ONLY]);
    expect(max).toBe(105); // WITH_LAYERS groundElevation 100 + 5
  });

  it("computes min as the lowest bottom elevation - 5", () => {
    const { min } = computeElevationRange([WITH_LAYERS, CPT_ONLY]);
    // WITH_LAYERS bottom elevation: 100 - 12 = 88; CPT_ONLY bottom elevation: 90 - 8 = 82
    expect(min).toBe(77); // 82 - 5
  });
});
