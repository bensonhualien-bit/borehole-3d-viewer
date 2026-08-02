import { describe, expect, it } from "vitest";
import { resolveContourPoints, lineHasEnoughPointsForContour, resolveVariogramPreview, pickLegendLine } from "./resolveContourPoints";
import type { Borehole } from "../../types/borehole";
import type { ProfileLine } from "../profileStorage";

const BOREHOLES: Borehole[] = [
  { id: "b1", name: "BH-1", x: 100, y: 200, groundElevation: 10, layers: [] },
  { id: "b2", name: "BH-2", x: 110, y: 220, groundElevation: 12, layers: [] },
  { id: "b3", name: "BH-3", x: 130, y: 190, groundElevation: 8, layers: [] },
];

const LINE: ProfileLine = {
  id: "line-1",
  name: "岩盤面",
  color: "#ff0000",
  visible: true,
  points: [
    { boreholeId: "b1", depth: 3 },
    { boreholeId: "b2", depth: 4 },
    { boreholeId: "missing-borehole", depth: 5 },
  ],
};

describe("resolveContourPoints", () => {
  it("converts each point to local (x,z,value) using the centerX/centerZ + N-S sign flip convention", () => {
    const points = resolveContourPoints(LINE, BOREHOLES, 100, 200);
    expect(points).toEqual([
      { x: 0, z: 0, value: 7 },   // b1: x=100-100=0, z=200-200=0(取負號後仍是 0), value=10-3=7
      { x: 10, z: -20, value: 8 }, // b2: x=110-100=10, z=200-220=-20, value=12-4=8
    ]);
  });

  it("skips points whose borehole no longer exists, without throwing", () => {
    const points = resolveContourPoints(LINE, BOREHOLES, 100, 200);
    expect(points.length).toBe(2); // 第三個點(missing-borehole)被跳過
  });
});

describe("lineHasEnoughPointsForContour", () => {
  it("is true for a line with 3+ non-collinear points on existing boreholes", () => {
    const line: ProfileLine = {
      ...LINE,
      points: [
        { boreholeId: "b1", depth: 3 },
        { boreholeId: "b2", depth: 4 },
        { boreholeId: "b3", depth: 2 },
      ],
    };
    expect(lineHasEnoughPointsForContour(line, BOREHOLES)).toBe(true);
  });

  it("is false for a line with only 2 resolvable points", () => {
    expect(lineHasEnoughPointsForContour(LINE, BOREHOLES)).toBe(false); // 第三個點的鑽孔不存在
  });
});

describe("resolveVariogramPreview", () => {
  const threePointLine: ProfileLine = {
    ...LINE,
    points: [
      { boreholeId: "b1", depth: 3 },
      { boreholeId: "b2", depth: 4 },
      { boreholeId: "b3", depth: 2 },
    ],
  };

  it("returns the real fitted params for a line with enough points (not a hardcoded placeholder)", () => {
    // 用真實(未平移)座標手算:b1=(100,200,7) b2=(110,220,8) b3=(130,190,6)
    // 最大兩兩距離 = hypot(20,-30) = sqrt(1300) ≈ 36.0555,range = /3 ≈ 12.0185
    // mean=7,variance=((0)^2+(1)^2+(-1)^2)/3 = 2/3,nugget = 2/3 * 0.05
    const preview = resolveVariogramPreview(threePointLine, BOREHOLES);
    expect(preview).not.toBeNull();
    expect(preview!.range).toBeCloseTo(Math.sqrt(1300) / 3, 6);
    expect(preview!.sill).toBeCloseTo(2 / 3, 6);
    expect(preview!.nugget).toBeCloseTo((2 / 3) * 0.05, 6);
  });

  it("returns null when the line has fewer than 3 resolvable points", () => {
    expect(resolveVariogramPreview(LINE, BOREHOLES)).toBeNull(); // 第三個點的鑽孔不存在,只剩 2 點
  });
});

describe("pickLegendLine", () => {
  it("returns the first line with showContour true", () => {
    const lineA: ProfileLine = { ...LINE, id: "a", showContour: false };
    const lineB: ProfileLine = { ...LINE, id: "b", showContour: true };
    const lineC: ProfileLine = { ...LINE, id: "c", showContour: true };
    expect(pickLegendLine([lineA, lineB, lineC])).toBe(lineB);
  });

  it("returns null when no line has showContour true", () => {
    const lineA: ProfileLine = { ...LINE, id: "a", showContour: false };
    const lineB: ProfileLine = { ...LINE, id: "b" }; // showContour undefined
    expect(pickLegendLine([lineA, lineB])).toBeNull();
  });
});
