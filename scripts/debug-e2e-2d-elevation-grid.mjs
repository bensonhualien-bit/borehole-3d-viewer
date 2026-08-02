import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "鑽孔資料", "測試場地.xlsx");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1005 } });
let errorCount = 0;
page.on("pageerror", (err) => { errorCount++; console.log("[PAGEERROR]", err.message); });

await page.goto(E2E_BASE_URL, { waitUntil: "load" });
await page.waitForTimeout(500);
await page.locator('input[type="file"][accept*="csv"]').setInputFiles(fixturePath);
await page.getByText(/成功匯入/).waitFor({ timeout: 20000 });

await page.getByRole("button", { name: "切換為2D剖面" }).click();
await page.waitForTimeout(200);

const checkboxes = page.locator('label:has(input[type="checkbox"])').filter({ hasText: /^BH-|^CH-/ });
for (let i = 0; i < 3; i++) {
  await checkboxes.nth(i).locator("input").click();
  await page.waitForTimeout(150);
}
await page.waitForTimeout(600);

// 高程網格的 <line> 包在 <g key={elevation}> 裡面(是 svg 的孫層,不是直接子層),
// 這個測試場景沒有畫任何剖面線(profileData.lines 是全新空的),所以用「後代」選擇器
// (不加 >)只會抓到網格線,不會誤抓到(這次沒有的)剖面連線
const gridLinesWithGrid = await page.locator("svg line").count();
console.log("grid line count with showGrid on (expect > 0):", gridLinesWithGrid);

const majorLabels = await page.locator("svg text", { hasText: /^-?\d+m$/ }).count();
console.log("major gridline elevation labels found (expect > 0):", majorLabels);

await page.getByRole("button", { name: "隱藏網格" }).click();
await page.waitForTimeout(200);
const gridLinesHidden = await page.locator("svg line").count();
console.log("grid line count with showGrid off (expect 0):", gridLinesHidden);

await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-2d-elevation-grid.png") });
console.log(`TOTAL PAGE ERRORS: ${errorCount}`);
await browser.close();
