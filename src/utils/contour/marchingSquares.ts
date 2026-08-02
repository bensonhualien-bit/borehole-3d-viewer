import type { ContourGrid } from "./grid";
import type { ContourSettings } from "./contourSettings";

interface Point {
  x: number;
  z: number;
}

interface Segment {
  a: Point;
  b: Point;
}

export interface ContourRing {
  level: number;
  isMajor: boolean;
  closed: boolean;
  points: Point[];
}

function interpEdge(v0: number, v1: number, p0: Point, p1: Point, level: number): Point {
  const t = (level - v0) / (v1 - v0);
  return { x: p0.x + t * (p1.x - p0.x), z: p0.z + t * (p1.z - p0.z) };
}

// 每個 2x2 網格單元最多產生 0、1(=2 個交點連成一段)或 2 條線段(鞍點,4 個
// 交點,對角兩角同側)。收集哪些邊有交點,而不是查標準 16-case 表——交點數量
// 只會是 0、2 或 4,不管是哪 2 條邊有交點,都只有唯一一種配對方式,除了 4
// 交點的鞍點才需要額外判斷規則。
function marchCell(
  v00: number, v10: number, v11: number, v01: number,
  p00: Point, p10: Point, p11: Point, p01: Point,
  level: number,
): Segment[] {
  const bottom = (v00 > level) !== (v10 > level) ? interpEdge(v00, v10, p00, p10, level) : null;
  const right = (v10 > level) !== (v11 > level) ? interpEdge(v10, v11, p10, p11, level) : null;
  const top = (v01 > level) !== (v11 > level) ? interpEdge(v01, v11, p01, p11, level) : null;
  const left = (v00 > level) !== (v01 > level) ? interpEdge(v00, v01, p00, p01, level) : null;

  const crossings = [bottom, right, top, left].filter((p): p is Point => p !== null);
  if (crossings.length === 0) return [];
  if (crossings.length === 2) {
    const [p0, p1] = crossings;
    // 角值剛好等於 level 時,兩條相鄰邊可能都內插到同一個角點,產生零長度
    // 線段,後續串接會變成頭尾相同的假「環」,直接濾掉。
    if (Math.hypot(p0.x - p1.x, p0.z - p1.z) < 1e-9) return [];
    return [{ a: p0, b: p1 }];
  }

  // 4 條邊都有交點(鞍點):用漸近判別式(asymptotic decider)判斷怎麼配對,
  // 避免把不該連的兩角誤連成一條線橫跨對角。
  // 漸近判別式:鞍點方塊的真正鞍點通常不在方塊正中央(u=v=0.5),而簡單平均數
  // 只是「正中央」那一點的值——兩者在角落值落差懸殊時可能不同號,導致選錯配對
  // 方式。這個公式算的是雙線性曲面在真正鞍點上的值,才是數學上正確的判斷依據。
  // 分母在退化情況(v00+v11===v10+v01)可能是 0,這種情況退回用平均數當安全
  // 預設,避免除以零產生 NaN。
  const saddleDenominator = v00 + v11 - v10 - v01;
  const saddleDeciderValue =
    saddleDenominator !== 0 ? (v00 * v11 - v10 * v01) / saddleDenominator : (v00 + v10 + v11 + v01) / 4;
  if (saddleDeciderValue > level) {
    return [
      { a: left!, b: bottom! },
      { a: right!, b: top! },
    ];
  }
  return [
    { a: left!, b: top! },
    { a: bottom!, b: right! },
  ];
}

function gridPoint(grid: ContourGrid, col: number, row: number): Point {
  return { x: grid.minX + col * grid.cellSize, z: grid.minZ + row * grid.cellSize };
}

function collectSegments(grid: ContourGrid, level: number): Segment[] {
  const segments: Segment[] = [];
  for (let row = 0; row < grid.rows - 1; row++) {
    for (let col = 0; col < grid.cols - 1; col++) {
      const v00 = grid.values[row * grid.cols + col];
      const v10 = grid.values[row * grid.cols + col + 1];
      const v01 = grid.values[(row + 1) * grid.cols + col];
      const v11 = grid.values[(row + 1) * grid.cols + col + 1];
      if (v00 === null || v10 === null || v01 === null || v11 === null) continue; // 任一角無資料,整格跳過,不外插
      segments.push(
        ...marchCell(
          v00, v10, v11, v01,
          gridPoint(grid, col, row),
          gridPoint(grid, col + 1, row),
          gridPoint(grid, col + 1, row + 1),
          gridPoint(grid, col, row + 1),
          level,
        ),
      );
    }
  }
  return segments;
}

function pointKey(p: Point, precision: number): string {
  return `${Math.round(p.x / precision)},${Math.round(p.z / precision)}`;
}

// 把零散線段串成一條條折線。同一個交點是由同一組角值算出來的,理論上座標完全
// 相同,這裡的四捨五入容差只是保險,避免極端浮點誤差讓同一點被判定成不同鍵值。
function chainSegments(segments: Segment[], precision: number): { points: Point[]; closed: boolean }[] {
  const remaining = [...segments];
  const rings: { points: Point[]; closed: boolean }[] = [];

  while (remaining.length > 0) {
    const seg = remaining.shift()!;
    const chain: Point[] = [seg.a, seg.b];
    let closed = false;
    let extended = true;

    while (extended) {
      extended = false;
      const tailKey = pointKey(chain[chain.length - 1], precision);
      const headKey = pointKey(chain[0], precision);
      if (chain.length > 2 && tailKey === headKey) {
        closed = true;
        break;
      }

      // 先試著從尾端延伸
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        if (pointKey(candidate.a, precision) === tailKey) {
          chain.push(candidate.b);
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (pointKey(candidate.b, precision) === tailKey) {
          chain.push(candidate.a);
          remaining.splice(i, 1);
          extended = true;
          break;
        }
      }
      if (extended) continue;

      // 尾端延伸不到,改試著從頭端延伸(往前接)——單靠尾端延伸會依線段被
      // 發現的順序不同,把同一條真正連續的等高線拆成好幾條片段,兩端都要試
      // 才能還原正確的拓樸。
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        if (pointKey(candidate.a, precision) === headKey) {
          chain.unshift(candidate.b);
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (pointKey(candidate.b, precision) === headKey) {
          chain.unshift(candidate.a);
          remaining.splice(i, 1);
          extended = true;
          break;
        }
      }
    }
    rings.push({ points: chain, closed });
  }
  return rings;
}

function gridExtent(grid: ContourGrid): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of grid.values) {
    if (v === null) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

export function extractContours(grid: ContourGrid, settings: ContourSettings): ContourRing[] {
  const { min, max } = gridExtent(grid);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];

  const rings: ContourRing[] = [];
  const firstStep = Math.ceil(min / settings.minorInterval);
  const lastStep = Math.floor(max / settings.minorInterval);
  for (let step = firstStep; step <= lastStep; step++) {
    const level = step * settings.minorInterval;
    const isMajor =
      Math.abs(level - Math.round(level / settings.majorInterval) * settings.majorInterval) <
      settings.minorInterval / 1000;
    const segments = collectSegments(grid, level);
    if (segments.length === 0) continue;
    const chains = chainSegments(segments, grid.cellSize / 1000);
    for (const chain of chains) {
      rings.push({ level, isMajor, closed: chain.closed, points: chain.points });
    }
  }
  return rings;
}
