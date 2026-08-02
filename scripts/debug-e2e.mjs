import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "鑽孔資料", "測試場地.xlsx");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1005 } });

page.on("console", (msg) => console.log("[console]", msg.type(), msg.text()));
page.on("pageerror", (err) => console.log("[pageerror]", err.message));

await page.goto(E2E_BASE_URL, { waitUntil: "load" });

const fileInput = page.locator('input[type="file"][accept*="csv"]');
await fileInput.setInputFiles(fixturePath);

// 等成功訊息出現(匯入完成)
await page.getByText(/成功匯入/).waitFor({ timeout: 15000 });
console.log("import success message appeared");

// 給 3D 場景一點時間 mount + 幾個 frame
await page.waitForTimeout(3000);

const debugState = await page.evaluate(() => window.__debugScene ?? null);
console.log("debugScene:", JSON.stringify(debugState, null, 2));

await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-screenshot.png") });
console.log("screenshot saved");

await browser.close();
