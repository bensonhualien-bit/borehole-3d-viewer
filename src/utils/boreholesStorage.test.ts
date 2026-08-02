import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearBoreholes, loadBoreholes, saveBoreholes } from "./boreholesStorage";
import type { Borehole } from "../types/borehole";

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
  return store;
}

const SAMPLE: Borehole[] = [
  {
    id: "BH-01",
    name: "BH-01",
    x: 100,
    y: 200,
    groundElevation: 50,
    layers: [{ topDepth: 0, bottomDepth: 5, soilType: "CL", color: "#ff0000" }],
  },
  {
    id: "BH-02",
    name: "BH-02",
    x: 110,
    y: 210,
    groundElevation: 51,
    layers: [],
  },
];

beforeEach(() => {
  stubLocalStorage();
});

describe("boreholesStorage", () => {
  it("回傳 null 當沒存過", () => {
    expect(loadBoreholes()).toBeNull();
  });

  it("save 後 load 回同一份資料", () => {
    saveBoreholes(SAMPLE);
    expect(loadBoreholes()).toEqual(SAMPLE);
  });

  it("localStorage 內容是壞 JSON 時回傳 null", () => {
    localStorage.setItem("boreholes", "{not json");
    expect(loadBoreholes()).toBeNull();
  });

  it("儲存值不是陣列時回傳 null", () => {
    localStorage.setItem("boreholes", JSON.stringify({ somethingElse: true }));
    expect(loadBoreholes()).toBeNull();
  });

  it("任一項缺少 layers(結構不合法)時整包回傳 null", () => {
    const broken = [
      { id: "BH-01", name: "BH-01", x: 0, y: 0, groundElevation: 0 }, // 缺 layers
    ];
    localStorage.setItem("boreholes", JSON.stringify(broken));
    expect(loadBoreholes()).toBeNull();
  });

  it("任一項 x/y/groundElevation 不是有限數值時整包回傳 null", () => {
    const broken = [
      { id: "BH-01", name: "BH-01", x: NaN, y: 0, groundElevation: 0, layers: [] },
    ];
    localStorage.setItem("boreholes", JSON.stringify(broken));
    expect(loadBoreholes()).toBeNull();
  });

  it("任一項 id/name 不是字串時整包回傳 null", () => {
    const broken = [{ id: 1, name: "BH-01", x: 0, y: 0, groundElevation: 0, layers: [] }];
    localStorage.setItem("boreholes", JSON.stringify(broken));
    expect(loadBoreholes()).toBeNull();
  });

  it("removeItem 後 load 回 null", () => {
    saveBoreholes(SAMPLE);
    clearBoreholes();
    expect(loadBoreholes()).toBeNull();
  });

  it("save 遇到 quota 超額時靜默吞掉例外", () => {
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
    expect(() => saveBoreholes(SAMPLE)).not.toThrow();
  });
});
