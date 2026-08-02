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
