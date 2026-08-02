import type { VariogramParams } from "./variogram";

export interface ContourSettings {
  minorInterval: number;
  majorInterval: number;
  colorMode: "lines" | "colored";
  interpolator: "tin" | "kriging";
  krigingParams?: VariogramParams;
}

export const DEFAULT_CONTOUR_SETTINGS: ContourSettings = {
  minorInterval: 1,
  majorInterval: 5,
  colorMode: "lines",
  interpolator: "tin",
};

const STORAGE_KEY = "contourSettings";

function isValidVariogramParams(value: unknown): value is VariogramParams {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<VariogramParams>;
  return (
    typeof v.range === "number" &&
    v.range > 0 &&
    typeof v.sill === "number" &&
    v.sill > 0 &&
    typeof v.nugget === "number" &&
    v.nugget >= 0
  );
}

// 逐欄位驗證/clamp,任何缺欄位或不合法的值都回退到預設值,不整包信任輸入——供
// localStorage(loadContourSettings)與專案存讀(projectFile.ts 的 parseProjectFile)
// 共用同一份驗證邏輯,避免兩個載入路徑各自維護一份、其中一份漏掉驗證(曾經發生過:
// parseProjectFile 原本只做「整個 contourSettings 物件存不存在」的層級回退,沒有逐
// 欄位驗證,minorInterval<=0 會讓 marchingSquares.ts 的等高線分層迴圈算出 Infinity
// 界線而卡死;無效的 krigingParams 則會讓 Kriging 內插算出 NaN,且 NaN 比較恆假,
// 讓 krigingSolver.ts 的奇異矩陣防呆完全失效)。
export function normalizeContourSettings(parsed: Partial<ContourSettings>): ContourSettings {
  const settings: ContourSettings = {
    minorInterval:
      typeof parsed.minorInterval === "number" && parsed.minorInterval > 0
        ? parsed.minorInterval
        : DEFAULT_CONTOUR_SETTINGS.minorInterval,
    majorInterval:
      typeof parsed.majorInterval === "number" && parsed.majorInterval > 0
        ? parsed.majorInterval
        : DEFAULT_CONTOUR_SETTINGS.majorInterval,
    colorMode: parsed.colorMode === "colored" ? "colored" : "lines",
    interpolator: parsed.interpolator === "kriging" ? "kriging" : "tin",
  };
  if (isValidVariogramParams(parsed.krigingParams)) {
    settings.krigingParams = parsed.krigingParams;
  }
  return settings;
}

export function loadContourSettings(): ContourSettings {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_CONTOUR_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<ContourSettings>;
    return normalizeContourSettings(parsed);
  } catch {
    return { ...DEFAULT_CONTOUR_SETTINGS };
  }
}

export function saveContourSettings(settings: ContourSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearContourSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}
