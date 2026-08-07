import {
  computeSimilarityTransform,
  pixelToWorld,
  type SitePlanCalibration,
} from "./sitePlanStorage";

// 快速插入的資料橋:把「中心點+寬度+角度」這種人類直覺的擺放描述,與既有
// SitePlanCalibration(兩個參考點)互相轉換——資料格式因此零改動,貼圖數學、
// localStorage、專案檔、舊檔全部照舊。兩點校準存的 calibration 一樣能反算,
// 所以把手/欄位對「校準過的圖」同樣可用。
export interface QuickInsertPlacement {
  /** 圖片中心,真實世界座標 */
  centerX: number;
  centerY: number;
  /** 圖片實際寬度(m),高依圖片長寬比 */
  widthMeters: number;
  /** 逆時針為正,0 = 圖片上緣朝正北,正規化到 (-180, 180] */
  rotationDeg: number;
}

export const MIN_WIDTH_METERS = 1;

export function normalizeAngleDeg(deg: number): number {
  const wrapped = ((deg % 360) + 360) % 360; // [0, 360)
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

// 虛擬參考點取「圖片左右兩緣的中點」:兩點連線就是圖片的水平中線,
// scale = widthMeters / imageWidth、角度 = rotationDeg,與
// computeSimilarityTransform 的推導一一對應,round-trip 無損。
export function placementToCalibration(
  p: QuickInsertPlacement,
  image: { dataUrl: string; width: number; height: number },
  elevation: number,
  locked?: boolean,
): SitePlanCalibration {
  const half = p.widthMeters / 2;
  const rad = (p.rotationDeg * Math.PI) / 180;
  const dirX = Math.cos(rad);
  const dirY = Math.sin(rad);
  const midY = image.height / 2;
  const calibration: SitePlanCalibration = {
    imageDataUrl: image.dataUrl,
    imageWidth: image.width,
    imageHeight: image.height,
    pointA: { px: 0, py: midY, x: p.centerX - half * dirX, y: p.centerY - half * dirY },
    pointB: { px: image.width, py: midY, x: p.centerX + half * dirX, y: p.centerY + half * dirY },
    groundElevation: elevation,
  };
  if (locked) calibration.locked = true;
  return calibration;
}

export function calibrationToPlacement(c: SitePlanCalibration): QuickInsertPlacement {
  const transform = computeSimilarityTransform(c.pointA, c.pointB);
  const calibratedCenter = pixelToWorld(
    { px: c.imageWidth / 2, py: c.imageHeight / 2 },
    transform,
  );
  // manualPosition(拖曳後的位置)只是平移,形狀/角度仍由校準點決定——中心以它為準
  const centerX = c.manualPosition?.x ?? calibratedCenter.x;
  const centerY = c.manualPosition?.z ?? calibratedCenter.y;
  return {
    centerX,
    centerY,
    widthMeters: c.imageWidth * transform.scale,
    rotationDeg: normalizeAngleDeg((transform.rotation * 180) / Math.PI),
  };
}

// 右下角把手拖曳:以圖片中心為錨,比較「拖曳起始向量」與「目前向量」——
// 長度比 = 縮放、夾角差 = 旋轉,同一次拖曳同時生效(Figma/Canva 式角落把手)。
// 向量都是真實世界座標(x=東, y=北),與 rotationDeg 的逆時針正向一致。
export function applyHandleDrag(
  startVec: { x: number; y: number },
  currentVec: { x: number; y: number },
  start: QuickInsertPlacement,
): QuickInsertPlacement {
  const startLen = Math.hypot(startVec.x, startVec.y);
  if (startLen < 1e-6) return start; // 起始向量退化(游標正壓在中心),不動
  const currentLen = Math.hypot(currentVec.x, currentVec.y);
  const widthMeters = Math.max(MIN_WIDTH_METERS, start.widthMeters * (currentLen / startLen));
  const angleDelta =
    Math.atan2(currentVec.y, currentVec.x) - Math.atan2(startVec.y, startVec.x);
  return {
    ...start,
    widthMeters,
    rotationDeg: normalizeAngleDeg(start.rotationDeg + (angleDelta * 180) / Math.PI),
  };
}
