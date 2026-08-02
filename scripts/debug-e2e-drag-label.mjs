import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "鑽孔資料", "測試場地.xlsx");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1005 } });
page.on("pageerror", (err) => console.log("[PAGEERROR]", err.message));

await page.goto(E2E_BASE_URL, { waitUntil: "load" });
await page.waitForTimeout(500);
await page.locator('input[type="file"][accept*="csv"]').setInputFiles(fixturePath);
await page.getByText(/成功匯入/).waitFor({ timeout: 20000 });

await page.getByText("繪製地層", { exact: true }).click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: "新增邊界線" }).click();
await page.waitForTimeout(150);

const canvas = page.locator("canvas");
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -100);
await page.waitForTimeout(300);

async function getPointCount() {
  const pd = await page.evaluate(() => JSON.parse(localStorage.getItem("profileData") ?? "null"));
  return pd?.lines?.[0]?.points?.length ?? 0;
}
for (const [x, y] of [[670, 650], [672, 600], [668, 700]]) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(200);
  if ((await getPointCount()) >= 1) break;
}
for (const [x, y] of [[865, 650], [867, 600], [863, 700]]) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(200);
  if ((await getPointCount()) >= 2) break;
}
await page.getByRole("button", { name: "完成此線" }).click();
await page.waitForTimeout(300);

const depthBefore = (await page.evaluate(() => JSON.parse(localStorage.getItem("profileData") ?? "null"))).lines[0].points[0].depth;
console.log("depth before drag:", depthBefore);

// 從截圖精準定位到的標記球座標開始拖曳
await page.mouse.move(690, 634);
await page.mouse.down();
await page.mouse.move(690, 450, { steps: 15 });
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-drag-depth-label.png") });
await page.mouse.up();
await page.waitForTimeout(300);

const depthAfter = (await page.evaluate(() => JSON.parse(localStorage.getItem("profileData") ?? "null"))).lines[0].points[0].depth;
console.log("depth after drag (expect different from before):", depthAfter);

await browser.close();
