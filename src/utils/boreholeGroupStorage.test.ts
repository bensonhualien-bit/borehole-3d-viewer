import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBoreholeGroups, saveBoreholeGroups, type BoreholeGroup } from "./boreholeGroupStorage";

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

const SAMPLE: BoreholeGroup[] = [
  { id: "group-1", name: "A-A' 剖面", boreholeIds: ["BH-01", "BH-02", "BH-03"] },
  { id: "group-2", name: "B-B' 剖面", boreholeIds: ["BH-04", "BH-05"] },
];

describe("borehole group persistence", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it("returns an empty array when nothing has been saved", () => {
    expect(loadBoreholeGroups()).toEqual([]);
  });

  it("saves and loads back an equal array", () => {
    saveBoreholeGroups(SAMPLE);
    expect(loadBoreholeGroups()).toEqual(SAMPLE);
  });

  it("returns an empty array when the stored value is corrupted JSON", () => {
    localStorage.setItem("boreholeGroups", "{not json");
    expect(loadBoreholeGroups()).toEqual([]);
  });

  it("returns an empty array when the stored value is not an array", () => {
    localStorage.setItem("boreholeGroups", JSON.stringify({ somethingElse: true }));
    expect(loadBoreholeGroups()).toEqual([]);
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
    expect(() => saveBoreholeGroups(SAMPLE)).toThrow("quota exceeded");
  });
});
