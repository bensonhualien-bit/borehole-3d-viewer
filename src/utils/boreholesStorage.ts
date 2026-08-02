import type { Borehole } from "../types/borehole";

const STORAGE_KEY = "boreholes";

// 逐項結構驗證:必須是陣列,且每一項都要有字串 id/name、有限數值 x/y/groundElevation、
// 陣列型的 layers——這個專案吃過虧(見 projectFile.ts 的 parseProjectFile 說明),
// 沒驗證過的資料直接餵進渲染會讓 3D 場景整片崩潰,所以這裡整包資料只要有一項不合法
// 就整包放棄(回傳 null),不像 soilStyles 那樣逐項過濾——鑽孔資料半套用比全部退回
// 範例資料更危險(位置/深度對不上會誤導使用者)。
function isValidBorehole(value: unknown): value is Borehole {
  if (typeof value !== "object" || value === null) return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.id === "string" &&
    typeof b.name === "string" &&
    typeof b.x === "number" &&
    Number.isFinite(b.x) &&
    typeof b.y === "number" &&
    Number.isFinite(b.y) &&
    typeof b.groundElevation === "number" &&
    Number.isFinite(b.groundElevation) &&
    Array.isArray(b.layers)
  );
}

// 背景自動讀 localStorage:壞資料靜默回傳 null,呼叫端(App.tsx)決定 fallback
// (目前的 fallback 是內建範例場景 mockBoreholes)。
export function loadBoreholes(): Borehole[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every(isValidBorehole)) return null;
    return parsed as Borehole[];
  } catch {
    return null;
  }
}

// 匯入/開啟專案是使用者主動觸發的高頻寫入路徑,quota 超額等例外吞掉不讓它中斷
// 匯入流程——存不進 localStorage 頂多下次重新整理救不回來,但畫面至少不會白屏。
export function saveBoreholes(boreholes: Borehole[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boreholes));
  } catch {
    // 靜默吞掉(quota 超額等),比照上面的容錯哲學。
  }
}

export function clearBoreholes(): void {
  localStorage.removeItem(STORAGE_KEY);
}
