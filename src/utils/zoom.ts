export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;
const ZOOM_STEP = 1.1;

// deltaY < 0 表示滾輪往上滾(放大),> 0 表示往下滾(縮小),0 維持不變
export function nextZoom(current: number, deltaY: number): number {
  if (deltaY === 0) return current;
  const factor = deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  const next = current * factor;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
}
