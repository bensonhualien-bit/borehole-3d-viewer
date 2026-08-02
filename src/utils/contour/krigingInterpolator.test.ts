import { describe, expect, it } from "vitest";
import { createKrigingInterpolator } from "./krigingInterpolator";
import type { KnownPoint } from "./types";

const SAMPLE_POINTS: KnownPoint[] = [
  { x: 0, z: 0, value: 10 },
  { x: 10, z: 0, value: 20 },
  { x: 0, z: 10, value: 15 },
];

const FIXED_PARAMS = { range: 20, sill: 10, nugget: 0 };

describe("createKrigingInterpolator", () => {
  it("returns null when there are fewer than 3 points", () => {
    const query = createKrigingInterpolator(FIXED_PARAMS).build(SAMPLE_POINTS.slice(0, 2));
    expect(query(5, 5)).toBeNull();
  });

  it("exactly reproduces a known point's value when queried at its own location", () => {
    // Kriging 是精確內插器(exact interpolator):查詢點剛好是已知點時,權重會剛好
    // 落在那一點上(獨立驗證腳本算出來的權重是 [1,0,0,-0]),回傳值等於原始值
    const query = createKrigingInterpolator(FIXED_PARAMS).build(SAMPLE_POINTS);
    expect(query(0, 0)).toBeCloseTo(10, 8);
    expect(query(10, 0)).toBeCloseTo(20, 8);
  });

  it("matches an independently-computed golden value for a query between the known points", () => {
    // 用跟正式實作分開的腳本手算出來的黃金標準答案(range=20,sill=10,nugget=0,
    // 查詢點 (5,0)):獨立驗證過解出來的權重滿足原始方程組(殘差 < 1e-15)且權重和為 1
    const query = createKrigingInterpolator(FIXED_PARAMS).build(SAMPLE_POINTS);
    expect(query(5, 0)).toBeCloseTo(15.068996291785204, 6);
  });

  it("returns a non-null extrapolated value outside the points' convex hull", () => {
    // 這是選擇 Kriging 的核心行為差異:TIN 在凸包外一律回傳 null,Kriging 不會。
    // 黃金標準答案(同一組獨立驗證腳本算出來):15.52618224534309
    const query = createKrigingInterpolator(FIXED_PARAMS).build(SAMPLE_POINTS);
    const value = query(1000, 1000); // 遠在凸包(0~10, 0~10)之外
    expect(value).not.toBeNull();
    expect(value!).toBeCloseTo(15.52618224534309, 4);
  });

  it("auto-fits variogram params when no override is given", () => {
    const query = createKrigingInterpolator().build(SAMPLE_POINTS);
    expect(query(0, 0)).toBeCloseTo(10, 6); // 自動擬合下,exact interpolator 性質依然成立
  });

  it("dedupes points sharing the exact same (x, z) position instead of producing a singular matrix", () => {
    // 真實案例(2026-07-25 使用者回報 Kriging 完全沒結果):同一支鑽孔在同一條剖面線
    // 的 points 陣列裡出現了兩次(座標完全相同,深度不同)。這會讓係數矩陣出現兩列
    // 完全相同、線性相關,導致每一個查詢點都解不出來(整條線的等高線曲面全部空白,
    // 不是局部缺一角)。後面出現的點(depth 較新)蓋過前面的,跟使用者「在同一條線上
    // 再點一次同一支鑽孔=更新這個點的深度」的既有語意一致。
    const pointsWithDuplicate: KnownPoint[] = [
      { x: 0, z: 0, value: 10 },
      { x: 10, z: 0, value: 20 },
      { x: 0, z: 10, value: 15 },
      { x: 0, z: 0, value: 12 }, // 跟第一個點位置重複
    ];
    const query = createKrigingInterpolator(FIXED_PARAMS).build(pointsWithDuplicate);
    expect(query(5, 5)).not.toBeNull();
    expect(query(0, 0)).toBeCloseTo(12, 8); // 後面出現的重複點蓋過前面的
  });
});
