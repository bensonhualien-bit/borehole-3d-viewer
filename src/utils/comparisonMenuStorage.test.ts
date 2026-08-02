import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadComparisonMenuCollapsed, saveComparisonMenuCollapsed } from "./comparisonMenuStorage";

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

describe("comparison menu collapsed persistence", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it("returns false when nothing has been saved (default: expanded)", () => {
    expect(loadComparisonMenuCollapsed()).toBe(false);
  });

  it("saves and loads back true", () => {
    saveComparisonMenuCollapsed(true);
    expect(loadComparisonMenuCollapsed()).toBe(true);
  });

  it("saves and loads back false", () => {
    saveComparisonMenuCollapsed(true);
    saveComparisonMenuCollapsed(false);
    expect(loadComparisonMenuCollapsed()).toBe(false);
  });

  it("returns false when the stored value is garbage (not the literal string 'true')", () => {
    localStorage.setItem("comparisonMenuCollapsed", "garbage");
    expect(loadComparisonMenuCollapsed()).toBe(false);
  });
});
