// BoreholeChecklist 在不同畫面(2D 剖面、3D 場景)各自獨立一份收合狀態,用呼叫端
// 傳入的 key 區分,彼此不互相影響。回傳 null 代表這個 key 從沒存過,呼叫端自己
// 決定 fallback(BoreholeChecklist 目前的 fallback 是既有的「選滿 2 支自動收合」)。
function storageKeyFor(key: string): string {
  return `checklistCollapsed:${key}`;
}

export function loadChecklistCollapsed(key: string): boolean | null {
  const raw = localStorage.getItem(storageKeyFor(key));
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

export function saveChecklistCollapsed(key: string, collapsed: boolean): void {
  localStorage.setItem(storageKeyFor(key), String(collapsed));
}
