import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM, nextZoom } from "./zoom";

describe("nextZoom", () => {
  it("increases zoom when scrolling up (negative deltaY)", () => {
    const result = nextZoom(1, -100);
    expect(result).toBeGreaterThan(1);
  });

  it("decreases zoom when scrolling down (positive deltaY)", () => {
    const result = nextZoom(2, 100);
    expect(result).toBeLessThan(2);
  });

  it("clamps at MAX_ZOOM when zooming in past the limit", () => {
    const result = nextZoom(MAX_ZOOM, -100);
    expect(result).toBe(MAX_ZOOM);
  });

  it("clamps at MIN_ZOOM when zooming out past the limit", () => {
    const result = nextZoom(MIN_ZOOM, 100);
    expect(result).toBe(MIN_ZOOM);
  });

  it("roughly round-trips: zooming in then out returns close to the start", () => {
    const zoomedIn = nextZoom(2, -100);
    const backOut = nextZoom(zoomedIn, 100);
    expect(backOut).toBeCloseTo(2, 5);
  });
});
