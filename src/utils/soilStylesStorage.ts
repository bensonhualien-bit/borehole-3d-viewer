import { normalizeSoilStyles, type SoilStyles } from "./soilStyles";

const STORAGE_KEY = "soilStyles";

// 背景自動讀 localStorage:壞資料靜默回傳空表(比照 profileStorage 等既有慣例)。
export function loadSoilStyles(): SoilStyles {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return normalizeSoilStyles(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveSoilStyles(styles: SoilStyles): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(styles));
}

export function clearSoilStyles(): void {
  localStorage.removeItem(STORAGE_KEY);
}
