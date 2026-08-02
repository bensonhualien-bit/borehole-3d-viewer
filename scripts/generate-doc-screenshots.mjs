// 產生 docs/使用手冊.md 用的實機截圖與範例匯出 PDF。
//
// 流程模仿 scripts/debug-e2e-examples.mjs(開專案檔的 input 定位、「繪製地層」
// 相關細節)與 scripts/debug-e2e-pdf-export.mjs(PDF 匯出的 download 事件攔截、
// 檔案大小健檢)——但這支腳本不是斷言測試,是「產生正式要入庫的視覺產物」,
// 所以流程改成:開專案 → 依序切畫面截圖 → 匯出範例 PDF → reload 上傳 CSV
// 拍最後一張,失敗就直接丟出例外,不做「PASS/FAIL 統計後仍 exit 0」這種事。
//
// 不自己起/殺 vite dev server(不同於 debug-e2e-pdf-export.mjs / debug-e2e-
// profile-comparison.mjs 那兩支):server 由外部先起好在 E2E_BASE_URL,這支只管
// 產生截圖,呼叫端負責「起乾淨 server → 跑這支 → 人工看過每張圖 → 殺 server」。
//
// 兩顆 3D WebGL 場景截圖(hero-3d / color-dialog,同一顆場景疊圖)在 1600×900、
// deviceScaleFactor=1 下每張都接近 900KB,遠超過 300KB 預算。試過直接把
// viewport 縮小(例如 750×422)會讓好幾個各自用 position:absolute + 固定
// top/left/bottom 像素值定位的浮動面板(專案、廠區配置圖……)因為可用高度變矮
// 而彼此重疊、擋住——那不是真實視窗大小下會發生的畫面,不能拿來當文件截圖。
// 改用「viewport 邏輯尺寸維持 1600×900(CSS 版面照常排列、面板位置完全不變),
// 只把 deviceScaleFactor 調低,讓最終輸出的像素點陣變小」這個做法,兩全其美。
// deviceScaleFactor 只能在建立 page/context 當下指定、事後不能動態調整,所以
// 這兩張改用獨立的 heroPage(自己的 browser context)截,其餘所有截圖仍在主要
// 的 page(deviceScaleFactor=1)完成。

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectJsonPath = path.join(projectRoot, "examples", "範例專案.json");
const csvPath = path.join(projectRoot, "examples", "範例鑽孔資料.csv");
const imagesDir = path.join(projectRoot, "docs", "images");

const PORT = new URL(E2E_BASE_URL).port || "5199";
if (PORT === "5173") {
  throw new Error(
    "REFUSING TO RUN: E2E_BASE_URL points at port 5173 (user's live dev session). Aborting before touching it."
  );
}

await fs.mkdir(imagesDir, { recursive: true });

const VIEWPORT = { width: 1600, height: 900 };
const HERO_DEVICE_SCALE_FACTOR = 0.4; // 見檔頭註解:CSS 版面不變,只降輸出像素密度

let errorCount = 0;
const browser = await chromium.launch({ channel: "chrome", headless: true });

// 深色浮動面板(SoilLegend / ContourLegend / DataUploader / ProjectManager /
// BarWidthSettingsPanel …)共用同一組樣式 background: rgba(30,30,30,0.85)、
// borderRadius: 8——用「先靠文字縮小候選範圍(只留下真的包含這段文字的 div,
// 排除掉外層一路往上、textContent 也剛好包含同一段文字的 flex 容器),再靠這組
// 樣式挑出實際的面板本身」的方式定位,不用寫死任何面板各自的 top/left/width。
async function screenshotPanelByText(targetPage, text, outPath) {
  const box = await targetPage.evaluate((needle) => {
    const divs = Array.from(document.querySelectorAll("div"));
    const candidates = divs.filter((d) => d.textContent && d.textContent.includes(needle));
    let best = null;
    let bestArea = Infinity;
    for (const d of candidates) {
      const cs = getComputedStyle(d);
      if (cs.backgroundColor === "rgba(30, 30, 30, 0.85)") {
        const r = d.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > 0 && area < bestArea) {
          bestArea = area;
          best = { x: r.x, y: r.y, width: r.width, height: r.height };
        }
      }
    }
    return best;
  }, text);
  if (!box) {
    throw new Error(`ASSERTION FAILED: panel containing "${text}" not found for screenshot (${outPath})`);
  }
  await targetPage.screenshot({ path: outPath, clip: box });
  console.log(`saved ${path.basename(outPath)} (clip ${JSON.stringify(box)})`);
}

try {
  // ===========================================================================
  // A. heroPage(deviceScaleFactor 降低):hero-3d.png、contour-legend.png、
  //    color-dialog.png——都是同一顆載入範例專案後的 3D 場景。
  // ===========================================================================
  const heroPage = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: HERO_DEVICE_SCALE_FACTOR,
    acceptDownloads: true,
  });
  heroPage.on("pageerror", (err) => {
    errorCount++;
    console.log("[PAGEERROR][heroPage]", err.message);
  });

  await heroPage.goto(E2E_BASE_URL, { waitUntil: "load" });
  await heroPage.waitForTimeout(500);

  await heroPage.locator('input[type="file"][accept*="json"]').setInputFiles(projectJsonPath);
  await heroPage.waitForTimeout(800);
  await heroPage.locator("canvas").first().waitFor({ state: "visible", timeout: 10000 });
  // examples/範例專案.json 的「黏土層頂面」線 showContour:true + contourSettings.
  // colorMode:"colored",Scene 掛載後會回報 onContourExtentChange,ContourLegend
  // 才會出現——等它出現代表 Kriging 曲面真的算完了,不是只有 canvas 掛載而已。
  await heroPage.getByText("等高線圖例").first().waitFor({ state: "visible", timeout: 15000 });
  await heroPage.waitForTimeout(800);

  // 預設相機角度會把好幾支鑽孔的名稱標籤擠在畫面同一小塊區域裡疊在一起、難以辨識
  // (BH-07/08/09/01 擠在正上方一帶、CH-02+BH-11 在右側疊字)。標籤是 3D 空間中的
  // 物件,螢幕上的間距只跟相機角度/距離有關——用滑鼠在 canvas 上做一次固定像素量的
  // 左鍵拖曳(OrbitControls 預設:左鍵拖曳 = 環繞旋轉)把相機轉到一個側俯角度,再用
  // 滾輪稍微拉遠一點,讓標籤在畫面上散開、Kriging 曲面與鑽孔柱狀圖仍然完整入鏡。
  // 拖曳量固定(非隨機),可重現。
  const heroCanvasBox = await heroPage.locator("canvas").first().boundingBox();
  if (!heroCanvasBox) {
    throw new Error("ASSERTION FAILED: hero canvas boundingBox not found for camera adjustment");
  }
  const heroCenterX = heroCanvasBox.x + heroCanvasBox.width / 2;
  const heroCenterY = heroCanvasBox.y + heroCanvasBox.height / 2;
  await heroPage.mouse.move(heroCenterX, heroCenterY);
  await heroPage.mouse.down();
  const dragSteps = 20;
  // 鑽孔名稱標籤(BoreholeColumn.tsx 的 <Text>)不是 billboard,是固定朝向 world +Z
  // 的平面文字——旋轉角度太大會轉到看到文字背面(鏡射/上下顛倒),所以水平拖曳量
  // 要保守,只做「夠讓標籤在螢幕空間散開」但不超過會看到文字背面的角度。
  const dragDx = -55; // 水平拖曳:環繞方位角(azimuth),把場景轉個小角度
  const dragDy = -25; // 垂直拖曳:調整俯仰角(轉往較高視角俯瞰),把水平方向本來
  // 就靠得很近的鑽孔標籤,依真實 X/Z 座標而不是被相機深度壓縮成一團的方式散開
  for (let i = 1; i <= dragSteps; i++) {
    await heroPage.mouse.move(
      heroCenterX + (dragDx * i) / dragSteps,
      heroCenterY + (dragDy * i) / dragSteps
    );
  }
  await heroPage.mouse.up();
  await heroPage.waitForTimeout(300);
  await heroPage.mouse.move(heroCenterX, heroCenterY);
  await heroPage.mouse.wheel(0, 90); // 滾輪拉遠,確保轉動後整個場地仍完整入鏡
  // 把滑鼠移到畫布外側的角落——上面幾步的滑鼠移動/滾輪都經過鑽孔柱體正上方,會
  // 觸發 hover 狀態(柱體 emissive 高亮 + 額外冒出的 N值/RQD 量測文字),那是互動
  // 狀態不是預設畫面,截圖前先移開滑鼠讓 hover 狀態清掉。
  await heroPage.mouse.move(heroCanvasBox.x + 2, heroCanvasBox.y + 2);
  await heroPage.waitForTimeout(500);

  await heroPage.screenshot({ path: path.join(imagesDir, "hero-3d.png") });
  console.log("saved hero-3d.png");

  await screenshotPanelByText(heroPage, "等高線圖例", path.join(imagesDir, "contour-legend.png"));

  const smLegendButton = heroPage.locator('button[aria-label="自訂 SM 顏色"]');
  await smLegendButton.waitFor({ state: "visible", timeout: 5000 });
  await smLegendButton.click();
  await heroPage.getByText("色彩選擇").first().waitFor({ state: "visible", timeout: 5000 });
  await heroPage.waitForTimeout(300);

  await heroPage.screenshot({ path: path.join(imagesDir, "color-dialog.png") });
  console.log("saved color-dialog.png");

  await heroPage.close();

  // ===========================================================================
  // B. page(deviceScaleFactor 預設 1):profile-2d、comparison、bar-width-panel、
  //    範例剖面匯出.pdf、data-uploader。
  // ===========================================================================
  const page = await browser.newPage({ viewport: VIEWPORT, acceptDownloads: true });
  page.on("pageerror", (err) => {
    errorCount++;
    console.log("[PAGEERROR]", err.message);
  });

  async function ensureChecklistExpanded() {
    const expandButton = page.getByRole("button", { name: /已選 \d+ 支鑽孔/ });
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(150);
    }
  }

  await page.goto(E2E_BASE_URL, { waitUntil: "load" });
  await page.waitForTimeout(500);

  await page.locator('input[type="file"][accept*="json"]').setInputFiles(projectJsonPath);
  await page.waitForTimeout(800);
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 10000 });
  await page.getByText("等高線圖例").first().waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(500);

  // ---- 1. 切 2D → 全選鑽孔(自動收合清單,畫面乾淨)-> profile-2d.png ------
  await page.getByRole("button", { name: "切換為2D剖面" }).click();
  await page.waitForTimeout(300);
  await ensureChecklistExpanded();
  await page.getByRole("button", { name: "全選", exact: true }).first().click();
  await page.waitForTimeout(800); // 選滿 >=2 支後清單 500ms 自動收合,等它收合完再拍
  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(imagesDir, "profile-2d.png") });
  console.log("saved profile-2d.png");

  // ---- 2. 多剖面比對(範例專案內建南側剖面/北側剖面兩群組)-> comparison.png
  await page.getByRole("button", { name: "多剖面比對" }).click();
  await page.waitForTimeout(500);
  // 選單預設展開時蓋在兩個群組面板正上方,收合成小標籤讓兩個面板完整入鏡
  // (title="收合" 是這顆按鈕獨有的屬性,不會跟柱寬設定面板的「▴ 收合」文字按鈕
  // 混淆)。
  if (await page.getByTitle("收合").isVisible().catch(() => false)) {
    await page.getByTitle("收合").click();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(imagesDir, "comparison.png") });
  console.log("saved comparison.png");

  // ---- 3. 回單一剖面 → 展開柱寬設定 → bar-width-panel.png -----------------
  await page.getByRole("button", { name: "返回單一剖面" }).click();
  await page.waitForTimeout(300);

  const collapsedBarWidthButton = page.getByRole("button", { name: "柱寬設定 ▾" });
  if (await collapsedBarWidthButton.isVisible().catch(() => false)) {
    await collapsedBarWidthButton.click();
    await page.waitForTimeout(200);
  }
  await page.getByText("柱寬上限", { exact: false }).first().waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(200);

  await screenshotPanelByText(page, "柱寬設定", path.join(imagesDir, "bar-width-panel.png"));

  // ---- 4. 匯出 PDF(單一剖面,清單裡選的是全部 12 支鑽孔)------------------
  await ensureChecklistExpanded();
  const exportButton = page.getByRole("button", { name: "匯出 PDF", exact: true });
  await exportButton.waitFor({ state: "visible", timeout: 5000 });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    exportButton.click(),
  ]);
  const pdfOutPath = path.join(imagesDir, "範例剖面匯出.pdf");
  await download.saveAs(pdfOutPath);
  console.log("saved 範例剖面匯出.pdf");

  // ---- 5. reload(乾淨狀態)→ 上傳 CSV → data-uploader.png ------------------
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(500);
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles(csvPath);
  await page.getByText("成功匯入 12 支鑽孔").waitFor({ timeout: 20000 });
  await page.waitForTimeout(300);

  await screenshotPanelByText(page, "匯入鑽孔資料", path.join(imagesDir, "data-uploader.png"));

  await page.close();

  console.log(`\nSCREENSHOT GENERATION DONE. pageerror count: ${errorCount}`);
} catch (err) {
  console.log("[FAIL]", err.message);
  console.log(err.stack);
  errorCount = errorCount || 1;
} finally {
  await browser.close();
}

// ---- 產物健檢:每張 PNG 都要存在且 < 300KB,PDF 要存在且落在合理大小區間 ----

const KB = 1024;
const MB = 1024 * 1024;
const pngFiles = [
  "hero-3d.png",
  "contour-legend.png",
  "profile-2d.png",
  "comparison.png",
  "color-dialog.png",
  "bar-width-panel.png",
  "data-uploader.png",
];

let warnCount = 0;
for (const f of pngFiles) {
  const p = path.join(imagesDir, f);
  try {
    const stat = await fs.stat(p);
    console.log(`${f}: ${(stat.size / KB).toFixed(1)} KB`);
    if (stat.size > 300 * KB) {
      console.log(`[WARN] ${f} exceeds 300KB budget`);
      warnCount++;
    }
  } catch (err) {
    console.log(`[MISSING] ${f}: ${err.message}`);
    warnCount++;
  }
}

const pdfOutPath = path.join(imagesDir, "範例剖面匯出.pdf");
try {
  const stat = await fs.stat(pdfOutPath);
  console.log(`範例剖面匯出.pdf: ${(stat.size / KB).toFixed(1)} KB`);
  if (stat.size < 50 * KB || stat.size > 5 * MB) {
    console.log("[WARN] 範例剖面匯出.pdf size outside plausible 50KB~5MB range");
    warnCount++;
  }
} catch (err) {
  console.log(`[MISSING] 範例剖面匯出.pdf: ${err.message}`);
  warnCount++;
}

console.log(warnCount === 0 ? "\nALL OUTPUTS OK" : `\n${warnCount} WARNING(S) — inspect before committing`);
process.exit(errorCount > 0 ? 1 : 0);
