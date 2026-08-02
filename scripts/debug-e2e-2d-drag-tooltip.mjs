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

await page.getByText("繪製地層", { exact: true }).click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: "新增邊界線" }).click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: "切換為2D剖面" }).click();
await page.waitForTimeout(200);

const checkboxes = page.locator('label:has(input[type="checkbox"])').filter({ hasText: /^BH-|^CH-/ });
for (let i = 0; i < 2; i++) {
  await checkboxes.nth(i).locator("input").click();
  await page.waitForTimeout(150);
}
await page.waitForTimeout(600);

const rects = page.locator("svg rect");
const firstBox = await rects.nth(0).boundingBox();
const x = firstBox.x + firstBox.width / 2;
const y = firstBox.y + firstBox.height / 2;
await page.mouse.move(x, y);
await page.waitForTimeout(100);
await page.mouse.click(x, y);
await page.waitForTimeout(150);
await page.getByRole("button", { name: "完成此線" }).click();
await page.waitForTimeout(200);

const circle = page.locator("svg circle").first();
const circleBox = await circle.boundingBox();
const cx = circleBox.x + circleBox.width / 2;
const cy = circleBox.y + circleBox.height / 2;

// 用跟拖曳中/放開後同一個帶小數點的正則(而不是單純 /m$/)——後來加入的高程網格
// 主要線標籤也是 "數字m" 格式(例如 "5m"),但都是整數、沒有小數點,這樣才不會被
// 誤判成拖曳提示文字
const tooltipDuringIdle = await page.locator("svg text", { hasText: /^-?\d+\.\d+m$/ }).count();
console.log("depth-format text elements before drag starts (expect 0, only borehole name labels exist):", tooltipDuringIdle);

await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx, cy + 80, { steps: 10 });
await page.waitForTimeout(150);
const tooltipDuringDrag = await page.locator("svg text", { hasText: /^-?\d+\.\d+m$/ }).count();
console.log("depth-format text elements during drag (expect >= 1):", tooltipDuringDrag);
await page.mouse.up();
await page.waitForTimeout(150);
const tooltipAfterDrag = await page.locator("svg text", { hasText: /^-?\d+\.\d+m$/ }).count();
console.log("depth-format text elements after releasing (expect 0):", tooltipAfterDrag);

console.log(`TOTAL PAGE ERRORS: ${errorCount}`);
await browser.close();
