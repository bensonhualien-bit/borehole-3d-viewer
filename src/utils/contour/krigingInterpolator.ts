import type { Interpolator, KnownPoint } from "./types";
import { sphericalVariogram, fitVariogramParams, type VariogramParams } from "./variogram";
import { solveLinearSystem } from "./krigingSolver";

// 同一個 (x, z) 位置出現兩個點,會讓係數矩陣出現兩列完全相同(變異函數只看距離,
// 兩個同位置的點到任何第三點的距離必然相等),矩陣線性相關、無法求解——不是「查詢點
// 剛好在那附近算不出來」這種局部問題,是整個矩陣一開始就解不出來,導致每一個查詢點
// 都回傳 null(整條線的曲面全部空白)。真實發生過:同一支鑽孔因為某個上游流程被記錄
// 成剖面線上的兩個點(座標當然相同,深度不同)。這裡在建矩陣前先按位置去重,後面出現
// 的點蓋過前面的,跟使用者「在同一條線上再點一次同一支鑽孔=更新這個點的深度」的既有
// 語意一致。
function dedupeByPosition(points: KnownPoint[]): KnownPoint[] {
  const byPosition = new Map<string, KnownPoint>();
  for (const p of points) {
    byPosition.set(`${p.x},${p.z}`, p);
  }
  return [...byPosition.values()];
}

// Ordinary Kriging:假設未知但固定的整體平均值,不需要額外的趨勢面設定。跟 TIN
// 不同的是,凸包外的查詢點依然會算出一個外插值(不回傳 null)——這裡完全沒有
// 「查詢點在不在凸包內」的判斷,任何 (x,z) 只要線性方程組解得出來就會有值,這是
// 選擇 Kriging 的主要理由之一。
export function createKrigingInterpolator(overrideParams?: VariogramParams): Interpolator {
  return {
    build(rawPoints: KnownPoint[]) {
      if (rawPoints.length < 3) return () => null;
      const points = dedupeByPosition(rawPoints);
      if (points.length < 3) return () => null;
      const params = overrideParams ?? fitVariogramParams(points);
      const n = points.length;

      // Ordinary Kriging 係數矩陣:(n+1)x(n+1)。左上 n x n 區塊是已知點兩兩之間的
      // 變異函數值(對角線為 0,因為 γ(0)=0);最後一列/行是 Lagrange 乘數的無偏
      // 約束(權重總和為 1),角落為 0。這個矩陣只跟點位/參數有關,對同一批點位
      // 只需要建一次,重複用在每個查詢點上。
      const matrix: number[][] = [];
      for (let i = 0; i < n; i++) {
        const row: number[] = [];
        for (let j = 0; j < n; j++) {
          const d = Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z);
          row.push(sphericalVariogram(d, params));
        }
        row.push(1);
        matrix.push(row);
      }
      matrix.push([...new Array(n).fill(1), 0]);

      return (x: number, z: number) => {
        const vector: number[] = [];
        for (let i = 0; i < n; i++) {
          const d = Math.hypot(points[i].x - x, points[i].z - z);
          vector.push(sphericalVariogram(d, params));
        }
        vector.push(1);

        const weights = solveLinearSystem(matrix, vector);
        if (weights === null) return null;
        let value = 0;
        for (let i = 0; i < n; i++) value += weights[i] * points[i].value;
        return value;
      };
    },
  };
}
