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

await page.getByText("繪製地層", { exact: true }).click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: "新增邊界線" }).click();
await page.waitForTimeout(150);

await page.getByRole("button", { name: "切換為2D剖面" }).click();
await page.waitForTimeout(200);

const checkboxes = page.locator('label:has(input[type="checkbox"])').filter({ hasText: /^BH-|^CH-/ });
for (let i = 0; i < 3; i++) {
  await checkboxes.nth(i).locator("input").click();
  await page.waitForTimeout(150);
}
// 選到第 2 支時會排程 500ms 後自動收合——這裡明確等超過 500ms 讓收合確實發生,
// 再點一次收合徽章重新展開清單,而不是假設「可能還來得及在收合前操作完」。
// 展開後,清單維持展開直到選取數量再次跨越 2 支的門檻(這裡不會再變動選取),
// 所以後面所有步驟(包含最後切換距離模式)都能持續點到裡面的內容。
await page.waitForTimeout(600);
await page.getByText(/已選 3 支鑽孔/).click();
await page.waitForTimeout(150);

// 依序點 3 個柱子中段新增剖面點
const rects = page.locator("svg rect");
async function clickRectCenter(index) {
  const box = await rects.nth(index).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  // 先 move 再 click(不是直接 click),讓 onMouseMove 的預覽先透過 React state
  // 落地,click 命中的才是最新的預覽點——跟既有的 debug-e2e-2d-section-interactive.mjs
  // 用同一個手法,避免同一批連續呼叫時前後兩個事件之間的 race。
  await page.mouse.move(x, y);
  await page.waitForTimeout(100);
  await page.mouse.click(x, y);
  await page.waitForTimeout(150);
}
await clickRectCenter(0);
const firstBox = await rects.nth(0).boundingBox();
let secondIndex = -1;
for (let i = 1; i < (await rects.count()); i++) {
  const box = await rects.nth(i).boundingBox();
  if (Math.abs(box.x - firstBox.x) > 5) { secondIndex = i; break; }
}
await clickRectCenter(secondIndex);
const secondBox = await rects.nth(secondIndex).boundingBox();
let thirdIndex = -1;
for (let i = 0; i < (await rects.count()); i++) {
  const box = await rects.nth(i).boundingBox();
  if (Math.abs(box.x - firstBox.x) > 5 && Math.abs(box.x - secondBox.x) > 5) { thirdIndex = i; break; }
}
await clickRectCenter(thirdIndex);

let pd = await getProfileData();
console.log("points added (expect 3):", pd.lines[0].points.length);

await page.getByRole("button", { name: "完成此線" }).click();
await page.waitForTimeout(200);

// 用直接子層選擇器(不是後代選擇器):剖面連線是直接畫在 svg 底下的 <line>,而
// 之後加入的高程網格線包在 <g key={elevation}> 裡面(是 svg 的孫層)——用後代選擇器
// 會把兩者混在一起算,數量對不上
const lineCount = await page.locator("svg > line").count();
console.log("line elements for a 3-point line (expect 2, path not complete graph):", lineCount);

// 切換距離模式,確認柱子 x 座標改變
const xsBefore = await page.locator("svg rect").evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute("x")))]);
await page.getByText("鑽孔間直線距離").click();
await page.waitForTimeout(200);
const xsAfter = await page.locator("svg rect").evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute("x")))]);
console.log("column x positions, projected mode:", xsBefore);
console.log("column x positions, sequential mode (expect different):", xsAfter);

// 右鍵拖曳平移
const svg = page.locator("svg").first();
const viewBoxBefore = await svg.getAttribute("viewBox");
const svgBox = await svg.boundingBox();
const cx = svgBox.x + svgBox.width / 2;
const cy = svgBox.y + svgBox.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down({ button: "right" });
await page.mouse.move(cx + 150, cy + 80, { steps: 10 });
await page.waitForTimeout(150);
await page.mouse.up({ button: "right" });
await page.waitForTimeout(150);
const viewBoxAfter = await svg.getAttribute("viewBox");
console.log("viewBox before right-drag pan:", viewBoxBefore);
console.log("viewBox after right-drag pan (expect different):", viewBoxAfter);

await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-2d-followup.png") });
console.log(`TOTAL PAGE ERRORS: ${errorCount}`);
await browser.close();
