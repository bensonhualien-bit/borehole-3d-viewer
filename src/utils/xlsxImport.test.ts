import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseBoreholeXlsx } from "./xlsxImport";

// 公開 repo 不含私人 fixture(鑽孔資料/測試場地.xlsx 已 gitignore),無檔時跳過此區塊;
// xlsx 解析邏輯仍由 scripts/exampleSite.test.ts 的 round-trip 覆蓋。
const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../鑽孔資料/測試場地.xlsx"
);
const fixtureExists = existsSync(fixturePath);

function buildTestFile(sheets: Record<string, unknown[][]>): File {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new File([new Uint8Array(buffer as ArrayBuffer)], "test.xlsx");
}

const COORD_HEADER = ["孔號", "類型", "X 座標 (E)", "Y 座標 (N)", "高程"];
const SOIL_HEADER = ["孔號", "起始深", "結束深度", "夾層", "主層", "副層"];
const SPTN_HEADER = [
  "孔號", "樣號", "起始深度", "結束深度",
  "SPT1", "貫入長1", "SPT2", "貫入長2", "SPT3", "貫入長3", "SPTN",
];

describe("parseBoreholeXlsx", () => {
  it("imports a BH borehole with coordinates scaled from millimeters", async () => {
    const file = buildTestFile({
      鑽探資料: [COORD_HEADER, ["BH-01", "BH", 181717746, 2493191785, 2.118]],
      土層: [SOIL_HEADER, ["BH-01", 0, 2.5, 0, "non"], ["BH-01", 2.5, 5, 0, "CL"]],
    });

    const { boreholes, errors } = await parseBoreholeXlsx(file);

    expect(errors).toEqual([]);
    expect(boreholes).toHaveLength(1);
    expect(boreholes[0].x).toBeCloseTo(181717.746, 5);
    expect(boreholes[0].y).toBeCloseTo(2493191.785, 5);
    expect(boreholes[0].groundElevation).toBe(2.118);
    expect(boreholes[0].layers).toHaveLength(2);
    expect(boreholes[0].layers[0].soilType).toBe("non");
  });

  it("writes an interbed note when the 夾層 flag is set", async () => {
    const file = buildTestFile({
      鑽探資料: [COORD_HEADER, ["BH-01", "BH", 0, 0, 0]],
      土層: [SOIL_HEADER, ["BH-01", 0, 5, 2, "CL", "SM"]],
    });

    const { boreholes } = await parseBoreholeXlsx(file);

    expect(boreholes[0].layers[0].note).toBe("互層:主 CL / 副 SM");
  });

  it("stops reading at the first blank 孔號 row (Excel used-range ghost rows)", async () => {
    const file = buildTestFile({
      鑽探資料: [COORD_HEADER, ["BH-01", "BH", 0, 0, 0]],
      土層: [SOIL_HEADER, ["BH-01", 0, 5, 0, "CL"], [], []],
    });

    const { boreholes, errors } = await parseBoreholeXlsx(file);

    expect(errors).toEqual([]);
    expect(boreholes[0].layers).toHaveLength(1);
  });

  it("skips a BH hole with no matching 土層 rows and records an error", async () => {
    const file = buildTestFile({
      鑽探資料: [
        COORD_HEADER,
        ["BH-01", "BH", 0, 0, 0],
        ["BH-02", "BH", 10000, 10000, 1],
      ],
      土層: [SOIL_HEADER, ["BH-01", 0, 5, 0, "CL"]],
    });

    const { boreholes, errors } = await parseBoreholeXlsx(file);

    expect(boreholes).toHaveLength(1);
    expect(errors.some((e) => e.includes("BH-02"))).toBe(true);
  });

  it("records an error and returns no boreholes when 鑽探資料 has no usable coordinates", async () => {
    const file = buildTestFile({
      鑽探資料: [COORD_HEADER],
      土層: [SOIL_HEADER],
    });

    const { boreholes, errors } = await parseBoreholeXlsx(file);

    expect(boreholes).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("attaches SPT-N measurements and skips rows with no SPTN value", async () => {
    const file = buildTestFile({
      鑽探資料: [COORD_HEADER, ["BH-01", "BH", 0, 0, 0]],
      土層: [SOIL_HEADER, ["BH-01", 0, 5, 0, "CL"]],
      SPTN: [
        SPTN_HEADER,
        ["BH-01", "S-1-2", 2.55, 3, null, 15, null, 15, null, 15, 2],
        ["BH-01", "S-2-0", 7, 7.5, null, 15, null, 15, null, 15, null],
      ],
    });

    const { boreholes } = await parseBoreholeXlsx(file);

    expect(boreholes[0].sptn).toHaveLength(1);
    expect(boreholes[0].sptn?.[0]).toEqual({ topDepth: 2.55, bottomDepth: 3, nValue: 2 });
  });

  it("leaves rqd undefined when the RQD sheet has no data rows", async () => {
    const file = buildTestFile({
      鑽探資料: [COORD_HEADER, ["BH-01", "BH", 0, 0, 0]],
      土層: [SOIL_HEADER, ["BH-01", 0, 5, 0, "CL"]],
      RQD: [["孔號", "起始深度", "結束深度", "RQD", "破裂指數FI"]],
    });

    const { boreholes, errors } = await parseBoreholeXlsx(file);

    expect(boreholes[0].rqd).toBeUndefined();
    expect(errors).toEqual([]);
  });

  it("imports a CH point with its CPT curve, no layers", async () => {
    const file = buildTestFile({
      鑽探資料: [
        COORD_HEADER,
        ["BH-01", "BH", 0, 0, 0],
        ["CH-01", "CPT", 5000, 5000, 1],
      ],
      土層: [SOIL_HEADER, ["BH-01", 0, 5, 0, "CL"]],
      CPT: [
        ["CH-01", null],
        ["深度", "Qc"],
        [0, 0.5],
        [0.05, 0.8],
        [0.1, 1.2],
      ],
    });

    const { boreholes, errors } = await parseBoreholeXlsx(file);

    expect(errors).toEqual([]);
    const ch01 = boreholes.find((b) => b.name === "CH-01");
    expect(ch01).toBeDefined();
    expect(ch01?.layers).toEqual([]);
    expect(ch01?.cptCurve).toEqual([
      { depth: 0, qc: 0.5 },
      { depth: 0.05, qc: 0.8 },
      { depth: 0.1, qc: 1.2 },
    ]);
  });

  it("records an error and skips a CH point with no matching CPT column", async () => {
    const file = buildTestFile({
      鑽探資料: [
        COORD_HEADER,
        ["BH-01", "BH", 0, 0, 0],
        ["CH-01", "CPT", 5000, 5000, 1],
      ],
      土層: [SOIL_HEADER, ["BH-01", 0, 5, 0, "CL"]],
    });

    const { boreholes, errors } = await parseBoreholeXlsx(file);

    expect(boreholes.find((b) => b.name === "CH-01")).toBeUndefined();
    expect(errors.some((e) => e.includes("CH-01"))).toBe(true);
  });

  describe.skipIf(!fixtureExists)("against the real 測試場地 fixture file", () => {
    it("imports 26 BH boreholes with SPT-N data (plus 22 CH CPT points)", async () => {
      const buffer = readFileSync(fixturePath);
      const file = new File([buffer], "測試場地.xlsx");

      const { boreholes, errors } = await parseBoreholeXlsx(file);

      expect(boreholes).toHaveLength(48);
      expect(errors).toEqual([]);
      const bh01 = boreholes.find((b) => b.name === "BH-01");
      expect(bh01?.sptn).toHaveLength(31);
      expect(bh01?.rqd).toBeUndefined();
    });

    it("imports all 26 BH and 22 CH holes from the real file", async () => {
      const buffer = readFileSync(fixturePath);
      const file = new File([buffer], "測試場地.xlsx");

      const { boreholes, errors } = await parseBoreholeXlsx(file);

      expect(boreholes).toHaveLength(48);
      expect(errors).toEqual([]);
      const chHoles = boreholes.filter((b) => b.name.startsWith("CH-"));
      expect(chHoles).toHaveLength(22);
      expect(chHoles.every((b) => b.layers.length === 0)).toBe(true);
      expect(chHoles.every((b) => (b.cptCurve?.length ?? 0) > 0)).toBe(true);
    });
  });
});
