import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadChecklistCollapsed, saveChecklistCollapsed } from "./checklistCollapseStorage";

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

describe("checklist collapse persistence", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it("returns null when nothing has been saved for this key (no opinion, caller falls back to its own heuristic)", () => {
    expect(loadChecklistCollapsed("profile2d")).toBeNull();
  });

  it("saves and loads back true", () => {
    saveChecklistCollapsed("profile2d", true);
    expect(loadChecklistCollapsed("profile2d")).toBe(true);
  });

  it("saves and loads back false", () => {
    saveChecklistCollapsed("profile2d", true);
    saveChecklistCollapsed("profile2d", false);
    expect(loadChecklistCollapsed("profile2d")).toBe(false);
  });

  it("keeps different keys independent", () => {
    saveChecklistCollapsed("profile2d", true);
    saveChecklistCollapsed("scene3d", false);
    expect(loadChecklistCollapsed("profile2d")).toBe(true);
    expect(loadChecklistCollapsed("scene3d")).toBe(false);
  });

  it("returns null when the stored value is garbage (not the literal string 'true'/'false')", () => {
    localStorage.setItem("checklistCollapsed:profile2d", "garbage");
    expect(loadChecklistCollapsed("profile2d")).toBeNull();
  });
});
