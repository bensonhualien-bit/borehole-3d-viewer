// 藍(低)→ 綠 → 黃 → 紅(高)四段固定漸層,RGB 分量皆為 0~1。
const STOPS: [number, number, number][] = [
  [0.1, 0.2, 0.8],
  [0.1, 0.7, 0.2],
  [0.95, 0.85, 0.1],
  [0.85, 0.15, 0.1],
];

export function elevationToColor(value: number, min: number, max: number): [number, number, number] {
  if (max <= min) return STOPS[0];
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const scaled = t * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(scaled));
  const localT = scaled - i;
  const [r0, g0, b0] = STOPS[i];
  const [r1, g1, b1] = STOPS[i + 1];
  return [r0 + (r1 - r0) * localT, g0 + (g1 - g0) * localT, b0 + (b1 - b0) * localT];
}

// STOPS 轉成 CSS linear-gradient 可以直接使用的 "rgb(r, g, b)" 字串(0~255 整數)。
// 圖例的漸層條直接沿用這份顏色定義,確保跟曲面上色永遠是同一份設定,不會走鐘。
export function colorStopsAsCss(): string[] {
  return STOPS.map(
    ([r, g, b]) => `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`,
  );
}

// 圖例刻度:5 個等分點(含頭尾兩端點),由低到高。min === max 時 5 個值都相同。
export function computeLegendTicks(min: number, max: number): number[] {
  const range = max - min;
  return [0, 0.25, 0.5, 0.75, 1].map((t) => min + range * t);
}
