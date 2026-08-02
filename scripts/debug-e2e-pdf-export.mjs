// 端到端驗證「剖面 PDF 匯出」功能(Task 4,含最終全分支審查後的修復波次):
//   1. 單一 2D 剖面:按鈕現在位在 2D 鑽孔勾選面板的 extraControls 內(不再是
//      獨立浮動按鈕)——0 或 1 支鑽孔選取時 disabled、>=2 支才 enabled;勾選
//      >=3 支鑽孔 -> 點「匯出 PDF」-> 攔截 download,斷言檔名、檔案大小(雙邊
//      界:>50KB 且 <5MB,鎖住無損壓縮修復)、PDF 檔頭 magic bytes、頁數
//      (regex 數 /Type /Page 物件)。
//   2. 比對模式:建立 2 個群組(各 >=2 支鑽孔)-> 點「匯出 PDF(一群一頁)」->
//      斷言檔名、頁數 === 2、每頁均價(總檔案大小/2)>50KB 且總檔案大小 <10MB。
//   3. 兩種模式下,未選取(無鑽孔/無群組,或單一 2D 只選 1 支)時匯出按鈕都要
//      是 disabled。
//   4. 全程 0 pageerror;匯出前後 document.querySelectorAll("svg").length 要
//      相等(離屏渲染用的 host svg 有確實 unmount + 移除,沒有殘留)。
//
// 與其他 debug-e2e-*.mjs 腳本不同之处:這支腳本自己起 vite dev server(直接
// `node node_modules/vite/bin/vite.js --port <PORT> --strictPort`,不透過 npm
// wrapper,child.pid 就是真正監聽 socket 的 process),跑完後用「現查現殺」
// 方式清理——結束前才去 `netstat -ano` 查誰目前正監聽這個 port,只殺那個
// PID,絕不動 5173(使用者的 live session)。
//
// PDF 頁數計算:jsPDF 預設輸出的頁物件字典沒有壓縮,可以把整個檔案當 latin1
// 文字讀出來,用 /\/Type\s*\/Page[^s]/g 數符合的字典數量([^s] 是為了排除
// /Type /Pages 這個「頁面樹根節點」物件,只數真正的 /Page 頁物件)。實測與
// 預期頁數(1 / 2)完全吻合,不需要換成 pdf.js。

import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "鑽孔資料", "測試場地.xlsx");
const scratchDir = path.join(projectRoot, ".superpowers", "sdd");

const PORT = new URL(E2E_BASE_URL).port || "5199";
if (PORT === "5173") {
  throw new Error("REFUSING TO RUN: E2E_BASE_URL points at port 5173 (user's live dev session). Aborting before touching it.");
}

// ---- dev server 自起自收 -----------------------------------------------

function findListeningPid(port) {
  let out;
  try {
    out = execSync("netstat -ano -p tcp", { encoding: "utf-8" });
  } catch {
    return null;
  }
  for (const line of out.split("\n")) {
    if (line.includes(`:${port} `) && /LISTENING/i.test(line)) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid)) return pid;
    }
  }
  return null;
}

function killPortForReal(port) {
  // 現查現殺:結束時才重新查一次誰在監聽這個 port,只殺那個 PID——不信任
  // 啟動時記下的 child.pid(vite 有可能重啟過內部 process)。
  const pid = findListeningPid(port);
  if (!pid) {
    console.log(`[server] no process currently listening on port ${port}, nothing to kill`);
    return;
  }
  console.log(`[server] killing freshly-looked-up PID ${pid} on port ${port}`);
  try {
    execSync(`taskkill /PID ${pid} /F /T`, { stdio: "ignore" });
  } catch (err) {
    console.log(`[server] taskkill on PID ${pid} failed (may already be gone): ${err.message}`);
  }
}

async function waitForServerReady(url, timeoutMs) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Dev server never became ready at ${url} within ${timeoutMs}ms (last error: ${lastErr?.message})`);
}

console.log(`[server] starting vite directly on port ${PORT}...`);
const viteBin = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const viteProcess = spawn(process.execPath, [viteBin, "--port", PORT, "--strictPort"], {
  cwd: projectRoot,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
viteProcess.stdout.on("data", (d) => (serverOutput += d.toString()));
viteProcess.stderr.on("data", (d) => (serverOutput += d.toString()));
let viteExitedUnexpectedly = false;
viteProcess.on("exit", (code, signal) => {
  // 正常收尾時我們自己在 finally 呼叫 kill(),code===null && signal==="SIGTERM"
  // 是預期中的乾淨結束;任何其他組合代表 dev server 中途意外掛掉,標記起來讓
  // 後面斷言結果附註,並在失敗時把 serverOutput 印出來協助除錯。
  if (!(code === null && signal === "SIGTERM")) {
    viteExitedUnexpectedly = true;
    console.log(`[server] WARNING: vite process exited unexpectedly (code=${code}, signal=${signal})`);
  }
});

let browser;
let exitCode = 0;

try {
  await waitForServerReady(E2E_BASE_URL, 30000);
  console.log(`[server] ready at ${E2E_BASE_URL}`);

  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  let errorCount = 0;
  page.on("pageerror", (err) => {
    errorCount++;
    console.log("[PAGEERROR]", err.message);
  });

  await fs.mkdir(scratchDir, { recursive: true });

  // ---- 共用小工具 ---------------------------------------------------------

  async function svgCount() {
    return page.locator("svg").count();
  }

  async function readPdfHeaderAndSize(filePath) {
    const stat = await fs.stat(filePath);
    const fh = await fs.open(filePath, "r");
    const buf = Buffer.alloc(5);
    await fh.read(buf, 0, 5, 0);
    await fh.close();
    return { size: stat.size, header: buf.toString("latin1") };
  }

  async function countPdfPages(filePath) {
    const buf = await fs.readFile(filePath);
    const text = buf.toString("latin1");
    const matches = text.match(/\/Type\s*\/Page[^s]/g);
    return matches ? matches.length : 0;
  }

  // 選單有可能是收合狀態(BoreholeChecklist 選取 >=2 支後 500ms 自動收合、且
  // 透過 localStorage 持久化跨掛載記住上次狀態,是既有行為),需要的話先展開——
  // 匯出 PDF 按鈕現在位在這個面板的 extraControls 內,收合時完全不在畫面上。
  async function ensureChecklistExpanded() {
    const expandButton = page.getByRole("button", { name: /已選 \d+ 支鑽孔/ });
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(150);
    }
  }

  const KB = 1024;
  const MB = 1024 * 1024;

  // ---- 匯入資料 -------------------------------------------------------------

  await page.goto(E2E_BASE_URL, { waitUntil: "load" });
  await page.waitForTimeout(500);
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles(fixturePath);
  await page.getByText(/成功匯入/).waitFor({ timeout: 20000 });
  await page.waitForTimeout(300);
  console.log("0. fixture imported — OK");

  // ---- 1. 單一 2D:切換 -> 展開勾選面板 -> 匯出按鈕 disabled(未勾任何鑽孔) --

  await page.getByRole("button", { name: "切換為2D剖面" }).click();
  await page.waitForTimeout(200);
  await ensureChecklistExpanded();

  const exportSingleButton = page.getByRole("button", { name: "匯出 PDF", exact: true });
  await exportSingleButton.waitFor({ state: "visible", timeout: 5000 });
  const singleDisabledBeforeSelect = await exportSingleButton.isDisabled();
  console.log("single-view export button disabled before selecting any borehole (expect true):", singleDisabledBeforeSelect);
  if (!singleDisabledBeforeSelect) {
    throw new Error("ASSERTION FAILED: 匯出 PDF button should be disabled when no boreholes are selected");
  }
  console.log("1. single-view export button disabled with 0 boreholes selected — OK");

  // ---- 1b. 剛好選 1 支鑽孔 -> 仍是 disabled(<2 支不夠自動縮放) -------------

  const checkboxes = page.locator('label:has(input[type="checkbox"])');
  await checkboxes.nth(0).locator("input").check();
  await page.waitForTimeout(200);
  const singleDisabledWithOne = await exportSingleButton.isDisabled();
  console.log("single-view export button disabled with exactly 1 borehole selected (expect true):", singleDisabledWithOne);
  if (!singleDisabledWithOne) {
    throw new Error("ASSERTION FAILED: 匯出 PDF button should stay disabled with only 1 borehole selected");
  }
  console.log("1b. single-view export button still disabled with 1 borehole selected — OK");

  // ---- 2. 勾選 >=3 支鑽孔(用「全選」)-> 匯出按鈕變 enabled ----------------

  const selectAllButton = page.getByRole("button", { name: "全選", exact: true }).first();
  await selectAllButton.click();
  await page.waitForTimeout(300);

  const checkedCount = await page.locator('label:has(input[type="checkbox"]) input:checked').count();
  console.log("boreholes selected via 全選 (expect >= 3):", checkedCount);
  if (checkedCount < 3) {
    throw new Error(`ASSERTION FAILED: expected at least 3 boreholes selected after 全選, got ${checkedCount}`);
  }

  // 選 >=2 支鑽孔後,面板會在 500ms 後自動收合(既有行為)——重新展開才能繼續
  // 操作面板內的匯出按鈕。
  await page.waitForTimeout(400);
  await ensureChecklistExpanded();

  const singleDisabledAfterSelect = await exportSingleButton.isDisabled();
  console.log("single-view export button disabled after selecting boreholes (expect false):", singleDisabledAfterSelect);
  if (singleDisabledAfterSelect) {
    throw new Error("ASSERTION FAILED: 匯出 PDF button should be enabled once boreholes are selected");
  }
  console.log("2. single-view export button enabled once >=3 boreholes selected — OK");

  // ---- 3. 點「匯出 PDF」-> 攔截 download -----------------------------------

  const svgCountBeforeSingleExport = await svgCount();
  console.log("svg count before single export (baseline):", svgCountBeforeSingleExport);

  const [singleDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    exportSingleButton.click(),
  ]);
  const singleSuggestedName = singleDownload.suggestedFilename();
  console.log("single export suggested filename:", singleSuggestedName);
  const singleFilenameRe = /^剖面圖_\d{8}\.pdf$/;
  if (!singleFilenameRe.test(singleSuggestedName)) {
    throw new Error(`ASSERTION FAILED: single export filename "${singleSuggestedName}" does not match ${singleFilenameRe}`);
  }

  const singlePdfPath = path.join(scratchDir, "e2e-pdf-export-single.pdf");
  await singleDownload.saveAs(singlePdfPath);
  console.log("saved single-export PDF to:", singlePdfPath);

  const { size: singleSize, header: singleHeader } = await readPdfHeaderAndSize(singlePdfPath);
  console.log("single-export PDF size (bytes, expect > 50KB and < 5MB):", singleSize, `(${(singleSize / MB).toFixed(2)} MB)`);
  if (singleSize <= 50 * KB) {
    throw new Error(`ASSERTION FAILED: single-export PDF size ${singleSize} bytes is not > 50KB`);
  }
  if (singleSize >= 5 * MB) {
    throw new Error(
      `ASSERTION FAILED: single-export PDF size ${singleSize} bytes is not < 5MB — lossless compression fix may have regressed`
    );
  }
  console.log("single-export PDF header bytes (expect %PDF-):", JSON.stringify(singleHeader));
  if (singleHeader !== "%PDF-") {
    throw new Error(`ASSERTION FAILED: single-export PDF header is not %PDF-, got ${JSON.stringify(singleHeader)}`);
  }

  const singlePageCount = await countPdfPages(singlePdfPath);
  console.log("single-export PDF page count (expect 1):", singlePageCount);
  if (singlePageCount !== 1) {
    throw new Error(`ASSERTION FAILED: single-export PDF should have exactly 1 page, got ${singlePageCount}`);
  }
  console.log("3. single export: filename + size + header + 1 page — OK");

  // ---- 4. 匯出後畫面回到正常(離屏 svg host 已清乾淨) -----------------------

  const svgCountAfterSingleExport = await svgCount();
  console.log(
    "svg count after single export (expect back to baseline",
    svgCountBeforeSingleExport + "):",
    svgCountAfterSingleExport
  );
  if (svgCountAfterSingleExport !== svgCountBeforeSingleExport) {
    throw new Error(
      `ASSERTION FAILED: svg count after single export (${svgCountAfterSingleExport}) did not return to baseline (${svgCountBeforeSingleExport}) — offscreen render host may not have been cleaned up`
    );
  }
  console.log("4. svg count restored to baseline after single export (no leaked offscreen host) — OK");

  // ---- 5. 進比對模式 -> 匯出按鈕 disabled(無群組) --------------------------

  await page.getByRole("button", { name: "多剖面比對" }).click();
  await page.waitForTimeout(300);

  // 選單有可能是收合狀態(localStorage 持久化),需要的話先展開
  const collapsedMenuButton = page.getByRole("button", { name: "選單 ▾" });
  if (await collapsedMenuButton.isVisible().catch(() => false)) {
    await collapsedMenuButton.click();
    await page.waitForTimeout(150);
  }

  const exportComparisonButton = page.getByRole("button", { name: "匯出 PDF(一群一頁)" });
  await exportComparisonButton.waitFor({ state: "visible", timeout: 5000 });
  const comparisonDisabledBeforeGroups = await exportComparisonButton.isDisabled();
  console.log("comparison export button disabled before any group exists (expect true):", comparisonDisabledBeforeGroups);
  if (!comparisonDisabledBeforeGroups) {
    throw new Error("ASSERTION FAILED: 匯出 PDF(一群一頁) button should be disabled when no groups exist");
  }
  console.log("5. comparison export button disabled with 0 groups — OK");

  // ---- 6. 建立 2 個群組(各 >=2 支鑽孔) -------------------------------------

  async function createGroup(indices) {
    await page.getByRole("button", { name: "+ 新增群組" }).click();
    await page.waitForTimeout(150);
    const checkboxes = page.locator('label:has(input[type="checkbox"])');
    for (const i of indices) {
      await checkboxes.nth(i).locator("input").check();
      await page.waitForTimeout(80);
    }
    await page.getByRole("button", { name: "建立" }).click();
    await page.waitForTimeout(200);
  }

  await createGroup([0, 1]);
  await createGroup([2, 3]);

  const groupCountText = await page
    .locator('div:has-text("鑽孔群組")')
    .first()
    .locator("xpath=..")
    .textContent()
    .catch(() => null);
  console.log("[INFO] group panel text snapshot:", groupCountText);

  const comparisonDisabledAfterGroups = await exportComparisonButton.isDisabled();
  console.log("comparison export button disabled after creating 2 groups (expect false):", comparisonDisabledAfterGroups);
  if (comparisonDisabledAfterGroups) {
    throw new Error("ASSERTION FAILED: 匯出 PDF(一群一頁) button should be enabled once groups exist");
  }
  console.log("6. created 2 groups (2 boreholes each), comparison export button enabled — OK");

  // ---- 7. 點「匯出 PDF(一群一頁)」-> 攔截 download,斷言 2 頁 --------------

  const svgCountBeforeComparisonExport = await svgCount();
  console.log("svg count before comparison export (baseline):", svgCountBeforeComparisonExport);

  const [comparisonDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 90000 }),
    exportComparisonButton.click(),
  ]);
  const comparisonSuggestedName = comparisonDownload.suggestedFilename();
  console.log("comparison export suggested filename:", comparisonSuggestedName);
  const comparisonFilenameRe = /^剖面比對_\d{8}\.pdf$/;
  if (!comparisonFilenameRe.test(comparisonSuggestedName)) {
    throw new Error(`ASSERTION FAILED: comparison export filename "${comparisonSuggestedName}" does not match ${comparisonFilenameRe}`);
  }

  const comparisonPdfPath = path.join(scratchDir, "e2e-pdf-export-comparison.pdf");
  await comparisonDownload.saveAs(comparisonPdfPath);
  console.log("saved comparison-export PDF to:", comparisonPdfPath);

  const { size: comparisonSize, header: comparisonHeader } = await readPdfHeaderAndSize(comparisonPdfPath);
  const comparisonPerPageSize = comparisonSize / 2; // 2 頁(一群一頁),用均價估每頁大小
  console.log(
    "comparison-export PDF size (bytes, expect per-page > 50KB and total < 10MB):",
    comparisonSize,
    `(${(comparisonSize / MB).toFixed(2)} MB total, ${(comparisonPerPageSize / KB).toFixed(0)} KB/page avg)`
  );
  if (comparisonPerPageSize <= 50 * KB) {
    throw new Error(
      `ASSERTION FAILED: comparison-export PDF per-page size ${comparisonPerPageSize} bytes is not > 50KB`
    );
  }
  if (comparisonSize >= 10 * MB) {
    throw new Error(
      `ASSERTION FAILED: comparison-export PDF total size ${comparisonSize} bytes is not < 10MB — lossless compression fix may have regressed`
    );
  }
  console.log("comparison-export PDF header bytes (expect %PDF-):", JSON.stringify(comparisonHeader));
  if (comparisonHeader !== "%PDF-") {
    throw new Error(`ASSERTION FAILED: comparison-export PDF header is not %PDF-, got ${JSON.stringify(comparisonHeader)}`);
  }

  const comparisonPageCount = await countPdfPages(comparisonPdfPath);
  console.log("comparison-export PDF page count (expect 2):", comparisonPageCount);
  if (comparisonPageCount !== 2) {
    throw new Error(`ASSERTION FAILED: comparison-export PDF should have exactly 2 pages (one per group), got ${comparisonPageCount}`);
  }
  console.log("7. comparison export: filename + size + header + 2 pages (one per group) — OK");

  // ---- 8. 匯出後畫面回到正常 -------------------------------------------------

  const svgCountAfterComparisonExport = await svgCount();
  console.log(
    "svg count after comparison export (expect back to baseline",
    svgCountBeforeComparisonExport + "):",
    svgCountAfterComparisonExport
  );
  if (svgCountAfterComparisonExport !== svgCountBeforeComparisonExport) {
    throw new Error(
      `ASSERTION FAILED: svg count after comparison export (${svgCountAfterComparisonExport}) did not return to baseline (${svgCountBeforeComparisonExport}) — offscreen render host may not have been cleaned up`
    );
  }
  console.log("8. svg count restored to baseline after comparison export (no leaked offscreen host) — OK");

  if (errorCount > 0) {
    throw new Error(`ASSERTION FAILED: ${errorCount} pageerror(s) occurred during the run`);
  }
  console.log(`\nALL ASSERTIONS PASSED. TOTAL PAGE ERRORS: 0`);
  console.log(`\nSaved PDFs for manual inspection:\n  ${singlePdfPath}\n  ${comparisonPdfPath}`);
  if (viteExitedUnexpectedly) {
    console.log("[WARN] dev server process exited unexpectedly during the run (see above) — assertions still all passed because the browser had already cached everything it needed, but investigate if this recurs.");
  }
} catch (err) {
  console.log("[FAIL]", err.message);
  console.log(err.stack);
  console.log("---- vite server output (for debugging) ----");
  console.log(serverOutput);
  exitCode = 1;
} finally {
  if (browser) await browser.close();
  console.log("[server] shutting down...");
  try {
    viteProcess.kill();
  } catch {
    // ignore
  }
  await new Promise((r) => setTimeout(r, 500));
  killPortForReal(PORT);
}

process.exit(exitCode);
