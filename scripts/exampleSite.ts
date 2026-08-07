// 虛構範例場地的單一資料來源:產出 examples/ 的 CSV / xlsx / 專案 JSON 三個
// 範例檔與內建預設場景(src/data/mockBoreholes.ts)。12 支 BH + 2 支 CPT,
// 座標/地層/量測值皆為虛構設計,不對應任何真實場地。
import * as XLSX from "xlsx";
import type { Borehole, SoilLayer, SptMeasurement, RqdSegment, CptSample } from "../src/types/borehole";
import { USCS_COLORS } from "../src/utils/soilColors";
import { colorForSoilType } from "../src/utils/csvImport";
import { serializeProject } from "../src/utils/projectFile";
import { DEFAULT_CONTOUR_SETTINGS } from "../src/utils/contour/contourSettings";
import { DEFAULT_BAR_WIDTH_SETTINGS } from "../src/utils/barWidth";
import type { ProfileData } from "../src/utils/profileStorage";
import type { BoreholeGroup } from "../src/utils/boreholeGroupStorage";
import type { SoilStyles } from "../src/utils/soilStyles";
import type { ModelSettings } from "../src/utils/model/modelSettings";

interface HoleSpec { name: string; x: number; y: number; elev: number; d: [number, number, number, number, number]; rock?: boolean }

const BH_SPECS: HoleSpec[] = [
  { name: "BH-01", x: 5,   y: 8,  elev: 99.2,  d: [1.5, 7.0, 13.5, 19.0, 26] },
  { name: "BH-02", x: 25,  y: 5,  elev: 99.6,  d: [1.8, 7.5, 14.0, 19.5, 26] },
  { name: "BH-03", x: 45,  y: 10, elev: 100.1, d: [2.0, 8.0, 14.8, 20.0, 27] },
  { name: "BH-04", x: 68,  y: 6,  elev: 100.5, d: [1.6, 8.4, 15.2, 20.8, 28] },
  { name: "BH-05", x: 90,  y: 12, elev: 101.2, d: [2.2, 8.8, 15.8, 21.5, 28] },
  { name: "BH-06", x: 112, y: 8,  elev: 101.6, d: [1.9, 9.2, 16.2, 22.0, 29], rock: true },
  { name: "BH-07", x: 10,  y: 42, elev: 100.4, d: [1.4, 6.6, 13.0, 18.6, 25] },
  { name: "BH-08", x: 35,  y: 48, elev: 101.0, d: [2.1, 7.2, 13.8, 19.2, 26] },
  { name: "BH-09", x: 60,  y: 45, elev: 101.8, d: [1.7, 7.8, 14.5, 20.2, 27] },
  { name: "BH-10", x: 85,  y: 50, elev: 102.5, d: [2.3, 8.5, 15.5, 21.0, 28] },
  { name: "BH-11", x: 108, y: 46, elev: 103.1, d: [2.0, 9.0, 16.0, 21.8, 29], rock: true },
  { name: "BH-12", x: 55,  y: 75, elev: 102.2, d: [1.5, 7.0, 14.0, 19.8, 27] },
];

const CH_SPECS = [
  { name: "CH-01", x: 20, y: 70, elev: 101.5 },
  { name: "CH-02", x: 95, y: 72, elev: 103.0 },
];

const colorFor = (code: string) => USCS_COLORS[code]?.color ?? colorForSoilType(code);

// 各層的 (code, 底深) 序列;BH-09 CL 層附互層備註(與 xlsx 匯入器產生的字樣一致)。
function layerRows(s: HoleSpec): { code: string; top: number; bottom: number; note?: string; interbed?: string }[] {
  const [d1, d2, d3, d4, bottom] = s.d;
  const lastCode = s.rock ? "風化岩" : "SM";
  return [
    { code: "SF", top: 0, bottom: d1 },
    { code: "SM", top: d1, bottom: d2 },
    s.name === "BH-09"
      ? { code: "CL", top: d2, bottom: d3, note: "互層:主 CL / 副 ML", interbed: "ML" }
      : { code: "CL", top: d2, bottom: d3 },
    { code: "ML", top: d3, bottom: d4 },
    { code: lastCode, top: d4, bottom },
  ];
}

function layerCodeAtDepth(s: HoleSpec, depth: number): string {
  const rows = layerRows(s);
  const hit = rows.find((r) => depth >= r.top && depth < r.bottom);
  return hit ? hit.code : rows[rows.length - 1].code;
}

const N_BASE: Record<string, number> = { SF: 4, SM: 10, CL: 6, ML: 14, 風化岩: 45 };

function sptFor(s: HoleSpec, holeIdx: number): SptMeasurement[] {
  const out: SptMeasurement[] = [];
  for (let i = 0; 1.5 + i * 1.5 < s.d[4] - 0.5; i++) {
    const top = 1.5 + i * 1.5;
    const code = layerCodeAtDepth(s, top);
    // 下部 SM(d4 以深)基準值 28,上部 SM 10
    const base = code === "SM" && top >= s.d[3] ? 28 : N_BASE[code];
    const n = Math.min(50, Math.max(2, base + Math.round(top / 6) + (((i * 7 + holeIdx * 3) % 5) - 2)));
    out.push({ topDepth: top, bottomDepth: Math.round((top + 0.45) * 100) / 100, nValue: n });
  }
  return out;
}

function rqdFor(s: HoleSpec): RqdSegment[] | undefined {
  if (!s.rock) return undefined;
  const out: RqdSegment[] = [];
  for (let i = 0; s.d[3] + i * 1.5 < s.d[4]; i++) {
    const top = Math.round((s.d[3] + i * 1.5) * 100) / 100;
    const bottom = Math.min(s.d[4], Math.round((top + 1.5) * 100) / 100);
    out.push({ topDepth: top, bottomDepth: bottom, rqd: Math.min(85, 35 + i * 8) });
  }
  return out;
}

function cptFor(holeIdx: number): CptSample[] {
  const out: CptSample[] = [];
  for (let i = 1; i * 0.2 <= 20; i++) {
    const depth = Math.round(i * 0.2 * 100) / 100;
    const qc = Math.max(0.2, 2 + 0.8 * depth + 1.5 * Math.sin(1.3 * depth + holeIdx));
    out.push({ depth, qc: Math.round(qc * 100) / 100 });
  }
  return out;
}

export function buildExampleBoreholes(): Borehole[] {
  const bh: Borehole[] = BH_SPECS.map((s, i) => {
    const layers: SoilLayer[] = layerRows(s).map((r) => ({
      topDepth: r.top,
      bottomDepth: r.bottom,
      soilType: r.code,
      color: colorFor(r.code),
      ...(r.note ? { note: r.note } : {}),
    }));
    const rqd = rqdFor(s);
    return {
      id: s.name, name: s.name, x: s.x, y: s.y, groundElevation: s.elev,
      layers, sptn: sptFor(s, i), ...(rqd ? { rqd } : {}),
    };
  });
  const ch: Borehole[] = CH_SPECS.map((s, i) => ({
    id: s.name, name: s.name, x: s.x, y: s.y, groundElevation: s.elev,
    layers: [], cptCurve: cptFor(i),
  }));
  return [...bh, ...ch];
}

// CSV 欄位轉義:部分岩性(如「風化岩」)在 USCS_COLORS 查無對應色,會落到
// colorForSoilType 的 hsl(h, 45%, 55%) 格式,值本身含逗號,若不加引號會被
// papaparse 誤判成多出的欄位(BH-06/BH-11 的風化岩層曾因此匯入失敗)。
function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildExampleCsv(): string {
  const lines = ["鑽孔名稱,X座標,Y座標,地表高程,頂深,底深,岩性,顏色,備註"];
  for (const s of BH_SPECS) {
    for (const r of layerRows(s)) {
      lines.push(
        [s.name, s.x, s.y, s.elev, r.top, r.bottom, r.code, colorFor(r.code), r.note ?? ""]
          .map(csvField)
          .join(",")
      );
    }
  }
  return lines.join("\n");
}

export function buildExampleWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const coordRows: unknown[][] = [["孔號", "類型", "X (mm)", "Y (mm)", "地表高程 (m)"]];
  for (const s of BH_SPECS) coordRows.push([s.name, "BH", s.x * 1000, s.y * 1000, s.elev]);
  for (const s of CH_SPECS) coordRows.push([s.name, "CPT", s.x * 1000, s.y * 1000, s.elev]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(coordRows), "鑽探資料");

  const soilRows: unknown[][] = [["孔號", "頂深 (m)", "底深 (m)", "互層", "主層", "副層"]];
  for (const s of BH_SPECS) {
    for (const r of layerRows(s)) soilRows.push([s.name, r.top, r.bottom, r.interbed ? 1 : 0, r.code, r.interbed ?? ""]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(soilRows), "土層");

  // SPTN 表:匯入器讀第 0/2/3/10 欄(孔號/頂深/底深/N 值),中間欄位仿真實報告佈局留白
  const sptRows: unknown[][] = [["孔號", "試驗編號", "頂深 (m)", "底深 (m)", "", "", "", "", "", "", "N 值"]];
  BH_SPECS.forEach((s, i) => {
    sptFor(s, i).forEach((m, j) => sptRows.push([s.name, `S-${j + 1}`, m.topDepth, m.bottomDepth, "", "", "", "", "", "", m.nValue]));
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sptRows), "SPTN");

  const rqdRows: unknown[][] = [["孔號", "頂深 (m)", "底深 (m)", "RQD (%)"]];
  for (const s of BH_SPECS) {
    for (const seg of rqdFor(s) ?? []) rqdRows.push([s.name, seg.topDepth, seg.bottomDepth, seg.rqd]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rqdRows), "RQD");

  // CPT 表:成對欄位,第 0 列孔名、第 1 列子標題、第 2 列起資料
  const cptRows: unknown[][] = [[], [], []];
  cptRows[0] = ["CH-01", "", "CH-02", ""];
  cptRows[1] = ["深度 (m)", "qc (MPa)", "深度 (m)", "qc (MPa)"];
  const curves = CH_SPECS.map((_, i) => cptFor(i));
  for (let r = 0; r < curves[0].length; r++) {
    cptRows[2 + r] = [curves[0][r].depth, curves[0][r].qc, curves[1][r].depth, curves[1][r].qc];
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cptRows), "CPT");
  return wb;
}

export function buildExampleProjectJson(): string {
  const boreholes = buildExampleBoreholes();
  const line = (id: string, name: string, color: string, di: 0 | 1 | 2, showContour: boolean) => ({
    id, name, color, visible: true, showContour,
    points: BH_SPECS.map((s) => ({ boreholeId: s.name, depth: s.d[di] })),
  });
  const profileData: ProfileData = {
    lines: [
      line("line-fill-bottom", "填土層底面", "#d97706", 0, false),
      line("line-clay-top", "黏土層頂面", "#2563eb", 1, true),
      line("line-clay-bottom", "黏土層底面", "#16a34a", 2, false),
    ],
    layers: [
      { id: "layer-clay", name: "黏土層", color: "#8a9a5b", topBoundaryId: "line-clay-top", bottomBoundaryId: "line-clay-bottom" },
    ],
  };
  const groups: BoreholeGroup[] = [
    { id: "group-south", name: "南側剖面", boreholeIds: BH_SPECS.slice(0, 6).map((s) => s.name) },
    { id: "group-north", name: "北側剖面", boreholeIds: BH_SPECS.slice(6).map((s) => s.name) },
  ];
  const soilStyles: SoilStyles = { SF: { color: "#c98f5f" } }; // 展示自訂顏色功能
  // 展示 3D 實體地層塊:開檔就能看到黏土層的半透明實體
  const modelSettings: ModelSettings = {
    extrapolationRatio: 0.1,
    layerStyles: { "layer-clay": { showSolid: true, opacity: 0.45 } },
  };
  return serializeProject(
    boreholes, null, profileData,
    { ...DEFAULT_CONTOUR_SETTINGS, interpolator: "kriging", colorMode: "colored" },
    groups, soilStyles, { ...DEFAULT_BAR_WIDTH_SETTINGS }, modelSettings
  );
}
