import { Delaunay } from "d3-delaunay";
import type { Interpolator, KnownPoint } from "../contour/types";
import { tinInterpolator } from "../contour/delaunayInterpolator";

// TIN 的「外插」包裝層,只給地層實體(solidGrid)用:凸包內委派給既有的
// tinInterpolator(跟等高線曲面完全同值,疊圖可對齊);凸包外把查詢點投影到
// 凸包邊界上最近的一點,取該點的 TIN 值平推出去——外插區域因此是「貼著邊界
// 高程往外攤平」,不會亂翹,也不假裝知道趨勢(跟 Kriging 往整體平均收斂的
// 外插性質不同,是刻意選擇的簡單行為)。
//
// 刻意不改 contour/delaunayInterpolator.ts:等高線曲面「不外插」是既有的
// 文件化行為(README 明寫),這個包裝層只存在於建模模組。
export const createExtendedTinInterpolator: Interpolator = {
  build(points: KnownPoint[]) {
    const inner = tinInterpolator.build(points);
    if (points.length < 3) return inner;

    const delaunay = Delaunay.from(
      points,
      (p) => p.x,
      (p) => p.z,
    );
    // 全部共線時三角剖分是空的,inner 永遠回 null;邊界平推也不該假裝有面,
    // 直接沿用 inner(等同一律回 null),讓呼叫端顯示「無法建模」。
    if (delaunay.triangles.length === 0) return inner;

    // delaunay.hull:凸包頂點的索引(逆時針)。投影目標是凸包的「邊」,
    // 所以要成對取相鄰頂點。
    const hull = delaunay.hull;
    const centroidX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const centroidZ = points.reduce((sum, p) => sum + p.z, 0) / points.length;

    return (x: number, z: number) => {
      const insideValue = inner(x, z);
      if (insideValue !== null) return insideValue;

      // 凸包外:找出到各邊的最近投影點,取整體最近的那一點
      let bestX = 0;
      let bestZ = 0;
      let bestDistSq = Infinity;
      for (let i = 0; i < hull.length; i++) {
        const a = points[hull[i]];
        const b = points[hull[(i + 1) % hull.length]];
        const abX = b.x - a.x;
        const abZ = b.z - a.z;
        const lenSq = abX * abX + abZ * abZ;
        // 退化邊(兩頂點同位置)投影就取端點本身
        const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * abX + (z - a.z) * abZ) / lenSq));
        const px = a.x + t * abX;
        const pz = a.z + t * abZ;
        const dSq = (x - px) * (x - px) + (z - pz) * (z - pz);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestX = px;
          bestZ = pz;
        }
      }

      // 投影點理論上正好落在凸包邊上(barycentricValue 有邊界容差,可直接查),
      // 但為了避免極端浮點情況剛好超出容差,往形心方向極微量內縮再查一次。
      const direct = inner(bestX, bestZ);
      if (direct !== null) return direct;
      const NUDGE = 1e-7;
      return inner(bestX + (centroidX - bestX) * NUDGE, bestZ + (centroidZ - bestZ) * NUDGE);
    };
  },
};
