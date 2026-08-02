import type { Borehole } from "../types/borehole";
import type { SitePlanCalibration } from "./sitePlanStorage";
import type { ProfileData } from "./profileStorage";
import { normalizeContourSettings, type ContourSettings } from "./contour/contourSettings";
import type { BoreholeGroup } from "./boreholeGroupStorage";
import { normalizeSoilStyles, type SoilStyles } from "./soilStyles";
import { normalizeBarWidthSettings, type BarWidthSettings } from "./barWidth";

export interface ProjectFile {
  version: 1;
  boreholes: Borehole[];
  sitePlan: SitePlanCalibration | null;
  profileData: ProfileData;
  contourSettings: ContourSettings;
  boreholeGroups: BoreholeGroup[];
  soilStyles: SoilStyles;
  barWidthSettings: BarWidthSettings;
}

export function serializeProject(
  boreholes: Borehole[],
  sitePlan: SitePlanCalibration | null,
  profileData: ProfileData,
  contourSettings: ContourSettings,
  boreholeGroups: BoreholeGroup[],
  soilStyles: SoilStyles,
  barWidthSettings: BarWidthSettings
): string {
  const project: ProjectFile = { version: 1, boreholes, sitePlan, profileData, contourSettings, boreholeGroups, soilStyles, barWidthSettings };
  return JSON.stringify(project, null, 2);
}

// 格式不對(不是合法 JSON、缺必要欄位、version 不支援)一律丟出有意義的錯誤訊息,
// 不是靜默回傳空值——這是使用者主動選檔案的動作,失敗了應該讓他知道具體原因,
// 跟 sitePlanStorage/profileStorage 那種「壞掉就悄悄回傳空狀態」的容錯哲學不同
// (那兩個是背景自動讀 localStorage,這裡是使用者明確選了一個檔案)。
export function parseProjectFile(json: string): ProjectFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("不是有效的 JSON 檔案");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("專案檔案格式不正確");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new Error("不支援的專案檔案版本");
  }
  if (!Array.isArray(obj.boreholes)) {
    throw new Error("專案檔案缺少鑽孔資料");
  }
  if (typeof obj.profileData !== "object" || obj.profileData === null) {
    throw new Error("專案檔案缺少剖面資料");
  }
  return {
    version: 1,
    boreholes: obj.boreholes as Borehole[],
    sitePlan: (obj.sitePlan ?? null) as SitePlanCalibration | null,
    profileData: obj.profileData as ProfileData,
    // 逐欄位驗證/clamp(不是整包信任),跟 localStorage 路徑(loadContourSettings)
    // 共用同一份 normalizeContourSettings——避免手改/損毀的專案檔帶著不合法的值
    // (例如 minorInterval<=0 讓等高線分層迴圈卡死、krigingParams 欄位不合法讓
    // Kriging 內插算出 NaN)未經檢查就流入 state。
    contourSettings: normalizeContourSettings((obj.contourSettings ?? {}) as Partial<ContourSettings>),
    boreholeGroups: Array.isArray(obj.boreholeGroups) ? (obj.boreholeGroups as BoreholeGroup[]) : [],
    soilStyles: normalizeSoilStyles(obj.soilStyles),
    barWidthSettings: normalizeBarWidthSettings(obj.barWidthSettings),
  };
}
