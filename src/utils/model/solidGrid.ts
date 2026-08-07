import type { KnownPoint } from "../contour/types";
import { createKrigingInterpolator } from "../contour/krigingInterpolator";
import { createExtendedTinInterpolator } from "./tinExtrapolator";
import type { VariogramParams } from "../contour/variogram";

// 一個地層實體的取樣網格:頂/底兩個界面在「同一套」網格規格上逐格取值。
// 頂界線和底界線用到的鑽孔通常不同,若各自建網格會得到不同的 bbox/cellSize,
// 無法逐格配對算厚度——所以規格必須由兩條線點集的聯集決定,這是本模組存在的理由,
// 也是不直接重用 contour/grid.ts 的 buildContourGrid 的原因(那邊是單面、無外插)。
export interface SolidGrid {
  cellSize: number;
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  /** 頂界高程,依 row*cols+col 索引;null = 該處無法內插 */
  top: (number | null)[];
  /** 底界高程,與 top 逐格對應 */
  bottom: (number | null)[];
  /** 尖滅(top<bottom 被歸零)的格數 / 兩面都有值的格數;0 = 無尖滅 */
  pinchOutRatio: number;
}

// 內插法跟隨等高線的全域設定(呼叫端傳入 contourSettings 的 interpolator 與
// krigingParams),讓實體曲面跟等高線曲面用同一組內插設定、疊圖比對時面能對齊:
// - Kriging:任何 (x,z) 都有值,可外插到邊距撐開的整個網格;krigingParams 未給時
//   自動擬合(fitVariogramParams),有給(使用者在等高線面板手動覆寫)就沿用。
// - TIN:凸包內跟等高線曲面同值;凸包外用邊界值平推(createExtendedTinInterpolator),
//   讓 TIN 實體也能外插到 extrapolationRatio 撐開的範圍——等高線曲面本身維持
//   「不外插」的既有行為,不受影響。
export function buildLayerSolidGrid(
  topPoints: KnownPoint[],
  bottomPoints: KnownPoint[],
  extrapolationRatio: number,
  interpolator: "tin" | "kriging" = "kriging",
  krigingParams?: VariogramParams,
): SolidGrid | null {
  if (topPoints.length < 3 || bottomPoints.length < 3) return null;

  // 網格解析度規則沿用 contour/grid.ts 的既有基準:整個範圍約 60 格、cellSize
  // 夾在 0.5~5m,但 bbox 取「兩面點集的聯集」,再依外插比例往四周撐開。
  const union = [...topPoints, ...bottomPoints];
  const xs = union.map((p) => p.x);
  const zs = union.map((p) => p.z);
  const diagonal = Math.hypot(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...zs) - Math.min(...zs),
  );
  const margin = diagonal * extrapolationRatio;
  const minX = Math.min(...xs) - margin;
  const maxX = Math.max(...xs) + margin;
  const minZ = Math.min(...zs) - margin;
  const maxZ = Math.max(...zs) + margin;
  const cellSize = Math.min(5, Math.max(0.5, diagonal / 60));
  const cols = Math.max(2, Math.ceil((maxX - minX) / cellSize) + 1);
  const rows = Math.max(2, Math.ceil((maxZ - minZ) / cellSize) + 1);

  const build = interpolator === "tin" ? createExtendedTinInterpolator : createKrigingInterpolator(krigingParams);
  const queryTop = build.build(topPoints);
  const queryBottom = build.build(bottomPoints);

  const top: (number | null)[] = new Array(cols * rows);
  const bottom: (number | null)[] = new Array(cols * rows);
  let paired = 0;
  let pinched = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = minX + col * cellSize;
      const z = minZ + row * cellSize;
      const t = queryTop(x, z);
      const b = queryBottom(x, z);
      const i = row * cols + col;
      if (t !== null && b !== null) {
        paired++;
        if (t < b) {
          // 尖滅歸零:兩面在此處合併到中點,幾何上厚度自然收斂為 0,不畫翻面。
          const mid = (t + b) / 2;
          top[i] = mid;
          bottom[i] = mid;
          pinched++;
        } else {
          top[i] = t;
          bottom[i] = b;
        }
      } else {
        // 任一面無值就整格視為無資料:實體必須同時有頂和底才有意義。
        top[i] = null;
        bottom[i] = null;
      }
    }
  }
  if (paired === 0) return null; // Kriging 矩陣無解等情況:整格都取不到值,不畫

  return { cellSize, cols, rows, minX, minZ, top, bottom, pinchOutRatio: pinched / paired };
}
