import { describe, expect, it } from "vitest";
import { computeProfileAxis, computeSequentialDistanceAxis } from "./profileAxis";

describe("computeProfileAxis", () => {
  it("returns an empty array for no boreholes", () => {
    expect(computeProfileAxis([])).toEqual([]);
  });

  it("returns distance 0 for a single borehole", () => {
    const result = computeProfileAxis([{ id: "A", x: 123, y: 456 }]);
    expect(result).toEqual([{ boreholeId: "A", distance: 0 }]);
  });

  it("projects two horizontally-separated boreholes to their real distance", () => {
    const result = computeProfileAxis([
      { id: "A", x: 0, y: 0 },
      { id: "B", x: 10, y: 0 },
    ]);
    const distances = result.map((r) => r.distance).sort((a, b) => a - b);
    expect(distances[1] - distances[0]).toBeCloseTo(10, 6);
  });

  it("projects two vertically-separated boreholes to their real distance", () => {
    const result = computeProfileAxis([
      { id: "A", x: 0, y: 0 },
      { id: "B", x: 0, y: 10 },
    ]);
    const distances = result.map((r) => r.distance).sort((a, b) => a - b);
    expect(distances[1] - distances[0]).toBeCloseTo(10, 6);
  });

  it("projects two diagonally-separated boreholes to their real distance", () => {
    const result = computeProfileAxis([
      { id: "A", x: 0, y: 0 },
      { id: "B", x: 3, y: 4 },
    ]);
    const distances = result.map((r) => r.distance).sort((a, b) => a - b);
    expect(distances[1] - distances[0]).toBeCloseTo(5, 6);
  });

  it("orders three collinear boreholes by their real spacing", () => {
    const result = computeProfileAxis([
      { id: "A", x: 0, y: 0 },
      { id: "B", x: 20, y: 20 },
      { id: "C", x: 5, y: 5 },
    ]);
    expect(result.map((r) => r.boreholeId)).toEqual(["A", "C", "B"]);
    const byId = (id: string) => result.find((r) => r.boreholeId === id)!.distance;
    const distAB = byId("B") - byId("A");
    const distAC = byId("C") - byId("A");
    expect(distAB / distAC).toBeCloseTo(4, 6); // C sits 1/4 of the way from A to B
  });

  it("does not crash for fully coincident boreholes", () => {
    const result = computeProfileAxis([
      { id: "A", x: 5, y: 5 },
      { id: "B", x: 5, y: 5 },
    ]);
    expect(result).toHaveLength(2);
    for (const r of result) {
      expect(Number.isNaN(r.distance)).toBe(false);
    }
  });
});

describe("computeSequentialDistanceAxis", () => {
  it("returns an empty array for no boreholes", () => {
    expect(computeSequentialDistanceAxis([])).toEqual([]);
  });

  it("returns distance 0 for a single borehole", () => {
    const result = computeSequentialDistanceAxis([{ id: "A", x: 10, y: 20 }]);
    expect(result).toEqual([{ boreholeId: "A", distance: 0 }]);
  });

  it("accumulates real straight-line distances for collinear boreholes", () => {
    const boreholes = [
      { id: "A", x: 0, y: 0 },
      { id: "B", x: 5, y: 5 },
      { id: "C", x: 20, y: 20 },
    ];
    const result = computeSequentialDistanceAxis(boreholes);
    const byId = (id: string) => result.find((r) => r.boreholeId === id)!.distance;
    expect(result.map((r) => r.boreholeId)).toEqual(["A", "B", "C"]);
    expect(byId("A")).toBeCloseTo(0, 6);
    expect(byId("B")).toBeCloseTo(Math.hypot(5, 5), 6);
    expect(byId("C")).toBeCloseTo(Math.hypot(5, 5) + Math.hypot(15, 15), 6);
  });

  it("keeps the same order as computeProfileAxis but different (non-collinear) spacing", () => {
    const boreholes = [
      { id: "A", x: 0, y: 0 },
      { id: "B", x: 10, y: 0 },
      { id: "C", x: 10, y: 10 },
    ];
    const projected = computeProfileAxis(boreholes);
    const sequential = computeSequentialDistanceAxis(boreholes);
    expect(sequential.map((e) => e.boreholeId)).toEqual(projected.map((e) => e.boreholeId));
    const gaps = (entries: typeof projected) => {
      const out: number[] = [];
      for (let i = 1; i < entries.length; i++) out.push(entries[i].distance - entries[i - 1].distance);
      return out;
    };
    expect(gaps(sequential)).not.toEqual(gaps(projected));
  });
});
