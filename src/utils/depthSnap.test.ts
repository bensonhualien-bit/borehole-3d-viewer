import { describe, expect, it } from "vitest";
import { snapDepth } from "./depthSnap";
import type { SoilLayer } from "../types/borehole";

const LAYERS: SoilLayer[] = [
  { topDepth: 0, bottomDepth: 5, soilType: "CL", color: "#8a9a5b" },
  { topDepth: 5, bottomDepth: 12, soilType: "SM", color: "#c2b280" },
];

describe("snapDepth", () => {
  it("snaps to the nearest layer boundary in boundary mode", () => {
    expect(snapDepth(4.7, LAYERS, "boundary")).toBe(5);
    expect(snapDepth(0.3, LAYERS, "boundary")).toBe(0);
    expect(snapDepth(11.4, LAYERS, "boundary")).toBe(12);
  });

  it("rounds to 0.01m in free mode regardless of layers", () => {
    expect(snapDepth(4.7326, LAYERS, "free")).toBeCloseTo(4.73, 6);
  });

  it("rounds to 0.01m in boundary mode when there are no layers", () => {
    expect(snapDepth(4.7326, [], "boundary")).toBeCloseTo(4.73, 6);
  });
});

describe("CPT sample snapping", () => {
  it("boundary mode with no layers snaps to the nearest cpt sample depth", () => {
    expect(snapDepth(0.31, [], "boundary", [0.2, 0.4, 0.6])).toBe(0.4);
    expect(snapDepth(0.29, [], "boundary", [0.2, 0.4, 0.6])).toBe(0.2);
  });
  it("free mode ignores cpt samples (stays on 0.01m grid)", () => {
    expect(snapDepth(0.313, [], "free", [0.2, 0.4])).toBe(0.31);
  });
  it("BH holes (non-empty layers) are unaffected by cpt samples", () => {
    const layers = [{ topDepth: 0, bottomDepth: 5, soilType: "CL", color: "#888" }];
    expect(snapDepth(4.9, layers, "boundary", [0.2])).toBe(5);
  });
  it("empty sample list falls back to the 0.01m grid", () => {
    expect(snapDepth(0.313, [], "boundary", [])).toBe(0.31);
    expect(snapDepth(0.313, [], "boundary")).toBe(0.31);
  });
});
