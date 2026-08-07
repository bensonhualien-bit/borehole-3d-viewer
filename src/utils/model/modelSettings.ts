// 3D 地層建模(實體地層塊)的顯示設定。刻意獨立於 profileStorage 的 ProfileLayer
// 型別之外:分層功能已完成並公開發布,建模的顯示偏好用 layerId 當 key 存在這裡,
// ProfileLayer 本身一個欄位都不用加,兩個功能的資料模型互不牽動。
export interface LayerSolidStyle {
  showSolid: boolean;
  /** 0.1~1,不允許 0(完全看不見會被誤會成「壞掉」) */
  opacity: number;
}

export interface ModelSettings {
  /** 外插距離 = 鑽孔範圍對角線 * 此比例,0~0.3;TIN 模式下無作用(凸包外無值) */
  extrapolationRatio: number;
  /** key 為 ProfileLayer.id。地層刪除後的孤兒條目保留不清理(無害),渲染端只依現存地層查詢 */
  layerStyles: Record<string, LayerSolidStyle>;
}
// 註:實體的內插法(TIN/Kriging)不存在這裡——刻意跟隨等高線的全域設定
// (contourSettings.interpolator 與 krigingParams),讓實體曲面跟等高線曲面用
// 完全同一組內插設定,疊圖比對時兩者的面才會對齊,切換也只有一個開關。

export const DEFAULT_LAYER_SOLID_STYLE: LayerSolidStyle = { showSolid: false, opacity: 0.45 };

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  extrapolationRatio: 0.1,
  layerStyles: {},
};

const STORAGE_KEY = "modelSettings";

const MIN_OPACITY = 0.1;
const MAX_EXTRAPOLATION = 0.3;

function normalizeLayerStyle(value: unknown): LayerSolidStyle | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Partial<LayerSolidStyle>;
  if (typeof v.showSolid !== "boolean" || typeof v.opacity !== "number" || !Number.isFinite(v.opacity)) {
    return null;
  }
  return { showSolid: v.showSolid, opacity: Math.min(1, Math.max(MIN_OPACITY, v.opacity)) };
}

// 逐欄位驗證/clamp,任何缺欄位或不合法的值都回退到預設值,不整包信任輸入——
// 供 localStorage(loadModelSettings)與專案存讀(projectFile.ts)共用同一份驗證,
// 比照 contourSettings.ts 的既有模式。
export function normalizeModelSettings(parsed: Partial<ModelSettings>): ModelSettings {
  const ratio =
    typeof parsed.extrapolationRatio === "number" && Number.isFinite(parsed.extrapolationRatio)
      ? Math.min(MAX_EXTRAPOLATION, Math.max(0, parsed.extrapolationRatio))
      : DEFAULT_MODEL_SETTINGS.extrapolationRatio;

  const layerStyles: Record<string, LayerSolidStyle> = {};
  if (typeof parsed.layerStyles === "object" && parsed.layerStyles !== null) {
    for (const [layerId, raw] of Object.entries(parsed.layerStyles)) {
      const style = normalizeLayerStyle(raw);
      if (style) layerStyles[layerId] = style;
    }
  }
  return { extrapolationRatio: ratio, layerStyles };
}

export function resolveLayerStyle(settings: ModelSettings, layerId: string): LayerSolidStyle {
  return settings.layerStyles[layerId] ?? { ...DEFAULT_LAYER_SOLID_STYLE };
}

export function loadModelSettings(): ModelSettings {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_MODEL_SETTINGS, layerStyles: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<ModelSettings>;
    return normalizeModelSettings(parsed);
  } catch {
    return { ...DEFAULT_MODEL_SETTINGS, layerStyles: {} };
  }
}

export function saveModelSettings(settings: ModelSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearModelSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}
