import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearProfileData, loadProfileData, saveProfileData, type ProfileData } from "./profileStorage";

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

const SAMPLE: ProfileData = {
  lines: [
    {
      id: "line-1",
      name: "黏土層頂",
      color: "#ff0000",
      points: [
        { boreholeId: "BH-01", depth: 3.5 },
        { boreholeId: "BH-02", depth: 4.2 },
      ],
      visible: true,
    },
  ],
  layers: [
    {
      id: "layer-1",
      name: "填土層",
      color: "#00ff00",
      topBoundaryId: null,
      bottomBoundaryId: "line-1",
    },
  ],
};

describe("profile data persistence", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it("returns empty lines/layers when nothing has been saved", () => {
    expect(loadProfileData()).toEqual({ lines: [], layers: [] });
  });

  it("saves and loads back an equal object", () => {
    saveProfileData(SAMPLE);
    expect(loadProfileData()).toEqual(SAMPLE);
  });

  it("returns empty lines/layers when the stored value is corrupted JSON", () => {
    localStorage.setItem("profileData", "{not json");
    expect(loadProfileData()).toEqual({ lines: [], layers: [] });
  });

  it("returns empty lines/layers when the stored value is missing lines/layers keys", () => {
    localStorage.setItem("profileData", JSON.stringify({ somethingElse: true }));
    expect(loadProfileData()).toEqual({ lines: [], layers: [] });
  });

  it("removes the stored value on clear", () => {
    saveProfileData(SAMPLE);
    clearProfileData();
    expect(loadProfileData()).toEqual({ lines: [], layers: [] });
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
    expect(() => saveProfileData(SAMPLE)).toThrow("quota exceeded");
  });
});
