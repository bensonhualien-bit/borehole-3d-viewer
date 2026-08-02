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
await page.waitForTimeout(500);

const sceneWithGrid = await page.evaluate(() => window.__debugScene?.sceneChildren ?? 0);
console.log("scene children with grid on:", sceneWithGrid);

await page.getByRole("button", { name: "隱藏網格" }).click();
await page.waitForTimeout(500);
const sceneWithoutGrid = await page.evaluate(() => window.__debugScene?.sceneChildren ?? 0);
console.log("scene children with grid off (expect fewer than", sceneWithGrid, "):", sceneWithoutGrid);

await page.getByRole("button", { name: "顯示網格" }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-3d-elevation-grid.png") });

console.log(`TOTAL PAGE ERRORS: ${errorCount}`);
await browser.close();
