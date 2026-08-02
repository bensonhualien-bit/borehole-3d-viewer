import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "鑽孔資料", "測試場地.xlsx");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1005 }, acceptDownloads: true });
page.on("pageerror", (err) => console.log("[pageerror]", err.message));

await page.goto(E2E_BASE_URL, { waitUntil: "load" });
await page.waitForTimeout(500);
// ProjectManager's hidden JSON-only file input now also renders on the page (and comes
// first in the JSX tree), so a bare "input[type=file]" selector is ambiguous -- target
// the xlsx/csv uploader specifically by its accept attribute.
const fileInput = page.locator('input[type="file"][accept*="csv"]');
await fileInput.setInputFiles(fixturePath);
await page.getByText(/成功匯入/).waitFor({ timeout: 20000 });
await page.waitForTimeout(300);

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
await page.mouse.click(670, 650);
await page.waitForTimeout(200);
await page.mouse.click(1355, 650);
await page.waitForTimeout(200);
await page.getByRole("button", { name: "完成此線" }).click();
await page.waitForTimeout(200);

const beforeSave = await page.evaluate(() => JSON.parse(localStorage.getItem("profileData") ?? "null"));
console.log("profileData before save (points on the one line):", beforeSave?.lines?.[0]?.points?.length ?? 0);

const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.getByRole("button", { name: "儲存專案" }).click(),
]);
const savedPath = path.join(projectRoot, ".superpowers", "sdd", "project-save-test.json");
await download.saveAs(savedPath);
console.log("downloaded project to", savedPath);

// 清空 localStorage 再重新整理,模擬「全新瀏覽器/全新電腦」——這樣之後如果真的能還原,
// 一定是「開啟專案」這個動作本身做到的,不是背景自動持久化殘留的舊資料造成的假象
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(500);

const beforeOpen = await page.evaluate(() => ({
  profileData: localStorage.getItem("profileData"),
  debugScene: window.__debugScene ?? null,
}));
console.log("confirmed localStorage cleared before open:", beforeOpen.profileData === null);

const openInput = page.locator('input[type="file"][accept*="json"]');
await openInput.setInputFiles(savedPath);
await page.waitForTimeout(800);

const afterOpen = await page.evaluate(() => ({
  profileData: JSON.parse(localStorage.getItem("profileData") ?? "null"),
  sceneChildren: window.__debugScene?.sceneChildren ?? null,
}));
console.log("profileData restored via 開啟專案 (points on the one line):", afterOpen.profileData?.lines?.[0]?.points?.length ?? 0);
console.log("scene children after restoring boreholes:", afterOpen.sceneChildren);

await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-project-restored.png") });
console.log("screenshot saved");

await browser.close();
