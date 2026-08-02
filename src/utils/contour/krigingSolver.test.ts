import { describe, expect, it } from "vitest";
import { solveLinearSystem } from "./krigingSolver";

describe("solveLinearSystem", () => {
  it("solves a simple 2x2 system", () => {
    // 2x + y = 5, x + 3y = 10 -> x=1, y=3
    const result = solveLinearSystem(
      [
        [2, 1],
        [1, 3],
      ],
      [5, 10],
    );
    expect(result).not.toBeNull();
    expect(result![0]).toBeCloseTo(1, 8);
    expect(result![1]).toBeCloseTo(3, 8);
  });

  it("solves a 3x3 system with a known solution", () => {
    // x+y+z=6, 2y+5z=-4, 2x+5y-z=27 -> x=5, y=3, z=-2(經典教科書範例)
    const result = solveLinearSystem(
      [
        [1, 1, 1],
        [0, 2, 5],
        [2, 5, -1],
      ],
      [6, -4, 27],
    );
    expect(result).not.toBeNull();
    expect(result![0]).toBeCloseTo(5, 6);
    expect(result![1]).toBeCloseTo(3, 6);
    expect(result![2]).toBeCloseTo(-2, 6);
  });

  it("returns null for a singular matrix", () => {
    const result = solveLinearSystem(
      [
        [1, 2],
        [2, 4],
      ],
      [3, 6],
    );
    expect(result).toBeNull();
  });

  it("uses partial pivoting so a zero on the diagonal doesn't cause division by zero", () => {
    // 0x + 2y = 4, 3x + 1y = 5 -> 沒有主元交換的話會除以 [0][0] 的 0
    const result = solveLinearSystem(
      [
        [0, 2],
        [3, 1],
      ],
      [4, 5],
    );
    expect(result).not.toBeNull();
    expect(result![0]).toBeCloseTo(1, 8);
    expect(result![1]).toBeCloseTo(2, 8);
  });
});
