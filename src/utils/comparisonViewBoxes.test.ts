import { describe, expect, it } from "vitest";
import { resolveNextVerticalViewBoxes } from "./comparisonViewBoxes";
import type { BoreholeGroup } from "./boreholeGroupStorage";
import type { VerticalViewBox } from "../components/ProfileSection2D";

const INITIAL_BOX: VerticalViewBox = { minY: -10, height: 20 };

describe("resolveNextVerticalViewBoxes", () => {
  it("assigns the initial box to a brand-new group", () => {
    const groups: BoreholeGroup[] = [{ id: "g1", name: "剖面1", boreholeIds: ["b1", "b2"] }];
    const result = resolveNextVerticalViewBoxes(groups, {}, {}, INITIAL_BOX);
    expect(result.boxes).toEqual({ g1: INITIAL_BOX });
    expect(result.membershipKeys).toEqual({ g1: "b1,b2" });
    expect(result.changed).toBe(true);
  });

  it("preserves a user-adjusted box when the group's membership hasn't changed", () => {
    const groups: BoreholeGroup[] = [{ id: "g1", name: "剖面1", boreholeIds: ["b1", "b2"] }];
    const userAdjusted: VerticalViewBox = { minY: -5, height: 15 };
    const result = resolveNextVerticalViewBoxes(
      groups,
      { g1: userAdjusted },
      { g1: "b1,b2" },
      INITIAL_BOX,
    );
    expect(result.boxes).toEqual({ g1: userAdjusted });
    expect(result.changed).toBe(false);
  });

  it("treats reordered-but-identical membership as unchanged (sorted key)", () => {
    const groups: BoreholeGroup[] = [{ id: "g1", name: "剖面1", boreholeIds: ["b2", "b1"] }];
    const userAdjusted: VerticalViewBox = { minY: -5, height: 15 };
    const result = resolveNextVerticalViewBoxes(
      groups,
      { g1: userAdjusted },
      { g1: "b1,b2" },
      INITIAL_BOX,
    );
    expect(result.boxes).toEqual({ g1: userAdjusted });
    expect(result.changed).toBe(false);
  });

  it("resets only the group whose membership actually changed", () => {
    const groups: BoreholeGroup[] = [
      { id: "g1", name: "剖面1", boreholeIds: ["b1", "b5"] }, // b2 -> b5,成員變了
      { id: "g2", name: "剖面2", boreholeIds: ["b3", "b4"] }, // 沒變
    ];
    const g1Adjusted: VerticalViewBox = { minY: -5, height: 15 };
    const g2Adjusted: VerticalViewBox = { minY: -7, height: 25 };
    const result = resolveNextVerticalViewBoxes(
      groups,
      { g1: g1Adjusted, g2: g2Adjusted },
      { g1: "b1,b2", g2: "b3,b4" },
      INITIAL_BOX,
    );
    expect(result.boxes.g1).toEqual(INITIAL_BOX); // 重算
    expect(result.boxes.g2).toEqual(g2Adjusted); // 完全不受影響
    expect(result.membershipKeys).toEqual({ g1: "b1,b5", g2: "b3,b4" });
    expect(result.changed).toBe(true);
  });

  it("removes the box and membership key for a deleted group, without touching remaining groups", () => {
    const groups: BoreholeGroup[] = [{ id: "g1", name: "剖面1", boreholeIds: ["b1", "b2"] }]; // g2 被刪除
    const g1Adjusted: VerticalViewBox = { minY: -5, height: 15 };
    const g2Adjusted: VerticalViewBox = { minY: -7, height: 25 };
    const result = resolveNextVerticalViewBoxes(
      groups,
      { g1: g1Adjusted, g2: g2Adjusted },
      { g1: "b1,b2", g2: "b3,b4" },
      INITIAL_BOX,
    );
    expect(result.boxes).toEqual({ g1: g1Adjusted });
    expect(result.membershipKeys).toEqual({ g1: "b1,b2" });
    expect(result.changed).toBe(true);
  });

  it("reports changed:false when nothing needs to happen (no new/changed/removed groups)", () => {
    const groups: BoreholeGroup[] = [{ id: "g1", name: "剖面1", boreholeIds: ["b1", "b2"] }];
    const g1Adjusted: VerticalViewBox = { minY: -5, height: 15 };
    const result = resolveNextVerticalViewBoxes(groups, { g1: g1Adjusted }, { g1: "b1,b2" }, INITIAL_BOX);
    expect(result.changed).toBe(false);
  });
});
