export interface KnownPoint {
  x: number;
  z: number;
  value: number;
}

// 輸入一批已知點,回傳一個可查詢任意 (x,z) 內插值的函式;查詢點在資料涵蓋範圍
// (凸包)外一律回傳 null,呼叫端視為「無資料」,絕不外插猜測。
export interface Interpolator {
  build(points: KnownPoint[]): (x: number, z: number) => number | null;
}
