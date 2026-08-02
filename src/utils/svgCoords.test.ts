import { describe, expect, it } from "vitest";
import { screenToWorld, zoomViewBox } from "./svgCoords";

describe("screenToWorld", () => {
  it("maps the container's top-left corner to the viewBox's minX/minY when aspect ratios match", () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    const viewBox = { minX: 10, minY: 20, width: 200, height: 100 };
    const result = screenToWorld(rect, viewBox, 100, 50);
    expect(result).toEqual({ x: 10, y: 20 });
  });

  it("maps the container's center to the viewBox's center", () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    const viewBox = { minX: 10, minY: 20, width: 200, height: 100 };
    const result = screenToWorld(rect, viewBox, 200, 100);
    expect(result).toEqual({ x: 110, y: 70 });
  });

  it("accounts for letterboxing when the container is wider than the viewBox aspect ratio", () => {
    // container 400x100 (aspect 4), viewBox 200x100 (aspect 2) -> scale limited by height,
    // rendered content is 200 wide, centered horizontally with 100px of blank space each side
    const rect = { left: 0, top: 0, width: 400, height: 100 };
    const viewBox = { minX: 0, minY: 0, width: 200, height: 100 };
    // click at the exact center of the rendered content (not the container)
    const result = screenToWorld(rect, viewBox, 200, 50);
    expect(result.x).toBeCloseTo(100, 6);
    expect(result.y).toBeCloseTo(50, 6);
  });
});

describe("zoomViewBox", () => {
  const base = { minX: 0, minY: 0, width: 100, height: 50 };

  it("shrinks width/height and keeps the center fixed when scrolling up (zoom in)", () => {
    const result = zoomViewBox(base, -100, 10, 1000);
    expect(result.width).toBeCloseTo(100 / 1.1, 6);
    expect(result.height).toBeCloseTo(50 / 1.1, 6);
    expect(result.minX + result.width / 2).toBeCloseTo(50, 6);
    expect(result.minY + result.height / 2).toBeCloseTo(25, 6);
  });

  it("grows width/height when scrolling down (zoom out)", () => {
    const result = zoomViewBox(base, 100, 10, 1000);
    expect(result.width).toBeCloseTo(110, 6);
  });

  it("does not zoom in past the minimum width", () => {
    const tiny = { minX: 0, minY: 0, width: 10.5, height: 5.25 };
    const result = zoomViewBox(tiny, -100, 10, 1000);
    expect(result).toEqual(tiny);
  });

  it("does not zoom out past the maximum width", () => {
    const huge = { minX: 0, minY: 0, width: 950, height: 475 };
    const result = zoomViewBox(huge, 100, 10, 1000);
    expect(result).toEqual(huge);
  });

  it("returns the same viewBox unchanged when deltaY is 0", () => {
    expect(zoomViewBox(base, 0, 10, 1000)).toEqual(base);
  });
});
