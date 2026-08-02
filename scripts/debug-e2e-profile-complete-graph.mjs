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

await page.getByText("繪製地層", { exact: true }).click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: "新增邊界線" }).click();
await page.waitForTimeout(200);

const canvas = page.locator("canvas");
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

await page.mouse.move(cx, cy);
for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -100);
await page.waitForTimeout(300);

// 依縮放後截圖觀察到的柱體位置,點選 BH-02、BH-05、BH-03 三支明顯分開的鑽孔
const clickPoints = [
  { x: 670, y: 650, label: "BH-02" },
  { x: 865, y: 650, label: "BH-05" },
  { x: 1355, y: 650, label: "BH-03" },
];

for (const p of clickPoints) {
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(200);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(200);
  console.log(`clicked near ${p.label} at (${p.x}, ${p.y})`);
}

const profileData = await page.evaluate(() => {
  const raw = localStorage.getItem("profileData");
  return raw ? JSON.parse(raw) : null;
});
console.log("profileData:", JSON.stringify(profileData, null, 2));

await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-profile-complete-graph.png") });
console.log("screenshot saved");

await browser.close();
