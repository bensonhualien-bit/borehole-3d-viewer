import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBarWidthSettings, saveBarWidthSettings } from "./barWidthSettingsStorage";
import { DEFAULT_BAR_WIDTH_SETTINGS } from "./barWidth";

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
    clear: () => {
      for (const key in store) delete store[key];
    },
  });
}

beforeEach(() => {
  stubLocalStorage();
  localStorage.clear();
});

describe("barWidthSettingsStorage", () => {
  it("沒存過時回傳預設值", () => {
    expect(loadBarWidthSettings()).toEqual(DEFAULT_BAR_WIDTH_SETTINGS);
  });

  it("save 後 load 回同一份資料", () => {
    const settings = { maxFraction: 0.03, spacingFactor: 0.5 };
    saveBarWidthSettings(settings);
    expect(loadBarWidthSettings()).toEqual(settings);
  });

  it("localStorage 內容是壞 JSON 時靜默回傳預設值", () => {
    localStorage.setItem("barWidthSettings", "{not json");
    expect(loadBarWidthSettings()).toEqual(DEFAULT_BAR_WIDTH_SETTINGS);
  });

  it("localStorage 內容合法 JSON 但形狀不對時,經 normalize 過濾(超界被 clamp)", () => {
    localStorage.setItem("barWidthSettings", JSON.stringify({ maxFraction: 0.5, spacingFactor: 0 }));
    expect(loadBarWidthSettings()).toEqual({ maxFraction: 0.05, spacingFactor: 0.1 });
  });
});
