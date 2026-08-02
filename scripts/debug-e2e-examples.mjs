// 驗證 examples/ 三個範例檔真的能透過「真實 App UI」
// 端對端載入成功——不是單元測試層級的 parser round-trip,而是實際點檔案輸入、
// 看畫面文字/按鈕真的出現。結構仿 scripts/debug-e2e-soil-colors.mjs 的
// launch/console-error 收集模式;開專案檔的 input 定位仿
// scripts/debug-e2e-project-save-load.mjs。
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const csvPath = path.join(projectRoot, "examples", "範例鑽孔資料.csv");
const xlsxPath = path.join(projectRoot, "examples", "範例鑽探報告.xlsx");
const projectPath = path.join(projectRoot, "examples", "範例專案.json");

let errorCount = 0;
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1005 }, acceptDownloads: true });
page.on("pageerror", (err) => {
  errorCount++;
  console.log("[PAGEERROR]", err.message);
});

try {
  await page.goto(E2E_BASE_URL, { waitUntil: "load" });
  await page.waitForTimeout(500);

  // ---- 1. CSV → 成功匯入 12 支鑽孔 -----------------------------------------
  const uploadInput = page.locator('input[type="file"][accept*="csv"]');
  await uploadInput.setInputFiles(csvPath);
  await page.getByText("成功匯入 12 支鑽孔").waitFor({ timeout: 20000 });
  record("CSV 範例檔匯入 12 支鑽孔", true);

  // ---- 2. reload → xlsx → 成功匯入 14 支鑽孔(12 BH + 2 CPT) ---------------
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(500);
  await uploadInput.setInputFiles(xlsxPath);
  await page.getByText("成功匯入 14 支鑽孔").waitFor({ timeout: 20000 });
  record("xlsx 範例檔匯入 14 支鑽孔(12 鑽孔 + 2 CPT)", true);

  // ---- 3. reload → 開啟專案 JSON -------------------------------------------
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(500);
  const openProjectInput = page.locator('input[type="file"][accept*="json"]');
  await openProjectInput.setInputFiles(projectPath);
  await page.waitForTimeout(800);

  // 專案檔開啟後 App.tsx 會把 profileModeEnabled 重設為 false(見
  // src/App.tsx:396),所以剖面線清單/等高線按鈕預設不會顯示——要看到它們
  // 得先勾選「繪製地層」,和 debug-e2e-project-save-load.mjs 的做法一致。
  await page.getByText("繪製地層", { exact: true }).click();
  await page.waitForTimeout(300);

  // (a)+(b) 剖面線清單出現「黏土層頂面」,且它的等高線按鈕呈開啟狀態。
  //
  // 「黏土層頂面」是 line.name,渲染在 <input type="text" value={line.name}> 裡
  // (src/components/ProfileDrawer.tsx:230-235)——是 DOM property,不是 HTML
  // attribute,CSS 屬性選擇器 [value=...] 抓不到;而 getByText 又會連同「地層」
  // 區塊的上界/下界 <select><option> 同名選項、以及 ContourLegend 面板顯示目前
  // 等高線所屬線名的 <div>{extent.lineName}</div>(src/components/ContourLegend.tsx:39)
  // 一起命中,造成 strict-mode 多重匹配。改用 evaluate 直接在 DOM 裡找 value 等於
  // 「黏土層頂面」的 text input,再取它所在的那一列 row div(該 input 的直接父層,
  // 見 ProfileDrawer.tsx 215-267 那個 flex row)一併驗證同一列的等高線按鈕文字。
  //
  // 按鈕文字本身就是目前狀態的顯示(line.showContour ? "等高線開" : "等高線關",
  // ProfileDrawer.tsx:252),不是「按下去會做什麼」的動作描述(那個是 title,
  // 同檔 250 行:showContour ? "隱藏等高線" : "顯示等高線")。examples/範例專案.json
  // 的 line-clay-top.showContour === true,所以正確期待值是按鈕文字為「等高線開」
  // ——brief 草稿寫的「等高線關」和實際渲染語意相反,這裡依實際元件行為調整斷言,
  // 不是回報產品 bug。
  const clayTopRowCheck = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
    const target = inputs.find((el) => el.value === "黏土層頂面");
    if (!target) return { found: false, rowText: null };
    const row = target.closest("div");
    return { found: true, rowText: row ? row.textContent : null };
  });
  console.log("黏土層頂面 line row lookup:", JSON.stringify(clayTopRowCheck));
  if (!clayTopRowCheck.found) {
    throw new Error('ASSERTION FAILED: no line-name <input> with value "黏土層頂面" found in the profile line list');
  }
  record("專案 JSON 開啟後剖面線清單顯示「黏土層頂面」", true);

  if (!clayTopRowCheck.rowText?.includes("等高線開")) {
    throw new Error(
      `ASSERTION FAILED: expected 「黏土層頂面」row to show 「等高線開」(showContour:true), got row text: ${clayTopRowCheck.rowText}`,
    );
  }
  record("「黏土層頂面」列的等高線按鈕顯示「等高線開」(對應 showContour:true)", true);

  // (c) canvas 存在
  const canvasCount = await page.locator("canvas").count();
  if (canvasCount === 0) {
    throw new Error("ASSERTION FAILED: expected at least one <canvas> element after opening project");
  }
  record("開啟專案後 canvas 存在", true, `count=${canvasCount}`);

  await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-examples-project-loaded.png") });
} catch (err) {
  record(err.message?.split("\n")[0] ?? String(err), false, "見上方例外訊息");
  console.log(err);
}

record("console 頁面錯誤數為 0", errorCount === 0, `errorCount=${errorCount}`);

const failed = results.filter((r) => !r.ok);
console.log("\n==================== SUMMARY ====================");
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"} - ${r.name}`);
}
console.log(failed.length === 0 ? "\nALL CHECKS PASSED" : `\n${failed.length} CHECK(S) FAILED`);

await browser.close();
process.exit(failed.length === 0 ? 0 : 1);
