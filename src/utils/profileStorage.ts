export interface ProfilePoint {
  boreholeId: string;
  depth: number;
}

// 一條邊界線(地層界面的相關線)
export interface ProfileLine {
  id: string;
  name: string;
  color: string;
  points: ProfilePoint[]; // 依使用者點選順序,不重排
  visible: boolean;
  showContour?: boolean; // 是否顯示這條線的 3D 等高線曲面,選填,預設視為 false
}

// 一個地層:參照兩條既有邊界線當上/下界。null 表示尚未指定,不是錯誤狀態。
// 上下界可能指向同一條 ProfileLine 的 id(跟另一個地層共用),拖動那條線的點時
// 兩個地層會一起變,因為這裡存的是參照(id),不是複製的資料。
export interface ProfileLayer {
  id: string;
  name: string;
  color: string; // 未來半透明填色用,這次先存著
  topBoundaryId: string | null;
  bottomBoundaryId: string | null;
}

export interface ProfileData {
  lines: ProfileLine[];
  layers: ProfileLayer[];
}

const STORAGE_KEY = "profileData";

export function loadProfileData(): ProfileData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { lines: [], layers: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<ProfileData>;
    return {
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
      layers: Array.isArray(parsed.layers) ? parsed.layers : [],
    };
  } catch {
    return { lines: [], layers: [] };
  }
}

export function saveProfileData(data: ProfileData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearProfileData(): void {
  localStorage.removeItem(STORAGE_KEY);
}
