export interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// 把螢幕像素座標(例如滑鼠事件的 clientX/clientY)換算成 SVG viewBox 所在的世界座標。
// 這裡刻意用 plain ScreenRect 物件而不是直接吃 SVGSVGElement,單純為了讓這個函式是
// 不碰 DOM 的純函式,可以直接單元測試,呼叫端自己從 getBoundingClientRect() 轉成
// plain object 再傳進來。
//
// 預設 preserveAspectRatio="xMidYMid meet"(SVG 沒特別設定時的預設值)在容器長寬比
// 跟 viewBox 長寬比不同時,實際渲染內容會置中並保留額外的留白(letterbox)——如果忽略
// 這個留白,直接用 rect.width/rect.height 除,算出來的世界座標在留白區域會偏移錯誤,
// 這裡額外算 scale/offset 來抵消這個留白。
export function screenToWorld(
  rect: ScreenRect,
  viewBox: ViewBox,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
  const renderedWidth = viewBox.width * scale;
  const renderedHeight = viewBox.height * scale;
  const offsetX = (rect.width - renderedWidth) / 2;
  const offsetY = (rect.height - renderedHeight) / 2;
  const localX = clientX - rect.left - offsetX;
  const localY = clientY - rect.top - offsetY;
  return {
    x: viewBox.minX + localX / scale,
    y: viewBox.minY + localY / scale,
  };
}

// 滑鼠滾輪縮放:固定中心點(viewBox 目前的中心),不是游標為中心——比照
// SitePlanUploader.tsx 校準預覽圖的縮放手法。deltaY < 0(滾輪往上滾)放大,
// > 0 縮小。縮放後的 width 若會超出 [minWidth, maxWidth] 就整個維持原值不變
// (而不是夾到邊界值再套用)——因為 height 是跟 width 同一個 factor 等比例縮放,
// 只要 width 沒超界,aspect ratio 永遠不變,不需要對 height 另外夾一次界線。
export function zoomViewBox(viewBox: ViewBox, deltaY: number, minWidth: number, maxWidth: number): ViewBox {
  if (deltaY === 0) return viewBox;
  const factor = deltaY < 0 ? 1 / 1.1 : 1.1;
  const nextWidth = viewBox.width * factor;
  if (nextWidth < minWidth || nextWidth > maxWidth) return viewBox;
  const scale = nextWidth / viewBox.width;
  const nextHeight = viewBox.height * scale;
  const centerX = viewBox.minX + viewBox.width / 2;
  const centerY = viewBox.minY + viewBox.height / 2;
  return {
    minX: centerX - nextWidth / 2,
    minY: centerY - nextHeight / 2,
    width: nextWidth,
    height: nextHeight,
  };
}
