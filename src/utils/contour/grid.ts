import type { KnownPoint } from "./types";

export interface ContourGrid {
  cellSize: number;
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  values: (number | null)[];
}

// 網格解析度是實作細節(不開放使用者調整),跟使用者關心的「等高線間距」是不同的
// 參數:目標是整個範圍大約 50~60 格,兩端夾在 0.5m~5m 之間,避免場地過大時網格
// 過密(效能)、過小時網格過疏(精細度)。
export function buildContourGrid(
  points: KnownPoint[],
  query: (x: number, z: number) => number | null,
): ContourGrid {
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const diagonal = Math.hypot(maxX - minX, maxZ - minZ);
  const cellSize = Math.min(5, Math.max(0.5, diagonal / 60));
  const cols = Math.max(2, Math.ceil((maxX - minX) / cellSize) + 1);
  const rows = Math.max(2, Math.ceil((maxZ - minZ) / cellSize) + 1);

  const values: (number | null)[] = new Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      values[row * cols + col] = query(minX + col * cellSize, minZ + row * cellSize);
    }
  }
  return { cellSize, cols, rows, minX, minZ, values };
}
