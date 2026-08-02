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
await page.waitForTimeout(300);

// 預設應該是全選(3D 一開始就顯示 48 支鑽孔的名稱標籤)
const badgeText = await page.getByText(/已選 \d+ 支鑽孔/).textContent();
console.log("3D default selection badge (expect 已選 48 支鑽孔):", badgeText);

await page.getByText(/已選 \d+ 支鑽孔/).click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: "清除" }).first().click();
await page.waitForTimeout(300);

// 清空選取後 <Scene> 整個會被換成提示訊息(canvas 不會存在),所以這裡改成截整個
// 頁面的screenshot,不是鎖定 canvas 本身——鎖定 canvas 在這個情境下一定會逾時等不到。
const pageScreenshotAfterClear = await page.screenshot();
console.log("screenshot taken after clearing 3D selection, byte length:", pageScreenshotAfterClear.length);
const emptyMessageVisible = await page.getByText("請至少勾選一支鑽孔").isVisible();
console.log("empty-selection message visible after clearing (expect true):", emptyMessageVisible);
const canvasGoneAfterClear = await page.locator("canvas").count();
console.log("canvas element count after clearing (expect 0, Scene fully unmounted):", canvasGoneAfterClear);

await page.getByRole("button", { name: "全選" }).first().click();
await page.waitForTimeout(300);
const emptyMessageGone = await page.getByText("請至少勾選一支鑽孔").isVisible().catch(() => false);
console.log("empty-selection message gone after select-all (expect false):", emptyMessageGone);

// 2D 的全選/清除也測一下,並確認跟 3D 的選取彼此獨立
await page.getByRole("button", { name: "切換為2D剖面" }).click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: "全選" }).first().click();
await page.waitForTimeout(200);
const rectCount2D = await page.locator("svg rect").count();
console.log("2D rect count after select-all (expect > 0):", rectCount2D);

await page.getByRole("button", { name: "切換為3D視圖" }).click();
await page.waitForTimeout(300);
const badge3DStillAll = await page.getByText(/已選 48 支鑽孔/).isVisible().catch(() => false);
console.log("3D selection still shows all 48 (independent of the 2D select-all just clicked):", badge3DStillAll);

console.log(`TOTAL PAGE ERRORS: ${errorCount}`);
await browser.close();
