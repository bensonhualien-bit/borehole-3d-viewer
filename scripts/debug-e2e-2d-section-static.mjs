import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "鑽孔資料", "測試場地.xlsx");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1005 } });
let errorCount = 0;
page.on("pageerror", (err) => {
  errorCount++;
  console.log("[PAGEERROR]", err.message);
});

await page.goto(E2E_BASE_URL, { waitUntil: "load" });
await page.waitForTimeout(500);
await page.locator('input[type="file"][accept*="csv"]').setInputFiles(fixturePath);
await page.getByText(/成功匯入/).waitFor({ timeout: 20000 });

await page.getByRole("button", { name: "切換為2D剖面" }).click();
await page.waitForTimeout(200);

// 尚未勾選任何鑽孔:應顯示提示文字,且沒有任何 <rect>(柱狀圖色塊)
const promptVisible = await page.getByText("請選擇至少 2 支鑽孔").isVisible();
console.log("prompt visible with 0 selected:", promptVisible);
const rectCountBefore = await page.locator("svg rect").count();
console.log("rect count with 0 selected (expect 0):", rectCountBefore);

// 勾選前 3 支鑽孔
const checkboxes = page.locator('label:has(input[type="checkbox"])');
const checkboxCount = await checkboxes.count();
console.log("checklist entries found:", checkboxCount);
for (let i = 0; i < Math.min(3, checkboxCount); i++) {
  await checkboxes.nth(i).locator("input").check();
  await page.waitForTimeout(100);
}

const promptGone = await page.getByText("請選擇至少 2 支鑽孔").isVisible().catch(() => false);
console.log("prompt still visible with 3 selected (expect false):", promptGone);
const rectCountAfter = await page.locator("svg rect").count();
console.log("rect count with 3 selected (expect > 0):", rectCountAfter);

// 確認柱子間距是依真實鑽孔座標投影(不是均勻排列):蒐集所有 rect 的 x 座標,
// 四捨五入去重後應該有 3 群(3 支鑽孔),且群跟群之間的間距不應該完全相等
// (真實資料裡 3 支鑽孔幾乎不可能剛好等距)
const rectXs = await page.locator("svg rect").evaluateAll((els) =>
  els.map((el) => Math.round(Number(el.getAttribute("x")) * 10) / 10)
);
const uniqueXs = [...new Set(rectXs)].sort((a, b) => a - b);
console.log("distinct column x positions (expect 3):", uniqueXs);
const gaps = [];
for (let i = 1; i < uniqueXs.length; i++) gaps.push(uniqueXs[i] - uniqueXs[i - 1]);
console.log("gaps between columns (expect NOT all equal):", gaps);

// 圖例:第一支鑽孔第一個 rect 的顏色,列印出來手動比對地層圖例/3D 柱狀圖同一支鑽孔
// 第一層的顏色是否一致(顏色對照表本身不是這支腳本的職責,靠螢幕截圖人工確認)
const firstFill = await page.locator("svg rect").first().getAttribute("fill");
console.log("first column's first layer fill color (compare against 3D/legend manually):", firstFill);

await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-2d-section-static.png") });
console.log(`\nTOTAL PAGE ERRORS: ${errorCount}`);
await browser.close();
