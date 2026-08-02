import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "鑽孔資料", "測試場地.xlsx");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1005 } });
let errorCount = 0;
page.on("pageerror", (err) => {
  errorCount++;
  console.log("[PAGEERROR]", err.message);
});

async function getProfileData() {
  return page.evaluate(() => JSON.parse(localStorage.getItem("profileData") ?? "null"));
}

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

const checkboxes = page.locator('label:has(input[type="checkbox"])');
for (let i = 0; i < 3; i++) {
  await checkboxes.nth(i).locator("input").check();
  await page.waitForTimeout(100);
}

// 點兩個柱子的中段新增剖面點(柱子邊界由 <rect> 決定,取第一個/第二個柱子群組的
// 第一個 rect 的中心點來點擊)
const rects = page.locator("svg rect");
const rectCount = await rects.count();
console.log("rect count with 3 selected:", rectCount);

async function clickRectCenter(index) {
  const box = await rects.nth(index).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(100);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(150);
}

await clickRectCenter(0);
let pd = await getProfileData();
console.log("points after clicking first column (expect 1):", pd.lines[0].points.length);

// 找第二支鑽孔的第一個 rect:用不同的 boreholeId 篩選比較脆弱,這裡改用「柱子群組
// 順序」——每支鑽孔至少 1 個 rect,用 rect 的 x 座標分群,取跟第一次點擊不同 x 的
// 第一個 rect
const firstBox = await rects.nth(0).boundingBox();
let secondIndex = -1;
for (let i = 1; i < rectCount; i++) {
  const box = await rects.nth(i).boundingBox();
  if (Math.abs(box.x - firstBox.x) > 5) {
    secondIndex = i;
    break;
  }
}
console.log("second column rect index:", secondIndex);
if (secondIndex >= 0) {
  await clickRectCenter(secondIndex);
  pd = await getProfileData();
  console.log("points after clicking second column (expect 2):", pd.lines[0].points.length);
}

await page.getByRole("button", { name: "完成此線" }).click();
await page.waitForTimeout(200);

// 拖動第一個點(用剛新增的點所在座標,由畫面上第一個 circle 判斷位置)
const circle = page.locator("svg circle").first();
const circleBox = await circle.boundingBox();
if (circleBox) {
  const cx = circleBox.x + circleBox.width / 2;
  const cy = circleBox.y + circleBox.height / 2;
  const depthBefore = (await getProfileData()).lines[0].points[0].depth;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 80, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(200);
  const depthAfter = (await getProfileData()).lines[0].points[0].depth;
  console.log("depth before drag:", depthBefore, "after drag (expect different):", depthAfter);
}

// 滾輪縮放:記錄縮放前後 viewBox 是否改變
const svg = page.locator("svg").first();
const viewBoxBefore = await svg.getAttribute("viewBox");
const svgBox = await svg.boundingBox();
await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
await page.mouse.wheel(0, -300);
await page.waitForTimeout(200);
const viewBoxAfter = await svg.getAttribute("viewBox");
console.log("viewBox before zoom:", viewBoxBefore);
console.log("viewBox after zoom (expect different):", viewBoxAfter);

await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-2d-section-interactive.png") });
console.log(`\nTOTAL PAGE ERRORS: ${errorCount}`);
await browser.close();
