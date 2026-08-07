// src/utils/exportPdf.ts
// 匯出流程協調:每一頁 = buildProfileSvg 純函式產生剖面繪圖區 svg 片段 → 塞進
// A3 頁面模板(buildExportPageSvg)→ 瀏覽器畫到 300 DPI canvas → PNG →
// jsPDF addImage。逐頁「渲染完立刻 addImage」,不同時持有所有頁的 canvas。
// jsPDF 動態 import,不進主 bundle。
import type { Borehole } from "../types/borehole";
import type { ProfileLine } from "./profileStorage";
import type { SoilStyles } from "./soilStyles";
import type { BarWidthSettings } from "./barWidth";
import { buildProfileSvg } from "./exportProfileSvg";
import { buildExportPageSvg, collectLegendItems } from "./exportPageTemplate";
import { computeProfileAxis, computeSequentialDistanceAxis } from "./profileAxis";
import { globalQcMax } from "./cptCurve";

// A3 橫式 @ 300 DPI
const PAGE_W_PX = 4961;
const PAGE_H_PX = 3508;
// 模板座標(mm):繪圖區(圖框內、圖例欄左)
const DRAW_X = 10;
const DRAW_Y = 10;
const DRAW_W = 333;
const DRAW_H = 277;

export interface ExportProfilePage {
  boreholes: Borehole[];
  selectedBoreholeIds: Set<string>;
  profileLines: ProfileLine[];
  axisMode: "projected" | "sequential";
  soilStyles: SoilStyles;
  barWidthSettings: BarWidthSettings;
  title: string;
}

function svgToPngDataUrl(svgMarkup: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = PAGE_W_PX;
        canvas.height = PAGE_H_PX;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("無法建立 canvas");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, PAGE_W_PX, PAGE_H_PX);
        ctx.drawImage(img, 0, 0, PAGE_W_PX, PAGE_H_PX);
        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("剖面圖轉檔失敗(SVG 無法載入)"));
    };
    img.src = url;
  });
}

export async function exportProfilesToPdf(
  pages: ExportProfilePage[],
  filename: string,
  dateText: string
): Promise<void> {
  // ProfileSection2D 在少於 2 支鑽孔時只畫「請選擇至少 2 支鑽孔」的文字提示、也
  // 不會 auto-fit——這種頁面沒有東西可匯出,直接跳過;比對模式下,membership 過舊
  // 只剩 0~1 支鑽孔的群組跟著跳過即可,其餘頁正常繼續(對應 spec「該頁跳過」)。
  const exportablePages = pages.filter(
    (page) => page.boreholes.filter((b) => page.selectedBoreholeIds.has(b.id)).length >= 2
  );
  if (exportablePages.length === 0) throw new Error("沒有可匯出的剖面(每頁至少需要 2 支鑽孔)");
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", format: "a3", unit: "mm", compress: true });
  for (let i = 0; i < exportablePages.length; i++) {
    const page = exportablePages[i];
    const exported = page.boreholes.filter((b) => page.selectedBoreholeIds.has(b.id));
    const { markup: profileSvgMarkup, verticalScale } = buildProfileSvg({
      boreholes: exported,
      profileLines: page.profileLines,
      axisMode: page.axisMode,
      soilStyles: page.soilStyles,
      barWidthSettings: page.barWidthSettings,
      drawX: DRAW_X, drawY: DRAW_Y, drawW: DRAW_W, drawH: DRAW_H,
      qcMax: globalQcMax(page.boreholes),
    });
    // 圖名欄的鑽孔清單要跟畫面上「由左至右」的順序一致,不能沿用 exported 的
    // 資料順序(勾選/匯入順序)——跟 buildProfileSvg 內部算 positioned 用的是
    // 同一條軸(computeProfileAxis / computeSequentialDistanceAxis),才能保證
    // 兩邊排序一致。
    const coords = exported.map((b) => ({ id: b.id, x: b.x, y: b.y }));
    const axis = page.axisMode === "sequential" ? computeSequentialDistanceAxis(coords) : computeProfileAxis(coords);
    const byId = new Map(exported.map((b) => [b.id, b]));
    const drawnOrderNames = axis.flatMap((e) => {
      const b = byId.get(e.boreholeId);
      return b ? [b.name] : [];
    });
    const pageSvg = buildExportPageSvg({
      profileSvgMarkup,
      title: page.title,
      dateText,
      boreholeCount: exported.length,
      legendItems: collectLegendItems(exported, page.soilStyles),
      verticalScale,
      boreholeNames: drawnOrderNames,
    });
    const png = await svgToPngDataUrl(pageSvg);
    if (i > 0) pdf.addPage("a3", "landscape");
    pdf.addImage(png, "PNG", 0, 0, 420, 297, undefined, "FAST");
  }
  pdf.save(filename);
}
