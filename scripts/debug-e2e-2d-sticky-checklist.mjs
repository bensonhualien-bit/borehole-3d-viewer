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

const header = page.getByText("選擇鑽孔(2D 剖面)");
const boxBefore = await header.boundingBox();
console.log("header y before scroll:", boxBefore.y);

// 找到清單的可捲動容器:用 inline style position:"sticky" 精準定位到那個固定標題
// div,它的 parentElement 就是外層可捲動容器——比起用文字內容找 div(巢狀 div 一定會
// 找到最外層的 App 容器 div,不是我們要的那一個),這樣才能準確鎖定目標元素。
const scrolled = await page.evaluate(() => {
  const stickyHeader = [...document.querySelectorAll("div")].find((d) => d.style.position === "sticky");
  const container = stickyHeader?.parentElement ?? null;
  if (!container) return null;
  container.scrollTop = container.scrollHeight;
  return container.scrollTop;
});
console.log("scrolled container to scrollTop:", scrolled);
await page.waitForTimeout(200);

const boxAfter = await header.boundingBox();
console.log("header y after scrolling to bottom (expect ~same as before, not off-screen):", boxAfter.y);
console.log("header still visible after scroll:", await header.isVisible());

const radioProjected = page.getByText("投影剖面距離");
console.log("axis mode radio still visible after scroll:", await radioProjected.isVisible());

await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-2d-sticky-checklist.png") });
console.log(`TOTAL PAGE ERRORS: ${errorCount}`);
await browser.close();
