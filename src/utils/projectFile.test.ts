import { describe, expect, it } from "vitest";
import { parseProjectFile, serializeProject } from "./projectFile";
import type { Borehole } from "../types/borehole";
import type { SitePlanCalibration } from "./sitePlanStorage";
import type { ProfileData } from "./profileStorage";
import { DEFAULT_CONTOUR_SETTINGS, type ContourSettings } from "./contour/contourSettings";
import type { BoreholeGroup } from "./boreholeGroupStorage";
import { DEFAULT_BAR_WIDTH_SETTINGS } from "./barWidth";

const SAMPLE_BOREHOLES: Borehole[] = [
  {
    id: "BH-01",
    name: "BH-01",
    x: 100,
    y: 200,
    groundElevation: 50,
    layers: [{ topDepth: 0, bottomDepth: 5, soilType: "CL", color: "#8a9a5b" }],
  },
];

const SAMPLE_SITE_PLAN: SitePlanCalibration = {
  imageDataUrl: "data:image/png;base64,AAAA",
  imageWidth: 100,
  imageHeight: 100,
  pointA: { px: 0, py: 0, x: 0, y: 0 },
  pointB: { px: 10, py: 0, x: 10, y: 0 },
  groundElevation: 50,
};

const SAMPLE_PROFILE_DATA: ProfileData = {
  lines: [
    {
      id: "line-1",
      name: "邊界線 1",
      color: "#ff0000",
      points: [{ boreholeId: "BH-01", depth: 3 }],
      visible: true,
    },
  ],
  layers: [
    { id: "layer-1", name: "填土層", color: "#00ff00", topBoundaryId: "line-1", bottomBoundaryId: null },
  ],
};

const SAMPLE_BOREHOLE_GROUPS: BoreholeGroup[] = [
  { id: "group-1", name: "A-A' 剖面", boreholeIds: ["BH-01"] },
];

describe("serializeProject / parseProjectFile", () => {
  it("round-trips boreholes, site plan, and profile data", () => {
    const json = serializeProject(
      SAMPLE_BOREHOLES,
      SAMPLE_SITE_PLAN,
      SAMPLE_PROFILE_DATA,
      DEFAULT_CONTOUR_SETTINGS,
      SAMPLE_BOREHOLE_GROUPS,
      {},
      DEFAULT_BAR_WIDTH_SETTINGS,
    );
    const parsed = parseProjectFile(json);
    expect(parsed).toEqual({
      version: 1,
      boreholes: SAMPLE_BOREHOLES,
      sitePlan: SAMPLE_SITE_PLAN,
      profileData: SAMPLE_PROFILE_DATA,
      contourSettings: DEFAULT_CONTOUR_SETTINGS,
      boreholeGroups: SAMPLE_BOREHOLE_GROUPS,
      soilStyles: {},
      barWidthSettings: DEFAULT_BAR_WIDTH_SETTINGS,
    });
  });

  it("round-trips a null site plan", () => {
    const json = serializeProject(
      SAMPLE_BOREHOLES,
      null,
      SAMPLE_PROFILE_DATA,
      DEFAULT_CONTOUR_SETTINGS,
      SAMPLE_BOREHOLE_GROUPS,
      {},
      DEFAULT_BAR_WIDTH_SETTINGS,
    );
    const parsed = parseProjectFile(json);
    expect(parsed.sitePlan).toBeNull();
  });

  it("round-trips a custom contourSettings value, including interpolator and krigingParams", () => {
    const contourSettings: ContourSettings = {
      minorInterval: 2,
      majorInterval: 10,
      colorMode: "colored",
      interpolator: "kriging",
      krigingParams: { range: 15, sill: 8, nugget: 0.5 },
    };
    const json = serializeProject(
      SAMPLE_BOREHOLES,
      null,
      SAMPLE_PROFILE_DATA,
      contourSettings,
      SAMPLE_BOREHOLE_GROUPS,
      {},
      DEFAULT_BAR_WIDTH_SETTINGS,
    );
    const parsed = parseProjectFile(json);
    expect(parsed.contourSettings).toEqual(contourSettings);
  });

  it("defaults contourSettings to DEFAULT_CONTOUR_SETTINGS when loading an older project file that predates this field", () => {
    const json = serializeProject(
      SAMPLE_BOREHOLES,
      null,
      SAMPLE_PROFILE_DATA,
      DEFAULT_CONTOUR_SETTINGS,
      SAMPLE_BOREHOLE_GROUPS,
      {},
      DEFAULT_BAR_WIDTH_SETTINGS,
    );
    const withoutContourSettings = JSON.parse(json);
    delete withoutContourSettings.contourSettings;
    const parsed = parseProjectFile(JSON.stringify(withoutContourSettings));
    expect(parsed.contourSettings).toEqual(DEFAULT_CONTOUR_SETTINGS);
  });

  it("defaults just the interpolator field to tin when an older contourSettings object predates it (partial-object backward compat)", () => {
    const json = serializeProject(
      SAMPLE_BOREHOLES,
      null,
      SAMPLE_PROFILE_DATA,
      DEFAULT_CONTOUR_SETTINGS,
      SAMPLE_BOREHOLE_GROUPS,
      {},
      DEFAULT_BAR_WIDTH_SETTINGS,
    );
    const parsedJson = JSON.parse(json);
    // 模擬「這個功能上線前」存的舊專案檔:contourSettings 物件存在,但沒有 interpolator 欄位
    delete parsedJson.contourSettings.interpolator;
    const parsed = parseProjectFile(JSON.stringify(parsedJson));
    expect(parsed.contourSettings.interpolator).toBe("tin");
    expect(parsed.contourSettings.minorInterval).toBe(DEFAULT_CONTOUR_SETTINGS.minorInterval);
  });

  it("clamps an invalid minorInterval from a hand-edited project file instead of passing it through raw (regression for the infinite-loop risk in marchingSquares.ts)", () => {
    const json = serializeProject(
      SAMPLE_BOREHOLES,
      null,
      SAMPLE_PROFILE_DATA,
      DEFAULT_CONTOUR_SETTINGS,
      SAMPLE_BOREHOLE_GROUPS,
      {},
      DEFAULT_BAR_WIDTH_SETTINGS,
    );
    const parsedJson = JSON.parse(json);
    parsedJson.contourSettings.minorInterval = 0;
    parsedJson.contourSettings.majorInterval = -5;
    const parsed = parseProjectFile(JSON.stringify(parsedJson));
    expect(parsed.contourSettings.minorInterval).toBe(DEFAULT_CONTOUR_SETTINGS.minorInterval);
    expect(parsed.contourSettings.majorInterval).toBe(DEFAULT_CONTOUR_SETTINGS.majorInterval);
  });

  it("falls back to tin for an unrecognized interpolator value from a hand-edited project file", () => {
    const json = serializeProject(
      SAMPLE_BOREHOLES,
      null,
      SAMPLE_PROFILE_DATA,
      DEFAULT_CONTOUR_SETTINGS,
      SAMPLE_BOREHOLE_GROUPS,
      {},
      DEFAULT_BAR_WIDTH_SETTINGS,
    );
    const parsedJson = JSON.parse(json);
    parsedJson.contourSettings.interpolator = "idw";
    const parsed = parseProjectFile(JSON.stringify(parsedJson));
    expect(parsed.contourSettings.interpolator).toBe("tin");
  });

  it("drops an invalid krigingParams shape from a hand-edited project file instead of letting it reach the Kriging solver as NaN", () => {
    const contourSettings: ContourSettings = {
      ...DEFAULT_CONTOUR_SETTINGS,
      interpolator: "kriging",
    };
    const json = serializeProject(
      SAMPLE_BOREHOLES,
      null,
      SAMPLE_PROFILE_DATA,
      contourSettings,
      SAMPLE_BOREHOLE_GROUPS,
      {},
      DEFAULT_BAR_WIDTH_SETTINGS,
    );
    const parsedJson = JSON.parse(json);
    parsedJson.contourSettings.krigingParams = { range: -5, sill: "not a number" };
    const parsed = parseProjectFile(JSON.stringify(parsedJson));
    expect(parsed.contourSettings.krigingParams).toBeUndefined();
    expect(parsed.contourSettings.interpolator).toBe("kriging");
  });

  it("round-trips a custom boreholeGroups value", () => {
    const json = serializeProject(
      SAMPLE_BOREHOLES,
      null,
      SAMPLE_PROFILE_DATA,
      DEFAULT_CONTOUR_SETTINGS,
      SAMPLE_BOREHOLE_GROUPS,
      {},
      DEFAULT_BAR_WIDTH_SETTINGS,
    );
    const parsed = parseProjectFile(json);
    expect(parsed.boreholeGroups).toEqual(SAMPLE_BOREHOLE_GROUPS);
  });

  it("defaults boreholeGroups to an empty array when loading an older project file that predates this field", () => {
    const json = serializeProject(
      SAMPLE_BOREHOLES,
      null,
      SAMPLE_PROFILE_DATA,
      DEFAULT_CONTOUR_SETTINGS,
      SAMPLE_BOREHOLE_GROUPS,
      {},
      DEFAULT_BAR_WIDTH_SETTINGS,
    );
    const withoutGroups = JSON.parse(json);
    delete withoutGroups.boreholeGroups;
    const parsed = parseProjectFile(JSON.stringify(withoutGroups));
    expect(parsed.boreholeGroups).toEqual([]);
  });

  it("throws a clear error for invalid JSON", () => {
    expect(() => parseProjectFile("{not json")).toThrow("不是有效的 JSON 檔案");
  });

  it("throws a clear error for a plain non-object JSON value", () => {
    expect(() => parseProjectFile("42")).toThrow("專案檔案格式不正確");
  });

  it("throws a clear error when version is unsupported", () => {
    const json = JSON.stringify({ version: 2, boreholes: [], profileData: { lines: [], layers: [] } });
    expect(() => parseProjectFile(json)).toThrow("不支援的專案檔案版本");
  });

  it("throws a clear error when boreholes is missing", () => {
    const json = JSON.stringify({ version: 1, profileData: { lines: [], layers: [] } });
    expect(() => parseProjectFile(json)).toThrow("專案檔案缺少鑽孔資料");
  });

  it("throws a clear error when profileData is missing", () => {
    const json = JSON.stringify({ version: 1, boreholes: [] });
    expect(() => parseProjectFile(json)).toThrow("專案檔案缺少剖面資料");
  });

  it("round-trips a custom soilStyles value", () => {
    const json = serializeProject(
      SAMPLE_BOREHOLES,
      null,
      SAMPLE_PROFILE_DATA,
      DEFAULT_CONTOUR_SETTINGS,
      SAMPLE_BOREHOLE_GROUPS,
      { SM: { color: "#ff0000" } },
      DEFAULT_BAR_WIDTH_SETTINGS,
    );
    const parsed = parseProjectFile(json);
    expect(parsed.soilStyles).toEqual({ SM: { color: "#ff0000" } });
  });

  it("defaults soilStyles to an empty object when loading an older project file that predates this field", () => {
    const json = serializeProject(
      SAMPLE_BOREHOLES,
      null,
      SAMPLE_PROFILE_DATA,
      DEFAULT_CONTOUR_SETTINGS,
      SAMPLE_BOREHOLE_GROUPS,
      {},
      DEFAULT_BAR_WIDTH_SETTINGS,
    );
    const withoutSoilStyles = JSON.parse(json);
    delete withoutSoilStyles.soilStyles;
    const parsed = parseProjectFile(JSON.stringify(withoutSoilStyles));
    expect(parsed.soilStyles).toEqual({});
  });

  it("drops invalid soilStyles entries from a hand-edited project file", () => {
    const json = serializeProject(
      SAMPLE_BOREHOLES,
      null,
      SAMPLE_PROFILE_DATA,
      DEFAULT_CONTOUR_SETTINGS,
      SAMPLE_BOREHOLE_GROUPS,
      {},
      DEFAULT_BAR_WIDTH_SETTINGS,
    );
    const parsedJson = JSON.parse(json);
    parsedJson.soilStyles = { SM: { color: 123 }, CL: { color: "#00ff00" } };
    const parsed = parseProjectFile(JSON.stringify(parsedJson));
    expect(parsed.soilStyles).toEqual({ CL: { color: "#00ff00" } });
  });

  it("round-trips a custom barWidthSettings value", () => {
    const barWidthSettings = { maxFraction: 0.03, spacingFactor: 0.5 };
    const json = serializeProject(
      SAMPLE_BOREHOLES,
      null,
      SAMPLE_PROFILE_DATA,
      DEFAULT_CONTOUR_SETTINGS,
      SAMPLE_BOREHOLE_GROUPS,
      {},
      barWidthSettings,
    );
    const parsed = parseProjectFile(json);
    expect(parsed.barWidthSettings).toEqual(barWidthSettings);
  });

  it("defaults barWidthSettings to DEFAULT_BAR_WIDTH_SETTINGS when loading an older project file that predates this field", () => {
    const json = serializeProject(
      SAMPLE_BOREHOLES,
      null,
      SAMPLE_PROFILE_DATA,
      DEFAULT_CONTOUR_SETTINGS,
      SAMPLE_BOREHOLE_GROUPS,
      {},
      DEFAULT_BAR_WIDTH_SETTINGS,
    );
    const withoutBarWidthSettings = JSON.parse(json);
    delete withoutBarWidthSettings.barWidthSettings;
    const parsed = parseProjectFile(JSON.stringify(withoutBarWidthSettings));
    expect(parsed.barWidthSettings).toEqual(DEFAULT_BAR_WIDTH_SETTINGS);
  });

  it("clamps an invalid barWidthSettings value from a hand-edited project file instead of passing it through raw", () => {
    const json = serializeProject(
      SAMPLE_BOREHOLES,
      null,
      SAMPLE_PROFILE_DATA,
      DEFAULT_CONTOUR_SETTINGS,
      SAMPLE_BOREHOLE_GROUPS,
      {},
      DEFAULT_BAR_WIDTH_SETTINGS,
    );
    const parsedJson = JSON.parse(json);
    parsedJson.barWidthSettings = { maxFraction: 0.5, spacingFactor: 0 };
    const parsed = parseProjectFile(JSON.stringify(parsedJson));
    expect(parsed.barWidthSettings).toEqual({ maxFraction: 0.05, spacingFactor: 0.1 });
  });
});
