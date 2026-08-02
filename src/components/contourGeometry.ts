import * as THREE from "three";
import type { ContourGrid } from "../utils/contour/grid";
import type { ContourRing } from "../utils/contour/marchingSquares";
import { elevationToColor } from "../utils/contour/colorScale";

export function gridExtent(grid: ContourGrid): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of grid.values) {
    if (v === null) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

// 曲面網格:每個 4 角都有值的 cell 拆成兩個三角形;任一角是 null(凸包外)的
// cell 整格跳過,不外插。colored 為 true 時才附加 vertex color(依高程漸層)。
export function buildSurfaceGeometry(grid: ContourGrid, colored: boolean): THREE.BufferGeometry | null {
  const { min, max } = gridExtent(grid);
  if (!Number.isFinite(min)) return null;

  const positions: number[] = [];
  const colors: number[] = [];

  function pushVertex(col: number, row: number, value: number) {
    positions.push(grid.minX + col * grid.cellSize, value, grid.minZ + row * grid.cellSize);
    if (colored) colors.push(...elevationToColor(value, min, max));
  }

  for (let row = 0; row < grid.rows - 1; row++) {
    for (let col = 0; col < grid.cols - 1; col++) {
      const v00 = grid.values[row * grid.cols + col];
      const v10 = grid.values[row * grid.cols + col + 1];
      const v01 = grid.values[(row + 1) * grid.cols + col];
      const v11 = grid.values[(row + 1) * grid.cols + col + 1];
      if (v00 === null || v10 === null || v01 === null || v11 === null) continue;
      pushVertex(col, row, v00);
      pushVertex(col + 1, row, v10);
      pushVertex(col, row + 1, v01);
      pushVertex(col + 1, row, v10);
      pushVertex(col + 1, row + 1, v11);
      pushVertex(col, row + 1, v01);
    }
  }
  if (positions.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  if (colored) geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
  geometry.computeVertexNormals();
  return geometry;
}

// 等值線:所有符合 isMajor 篩選的 ring 攤平成一個 LineSegments BufferGeometry
// ——比照 ElevationGrid.tsx 已驗證過的批次繪製方式,不是每條 ring 各自一個
// draw call。每個 ring 內的點全部同一個高程(level),Y 座標直接用 level。
export function buildContourLineGeometry(rings: ContourRing[], isMajor: boolean): THREE.BufferGeometry | null {
  const positions: number[] = [];
  for (const ring of rings) {
    if (ring.isMajor !== isMajor) continue;
    for (let i = 0; i < ring.points.length - 1; i++) {
      const a = ring.points[i];
      const b = ring.points[i + 1];
      positions.push(a.x, ring.level, a.z, b.x, ring.level, b.z);
    }
  }
  if (positions.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}
