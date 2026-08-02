import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CONTOUR_SETTINGS,
  loadContourSettings,
  normalizeContourSettings,
  saveContourSettings,
  type ContourSettings,
} from "./contourSettings";

function stubLocalStorage() {
  const store: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  });
  return store;
}

const CUSTOM: ContourSettings = {
  minorInterval: 2,
  majorInterval: 10,
  colorMode: "colored",
  interpolator: "kriging",
  krigingParams: { range: 15, sill: 8, nugget: 0.5 },
};

describe("contour settings persistence", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it("returns the default when nothing has been saved", () => {
    expect(loadContourSettings()).toEqual(DEFAULT_CONTOUR_SETTINGS);
  });

  it("defaults interpolator to tin", () => {
    expect(DEFAULT_CONTOUR_SETTINGS.interpolator).toBe("tin");
  });

  it("saves and loads back an equal object, including krigingParams", () => {
    saveContourSettings(CUSTOM);
    expect(loadContourSettings()).toEqual(CUSTOM);
  });

  it("falls back to the default when the stored value is corrupted JSON", () => {
    localStorage.setItem("contourSettings", "{not json");
    expect(loadContourSettings()).toEqual(DEFAULT_CONTOUR_SETTINGS);
  });

  it("falls back per-field when a stored field is invalid", () => {
    localStorage.setItem(
      "contourSettings",
      JSON.stringify({ minorInterval: -1, majorInterval: 10, colorMode: "rainbow", interpolator: "spline" }),
    );
    expect(loadContourSettings()).toEqual({
      minorInterval: DEFAULT_CONTOUR_SETTINGS.minorInterval,
      majorInterval: 10,
      colorMode: "lines",
      interpolator: "tin",
    });
  });

  it("omits krigingParams when the stored value has an invalid shape", () => {
    localStorage.setItem(
      "contourSettings",
      JSON.stringify({
        minorInterval: 1,
        majorInterval: 5,
        colorMode: "lines",
        interpolator: "kriging",
        krigingParams: { range: -5, sill: "not a number" },
      }),
    );
    const loaded = loadContourSettings();
    expect(loaded.interpolator).toBe("kriging");
    expect(loaded.krigingParams).toBeUndefined();
  });

  it("propagates errors thrown by localStorage.setItem", () => {
    const store = stubLocalStorage();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: () => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
    expect(() => saveContourSettings(CUSTOM)).toThrow("quota exceeded");
  });

  it("exports normalizeContourSettings so other loaders (e.g. projectFile.ts) can share the same validation instead of re-implementing it", () => {
    // 這個測試本身就是「驗證邏輯已抽出成獨立可重用函式」這個修正的文件——
    // projectFile.ts 的 parseProjectFile 現在直接呼叫這個函式,不是自己另外拼一份
    expect(
      normalizeContourSettings({ minorInterval: 0, majorInterval: -1, interpolator: "unknown" as never }),
    ).toEqual({
      minorInterval: DEFAULT_CONTOUR_SETTINGS.minorInterval,
      majorInterval: DEFAULT_CONTOUR_SETTINGS.majorInterval,
      colorMode: "lines",
      interpolator: "tin",
    });
  });

  it("returns a fresh copy of default settings, not a shared reference", () => {
    const expected = {
      minorInterval: 1,
      majorInterval: 5,
      colorMode: "lines" as const,
      interpolator: "tin" as const,
    };
    const first = loadContourSettings();
    first.minorInterval = 999;
    const second = loadContourSettings();
    expect(second).toEqual(expected);
    expect(DEFAULT_CONTOUR_SETTINGS).toEqual(expected);
  });
});
