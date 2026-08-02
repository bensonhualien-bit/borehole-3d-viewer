// 匯出 PDF 的 A3 橫式頁面模板(單位 = mm,viewBox 0 0 420 297)。
// 純字串組裝、不碰 DOM/React——可直接 vitest。版面:繪圖區佔左側主要區域,
// 右側直欄是圖例,右下角是圖名欄(公司名/圖號等正式欄位 App 沒有資料來源,
// 刻意不做,見 spec)。
import type { Borehole } from "../types/borehole";
import { USCS_COLORS } from "./soilColors";
import { effectiveCodeColor, type SoilStyles } from "./soilStyles";

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 圖名欄的鑽孔編號清單:以「、」連接後貪婪換行(不拆名稱),超過行數上限
// 時以「…等 N 孔」收尾——多鑽孔(如 48 孔)頁面圖名欄不爆版。
export function wrapBoreholeNames(names: string[], maxCharsPerLine = 16, maxLines = 8): string[] {
  const lines: string[] = [];
  let current = "";
  for (const name of names) {
    const candidate = current === "" ? name : `${current}、${name}`;
    if (candidate.length <= maxCharsPerLine || current === "") {
      current = candidate;
    } else {
      lines.push(`${current}、`);
      current = name;
    }
  }
  if (current !== "") lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines - 1);
    kept.push(`…等 ${names.length} 孔`);
    return kept;
  }
  return lines;
}

export function formatVerticalScale(v: number): string {
  return Number.isInteger(v) ? `${v}×` : `${v.toFixed(1)}×`;
}

export interface LegendItem {
  code: string;
  label: string;
  color: string;
}

// 掃鑽孔實際出現的土層代碼(聯集),色用 effectiveCodeColor(與畫面一致)。
// 順序:USCS 固定表的順序在前,表外代碼照首次出現順序附在後。
export function collectLegendItems(boreholes: Borehole[], soilStyles: SoilStyles): LegendItem[] {
  const present = new Set<string>();
  const extras: string[] = [];
  for (const b of boreholes) {
    for (const layer of b.layers) {
      if (!present.has(layer.soilType)) {
        present.add(layer.soilType);
        if (!Object.prototype.hasOwnProperty.call(USCS_COLORS, layer.soilType)) extras.push(layer.soilType);
      }
    }
  }
  const ordered = [...Object.keys(USCS_COLORS).filter((c) => present.has(c)), ...extras];
  return ordered.map((code) => ({
    code,
    label: USCS_COLORS[code]?.label ?? code,
    color: effectiveCodeColor(code, soilStyles),
  }));
}

// 圖例色塊片段——花紋功能(patternId)之後只改這一個函式(fill 換 pattern 引用)。
export function legendSwatchFragment(item: LegendItem, x: number, y: number, size: number): string {
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${escapeXml(item.color)}" stroke="#333" stroke-width="0.3" data-swatch="${escapeXml(item.code)}" />`;
}

export interface ExportPageInput {
  profileSvgMarkup: string;
  title: string;
  dateText: string;
  boreholeCount: number;
  legendItems: LegendItem[];
  verticalScale?: number;
  boreholeNames?: string[];
}

export function buildExportPageSvg(input: ExportPageInput): string {
  const legendRows = input.legendItems
    .map((item, i) => {
      const y = 30 + i * 9;
      return (
        legendSwatchFragment(item, 350, y, 5) +
        `<text x="357" y="${y + 4.2}" font-size="4" font-family="sans-serif" fill="#000">${escapeXml(item.code)} ${escapeXml(item.label)}</text>`
      );
    })
    .join("");

  // 組圖名欄(含可選欄位:縱向放大倍率、鑽孔清單)
  const titleBlockRows = [
    `<text x="350" y="243" font-size="5" font-weight="bold" fill="#000">${escapeXml(input.title)}</text>`,
    `<text x="350" y="251" font-size="4" fill="#000">日期:${escapeXml(input.dateText)}</text>`,
    `<text x="350" y="258" font-size="4" fill="#000">鑽孔數:${input.boreholeCount}</text>`,
  ];

  if (input.verticalScale !== undefined) {
    titleBlockRows.push(
      `<text x="350" y="265" font-size="4" fill="#000">縱向放大:${formatVerticalScale(input.verticalScale)}</text>`
    );
  }

  if (input.boreholeNames !== undefined && input.boreholeNames.length > 0) {
    const wrappedLines = wrapBoreholeNames(input.boreholeNames, 16, 3);
    wrappedLines.forEach((line, i) => {
      const y = 273 + i * 6;
      const prefix = i === 0 ? "鑽孔:" : "";
      titleBlockRows.push(
        `<text x="350" y="${y}" font-size="3.6" fill="#000">${prefix}${escapeXml(line)}</text>`
      );
    });
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 297" font-family="sans-serif">
  <rect x="0" y="0" width="420" height="297" fill="#ffffff" />
  <rect x="5" y="5" width="410" height="287" fill="none" stroke="#000" stroke-width="1" data-frame="outer" />
  <rect x="8" y="8" width="404" height="281" fill="none" stroke="#000" stroke-width="0.3" data-frame="inner" />
  ${input.profileSvgMarkup}
  <line x1="345" y1="8" x2="345" y2="289" stroke="#000" stroke-width="0.3" />
  <text x="350" y="22" font-size="5.5" font-weight="bold" fill="#000">圖例</text>
  ${legendRows}
  <rect x="345" y="234" width="67" height="55" fill="none" stroke="#000" stroke-width="0.5" />
  ${titleBlockRows.join("\n  ")}
</svg>`;
}
