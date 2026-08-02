import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildExampleBoreholes, buildExampleCsv, buildExampleWorkbook, buildExampleProjectJson } from "./exampleSite";
import { parseBoreholeCsv } from "../src/utils/csvImport";
import { parseBoreholeXlsx } from "../src/utils/xlsxImport";
import { parseProjectFile } from "../src/utils/projectFile";
import { mockBoreholes } from "../src/data/mockBoreholes";

describe("exampleSite", () => {
  it("builds 12 BH + 2 CPT boreholes with valid layers", () => {
    const holes = buildExampleBoreholes();
    expect(holes.filter((h) => h.layers.length > 0)).toHaveLength(12);
    expect(holes.filter((h) => h.cptCurve)).toHaveLength(2);
    for (const h of holes.filter((h) => h.layers.length > 0)) {
      expect(h.layers[0].topDepth).toBe(0);
      for (let i = 1; i < h.layers.length; i++) {
        expect(h.layers[i].topDepth).toBe(h.layers[i - 1].bottomDepth);
      }
      expect(h.sptn && h.sptn.length).toBeGreaterThan(10);
    }
  });

  it("CSV round-trips through the app importer with zero errors", async () => {
    const file = new File([buildExampleCsv()], "範例鑽孔資料.csv", { type: "text/csv" });
    const result = await parseBoreholeCsv(file);
    expect(result.errors).toEqual([]);
    expect(result.boreholes).toHaveLength(12); // CSV 格式不含 CPT
  });

  it("CSV with UTF-8 BOM (as written to examples/) still imports cleanly", async () => {
    // generateExamples.ts 寫檔時前置 BOM 讓 Excel 正確判定編碼;匯入器的
    // TextDecoder 會吃掉 BOM,不得影響欄名比對(external review 6-11)。
    const file = new File(["﻿" + buildExampleCsv()], "範例鑽孔資料.csv", { type: "text/csv" });
    const result = await parseBoreholeCsv(file);
    expect(result.errors).toEqual([]);
    expect(result.boreholes).toHaveLength(12);
  });

  it("generated src/data/mockBoreholes.ts stays in sync with exampleSite source", () => {
    // 防止改了 exampleSite.ts 卻忘記重跑 generateExamples.ts 的失步
    // (external review 6-13):committed 產生檔必須與來源定義完全一致。
    expect(mockBoreholes).toEqual(buildExampleBoreholes());
  });

  it("xlsx round-trips through the app importer with zero errors", async () => {
    const wb = buildExampleWorkbook();
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const file = new File([buf], "範例鑽探報告.xlsx");
    const result = await parseBoreholeXlsx(file);
    expect(result.errors).toEqual([]);
    expect(result.boreholes).toHaveLength(14);
    const bh09 = result.boreholes.find((b) => b.name === "BH-09")!;
    expect(bh09.layers.some((l) => l.note?.includes("互層"))).toBe(true);
    const bh06 = result.boreholes.find((b) => b.name === "BH-06")!;
    expect(bh06.rqd && bh06.rqd.length).toBeGreaterThan(0);
  });

  it("project JSON parses and its profile lines reference real holes at valid depths", () => {
    const project = parseProjectFile(buildExampleProjectJson());
    expect(project.boreholes).toHaveLength(14);
    expect(project.profileData.lines).toHaveLength(3);
    expect(project.profileData.lines.some((l) => l.showContour)).toBe(true);
    expect(project.profileData.layers).toHaveLength(1);
    expect(project.boreholeGroups).toHaveLength(2);
    const byId = new Map(project.boreholes.map((b) => [b.id, b]));
    for (const line of project.profileData.lines) {
      expect(line.points).toHaveLength(12);
      for (const pt of line.points) {
        const hole = byId.get(pt.boreholeId)!;
        expect(hole).toBeDefined();
        const maxDepth = Math.max(...hole.layers.map((l) => l.bottomDepth));
        expect(pt.depth).toBeGreaterThan(0);
        expect(pt.depth).toBeLessThanOrEqual(maxDepth);
      }
    }
  });
});
