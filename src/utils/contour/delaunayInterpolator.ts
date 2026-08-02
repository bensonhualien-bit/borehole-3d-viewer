import { Delaunay } from "d3-delaunay";
import type { Interpolator, KnownPoint } from "./types";

function barycentricValue(
  a: KnownPoint,
  b: KnownPoint,
  c: KnownPoint,
  x: number,
  z: number,
): number | null {
  const denom = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  // Handle degenerate triangle (collinear points)
  if (denom === 0) return null;
  const w1 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denom;
  const w2 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denom;
  const w3 = 1 - w1 - w2;
  // 允許極小的浮點誤差(查詢點理論上在三角形邊界上時,某個權重可能算出 -1e-12
  // 這種幾乎為零但為負的值),超出這個容差才視為「不在這個三角形內」。
  const EPS = -1e-9;
  if (w1 < EPS || w2 < EPS || w3 < EPS) return null;
  return w1 * a.value + w2 * b.value + w3 * c.value;
}

export const tinInterpolator: Interpolator = {
  build(points: KnownPoint[]) {
    if (points.length < 3) return () => null;
    const delaunay = Delaunay.from(
      points,
      (p) => p.x,
      (p) => p.z,
    );
    const triangles = delaunay.triangles;
    if (triangles.length === 0) return () => null; // 全部共線,三角剖分不出任何三角形

    return (x: number, z: number) => {
      for (let t = 0; t < triangles.length; t += 3) {
        const ia = triangles[t];
        const ib = triangles[t + 1];
        const ic = triangles[t + 2];
        if (ia === -1 || ib === -1 || ic === -1) continue;
        const a = points[ia];
        const b = points[ib];
        const c = points[ic];
        const value = barycentricValue(a, b, c, x, z);
        if (value !== null) return value;
      }
      return null;
    };
  },
};

// 一條剖面線的點是否足夠、且不共線,可以產生等高線——用來讓 UI(ProfileDrawer)
// 在點數不足時顯示提示,而不是靜默不做事。用「查詢點集合的形心」當探測點:
// 形心對任何非共線的點集合,必定落在其凸包內部。
export function hasEnoughPointsForContour(points: KnownPoint[]): boolean {
  if (points.length < 3) return false;
  const query = tinInterpolator.build(points);
  const centroidX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const centroidZ = points.reduce((sum, p) => sum + p.z, 0) / points.length;
  return query(centroidX, centroidZ) !== null;
}
