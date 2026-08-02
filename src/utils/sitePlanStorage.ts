export interface CalibrationPoint {
  px: number;
  py: number;
  x: number;
  y: number;
}

export interface SimilarityTransform {
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
}

const MIN_DISTANCE = 1e-6;

// 圖片座標系 Y 軸向下,世界座標系 Y 軸向上,所以旋轉/縮放前先把 py 取負號對齊方向
function rotateAndScale(px: number, py: number, scale: number, rotation: number): { x: number; y: number } {
  const flippedY = -py;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: scale * (px * cos - flippedY * sin),
    y: scale * (px * sin + flippedY * cos),
  };
}

export function computeSimilarityTransform(
  pointA: CalibrationPoint,
  pointB: CalibrationPoint
): SimilarityTransform {
  const pixelDx = pointB.px - pointA.px;
  const pixelDy = pointB.py - pointA.py;
  const pixelDistance = Math.hypot(pixelDx, pixelDy);

  const worldDx = pointB.x - pointA.x;
  const worldDy = pointB.y - pointA.y;
  const worldDistance = Math.hypot(worldDx, worldDy);

  if (pixelDistance < MIN_DISTANCE || worldDistance < MIN_DISTANCE) {
    throw new Error("兩個參考點距離太近,無法計算校準");
  }

  const scale = worldDistance / pixelDistance;
  const pixelAngle = Math.atan2(-pixelDy, pixelDx);
  const worldAngle = Math.atan2(worldDy, worldDx);
  const rotation = worldAngle - pixelAngle;

  const rotatedA = rotateAndScale(pointA.px, pointA.py, scale, rotation);

  return {
    scale,
    rotation,
    offsetX: pointA.x - rotatedA.x,
    offsetY: pointA.y - rotatedA.y,
  };
}

export function pixelToWorld(
  point: { px: number; py: number },
  transform: SimilarityTransform
): { x: number; y: number } {
  const rotated = rotateAndScale(point.px, point.py, transform.scale, transform.rotation);
  return { x: rotated.x + transform.offsetX, y: rotated.y + transform.offsetY };
}

export interface SitePlanCalibration {
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  pointA: CalibrationPoint;
  pointB: CalibrationPoint;
  groundElevation: number;
  manualPosition?: { x: number; z: number };
  locked?: boolean;
}

export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// 圖片可能因為校準點的角度而在世界座標系裡是傾斜的矩形,四個角落算出絕對世界座標後
// 取外接矩形,才能正確反映圖片實際涵蓋的範圍(而不是誤用圖片中心+寬高當作沒有旋轉的框)。
// manualPosition(拖曳後手動指定的位置)只是整張圖的平移,校準推算出的形狀/角度不變,
// 用「手動位置 - 校準中心」的偏移量套用在四個角落上即可。
export function getSitePlanBounds(calibration: SitePlanCalibration): WorldBounds {
  const transform = computeSimilarityTransform(calibration.pointA, calibration.pointB);
  const corners = [
    { px: 0, py: 0 },
    { px: calibration.imageWidth, py: 0 },
    { px: 0, py: calibration.imageHeight },
    { px: calibration.imageWidth, py: calibration.imageHeight },
  ].map((c) => pixelToWorld(c, transform));

  const calibratedCenter = pixelToWorld(
    { px: calibration.imageWidth / 2, py: calibration.imageHeight / 2 },
    transform
  );
  const effectiveCenter = calibration.manualPosition
    ? { x: calibration.manualPosition.x, y: calibration.manualPosition.z }
    : calibratedCenter;
  const shiftX = effectiveCenter.x - calibratedCenter.x;
  const shiftY = effectiveCenter.y - calibratedCenter.y;

  const xs = corners.map((c) => c.x + shiftX);
  const ys = corners.map((c) => c.y + shiftY);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

const STORAGE_KEY = "sitePlanCalibration";

export function loadSitePlan(): SitePlanCalibration | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SitePlanCalibration;
  } catch {
    return null;
  }
}

export function saveSitePlan(data: SitePlanCalibration): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearSitePlan(): void {
  localStorage.removeItem(STORAGE_KEY);
}
