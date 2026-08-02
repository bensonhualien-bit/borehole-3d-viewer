import * as XLSX from "xlsx";
import type { Borehole, SoilLayer, SptMeasurement, RqdSegment, CptSample } from "../types/borehole";
import { USCS_COLORS } from "./soilColors";
import { colorForSoilType } from "./csvImport";

export interface XlsxImportResult {
  boreholes: Borehole[];
  errors: string[];
}

type BoreholeKind = "BH" | "CH";

interface CoordEntry {
  x: number;
  y: number;
  groundElevation: number;
  kind: BoreholeKind;
}

// Excel 常見的「used range」問題:工作表宣告的範圍會遠超過實際資料(甚至到 Excel 上限
// 104萬列),若直接對整張表呼叫 sheet_to_json,SheetJS 得先把所有幽靈列都轉成陣列元素,
// 大檔案下這一步可能耗費數秒、卡住瀏覽器主執行緒。這裡先用單一儲存格逐列探測(便宜很多)
// 找出「關鍵欄真正有資料的最後一列」,再用這個邊界限制 sheet_to_json 要處理的範圍。
function findLastDataRow(ws: XLSX.WorkSheet, col: number): number {
  let row = 1; // 第 0 列是標題
  while (ws[XLSX.utils.encode_cell({ r: row, c: col })] !== undefined) row++;
  return row - 1;
}

function readRowsBoundedByColumn(ws: XLSX.WorkSheet, keyCol: number): unknown[][] {
  const fullRange = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const lastRow = Math.max(findLastDataRow(ws, keyCol), 0);
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    range: { s: { r: 0, c: 0 }, e: { r: lastRow, c: fullRange.e.c } },
  });
}

function parseCoordSheet(wb: XLSX.WorkBook): { coords: Map<string, CoordEntry>; errors: string[] } {
  const errors: string[] = [];
  const coords = new Map<string, CoordEntry>();
  const ws = wb.Sheets["鑽探資料"];
  if (!ws) {
    errors.push('找不到「鑽探資料」工作表');
    return { coords, errors };
  }
  const rows = readRowsBoundedByColumn(ws, 0);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id = row[0];
    if (!id) break; // Excel used-range 幽靈列:孔號空白即停止
    const name = String(id).trim();
    const type = row[1] != null ? String(row[1]).trim() : "";
    if (type !== "BH" && type !== "CPT") continue;
    const rawX = row[2];
    const rawY = row[3];
    const groundElevation = row[4];
    if (typeof rawX !== "number" || typeof rawY !== "number" || typeof groundElevation !== "number") {
      errors.push(`鑽探資料表:${name} 的座標或高程不是數字,已略過`);
      continue;
    }
    coords.set(name, {
      x: rawX / 1000,
      y: rawY / 1000,
      groundElevation,
      kind: type === "BH" ? "BH" : "CH",
    });
  }
  return { coords, errors };
}

function parseSoilLayers(wb: XLSX.WorkBook): { layersByHole: Map<string, SoilLayer[]>; errors: string[] } {
  const errors: string[] = [];
  const layersByHole = new Map<string, SoilLayer[]>();
  const ws = wb.Sheets["土層"];
  if (!ws) {
    errors.push('找不到「土層」工作表');
    return { layersByHole, errors };
  }
  const rows = readRowsBoundedByColumn(ws, 0);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id = row[0];
    if (!id) break;
    const name = String(id).trim();
    const topDepth = row[1];
    const bottomDepth = row[2];
    const interbedFlag = row[3];
    const mainType = row[4];
    const subType = row[5];
    if (typeof topDepth !== "number" || typeof bottomDepth !== "number" || typeof mainType !== "string") {
      errors.push(`土層表:${name} 有一列深度或主層資料不是有效值,已略過該列`);
      continue;
    }
    const color = USCS_COLORS[mainType]?.color ?? colorForSoilType(mainType);
    const note =
      typeof interbedFlag === "number" && interbedFlag > 0 && typeof subType === "string" && subType
        ? `互層:主 ${mainType} / 副 ${subType}`
        : undefined;
    const layer: SoilLayer = {
      topDepth,
      bottomDepth,
      soilType: mainType,
      color,
      ...(note ? { note } : {}),
    };
    const list = layersByHole.get(name);
    if (list) list.push(layer);
    else layersByHole.set(name, [layer]);
  }
  return { layersByHole, errors };
}

function parseSptn(wb: XLSX.WorkBook): Map<string, SptMeasurement[]> {
  const sptnByHole = new Map<string, SptMeasurement[]>();
  const ws = wb.Sheets["SPTN"];
  if (!ws) return sptnByHole;
  const rows = readRowsBoundedByColumn(ws, 0);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id = row[0];
    if (!id) break;
    const name = String(id).trim();
    const topDepth = row[2];
    const bottomDepth = row[3];
    const nValue = row[10];
    if (typeof nValue !== "number" || typeof topDepth !== "number" || typeof bottomDepth !== "number") continue;
    const measurement: SptMeasurement = { topDepth, bottomDepth, nValue };
    const list = sptnByHole.get(name);
    if (list) list.push(measurement);
    else sptnByHole.set(name, [measurement]);
  }
  return sptnByHole;
}

function parseRqd(wb: XLSX.WorkBook): Map<string, RqdSegment[]> {
  const rqdByHole = new Map<string, RqdSegment[]>();
  const ws = wb.Sheets["RQD"];
  if (!ws) return rqdByHole;
  const rows = readRowsBoundedByColumn(ws, 0);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id = row[0];
    if (!id) break;
    const name = String(id).trim();
    const topDepth = row[1];
    const bottomDepth = row[2];
    const rqd = row[3];
    if (typeof rqd !== "number" || typeof topDepth !== "number" || typeof bottomDepth !== "number") continue;
    const segment: RqdSegment = { topDepth, bottomDepth, rqd };
    const list = rqdByHole.get(name);
    if (list) list.push(segment);
    else rqdByHole.set(name, [segment]);
  }
  return rqdByHole;
}

function parseCpt(
  wb: XLSX.WorkBook,
  coords: Map<string, CoordEntry>
): { cptByHole: Map<string, CptSample[]>; errors: string[] } {
  const cptByHole = new Map<string, CptSample[]>();
  const errors: string[] = [];
  const ws = wb.Sheets["CPT"];
  if (!ws) return { cptByHole, errors };

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true });
  const labelRow = rows[0] ?? [];
  for (let col = 0; col < labelRow.length; col += 2) {
    const rawName = labelRow[col];
    if (!rawName) continue;
    const name = String(rawName).trim();
    if (!name.startsWith("CH-")) continue;
    if (!coords.has(name)) {
      errors.push(`CPT 表:${name} 在鑽探資料表查不到座標,已略過`);
      continue;
    }
    const samples: CptSample[] = [];
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      const depth = row[col];
      const qc = row[col + 1];
      if (typeof depth !== "number" || typeof qc !== "number") break;
      samples.push({ depth, qc });
    }
    cptByHole.set(name, samples);
  }
  return { cptByHole, errors };
}

export async function parseBoreholeXlsx(file: File): Promise<XlsxImportResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });

  const errors: string[] = [];
  const { coords, errors: coordErrors } = parseCoordSheet(wb);
  errors.push(...coordErrors);
  if (coords.size === 0) {
    errors.push("鑽探資料表沒有可用的鑽孔座標");
    return { boreholes: [], errors };
  }

  const { layersByHole, errors: layerErrors } = parseSoilLayers(wb);
  errors.push(...layerErrors);
  const sptnByHole = parseSptn(wb);
  const rqdByHole = parseRqd(wb);
  const { cptByHole, errors: cptErrors } = parseCpt(wb, coords);
  errors.push(...cptErrors);

  const boreholes: Borehole[] = [];
  for (const [name, coord] of coords) {
    if (coord.kind === "BH") {
      const layers = layersByHole.get(name);
      if (!layers || layers.length === 0) {
        errors.push(`${name}:在土層表查不到分層資料,已略過`);
        continue;
      }
      const sptn = sptnByHole.get(name);
      const rqd = rqdByHole.get(name);
      boreholes.push({
        id: name,
        name,
        x: coord.x,
        y: coord.y,
        groundElevation: coord.groundElevation,
        layers: [...layers].sort((a, b) => a.topDepth - b.topDepth),
        ...(sptn ? { sptn } : {}),
        ...(rqd ? { rqd } : {}),
      });
    } else {
      const cptCurve = cptByHole.get(name);
      if (!cptCurve || cptCurve.length === 0) {
        errors.push(`${name}:在 CPT 表查不到貫入資料,已略過`);
        continue;
      }
      boreholes.push({
        id: name,
        name,
        x: coord.x,
        y: coord.y,
        groundElevation: coord.groundElevation,
        layers: [],
        cptCurve,
      });
    }
  }

  if (boreholes.length === 0 && errors.length === 0) {
    errors.push("XLSX 沒有可用的鑽孔資料");
  }

  return { boreholes, errors };
}
