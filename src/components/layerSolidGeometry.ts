import * as THREE from "three";
import type { SolidGrid } from "../utils/model/solidGrid";

// 一個 cell 有效 = 四個角在頂/底兩面都有值(solidGrid.ts 保證 top/bottom 逐格
// 同步為 null 或同時有值,這裡只需檢查其中一面)。
function isCellValid(grid: SolidGrid, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= grid.cols - 1 || row >= grid.rows - 1) return false;
  const i00 = row * grid.cols + col;
  const i10 = i00 + 1;
  const i01 = i00 + grid.cols;
  const i11 = i01 + 1;
  return (
    grid.top[i00] !== null && grid.top[i10] !== null && grid.top[i01] !== null && grid.top[i11] !== null
  );
}

// 把 SolidGrid 封成單一 BufferGeometry:頂面 + 底面(繞序反向)+ 側面裙邊。
// 裙邊是讓半透明實體看起來「有厚度」而不是兩張浮空破面的關鍵——有效區域邊界
// (鄰格無效或超出網格)的每一條邊,都生成一個連接頂/底的四邊形(兩個三角形)。
// 三角化規則比照 contourGeometry.ts 的 buildSurfaceGeometry:任一角無值的 cell
// 整格跳過,不外插。
export function buildLayerSolidGeometry(grid: SolidGrid): THREE.BufferGeometry | null {
  const positions: number[] = [];

  const xOf = (col: number) => grid.minX + col * grid.cellSize;
  const zOf = (row: number) => grid.minZ + row * grid.cellSize;

  function pushTriangle(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
  ) {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  }

  // 收集有效 cell,頂面/底面/裙邊三段各自成批 push,讓「頂面頂點在前、底面次之、
  // 裙邊最後」的順序固定(測試依此驗證法線方向)。
  const validCells: [number, number][] = [];
  for (let row = 0; row < grid.rows - 1; row++) {
    for (let col = 0; col < grid.cols - 1; col++) {
      if (isCellValid(grid, col, row)) validCells.push([col, row]);
    }
  }
  if (validCells.length === 0) return null;

  // 頂面:繞序取 (v00, v01, v10) / (v10, v01, v11),在 Y 朝上、Z 朝南的座標系裡
  // 法線朝上(+Y)。
  for (const [col, row] of validCells) {
    const i00 = row * grid.cols + col;
    const t00 = grid.top[i00]!;
    const t10 = grid.top[i00 + 1]!;
    const t01 = grid.top[i00 + grid.cols]!;
    const t11 = grid.top[i00 + grid.cols + 1]!;
    pushTriangle(xOf(col), t00, zOf(row), xOf(col), t01, zOf(row + 1), xOf(col + 1), t10, zOf(row));
    pushTriangle(xOf(col + 1), t10, zOf(row), xOf(col), t01, zOf(row + 1), xOf(col + 1), t11, zOf(row + 1));
  }

  // 底面:同樣的 cell、繞序反向,法線朝下(-Y)。
  for (const [col, row] of validCells) {
    const i00 = row * grid.cols + col;
    const b00 = grid.bottom[i00]!;
    const b10 = grid.bottom[i00 + 1]!;
    const b01 = grid.bottom[i00 + grid.cols]!;
    const b11 = grid.bottom[i00 + grid.cols + 1]!;
    pushTriangle(xOf(col), b00, zOf(row), xOf(col + 1), b10, zOf(row), xOf(col), b01, zOf(row + 1));
    pushTriangle(xOf(col + 1), b10, zOf(row), xOf(col + 1), b11, zOf(row + 1), xOf(col), b01, zOf(row + 1));
  }

  // 側面裙邊:有效 cell 的四個方向,鄰格無效(或超出網格)的那一側,沿著共用邊
  // 生成連接頂/底的四邊形。相鄰兩個有效 cell 的共用邊不生成(不是邊界)。
  // 用 DoubleSide 材質渲染,裙邊繞序不影響顯示。
  function pushSkirt(colA: number, rowA: number, colB: number, rowB: number) {
    const iA = rowA * grid.cols + colA;
    const iB = rowB * grid.cols + colB;
    const xA = xOf(colA);
    const zA = zOf(rowA);
    const xB = xOf(colB);
    const zB = zOf(rowB);
    const topA = grid.top[iA]!;
    const topB = grid.top[iB]!;
    const bottomA = grid.bottom[iA]!;
    const bottomB = grid.bottom[iB]!;
    pushTriangle(xA, topA, zA, xB, topB, zB, xA, bottomA, zA);
    pushTriangle(xB, topB, zB, xB, bottomB, zB, xA, bottomA, zA);
  }

  for (const [col, row] of validCells) {
    if (!isCellValid(grid, col, row - 1)) pushSkirt(col, row, col + 1, row); // 北緣
    if (!isCellValid(grid, col, row + 1)) pushSkirt(col, row + 1, col + 1, row + 1); // 南緣
    if (!isCellValid(grid, col - 1, row)) pushSkirt(col, row, col, row + 1); // 西緣
    if (!isCellValid(grid, col + 1, row)) pushSkirt(col + 1, row, col + 1, row + 1); // 東緣
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
}
