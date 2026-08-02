import type { SoilLayer } from "../types/borehole";
import { USCS_COLORS } from "./soilColors";
import { colorForSoilType } from "./csvImport";

// 使用者自訂的土層樣式覆寫表,key = 土層代碼(layer.soilType)。
// 純顯示層概念:匯入時烙進每層的 layer.color 永遠不被改寫,「恢復預設」只要清掉
// 覆寫項即可。patternId 是後續黑白花紋功能的保留欄位,這一版只讀寫、不使用。
export interface SoilStyle {
  color?: string;
  patternId?: string;
}
export type SoilStyles = Record<string, SoilStyle>;

// 渲染單一地層時的唯一取色入口:先查覆寫,沒有才用該層匯入時烙定的顏色。
export function effectiveLayerColor(layer: SoilLayer, styles: SoilStyles): string {
  return styles[layer.soilType]?.color ?? layer.color;
}

// 圖例色塊的取色(圖例只有代碼、沒有 layer 實體):覆寫 → USCS 固定表 → hash 色,
// 跟 xlsxImport 匯入時決定顏色的優先序一致。
export function effectiveCodeColor(code: string, styles: SoilStyles): string {
  return styles[code]?.color ?? USCS_COLORS[code]?.color ?? colorForSoilType(code);
}

// localStorage 與專案檔共用的逐項驗證:只收 value 是物件、且 color/patternId 至少
// 一個是非空字串的項目——手改/損毀的資料不讓不合法值流入 state。
export function normalizeSoilStyles(input: unknown): SoilStyles {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return {};
  const out: SoilStyles = {};
  for (const [code, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const v = value as Record<string, unknown>;
    const style: SoilStyle = {};
    if (typeof v.color === "string" && v.color) style.color = v.color;
    if (typeof v.patternId === "string" && v.patternId) style.patternId = v.patternId;
    if (style.color !== undefined || style.patternId !== undefined) out[code] = style;
  }
  return out;
}
