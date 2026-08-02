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

// 在目前的鏡頭視角下,依序在好幾個候選螢幕座標點擊,直到 profileData 的點數真的增加
// 為止——3D 柱體很細,單一像素座標偶爾會點空,這裡用「點了之後檢查有沒有真的加進去,
// 沒加到就換下一個候選座標再試」讓自動化測試對點擊誤差更穩健,不代表產品本身有問題。
async function clickUntilPointAdded(candidates, expectedCountAfter) {
  for (const [x, y] of candidates) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(200);
    const pd = await getProfileData();
    const count = pd?.lines?.[0]?.points?.length ?? 0;
    if (count >= expectedCountAfter) return true;
  }
  return false;
}

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

// 三組候選座標各自對應不同鑽孔(670/865/1355 這幾個 x 座標在這個縮放/鏡頭下,
// 過去測試已確認分別落在不同柱體上),每次呼叫只用其中一組,確保三次點擊
// 點到的是三支不同的鑽孔,不會像之前那樣同一組候選重複點到同一支
const boreholeGroups = [
  [[670, 650], [672, 600], [668, 700]],
  [[865, 650], [867, 600], [863, 700]],
  [[1355, 650], [1357, 600], [1160, 550]],
];

const gotFirst = await clickUntilPointAdded(boreholeGroups[0], 1);
console.log("got first point:", gotFirst);
const gotSecond = await clickUntilPointAdded(boreholeGroups[1], 2);
console.log("got second point:", gotSecond);

await page.getByRole("button", { name: "完成此線" }).click();
await page.waitForTimeout(200);

let pd = await getProfileData();
const countAfterFinish = pd.lines[0].points.length;
console.log("points after finishing:", countAfterFinish);

// 展開這條線,看點位清單(鑽孔名稱+深度)
await page.getByRole("button", { name: "▸" }).click();
await page.waitForTimeout(200);
let pointRows = await page.locator("text=/[0-9]+\\.[0-9]m/").count();
console.log(`expanded point rows with a depth label (expect ${countAfterFinish}):`, pointRows);

// 點「繼續編輯」,回到 3D 點選流程,再加一點
await page.getByRole("button", { name: "繼續編輯" }).click();
await page.waitForTimeout(150);
await clickUntilPointAdded(boreholeGroups[2], countAfterFinish + 1);
await page.getByRole("button", { name: "完成此線" }).click();
await page.waitForTimeout(200);

pd = await getProfileData();
const countAfterResume = pd.lines[0].points.length;
console.log(`points after resume+add (expect > ${countAfterFinish}):`, countAfterResume);

// 展開後移除一個點(這條線目前應該還是展開狀態,標題會是「收合」;若已收合則重新展開)
const collapseVisible = await page.getByRole("button", { name: "▾" }).isVisible().catch(() => false);
if (!collapseVisible) {
  await page.getByRole("button", { name: "▸" }).click();
  await page.waitForTimeout(200);
}
const removeButtons = page.getByTitle("移除這個點");
const removeCountBefore = await removeButtons.count();
console.log("removable point rows visible:", removeCountBefore);
if (removeCountBefore > 0) {
  await removeButtons.first().click();
  await page.waitForTimeout(200);
}

pd = await getProfileData();
console.log(`points after removing one via the point list (expect ${countAfterResume - (removeCountBefore > 0 ? 1 : 0)}):`, pd.lines[0].points.length);
console.log("remaining boreholeIds:", pd.lines[0].points.map((p) => p.boreholeId));

await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-line-editing-expanded.png") });
console.log(`\nTOTAL PAGE ERRORS: ${errorCount}`);
await browser.close();
