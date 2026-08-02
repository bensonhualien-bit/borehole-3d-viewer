const STORAGE_KEY = "barWidthPanelCollapsed";

export function loadBarWidthPanelCollapsed(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function saveBarWidthPanelCollapsed(collapsed: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(collapsed));
}
