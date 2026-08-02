import Papa from "papaparse";
import type { Borehole, SoilLayer } from "../types/borehole";

// 每一列代表「一支鑽孔的其中一層」,同一鑽孔名稱的多列會被合併成一支 Borehole
// 欄位名稱同時支援中/英文,大小寫與前後空白不敏感
const HEADER_ALIASES: Record<keyof RawRow, string[]> = {
  name: ["鑽孔名稱", "鑽孔編號", "name", "id"],
  x: ["x座標", "x", "座標x"],
  y: ["y座標", "y", "座標y"],
  groundElevation: ["地表高程", "高程", "groundelevation", "elevation"],
  topDepth: ["頂深", "上層深度", "topdepth", "top"],
  bottomDepth: ["底深", "下層深度", "bottomdepth", "bottom"],
  soilType: ["岩性", "土層", "地層", "soiltype", "type"],
  color: ["顏色", "color"],
  note: ["備註", "note", "remark"],
};

interface RawRow {
  name: string;
  x: string;
  y: string;
  groundElevation: string;
  topDepth: string;
  bottomDepth: string;
  soilType: string;
  color: string;
  note: string;
}

export interface CsvImportResult {
  boreholes: Borehole[];
  errors: string[];
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

function buildHeaderMap(headers: string[]): Partial<Record<keyof RawRow, string>> {
  const map: Partial<Record<keyof RawRow, string>> = {};
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    for (const key of Object.keys(HEADER_ALIASES) as (keyof RawRow)[]) {
      if (HEADER_ALIASES[key].some((alias) => normalizeHeader(alias) === normalized)) {
        map[key] = header;
      }
    }
  }
  return map;
}

// 依土層名稱字串產生穩定的顏色(同名稱永遠得到同一顏色),避免 CSV 沒填顏色欄位時每次重新整理顏色都不同
export function colorForSoilType(soilType: string): string {
  let hash = 0;
  for (let i = 0; i < soilType.length; i++) {
    hash = (hash * 31 + soilType.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 45%, 55%)`;
}

// 嘗試以 UTF-8 解碼;若出現大量替代字元(�),代表原始檔案很可能是 Big5 編碼(Excel 常見匯出格式),改用 Big5 重新解碼
function decodeCsvBuffer(buffer: ArrayBuffer): string {
  const utf8Text = new TextDecoder("utf-8").decode(buffer);
  const replacementCount = (utf8Text.match(/�/g) ?? []).length;
  if (replacementCount === 0) return utf8Text;

  try {
    const big5Text = new TextDecoder("big5").decode(buffer);
    const big5ReplacementCount = (big5Text.match(/�/g) ?? []).length;
    if (big5ReplacementCount < replacementCount) return big5Text;
  } catch {
    // 瀏覽器不支援 big5 解碼時,退回 UTF-8 結果
  }
  return utf8Text;
}

export async function parseBoreholeCsv(file: File): Promise<CsvImportResult> {
  const buffer = await file.arrayBuffer();
  const text = decodeCsvBuffer(buffer);

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  const errors: string[] = parsed.errors.map(
    (e) => `第 ${e.row != null ? e.row + 2 : "?"} 列:${e.message}`
  );

  const headers = parsed.meta.fields ?? [];
  const headerMap = buildHeaderMap(headers);

  const requiredKeys: (keyof RawRow)[] = [
    "name",
    "x",
    "y",
    "groundElevation",
    "topDepth",
    "bottomDepth",
    "soilType",
  ];
  const missing = requiredKeys.filter((k) => !headerMap[k]);
  if (missing.length > 0) {
    errors.push(
      `找不到必要欄位:${missing.join(", ")}(請確認 CSV 標題列名稱是否正確)`
    );
    return { boreholes: [], errors };
  }

  const boreholeMap = new Map<string, Borehole>();

  parsed.data.forEach((row, index) => {
    const rowNum = index + 2; // +2:第1列是標題,陣列從0起算
    const get = (key: keyof RawRow) => (headerMap[key] ? row[headerMap[key]!]?.trim() : "");

    const name = get("name");
    if (!name) {
      errors.push(`第 ${rowNum} 列:缺少鑽孔名稱,已略過`);
      return;
    }

    const x = Number(get("x"));
    const y = Number(get("y"));
    const groundElevation = Number(get("groundElevation"));
    const topDepth = Number(get("topDepth"));
    const bottomDepth = Number(get("bottomDepth"));
    const soilType = get("soilType");

    if ([x, y, groundElevation, topDepth, bottomDepth].some((n) => Number.isNaN(n))) {
      errors.push(`第 ${rowNum} 列(${name}):座標/高程/深度必須是數字,已略過`);
      return;
    }
    if (bottomDepth <= topDepth) {
      errors.push(`第 ${rowNum} 列(${name}):底深必須大於頂深,已略過`);
      return;
    }
    if (!soilType) {
      errors.push(`第 ${rowNum} 列(${name}):缺少岩性,已略過`);
      return;
    }

    const colorRaw = get("color");
    const note = get("note");

    const layer: SoilLayer = {
      topDepth,
      bottomDepth,
      soilType,
      color: colorRaw || colorForSoilType(soilType),
      ...(note ? { note } : {}),
    };

    const existing = boreholeMap.get(name);
    if (existing) {
      existing.layers.push(layer);
    } else {
      boreholeMap.set(name, {
        id: name,
        name,
        x,
        y,
        groundElevation,
        layers: [layer],
      });
    }
  });

  const boreholes = Array.from(boreholeMap.values()).map((b) => ({
    ...b,
    layers: [...b.layers].sort((a, c) => a.topDepth - c.topDepth),
  }));

  if (boreholes.length === 0 && errors.length === 0) {
    errors.push("CSV 沒有可用的資料列");
  }

  return { boreholes, errors };
}

export const CSV_TEMPLATE = `鑽孔名稱,X座標,Y座標,地表高程,頂深,底深,岩性,顏色,備註
BH-1,0,0,100,0,2,回填土,#c2a878,
BH-1,0,0,100,2,6,黏土,#8a9a5b,N=4
BH-1,0,0,100,6,12,砂質土,#e0c068,N=15
BH-1,0,0,100,12,18,風化岩,#8b7d6b,
BH-1,0,0,100,18,25,岩盤,#5b5b5b,
BH-2,15,5,101.5,0,1.5,回填土,#c2a878,
BH-2,15,5,101.5,1.5,5,砂質土,#e0c068,N=10
BH-2,15,5,101.5,5,9,黏土,#8a9a5b,N=6
`;
