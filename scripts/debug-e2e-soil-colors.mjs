import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "鑽孔資料", "測試場地.xlsx");
const BASE_URL = E2E_BASE_URL;

let errorCount = 0;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1005 }, acceptDownloads: true });
page.on("pageerror", (err) => {
  errorCount++;
  console.log("[PAGEERROR]", err.message);
});

await page.goto(BASE_URL, { waitUntil: "load" });
await page.waitForTimeout(500);

const fileInput = page.locator('input[type="file"][accept*="csv"]');
await fileInput.setInputFiles(fixturePath);
await page.getByText(/成功匯入/).waitFor({ timeout: 20000 });
await page.waitForTimeout(500);

// ---- 共用小工具 ----------------------------------------------------------

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

const DEFAULT_SM_RGB = hexToRgb("#e0c068"); // rgb(224, 192, 104)

// 圖例 SM 色塊:aria-label 定位的 button 內第一個(唯一)span 就是色塊
const smLegendButton = page.locator('button[aria-label="自訂 SM 顏色"]');
const smSwatch = smLegendButton.locator("span").first();

async function getSmSwatchColor() {
  return smSwatch.evaluate((el) => getComputedStyle(el).backgroundColor);
}

async function getSoilStylesLS() {
  const raw = await page.evaluate(() => localStorage.getItem("soilStyles"));
  return raw ? JSON.parse(raw) : null;
}

// 對話框標題列:同一個 div 裡有「色彩選擇」與「{code} {label}」兩個 span,
// 用「色彩選擇」span 的父層 div 取整列文字,同時驗證標題字樣與代碼字樣。
const dialogTitleSpan = page.locator("span", { hasText: "色彩選擇" });
const dialogHeaderRow = dialogTitleSpan.locator("xpath=..");
const dialogPanel = dialogHeaderRow.locator("xpath=..");
const dialogPreviewNew = page.locator('[data-testid="color-dialog-preview-new"]');
const dialogCustomInput = dialogPanel.locator('input[type="color"]');
const standardColorBd2828 = page.locator('button[aria-label="標準色 #bd2828"]');
const confirmButton = page.getByRole("button", { name: "確認" });
const closeButton = page.getByRole("button", { name: "關閉" });

async function assertDialogOpenWithCode(code) {
  await dialogTitleSpan.waitFor({ state: "visible", timeout: 3000 });
  const headerText = await dialogHeaderRow.textContent();
  if (!headerText?.includes("色彩選擇")) {
    throw new Error(`ASSERTION FAILED: dialog header missing 「色彩選擇」, got: ${headerText}`);
  }
  if (!headerText?.includes(code)) {
    throw new Error(`ASSERTION FAILED: dialog header missing code "${code}", got: ${headerText}`);
  }
}

async function assertDialogClosed() {
  await dialogTitleSpan.waitFor({ state: "hidden", timeout: 3000 });
  const stillThere = await dialogTitleSpan.count();
  if (stillThere !== 0) {
    throw new Error(`ASSERTION FAILED: dialog still present after expecting it closed (count=${stillThere})`);
  }
}

async function ensureChecklistExpanded() {
  const expandButton = page.getByRole("button", { name: /已選 \d+ 支鑽孔/ });
  if (await expandButton.isVisible().catch(() => false)) {
    await expandButton.click();
    await page.waitForTimeout(150);
  }
}

async function countRectsWithFill(hex) {
  return page.locator(`svg rect[fill="${hex}"]`).count();
}

async function switchTo2DAndCheckSome() {
  await page.getByRole("button", { name: "切換為2D剖面" }).click();
  await page.waitForTimeout(200);
  await ensureChecklistExpanded();
  const checkboxes = page.locator('label:has(input[type="checkbox"])');
  const checkboxCount = await checkboxes.count();
  for (let i = 0; i < Math.min(5, checkboxCount); i++) {
    await checkboxes.nth(i).locator("input").check();
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);
}

async function switchTo3D() {
  await page.getByRole("button", { name: "切換為3D視圖" }).click();
  await page.waitForTimeout(300);
}

// ---- 1. 點圖例 SM 色塊 → 對話框出現(含「色彩選擇」與「SM」) --------------

await smLegendButton.click();
await assertDialogOpenWithCode("SM");
console.log("1. dialog opened with 色彩選擇 + SM header — OK");

// ---- 2. 點標準色 #bd2828 → 只更新預覽,不套用 -----------------------------

await standardColorBd2828.click();
await page.waitForTimeout(100);

const previewAfterPick = await dialogPreviewNew.evaluate((el) => getComputedStyle(el).backgroundColor);
const expectedBd2828Rgb = hexToRgb("#bd2828"); // rgb(189, 40, 40)
console.log("preview 'new' background after picking #bd2828 (expect", expectedBd2828Rgb + "):", previewAfterPick);
if (previewAfterPick !== expectedBd2828Rgb) {
  throw new Error(`ASSERTION FAILED: preview did not update to #bd2828, got ${previewAfterPick}`);
}

const legendColorBeforeConfirm = await getSmSwatchColor();
console.log("legend SM swatch color before confirm (expect unchanged", DEFAULT_SM_RGB + "):", legendColorBeforeConfirm);
if (legendColorBeforeConfirm !== DEFAULT_SM_RGB) {
  throw new Error(
    `ASSERTION FAILED: legend swatch changed before confirm (未確認不套用 violated), got ${legendColorBeforeConfirm}`,
  );
}

const soilStylesBeforeConfirm = await getSoilStylesLS();
console.log("soilStyles localStorage before confirm (expect null or no SM key):", JSON.stringify(soilStylesBeforeConfirm));
if (soilStylesBeforeConfirm !== null && Object.prototype.hasOwnProperty.call(soilStylesBeforeConfirm, "SM")) {
  throw new Error(
    `ASSERTION FAILED: localStorage soilStyles already contains SM before confirm, got ${JSON.stringify(soilStylesBeforeConfirm)}`,
  );
}
console.log("2. picking a standard color only updates preview (legend + localStorage untouched) — OK");

// ---- 3. 點「關閉」→ 對話框消失、顏色/localStorage 完全不變 ----------------

await closeButton.click();
await assertDialogClosed();

const legendColorAfterClose = await getSmSwatchColor();
console.log("legend SM swatch color after 關閉 (expect unchanged", DEFAULT_SM_RGB + "):", legendColorAfterClose);
if (legendColorAfterClose !== DEFAULT_SM_RGB) {
  throw new Error(`ASSERTION FAILED: legend swatch changed after 關閉, got ${legendColorAfterClose}`);
}
const soilStylesAfterClose = await getSoilStylesLS();
if (soilStylesAfterClose !== null && Object.prototype.hasOwnProperty.call(soilStylesAfterClose, "SM")) {
  throw new Error(
    `ASSERTION FAILED: localStorage soilStyles changed after 關閉, got ${JSON.stringify(soilStylesAfterClose)}`,
  );
}
console.log("3. 關閉 discards the pending pick, dialog closed, nothing changed — OK");

// ---- 4. 重開對話框 → 選同一標準色 → 確認 → 套用 --------------------------

await smLegendButton.click();
await assertDialogOpenWithCode("SM");
await standardColorBd2828.click();
await page.waitForTimeout(100);
await confirmButton.click();
await assertDialogClosed();

const legendColorAfterConfirm = await getSmSwatchColor();
console.log("legend SM swatch color after 確認 (expect", expectedBd2828Rgb + "):", legendColorAfterConfirm);
if (legendColorAfterConfirm !== expectedBd2828Rgb) {
  throw new Error(`ASSERTION FAILED: legend swatch did not turn #bd2828 after confirm, got ${legendColorAfterConfirm}`);
}

await switchTo2DAndCheckSome();
const bd2828RectCount = await countRectsWithFill("#bd2828");
console.log("2D rect count with fill #bd2828 after confirm (expect > 0):", bd2828RectCount);
if (bd2828RectCount === 0) {
  throw new Error("ASSERTION FAILED: expected at least one #bd2828 rect in 2D section after confirm");
}
await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-soil-colors-2d-bd2828.png") });

const soilStylesAfterConfirm = await getSoilStylesLS();
console.log("soilStyles localStorage after confirm:", JSON.stringify(soilStylesAfterConfirm));
if (soilStylesAfterConfirm?.SM?.color !== "#bd2828") {
  throw new Error(
    `ASSERTION FAILED: localStorage soilStyles.SM.color not written after confirm, got ${JSON.stringify(soilStylesAfterConfirm)}`,
  );
}
await switchTo3D();
console.log("4. picking standard color then 確認 applies to legend + 2D + localStorage — OK");

// ---- 5. 自訂路徑:對話框內唯一的 input[type=color] --------------------------

await smLegendButton.click();
await assertDialogOpenWithCode("SM");

const customInputCount = await dialogCustomInput.count();
console.log("input[type=color] count inside dialog while open (expect 1):", customInputCount);
if (customInputCount !== 1) {
  throw new Error(`ASSERTION FAILED: expected exactly one input[type=color] inside the color dialog, got ${customInputCount}`);
}

await dialogCustomInput.evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, "#00ff00");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(150);

const previewAfterCustom = await dialogPreviewNew.evaluate((el) => getComputedStyle(el).backgroundColor);
const greenRgb = hexToRgb("#00ff00"); // rgb(0, 255, 0)
console.log("preview 'new' background after custom #00ff00 (expect", greenRgb + "):", previewAfterCustom);
if (previewAfterCustom !== greenRgb) {
  throw new Error(`ASSERTION FAILED: preview did not update to custom #00ff00, got ${previewAfterCustom}`);
}
const legendColorDuringCustom = await getSmSwatchColor();
console.log(
  "legend SM swatch color while custom picker pending (expect unchanged",
  expectedBd2828Rgb + "):",
  legendColorDuringCustom,
);
if (legendColorDuringCustom !== expectedBd2828Rgb) {
  throw new Error(
    `ASSERTION FAILED: legend swatch changed before confirming custom color, got ${legendColorDuringCustom}`,
  );
}

await confirmButton.click();
await assertDialogClosed();
const legendColorAfterCustomConfirm = await getSmSwatchColor();
console.log("legend SM swatch color after confirming custom color (expect", greenRgb + "):", legendColorAfterCustomConfirm);
if (legendColorAfterCustomConfirm !== greenRgb) {
  throw new Error(
    `ASSERTION FAILED: legend swatch did not turn green after confirming custom color, got ${legendColorAfterCustomConfirm}`,
  );
}
console.log("5. custom color via input[type=color] only applies after 確認 — OK");

await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-soil-colors-3d-green.png") });

// ---- 6a. reload 持久化(localStorage 生效,綠色 rect 應保留) ----------------

await switchTo2DAndCheckSome();
const greenRectCountBeforeReload = await countRectsWithFill("#00ff00");
console.log("2D rect count with fill #00ff00 before reload (expect > 0):", greenRectCountBeforeReload);
if (greenRectCountBeforeReload === 0) {
  throw new Error("ASSERTION FAILED: expected at least one #00ff00 rect in 2D section before reload");
}

await page.reload({ waitUntil: "load" });
await page.waitForTimeout(500);
// boreholes 本身不持久化,reload 後要重新匯入才有資料可切 2D 檢視
await page.locator('input[type="file"][accept*="csv"]').setInputFiles(fixturePath);
await page.getByText(/成功匯入/).waitFor({ timeout: 20000 });
await page.waitForTimeout(300);
await switchTo2DAndCheckSome();
const greenRectCountAfterReload = await countRectsWithFill("#00ff00");
console.log("2D rect count with fill #00ff00 after reload (expect > 0, from localStorage):", greenRectCountAfterReload);
if (greenRectCountAfterReload === 0) {
  throw new Error("ASSERTION FAILED: expected #00ff00 rect to persist across reload via localStorage");
}
console.log("6a. reload persistence via localStorage — OK");

// ---- 6b. 恢復預設顏色 -------------------------------------------------------

const resetButton = page.getByRole("button", { name: "恢復預設顏色" });
await resetButton.click();
await page.waitForTimeout(200);
const colorAfterReset = await getSmSwatchColor();
console.log("legend SM swatch color after 恢復預設顏色 (expect", DEFAULT_SM_RGB + "):", colorAfterReset);
if (colorAfterReset !== DEFAULT_SM_RGB) {
  throw new Error(`ASSERTION FAILED: legend swatch did not reset to default, got ${colorAfterReset}`);
}
const greenRectCountAfterReset = await countRectsWithFill("#00ff00");
console.log("2D rect count with fill #00ff00 after reset (expect 0):", greenRectCountAfterReset);
if (greenRectCountAfterReset !== 0) {
  throw new Error(`ASSERTION FAILED: expected 0 green rects after reset, got ${greenRectCountAfterReset}`);
}
console.log("6b. 恢復預設顏色 clears the override — OK");

// ---- 6c. 專案檔 round-trip(套用動作改走「開對話框→選標準色→確認」) --------

await switchTo3D();
await smLegendButton.click();
await assertDialogOpenWithCode("SM");
await standardColorBd2828.click();
await page.waitForTimeout(100);
await confirmButton.click();
await assertDialogClosed();
const colorBeforeSave = await getSmSwatchColor();
console.log("legend SM swatch color before save (expect", expectedBd2828Rgb + "):", colorBeforeSave);
if (colorBeforeSave !== expectedBd2828Rgb) {
  throw new Error(`ASSERTION FAILED: legend swatch not #bd2828 before save, got ${colorBeforeSave}`);
}

const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.getByRole("button", { name: "儲存專案" }).click(),
]);
const savedPath = path.join(projectRoot, ".superpowers", "sdd", "soil-colors-project-test.json");
await download.saveAs(savedPath);
console.log("downloaded project to", savedPath);

const fs = await import("node:fs/promises");
const savedJson = JSON.parse(await fs.readFile(savedPath, "utf-8"));
console.log("saved project soilStyles:", JSON.stringify(savedJson.soilStyles));
if (!savedJson.soilStyles || savedJson.soilStyles.SM?.color !== "#bd2828") {
  throw new Error(`ASSERTION FAILED: saved project file missing expected soilStyles.SM.color, got ${JSON.stringify(savedJson.soilStyles)}`);
}

// 清空 localStorage 再重新整理,模擬全新瀏覽器
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(500);

const clearedCheck = await page.evaluate(() => localStorage.getItem("soilStyles"));
if (clearedCheck !== null) {
  throw new Error(`ASSERTION FAILED: soilStyles localStorage should be cleared before open, but got: ${clearedCheck}`);
}
console.log("confirmed soilStyles localStorage cleared before open");

const openInput = page.locator('input[type="file"][accept*="json"]');
await openInput.setInputFiles(savedPath);
await page.waitForTimeout(800);

const restoredLocalStorage = await getSoilStylesLS();
console.log("soilStyles localStorage restored via 開啟專案:", JSON.stringify(restoredLocalStorage));
if (restoredLocalStorage?.SM?.color !== "#bd2828") {
  throw new Error(
    `ASSERTION FAILED: localStorage soilStyles not restored via 開啟專案, got ${JSON.stringify(restoredLocalStorage)}`,
  );
}

const colorAfterOpen = await getSmSwatchColor();
console.log("legend SM swatch color after opening project (expect", expectedBd2828Rgb + "):", colorAfterOpen);
if (colorAfterOpen !== expectedBd2828Rgb) {
  throw new Error(`ASSERTION FAILED: color did not restore from opened project file, got ${colorAfterOpen}`);
}
console.log("6c. project save/clear/open round-trip — OK");

// ---- 7. 版面斷言:專案面板不得與圖例面板重疊 -------------------------------
// 此時圖例仍有覆寫(SM=#bd2828),「恢復預設顏色」按鈕存在,圖例面板處於較高狀態,
// 正是要驗證「即使圖例變高,專案面板仍被往下推、不重疊」的時機。

const resetButtonVisibleForLayout = await page.getByRole("button", { name: "恢復預設顏色" }).isVisible();
console.log("恢復預設顏色 button visible for layout assertion (expect true):", resetButtonVisibleForLayout);
if (!resetButtonVisibleForLayout) {
  throw new Error("ASSERTION FAILED: expected 恢復預設顏色 button to be visible during layout assertion");
}

// div:has-text() 對巢狀祖先都會命中(App.tsx 外層 flex 欄一路包到面板本身),first()/last()
// 都不保證選到「面板本身」——改用結構關係精準取面板:「恢復預設顏色」按鈕是 SoilLegend
// 根 div 的直接子節點,「儲存專案」按鈕的祖父節點是 ProjectManager 根 div。
const legendPanel = resetButton.locator("xpath=..");
const projectPanel = page.getByRole("button", { name: "儲存專案" }).locator("xpath=../..");
const legendBox = await legendPanel.boundingBox();
const projectBox = await projectPanel.boundingBox();
console.log("legend panel box:", JSON.stringify(legendBox));
console.log("project panel box:", JSON.stringify(projectBox));
if (!legendBox || !projectBox) {
  throw new Error("ASSERTION FAILED: could not measure legend/project panel bounding boxes");
}
if (!(projectBox.y > legendBox.y + legendBox.height)) {
  throw new Error(
    `ASSERTION FAILED: 專案 panel must be strictly below 圖例 panel (y > y+height) — projectBox.y=${projectBox.y}, legendBox.y+height=${legendBox.y + legendBox.height}`,
  );
}
console.log("7. 專案 panel stacked below 圖例 panel, no overlap — OK");

// ---- 8. Escape 斷言:開對話框、按 Escape → 對話框消失、不套用 --------------

const legendColorBeforeEscape = await getSmSwatchColor();
const soilStylesBeforeEscape = await getSoilStylesLS();

await smLegendButton.click();
await assertDialogOpenWithCode("SM");
// 選一個跟目前顏色不同的標準色,證明「不是因為根本沒選就沒差」
const differentStandardColor = page.locator('button[aria-label="標準色 #17823b"]');
await differentStandardColor.click();
await page.waitForTimeout(100);
await page.keyboard.press("Escape");
await assertDialogClosed();

const legendColorAfterEscape = await getSmSwatchColor();
console.log(
  "legend SM swatch color after Escape (expect unchanged",
  legendColorBeforeEscape + "):",
  legendColorAfterEscape,
);
if (legendColorAfterEscape !== legendColorBeforeEscape) {
  throw new Error(`ASSERTION FAILED: legend swatch changed after Escape, got ${legendColorAfterEscape}`);
}
const soilStylesAfterEscape = await getSoilStylesLS();
if (JSON.stringify(soilStylesAfterEscape) !== JSON.stringify(soilStylesBeforeEscape)) {
  throw new Error(
    `ASSERTION FAILED: localStorage soilStyles changed after Escape, before=${JSON.stringify(soilStylesBeforeEscape)}, after=${JSON.stringify(soilStylesAfterEscape)}`,
  );
}
console.log("8. Escape discards the pending pick, dialog closed, nothing changed — OK");

console.log(`\nALL ASSERTIONS PASSED. TOTAL PAGE ERRORS: ${errorCount}`);
if (errorCount > 0) {
  await browser.close();
  process.exit(1);
}

await browser.close();
