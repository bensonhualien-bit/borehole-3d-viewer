interface Point {
  x: number;
  z: number;
}

function lerp(p0: Point, p1: Point, t: number): Point {
  return { x: p0.x + t * (p1.x - p0.x), z: p0.z + t * (p1.z - p0.z) };
}

// Chaikin corner-cutting:每段各切一刀在 1/4、3/4 處,取代原本的角點。開放線段
// (closed=false,通常代表在凸包邊界被截斷)頭尾兩個端點固定不動,只切內部的角,
// 避免平滑把端點拉離原本代表的資料邊界;封閉線段(一整圈)沒有頭尾之分,首尾
// 段也一起切。
export function smoothPolyline(points: Point[], closed: boolean, iterations = 2): Point[] {
  let current = points;
  for (let iter = 0; iter < iterations; iter++) {
    if (current.length < 3) return current;
    const next: Point[] = [];
    const segmentCount = closed ? current.length : current.length - 1;

    if (!closed) next.push(current[0]);
    for (let i = 0; i < segmentCount; i++) {
      const p0 = current[i];
      const p1 = current[(i + 1) % current.length];
      const isFirstOpenSegment = !closed && i === 0;
      const isLastOpenSegment = !closed && i === segmentCount - 1;

      if (isFirstOpenSegment) {
        next.push(lerp(p0, p1, 0.75));
      } else if (isLastOpenSegment) {
        next.push(lerp(p0, p1, 0.25));
      } else {
        next.push(lerp(p0, p1, 0.25));
        next.push(lerp(p0, p1, 0.75));
      }
    }
    if (!closed) next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}
