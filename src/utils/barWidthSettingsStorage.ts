import { normalizeBarWidthSettings, type BarWidthSettings, DEFAULT_BAR_WIDTH_SETTINGS } from "./barWidth";

const STORAGE_KEY = "barWidthSettings";

// 背景自動讀 localStorage:壞資料靜默回傳預設值。
export function loadBarWidthSettings(): BarWidthSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BAR_WIDTH_SETTINGS };
    return normalizeBarWidthSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_BAR_WIDTH_SETTINGS };
  }
}

export function saveBarWidthSettings(s: BarWidthSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function clearBarWidthSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}
