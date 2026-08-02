import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBarWidthPanelCollapsed, saveBarWidthPanelCollapsed } from "./barWidthPanelStorage";

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

describe("bar width panel collapsed persistence", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it("returns false when nothing has been saved (default: expanded)", () => {
    expect(loadBarWidthPanelCollapsed()).toBe(false);
  });

  it("saves and loads back true", () => {
    saveBarWidthPanelCollapsed(true);
    expect(loadBarWidthPanelCollapsed()).toBe(true);
  });

  it("saves and loads back false", () => {
    saveBarWidthPanelCollapsed(true);
    saveBarWidthPanelCollapsed(false);
    expect(loadBarWidthPanelCollapsed()).toBe(false);
  });

  it("returns false when the stored value is garbage (not the literal string 'true')", () => {
    localStorage.setItem("barWidthPanelCollapsed", "garbage");
    expect(loadBarWidthPanelCollapsed()).toBe(false);
  });
});
