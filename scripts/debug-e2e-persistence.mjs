// 驗證 review finding 6-2 的修法真的生效:
// (a) CSV 匯入 12 支鑽孔後重新整理(F5),匯入的資料要活下來——不能被 App.tsx
//     的 useState<Borehole[]>(mockBoreholes) 悄悄蓋回內建範例場景(這正是回歸的核心
//     風險:內建範例改名成 BH-01…BH-12/CH-01…CH-02 之後,誤蓋回去會讓使用者匯入的
//     剖面線在錯的鑽孔上重新掛回,肉眼看不出來)。
//     CSV 只有 12 支 BH,沒有 CPT 測點;內建範例場景是 12 BH + 2 CH = 14 支——這個
//     數量差異(BoreholeChecklist.tsx 的「已選 N 支鑽孔」文字)是本腳本拿來分辨
//     「畫面上到底是匯入的資料還是被蓋回內建範例」的關鍵訊號,單看鑽孔名稱不夠,因為
//     examples/範例鑽孔資料.csv 本來就是拿內建範例場景產生的,BH-01 的名字兩邊一樣。
// (b) 「重設為範例資料」按鈕:確認對話框接受後,清光相關 localStorage key、reload
//     回到內建的 14 支範例鑽孔。
// 結構仿 scripts/debug-e2e-examples.mjs(launch/console-error 收集模式)與
// scripts/debug-e2e-project-save-load.mjs(localStorage 直接讀取斷言)。
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const csvPath = path.join(projectRoot, "examples", "範例鑽孔資料.csv");

let errorCount = 0;
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " — " + detail : ""}`);
}

async function readSelectedCountText(page) {
  // 等自動收合計時器(500ms)跑完,讀「已選 N 支鑽孔 ▾」文字。
  await page.waitForTimeout(800);
  const el = await page.getByText(/已選 \d+ 支鑽孔/).first();
  return (await el.textContent()) ?? "";
}

const PERSISTED_KEYS = [
  "boreholes",
  "profileData",
  "boreholeGroups",
  "soilStyles",
  "contourSettings",
  "barWidthSettings",
  "sitePlanCalibration",
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1005 }, acceptDownloads: true });
page.on("pageerror", (err) => {
  errorCount++;
  console.log("[PAGEERROR]", err.message);
});
page.on("dialog", async (dialog) => {
  console.log("[DIALOG]", dialog.type(), dialog.message());
  await dialog.accept();
});

try {
  await page.goto(E2E_BASE_URL, { waitUntil: "load" });
  await page.waitForTimeout(500);

  // 全新開始,不受同一瀏覽器 profile 殘留資料影響(雖然每次 chromium.launch() 本來
  // 就是全新 context,這裡保險再清一次、比照 debug-e2e-project-save-load.mjs)。
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(500);

  const initialCountText = await readSelectedCountText(page);
  console.log("初始(內建範例場景)已選文字:", initialCountText);
  if (!initialCountText.includes("14")) {
    throw new Error(`ASSERTION FAILED: 內建範例場景預期 14 支鑽孔,實際文字: ${initialCountText}`);
  }
  record("初始畫面顯示內建範例場景 14 支鑽孔", true);

  // ---- (a) CSV 匯入 → reload → 匯入資料要存活 --------------------------------
  const uploadInput = page.locator('input[type="file"][accept*="csv"]');
  await uploadInput.setInputFiles(csvPath);
  await page.getByText("成功匯入 12 支鑽孔").waitFor({ timeout: 20000 });
  record("CSV 範例檔匯入 12 支鑽孔", true);

  const afterImportCountText = await readSelectedCountText(page);
  if (!afterImportCountText.includes("12")) {
    throw new Error(`ASSERTION FAILED: 匯入後預期 12 支鑽孔,實際文字: ${afterImportCountText}`);
  }
  record("匯入後畫面顯示 12 支鑽孔(尚未 reload)", true);

  const storedBeforeReload = await page.evaluate(() => localStorage.getItem("boreholes"));
  if (!storedBeforeReload) {
    throw new Error("ASSERTION FAILED: 匯入成功後 localStorage 的 boreholes key 應該要有資料");
  }
  const parsedBeforeReload = JSON.parse(storedBeforeReload);
  if (!Array.isArray(parsedBeforeReload) || parsedBeforeReload.length !== 12) {
    throw new Error(
      `ASSERTION FAILED: localStorage.boreholes 應該存 12 筆,實際 ${JSON.stringify(parsedBeforeReload)?.slice(0, 200)}`
    );
  }
  record("匯入成功後 localStorage.boreholes 已寫入 12 筆資料", true);

  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(500);

  const afterReloadCountText = await readSelectedCountText(page);
  console.log("reload 後已選文字:", afterReloadCountText);
  if (!afterReloadCountText.includes("12")) {
    throw new Error(
      `ASSERTION FAILED (這就是要修的回歸): reload 後應該還是 12 支鑽孔(匯入資料存活),` +
        `實際文字: ${afterReloadCountText} — 代表畫面被悄悄蓋回內建範例場景`
    );
  }
  record("F5 重新整理後,CSV 匯入的 12 支鑽孔資料存活(未被蓋回內建範例場景)", true);

  // 已選 N 支鑽孔的清單預設是收合狀態(BoreholeChecklist.tsx:選滿 2 支自動收合),
  // 個別鑽孔名稱要展開後才會出現在 DOM 裡(3D 場景裡的鑽孔標籤是畫在 canvas 上,
  // 不是 DOM 節點,不能用 querySelector 找)。
  await page.getByText(/已選 \d+ 支鑽孔/).first().click();
  await page.waitForTimeout(200);
  const boreholeNameFound = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("label,span,button"));
    return els.some((el) => (el.textContent ?? "").includes("BH-01"));
  });
  if (!boreholeNameFound) {
    throw new Error("ASSERTION FAILED: reload 後展開鑽孔清單應該還找得到鑽孔名稱 BH-01");
  }
  record("reload 後展開鑽孔清單仍可見鑽孔名稱 BH-01", true);
  // 展開完測完立刻收合回去,避免擋住後面「重設為範例資料」按鈕的點擊區域。
  await page.getByRole("button", { name: "▴", exact: true }).click();
  await page.waitForTimeout(200);

  // ---- (b) 重設為範例資料 -----------------------------------------------------
  await page.getByRole("button", { name: "重設為範例資料" }).click();
  // dialog handler 已經 accept,resetToExampleData() 內部呼叫 location.reload()
  await page.waitForLoadState("load");
  await page.waitForTimeout(500);

  const clearedKeys = await page.evaluate(
    (keys) => keys.map((k) => ({ key: k, value: localStorage.getItem(k) })),
    PERSISTED_KEYS
  );
  const stillPresent = clearedKeys.filter((k) => k.value !== null);
  if (stillPresent.length > 0) {
    throw new Error(
      `ASSERTION FAILED: 重設後這些 localStorage key 應該要被清掉: ${JSON.stringify(stillPresent)}`
    );
  }
  record("重設為範例資料後,相關 localStorage key 全部清空", true, `已檢查 ${PERSISTED_KEYS.join(", ")}`);

  const afterResetCountText = await readSelectedCountText(page);
  console.log("重設後已選文字:", afterResetCountText);
  if (!afterResetCountText.includes("14")) {
    throw new Error(`ASSERTION FAILED: 重設後應該回到內建範例場景 14 支鑽孔,實際文字: ${afterResetCountText}`);
  }
  record("重設為範例資料後,畫面回到內建範例場景 14 支鑽孔", true);

  await page.screenshot({ path: path.join(projectRoot, ".superpowers", "sdd", "e2e-persistence-reset.png") });
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
