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

async function getProfileData() {
  return page.evaluate(() => JSON.parse(localStorage.getItem("profileData") ?? "null"));
}

await page.goto(E2E_BASE_URL, { waitUntil: "load" });
await page.waitForTimeout(500);
await page.locator('input[type="file"][accept*="csv"]').setInputFiles(fixturePath);
await page.getByText(/成功匯入/).waitFor({ timeout: 20000 });

// --- 3D: 對同一支鑽孔點兩次 ---
await page.getByText("繪製地層", { exact: true }).click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: "新增邊界線" }).click();
await page.waitForTimeout(150);

const canvas = page.locator("canvas");
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -100);
await page.waitForTimeout(300);

await page.mouse.click(670, 650);
await page.waitForTimeout(200);
let pd = await getProfileData();
const countAfterFirst3DClick = pd.lines[0]?.points.length ?? 0;
console.log("3D: points after first click:", countAfterFirst3DClick);

await page.mouse.click(670, 550); // 同一支鑽孔,不同深度
await page.waitForTimeout(200);
pd = await getProfileData();
console.log("3D: points after clicking the SAME borehole again (expect still", countAfterFirst3DClick, "):", pd.lines[0].points.length);
console.log("3D: depth updated to the second click's value (not a duplicate):", pd.lines[0].points[0].depth);

await page.getByRole("button", { name: "完成此線" }).click();
await page.waitForTimeout(200);

// --- 2D: 對同一支鑽孔點兩次 ---
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
async function clickAt(x, y) {
  await page.mouse.move(x, y);
  await page.waitForTimeout(100);
  await page.mouse.click(x, y);
  await page.waitForTimeout(150);
}
await clickAt(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
pd = await getProfileData();
const countAfter2DFirst = pd.lines[1]?.points.length ?? 0;
console.log("2D: points after first click:", countAfter2DFirst);

await clickAt(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2 + 60); // 同一支鑽孔,不同深度
pd = await getProfileData();
console.log("2D: points after clicking the SAME borehole again (expect still", countAfter2DFirst, "):", pd.lines[1].points.length);

console.log(`TOTAL PAGE ERRORS: ${errorCount}`);
await browser.close();
