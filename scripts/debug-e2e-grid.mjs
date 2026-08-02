import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "鑽孔資料", "測試場地.xlsx");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1005 } });
page.on("pageerror", (err) => console.log("[pageerror]", err.message));

await page.goto(E2E_BASE_URL, { waitUntil: "load" });
const fileInput = page.locator('input[type="file"][accept*="csv"]');
await fileInput.setInputFiles(fixturePath);
await page.getByText(/成功匯入/).waitFor({ timeout: 15000 });
await page.waitForTimeout(500);

const canvas = page.locator("canvas");
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);

// low, near-horizon grazing angle similar to the user's earlier screenshots:
// zoom in a bit, then drag down to rotate the camera toward horizontal
for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -100);
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx, cy - 130, { steps: 20 });
await page.mouse.up();
await page.waitForTimeout(1000);

await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-grid-on.png") });
console.log("grid-on screenshot saved");

const toggleButton = page.getByRole("button", { name: /隱藏網格|顯示網格/ });
await toggleButton.click();
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-grid-off.png") });
console.log("grid-off screenshot saved");

await toggleButton.click();
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-grid-back-on.png") });
console.log("grid-back-on screenshot saved");

await browser.close();
