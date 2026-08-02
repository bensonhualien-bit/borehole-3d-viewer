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

async function dump(label) {
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => window.__debugScene ?? null);
  console.log(label, JSON.stringify(state));
}

await dump("initial");

// zoom in aggressively (many wheel ticks toward the surface)
for (let i = 0; i < 60; i++) {
  await page.mouse.wheel(0, -150);
}
await dump("after zoom-in x60");
await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-zoomin.png") });

// zoom back out past the original distance, then far beyond it
for (let i = 0; i < 150; i++) {
  await page.mouse.wheel(0, 150);
}
await dump("after zoom-out x150");
await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-zoomout.png") });

await browser.close();
