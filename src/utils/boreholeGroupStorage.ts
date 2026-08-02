export interface BoreholeGroup {
  id: string;
  name: string;
  boreholeIds: string[];
}

const STORAGE_KEY = "boreholeGroups";

export function loadBoreholeGroups(): BoreholeGroup[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as BoreholeGroup[]) : [];
  } catch {
    return [];
  }
}

export function saveBoreholeGroups(groups: BoreholeGroup[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

export function clearBoreholeGroups(): void {
  localStorage.removeItem(STORAGE_KEY);
}
