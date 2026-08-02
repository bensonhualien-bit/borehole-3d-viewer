const STORAGE_KEY = "comparisonMenuCollapsed";

export function loadComparisonMenuCollapsed(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function saveComparisonMenuCollapsed(collapsed: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(collapsed));
}
