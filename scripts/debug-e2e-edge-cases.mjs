import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "鑽孔資料", "測試場地.xlsx");
const scratchDir = path.join(projectRoot, ".superpowers", "sdd");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1005 }, acceptDownloads: true });

let errorCount = 0;
page.on("pageerror", (err) => {
  errorCount++;
  console.log("[PAGEERROR]", err.message);
});

function checkpoint(label) {
  console.log(`--- checkpoint: ${label} (pageerrors so far: ${errorCount}) ---`);
}

await page.goto(E2E_BASE_URL, { waitUntil: "load" });
await page.waitForTimeout(500);
const fileInput = page.locator('input[type="file"][accept*="csv"]');
await fileInput.setInputFiles(fixturePath);
await page.getByText(/成功匯入/).waitFor({ timeout: 20000 });
checkpoint("xlsx imported");

const canvas = page.locator("canvas");
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

async function zoomIn(ticks = 10) {
  await page.mouse.move(cx, cy);
  for (let i = 0; i < ticks; i++) await page.mouse.wheel(0, -100);
  await page.waitForTimeout(300);
}

// ============================================================
// Edge case 1: malformed project files
// ============================================================
await page.getByText("繪製地層", { exact: true }).click();
await page.waitForTimeout(150);

const badFiles = {
  "bad-not-json.json": "this is not json {{{",
  "bad-wrong-version.json": JSON.stringify({ version: 2, boreholes: [], profileData: { lines: [], layers: [] } }),
  "bad-missing-boreholes.json": JSON.stringify({ version: 1, profileData: { lines: [], layers: [] } }),
  "bad-missing-profiledata.json": JSON.stringify({ version: 1, boreholes: [] }),
  "bad-plain-number.json": "42",
};

for (const [name, content] of Object.entries(badFiles)) {
  const p = path.join(scratchDir, name);
  fs.writeFileSync(p, content, "utf-8");
  const openInput = page.locator('input[type="file"][accept*="json"]');
  await openInput.setInputFiles(p);
  await page.waitForTimeout(300);
  const errorVisible = await page.locator("text=/不是有效的|不支援的|缺少/").isVisible().catch(() => false);
  console.log(`  ${name}: error message shown = ${errorVisible}`);
  // 確認現有資料沒被清空/破壞(還是原本 48 孔)
  const stillHasData = await page.getByText(/成功匯入 48 支鑽孔/).isVisible().catch(() => false);
  console.log(`  ${name}: original import banner still intact = ${stillHasData}`);
}
checkpoint("malformed project files handled");

// ============================================================
// Edge case 2: draw a line with 5 points, undo back to 0, delete while active
// ============================================================
await page.getByRole("button", { name: "新增邊界線" }).click();
await page.waitForTimeout(150);
await zoomIn();

const fivePoints = [
  [670, 650],
  [865, 650],
  [1355, 650],
  [960, 500],
  [1160, 550],
];
for (const [x, y] of fivePoints) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(150);
}
let pd = await page.evaluate(() => JSON.parse(localStorage.getItem("profileData") ?? "null"));
console.log("points after 5 clicks:", pd.lines[0]?.points.length);
checkpoint("5-point line drawn (10 edges)");

// 悔恨上一點,一路點到 0
for (let i = 0; i < 6; i++) {
  await page.getByRole("button", { name: "悔恨上一點" }).click();
  await page.waitForTimeout(100);
}
pd = await page.evaluate(() => JSON.parse(localStorage.getItem("profileData") ?? "null"));
console.log("points after undoing past zero (should stay at 0, not negative/crash):", pd.lines[0]?.points.length);
checkpoint("undo past zero handled without crash");

// 刪除這條「還在畫」的線(還沒按完成此線)
const deleteButtons = page.getByRole("button", { name: "刪除" });
await deleteButtons.first().click();
await page.waitForTimeout(200);
pd = await page.evaluate(() => JSON.parse(localStorage.getItem("profileData") ?? "null"));
console.log("lines remaining after deleting the active line:", pd.lines.length);
const undoButtonGone = await page.getByRole("button", { name: "悔恨上一點" }).isVisible().catch(() => false);
console.log("undo/finish controls correctly gone after deleting active line:", !undoButtonGone);
checkpoint("deleted line while still active");

// ============================================================
// Edge case 3: switch to 簡化點位 display mode while profile mode is on
// ============================================================
await page.getByRole("button", { name: "新增邊界線" }).click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: "切換為簡化點位" }).click();
await page.waitForTimeout(300);
// 在簡化點位模式下點擊鑽孔(這裡應該是小球,不是柱體),確認不會新增剖面點也不會噴錯
await page.mouse.click(cx, cy);
await page.waitForTimeout(200);
pd = await page.evaluate(() => JSON.parse(localStorage.getItem("profileData") ?? "null"));
console.log("points added while in 簡化點位 mode (expected 0, picking is full-mode only):", pd.lines.at(-1)?.points.length ?? "no active line");
checkpoint("display mode switch while profile-drawing active");
await page.getByRole("button", { name: "切換為完整柱狀圖" }).click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: "完成此線" }).click();

// ============================================================
// Edge case 4: two layers sharing the same boundary line, drag a point
// ============================================================
await page.getByRole("button", { name: "新增邊界線" }).click();
await page.waitForTimeout(150);
await page.mouse.click(670, 650);
await page.waitForTimeout(150);
await page.mouse.click(865, 650);
await page.waitForTimeout(150);
await page.getByRole("button", { name: "完成此線" }).click();
await page.waitForTimeout(200);

await page.getByPlaceholder("地層名稱").fill("地層A");
await page.getByRole("button", { name: "新增地層" }).click();
await page.waitForTimeout(150);
await page.getByPlaceholder("地層名稱").fill("地層B");
await page.getByRole("button", { name: "新增地層" }).click();
await page.waitForTimeout(150);

const boundarySelects = page.locator("select");
const selectCount = await boundarySelects.count();
console.log("boundary <select> dropdowns found:", selectCount);
// 地層A 的下界、地層B 的上界都指向剛剛畫的那條線(索引 1 對應第一個地層的下界,
// 依 ProfileDrawer 的渲染順序:每個地層有上界/下界兩個 select)
const lineName = await page.locator("text=/邊界線/").first().textContent();
console.log("boundary line to share:", lineName);

pd = await page.evaluate(() => JSON.parse(localStorage.getItem("profileData") ?? "null"));
const sharedLineId = pd.lines[pd.lines.length - 1].id;
console.log("shared line id:", sharedLineId);

await boundarySelects.nth(1).selectOption(sharedLineId); // 地層A 下界
await page.waitForTimeout(150);
await boundarySelects.nth(2).selectOption(sharedLineId); // 地層B 上界
await page.waitForTimeout(150);

pd = await page.evaluate(() => JSON.parse(localStorage.getItem("profileData") ?? "null"));
const layerA = pd.layers.find((l) => l.name === "地層A");
const layerB = pd.layers.find((l) => l.name === "地層B");
console.log("layerA.bottomBoundaryId === sharedLineId:", layerA?.bottomBoundaryId === sharedLineId);
console.log("layerB.topBoundaryId === sharedLineId:", layerB?.topBoundaryId === sharedLineId);
console.log("both reference the SAME id (shared, not copied):", layerA?.bottomBoundaryId === layerB?.topBoundaryId);
checkpoint("two layers sharing one boundary line");

// 刪除那條被兩個地層參照的邊界線,確認地層還在、只是顯示未設定,不會噴錯
await deleteButtons.last().click();
await page.waitForTimeout(200);
pd = await page.evaluate(() => JSON.parse(localStorage.getItem("profileData") ?? "null"));
console.log("layers still present after deleting their shared boundary line:", pd.layers.length);
checkpoint("deleted a boundary line referenced by two layers");

console.log(`\nTOTAL PAGE ERRORS ACROSS ALL SCENARIOS: ${errorCount}`);
await page.screenshot({ path: path.join(scratchDir, "e2e-edge-cases-final.png") });
await browser.close();
