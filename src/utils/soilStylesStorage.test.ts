import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSoilStyles, saveSoilStyles } from "./soilStylesStorage";

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

describe("soilStylesStorage", () => {
  it("沒存過時回傳空表", () => {
    expect(loadSoilStyles()).toEqual({});
  });
  it("save 後 load 回同一份資料", () => {
    saveSoilStyles({ SM: { color: "#ff0000" } });
    expect(loadSoilStyles()).toEqual({ SM: { color: "#ff0000" } });
  });
  it("localStorage 內容是壞 JSON 時靜默回傳空表", () => {
    localStorage.setItem("soilStyles", "{not json");
    expect(loadSoilStyles()).toEqual({});
  });
  it("localStorage 內容合法 JSON 但形狀不對時,經 normalize 過濾", () => {
    localStorage.setItem("soilStyles", JSON.stringify({ SM: { color: 123 }, CL: { color: "#00ff00" } }));
    expect(loadSoilStyles()).toEqual({ CL: { color: "#00ff00" } });
  });
});
