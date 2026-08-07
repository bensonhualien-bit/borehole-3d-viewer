import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MODEL_SETTINGS,
  DEFAULT_LAYER_SOLID_STYLE,
  loadModelSettings,
  normalizeModelSettings,
  resolveLayerStyle,
  saveModelSettings,
  type ModelSettings,
} from "./modelSettings";

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

const CUSTOM: ModelSettings = {
  extrapolationRatio: 0.25,
  layerStyles: {
    "layer-1": { showSolid: true, opacity: 0.6 },
    "layer-2": { showSolid: false, opacity: 1 },
  },
};

describe("model settings persistence", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it("returns the default when nothing has been saved", () => {
    expect(loadModelSettings()).toEqual(DEFAULT_MODEL_SETTINGS);
  });

  it("saves and loads back an equal object, including per-layer styles", () => {
    saveModelSettings(CUSTOM);
    expect(loadModelSettings()).toEqual(CUSTOM);
  });

  it("falls back to the default when the stored value is corrupted JSON", () => {
    localStorage.setItem("modelSettings", "{not json");
    expect(loadModelSettings()).toEqual(DEFAULT_MODEL_SETTINGS);
  });

  it("clamps extrapolationRatio into [0, 0.3] and rejects non-numbers", () => {
    expect(normalizeModelSettings({ extrapolationRatio: 0.9 }).extrapolationRatio).toBe(0.3);
    expect(normalizeModelSettings({ extrapolationRatio: -1 }).extrapolationRatio).toBe(0);
    expect(normalizeModelSettings({ extrapolationRatio: Number.NaN }).extrapolationRatio).toBe(
      DEFAULT_MODEL_SETTINGS.extrapolationRatio,
    );
    expect(
      normalizeModelSettings({ extrapolationRatio: "0.2" as never }).extrapolationRatio,
    ).toBe(DEFAULT_MODEL_SETTINGS.extrapolationRatio);
  });

  it("drops malformed layer style entries and clamps opacity into [0.1, 1]", () => {
    const normalized = normalizeModelSettings({
      layerStyles: {
        ok: { showSolid: true, opacity: 0.5 },
        tooTransparent: { showSolid: true, opacity: 0 },
        tooOpaque: { showSolid: false, opacity: 5 },
        badShape: "nope" as never,
        badFields: { showSolid: "yes", opacity: "half" } as never,
      },
    });
    expect(normalized.layerStyles).toEqual({
      ok: { showSolid: true, opacity: 0.5 },
      tooTransparent: { showSolid: true, opacity: 0.1 },
      tooOpaque: { showSolid: false, opacity: 1 },
    });
  });

  it("keeps orphan layer ids (deleted layers) instead of silently dropping them", () => {
    // 孤兒條目由渲染端「只查詢現存地層」處理,storage 層不做清理——這裡明確固定
    // 這個行為,避免日後有人在 normalize 裡「順手」清掉導致跨裝置同步時互相覆蓋。
    const normalized = normalizeModelSettings({
      layerStyles: { "gone-layer": { showSolid: true, opacity: 0.3 } },
    });
    expect(normalized.layerStyles["gone-layer"]).toEqual({ showSolid: true, opacity: 0.3 });
  });

  it("has no interpolator field of its own (solids follow the global contour setting)", () => {
    // 內插法刻意不存在 modelSettings——實體跟隨 contourSettings.interpolator,
    // 這裡固定「殘留的舊欄位會被 normalize 丟棄」的行為(dev 期間曾短暫存過)。
    const normalized = normalizeModelSettings({ interpolator: "tin" } as never);
    expect("interpolator" in normalized).toBe(false);
  });

  it("resolveLayerStyle returns the stored style or the default for unknown ids", () => {
    expect(resolveLayerStyle(CUSTOM, "layer-1")).toEqual({ showSolid: true, opacity: 0.6 });
    expect(resolveLayerStyle(CUSTOM, "unknown")).toEqual(DEFAULT_LAYER_SOLID_STYLE);
  });

  it("returns a fresh copy of default settings, not a shared reference", () => {
    const first = loadModelSettings();
    first.extrapolationRatio = 999;
    first.layerStyles["x"] = { showSolid: true, opacity: 0.5 };
    expect(loadModelSettings()).toEqual({ extrapolationRatio: 0.1, layerStyles: {} });
    expect(DEFAULT_MODEL_SETTINGS).toEqual({ extrapolationRatio: 0.1, layerStyles: {} });
  });
});
