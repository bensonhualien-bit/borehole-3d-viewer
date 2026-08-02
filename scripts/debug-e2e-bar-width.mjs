// 端到端驗證「2D 柱寬一致性」功能(spec: 2026-08-01-bar-width-settings,Task 1-4;
// 疊合並排規則已依 spec 2026-08-01-export-layout-design 樣張檢查點回饋 2 改為
// 「全寬並排、不再除以 k 變細」,螢幕與匯出共用):
//   1. 一致性:測試場地 xlsx(48 支鑽孔,真實座標)全選 -> 實測發現少數幾支彼此距離
//      小於 baseBarWidth、確實會觸發疊合並排(這是 computeBarLayout 的既定行為,
//      不是 bug)。全寬並排規則下疊合不再改變柱寬——不管有沒有疊合,所有 rect
//      的寬度理論上都應該完全相等(全部等於 baseBarWidth),不再需要「baseWidth
//      除以整數 k」的容忍檢查,uniformity 檢查因此變回單純的「全體 rect 寬度
//      相等」;然後 baseWidth/viewBox.width 應落在 min(2%, 0.35/count) 換算到
//      viewBox 座標系(viewBox 含左右各 2×baseBarWidth 邊距)後的 ±20% 容差
//      區間內。
//   2. 疊合並排:腳本現場產生一個 4 支鑽孔的專案 .json(x=0/50/51/100、y=0,
//      每支 2 層土層,groundElevation 10),透過 ProjectManager 的「開啟專案」
//      匯入。x=50/51 這兩支距離只有 1、遠小於預設 baseBarWidth(span 100 ×
//      2% = 2.0),會觸發 computeBarLayout 的並排群邏輯;x=0/100 距離夠遠不受
//      影響,同時刻意放在座標範圍兩端,讓疊合群落在座標範圍中段——auto-fit 後
//      畫面上大約在水平置中位置,不會被 ProfileDrawer 浮動面板(貼右上角,
//      maxHeight max(200px, calc(100vh - 460px)))蓋住,第 3 步才點得到真正的 rect。斷言:
//      並排群兩支的 rect 寬 ≈ 其他兩支「全寬」(不再是一半),且群內兩支 rect
//      區間緊鄰不重疊(footprint 隨 k 成長,群佔寬變成 2×baseBarWidth)。
//   3. 疊合群內點選命中:延續同一個 4 孔專案,啟用「繪製地層」+「新增邊界線」
//      進入畫線模式,分別點擊並排群左半 / 右半 rect 的畫面中心 -> 斷言新增的
//      兩個點各自的 boreholeId,對應到「哪支鑽孔的名稱文字 x 座標離點擊柱子中心
//      最近」——不是憑數學推導硬編、而是直接讀 DOM 上鑽孔名稱標籤的實際位置來
//      判斷預期值,確保命中區真的跟著繪製中心走。
//   4. 滑桿 + 持久化 + 恢復預設:重要前提——測試場地 48 孔資料集在預設設定下,
//      min(maxFraction=2%, spacingFactor/count=0.35/48≈0.73%) 已經是
//      spacingFactor/count 那支在頂,拉 maxFraction 滑桿完全不會改變柱寬(不是
//      這支腳本的 bug,是產品規則本身)。所以這個步驟改成只勾選同一批資料裡的
//      前 2 支鑽孔(spacingFactor/count = 0.35/2 = 17.5% 遠大於 maxFraction 上限
//      5%,maxFraction 一定是頂到的那支,滑桿才會真的改變柱寬;2 支鑽孔的柱寬
//      本身是各自跨距的一個小比例,不可能超過跨距本身,不會觸發並排),把「柱寬
//      上限」拉到最大 -> 量測柱寬變大 -> 檢查 localStorage -> 順帶驗證修好的
//      auto-fit「柱寬設定改動即重新 fit」不會裁到端點的柱子(最左 rect 的 x
//      不小於 viewBox minX)-> reload 頁面 -> 用 DataUploader(CSV/xlsx 輸入,
//      只呼叫 setBoreholes,不會動 barWidthSettings)重新匯入同一份 xlsx、重新
//      勾選同樣前 2 支 -> 確認柱寬維持 reload 前變大的樣子(從 localStorage 讀回,
//      不是重新預設)-> 按「恢復預設」-> 柱寬變回原本的預設寬度。接著另外改選
//      前 3 支驗證「密度係數」滑桿:N=2 時 spacingFactor 滑桿下界(0.1/2=0.05)
//      精確打平 maxFraction 滑桿上界(5%=0.05),整個可拖動範圍內 spacingFactor
//      永遠不可能嚴格小於 maxFraction、滑桿在 N=2 時全程無感(滑桿範圍設計上的
//      邊界巧合,不是 bug);改用 N=3(下界 0.1/3≈3.3% 嚴格小於 5%)才能讓
//      maxFraction 固定拉到 5% 後,拖 spacingFactor 從 0.8 到 0.1 真的量到柱寬
//      變窄,並確認 localStorage 同步更新。
//      (刻意不透過 ProjectManager「開啟專案」重建這 2/3 孔的資料——
//      parseProjectFile 對缺少 barWidthSettings 欄位的專案檔一律回退成預設值,
//      handleOpenProject 會把這個預設值寫回 localStorage,若拿專案檔案來測
//      「reload 後設定有沒有保留」,量到的其實是「開專案把設定重設成預設」而
//      不是「reload 保留了 localStorage 裡的設定」,兩件事會混在一起、測不準。)
//   5. 匯出回歸:重新全選 48 孔(確保匯出內容夠豐富,PDF 大小門檻沿用
//      debug-e2e-pdf-export.mjs 的常數)-> 點「匯出 PDF」-> 斷言檔名、
//      %PDF- 檔頭、50KB~5MB 大小界限。
//   6. 全程 0 pageerror(這個檢查最後才印成功訊息,不能在它之前就印)。
//
// 跟 debug-e2e-pdf-export.mjs 一樣自己起 vite dev server、結束時「現查現殺」
// 只殺目前真正監聯這個 port 的 PID,絕不動 5173(使用者的 live session)。

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

// ---- dev server 自起自收(比照 debug-e2e-pdf-export.mjs)-------------------

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

  // ---- 共用小工具 -----------------------------------------------------------

  const csvInput = page.locator('input[type="file"][accept*="csv"]');
  const jsonInput = page.locator('input[type="file"][accept*="json"]');

  async function importXlsx() {
    await csvInput.setInputFiles(fixturePath);
    await page.getByText(/成功匯入/).waitFor({ timeout: 20000 });
    await page.waitForTimeout(300);
  }

  async function ensureChecklistExpanded() {
    const expandButton = page.getByRole("button", { name: /已選 \d+ 支鑽孔/ });
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(150);
    }
  }

  // 「清除」按鈕文字在 SitePlanUploader 裡也有一個(清除配置圖),page 層級
  // getByRole 會撞名——用「全選」按鈕的下一個相鄰 button 精準定位到
  // BoreholeChecklist 自己的「清除」。
  async function clickChecklistClearAll() {
    const selectAllBtn = page.getByRole("button", { name: "全選", exact: true }).first();
    const clearBtn = selectAllBtn.locator("xpath=following-sibling::button[1]");
    await clearBtn.click();
  }

  async function switchTo2D() {
    const btn = page.getByRole("button", { name: /切換為(2D剖面|3D視圖)/ });
    const label = await btn.textContent();
    if (label?.includes("切換為2D剖面")) {
      await btn.click();
      await page.waitForTimeout(200);
    }
  }

  // viewBox 量測跟 rect 邊界量測(leftmost/rightmost)一律鎖到 page 上「同一顆」
  // svg(第一顆)——如果 viewBox 用 page.locator("svg").first()、rect 座標卻各自
  // 獨立用 page.locator("svg rect") 選到不同 svg(例如匯出流程短暫殘留的
  // off-screen svg host),量到的 viewBox 跟 rect 座標會是兩個不同座標系,
  // 比較沒有意義。所有跟這顆主 svg 有關的量測都透過同一個 svgLocator 存取。
  const svgLocator = page.locator("svg").first();

  async function getAllRectWidths() {
    // 跟 getLeftmostRectX/getRightmostRectRight 一樣鎖到同一顆主 svg(見上面
    // svgLocator 的說明)——用未加範圍的 page.locator("svg rect") 有可能連匯出
    // 流程短暫殘留的離屏 svg host 都選到,量出來的寬度就不只是主畫面那一顆了。
    return svgLocator.locator("rect").evaluateAll((els) => els.map((el) => parseFloat(el.getAttribute("width"))));
  }

  async function getMaxRectWidth() {
    const widths = await getAllRectWidths();
    if (widths.length === 0) throw new Error("ASSERTION FAILED: no rects found when measuring bar width");
    return Math.max(...widths);
  }

  async function getViewBoxWidth() {
    const vb = await svgLocator.getAttribute("viewBox");
    if (!vb) throw new Error("ASSERTION FAILED: svg has no viewBox attribute");
    return parseFloat(vb.trim().split(/\s+/)[2]);
  }

  async function getViewBoxMinX() {
    const vb = await svgLocator.getAttribute("viewBox");
    if (!vb) throw new Error("ASSERTION FAILED: svg has no viewBox attribute");
    return parseFloat(vb.trim().split(/\s+/)[0]);
  }

  async function getLeftmostRectX() {
    const xs = await svgLocator.locator("rect").evaluateAll((els) => els.map((el) => parseFloat(el.getAttribute("x"))));
    if (xs.length === 0) throw new Error("ASSERTION FAILED: no rects found when measuring leftmost rect x");
    return Math.min(...xs);
  }

  async function getRightmostRectRight() {
    const rights = await svgLocator
      .locator("rect")
      .evaluateAll((els) => els.map((el) => parseFloat(el.getAttribute("x")) + parseFloat(el.getAttribute("width"))));
    if (rights.length === 0) throw new Error("ASSERTION FAILED: no rects found when measuring rightmost rect right-edge");
    return Math.max(...rights);
  }

  async function getProfileData() {
    return page.evaluate(() => JSON.parse(localStorage.getItem("profileData") ?? "null"));
  }

  async function getBarWidthSettingsLS() {
    const raw = await page.evaluate(() => localStorage.getItem("barWidthSettings"));
    return raw ? JSON.parse(raw) : null;
  }

  async function setRangeValue(locator, value) {
    await locator.evaluate((el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  }

  async function clickBoxCenter(box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.waitForTimeout(100);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(150);
  }

  const DEFAULT_MAX_FRACTION = 0.02;
  const DEFAULT_SPACING_FACTOR = 0.35;

  // ---- 匯入資料 -------------------------------------------------------------

  await page.goto(E2E_BASE_URL, { waitUntil: "load" });
  await page.waitForTimeout(500);
  await importXlsx();
  console.log("0. fixture imported (測試場地, 48 支鑽孔預期) — OK");

  await switchTo2D();
  await ensureChecklistExpanded();

  // ===========================================================================
  // 1. 一致性:全選 -> 所有 rect width 相等,且 width/viewBox.width 落在合理區間
  // ===========================================================================

  await page.getByRole("button", { name: "全選", exact: true }).first().click();
  await page.waitForTimeout(400);

  const selectedCount = await page.locator('label:has(input[type="checkbox"]) input:checked').count();
  console.log("selected borehole count after 全選 (expect 48):", selectedCount);
  if (selectedCount < 40) {
    throw new Error(`ASSERTION FAILED: expected close to the full 48-borehole dataset after 全選, got ${selectedCount}`);
  }

  const widths1 = await getAllRectWidths();
  console.log("rect count sampled for uniformity check:", widths1.length);
  if (widths1.length < 10) {
    throw new Error(`ASSERTION FAILED: too few rects to meaningfully check uniformity, got ${widths1.length}`);
  }
  // 全寬並排規則下,疊合並排不再改變柱寬(群內每支維持「全」基準寬,不再除以
  // k)——所以不管有沒有疊合,全體 rect 的寬度理論上都應該完全相等,一致性檢查
  // 因此變回單純的「全部 rect 寬度相等」,不需要再容忍 baseWidth/k 這些變窄值。
  const baseWidth1 = Math.max(...widths1);
  const minWidth1 = Math.min(...widths1);
  const distinctWidths1 = [...new Set(widths1.map((w) => Number(w.toFixed(6))))].sort((a, b) => b - a);
  console.log("distinct rect widths observed (expect exactly one value under the full-width dodge rule):", distinctWidths1);
  console.log(`max width ${baseWidth1}, min width ${minWidth1}`);
  if (baseWidth1 - minWidth1 > 1e-6) {
    throw new Error(
      `ASSERTION FAILED: expected all rects to share exactly one width under the full-width dodge rule, got distinct widths ${JSON.stringify(distinctWidths1)}`
    );
  }

  const viewBoxWidth1 = await getViewBoxWidth();
  const actualRatio1 = baseWidth1 / viewBoxWidth1;
  const expectedSpanRatio1 = Math.min(DEFAULT_MAX_FRACTION, DEFAULT_SPACING_FACTOR / selectedCount);
  // viewBox 含左右各 baseBarWidth*2 邊距(見 computeAutoFitViewBox),換算成
  // viewBox 座標系下的比例: ratio/(1+4*ratio)。
  const expectedViewBoxRatio1 = expectedSpanRatio1 / (1 + 4 * expectedSpanRatio1);
  const lo1 = expectedViewBoxRatio1 * 0.8;
  const hi1 = expectedViewBoxRatio1 * 1.2;
  console.log(
    `width/viewBox.width = ${actualRatio1} (expect within [${lo1}, ${hi1}], derived from min(2%, 0.35/${selectedCount})=${expectedSpanRatio1})`
  );
  if (actualRatio1 < lo1 || actualRatio1 > hi1) {
    throw new Error(
      `ASSERTION FAILED: width/viewBox.width ratio ${actualRatio1} out of expected ±20% range [${lo1}, ${hi1}]`
    );
  }
  console.log("1. 一致性: all sampled rects share the same width, ratio within expected range — OK");

  // ===========================================================================
  // 4. 滑桿 + 持久化 + 恢復預設(用同一批 xlsx 資料裡的前 2 支,見檔頭註解說明
  //    為什麼不是用全選的 48 支,也不是用下面第 2/3 步的疊合專案檔)
  // ===========================================================================

  await ensureChecklistExpanded();
  await clickChecklistClearAll();
  await page.waitForTimeout(150);
  const checklistCheckboxes = page.locator('label:has(input[type="checkbox"]) input[type="checkbox"]');
  await checklistCheckboxes.nth(0).check();
  await page.waitForTimeout(80);
  await checklistCheckboxes.nth(1).check();
  await page.waitForTimeout(300);

  const checkedFor2 = await page.locator('label:has(input[type="checkbox"]) input:checked').count();
  console.log("selected borehole count for slider test (expect 2):", checkedFor2);
  if (checkedFor2 !== 2) {
    throw new Error(`ASSERTION FAILED: expected exactly 2 boreholes selected for the slider test, got ${checkedFor2}`);
  }

  // 面板預設是展開的(第一次掛載、localStorage 沒有 barWidthPanelCollapsed 值時
  // collapsed=false),但還是防禦性地檢查一次收合按鈕存不存在。
  const collapsedPanelButton = page.getByRole("button", { name: "柱寬設定 ▾" });
  if (await collapsedPanelButton.isVisible().catch(() => false)) {
    await collapsedPanelButton.click();
    await page.waitForTimeout(150);
  }

  const maxFractionSlider = page.locator("label", { hasText: "柱寬上限" }).locator('input[type="range"]');
  await maxFractionSlider.waitFor({ state: "visible", timeout: 5000 });

  const widthBeforeSlider = await getMaxRectWidth();
  console.log("max rect width before raising 柱寬上限 slider (2 boreholes, default settings):", widthBeforeSlider);

  // ---- 建立無裁切迴歸要用的「真正的舊 fit 基準」---------------------------
  // auto-fit effect 永遠都會在 selectionKey 改變時重新 fit(這件事跟 fix #1 有
  // 沒有修好無關,selectionKey 一直都在 deps 陣列裡)。fix #1 加的只是「baseWidth
  // 改變也重新 fit」這一條額外觸發條件。所以如果只是單純把滑桿從目前值拉到 5%,
  // 沒有修好的版本仍然會沿用「上一次 selectionKey 改變時」凍結的 fit 基準——而
  // 那次凍結發生在上面勾選這 2 支鑽孔的當下,用的是預設 maxFraction=2%,
  // 5%/2%=2.5 倍,本來就低於裁切門檻(>4 倍),兩個版本(修好/沒修好)這裡都不會
  // 裁切,測不出差異(這是 re-review 抓到的問題)。
  // 要讓「沒修好」的版本也真的裁切,必須讓凍結的 fit 基準本身就很小——做法:先把
  // 柱寬上限壓到滑桿最小值 0.5%,再刻意觸發一次 selectionKey 改變(把其中一支
  // 鑽孔取消勾選再勾回來,選取的兩支鑽孔不變,但 selectionKey 字串會先變再變回
  // 來,對 React 來說是兩次不同的 key,一定會重新跑 fit),讓這次 fit 用 0.5% 的
  // baseBarWidth 當基準,不管 fix #1 修好與否都會發生(因為觸發條件是
  // selectionKey,不是 baseBarWidth)。接著再把滑桿拉到 5%——這才是相對於「凍結
  // 基準」真正的 10 倍跳躍(0.5%→5%),沒修好的版本這裡才會真的沿用 0.5% 算出的
  // 窄邊距、裁到兩端的柱子;修好的版本因為 baseBarWidth 本身也是 dep,拉滑桿到
  // 5% 會立刻重新 fit,不會裁切。
  await setRangeValue(maxFractionSlider, 0.5);
  await page.waitForTimeout(200);
  // BoreholeChecklist 選滿 2 支後 500ms 會自動收合(見該元件的 hasAutoCollapsedRef
  // 計時器)——上面兩次 setRangeValue+等待加起來已經超過 500ms,這裡重新展開一次
  // 才點得到 checkbox。
  await ensureChecklistExpanded();
  await checklistCheckboxes.nth(1).uncheck();
  await page.waitForTimeout(150);
  await checklistCheckboxes.nth(1).check();
  await page.waitForTimeout(300);

  const checkedForFitBaseline = await page.locator('label:has(input[type="checkbox"]) input:checked').count();
  if (checkedForFitBaseline !== 2) {
    throw new Error(
      `ASSERTION FAILED: expected exactly 2 boreholes still selected after toggling the fit-baseline checkbox, got ${checkedForFitBaseline}`
    );
  }

  // 這一步之後,已用 negative control(還原 ProfileSection2D 的
  // [selectionKey, baseBarWidth] 成 [selectionKey])驗證過:接下來的 0.5%→5%
  // 跳躍在未修的版本上會真的觸發裁切、下面的無裁切斷言真的會 FAIL(記錄在
  // task-5-report.md「Fix round 2」)。
  await setRangeValue(maxFractionSlider, 5);
  await page.waitForTimeout(250);

  const widthAfterSlider = await getMaxRectWidth();
  console.log("max rect width after raising 柱寬上限 slider to max (5%) (expect larger):", widthAfterSlider);
  if (!(widthAfterSlider > widthBeforeSlider * 1.5)) {
    throw new Error(
      `ASSERTION FAILED: expected rect width to grow substantially after raising 柱寬上限 to max, before=${widthBeforeSlider}, after=${widthAfterSlider}`
    );
  }

  const lsAfterSlider = await getBarWidthSettingsLS();
  console.log("localStorage barWidthSettings after slider drag (expect maxFraction≈0.05):", JSON.stringify(lsAfterSlider));
  if (!lsAfterSlider || Math.abs(lsAfterSlider.maxFraction - 0.05) > 1e-6) {
    throw new Error(`ASSERTION FAILED: localStorage barWidthSettings.maxFraction not updated to 0.05, got ${JSON.stringify(lsAfterSlider)}`);
  }
  console.log("4a. dragging 柱寬上限 slider to max grows rect width + updates localStorage — OK");

  // ---- 無裁切迴歸(fix #1):auto-fit effect 過去只 key 在 [selectionKey],柱寬
  // 設定滑桿大幅拉大(這裡真的做了 0.5%→5%,10 倍)時,視野邊距
  // (computeAutoFitViewBox 的 minX = 最小投影距離 − 2×baseBarWidth,maxX 同理
  // 用 + 2×baseBarWidth)還是用拖曳前的舊 baseBarWidth 算的,兩端的柱子會超出
  // 邊距、被 viewBox 裁掉一截。修好後 effect 多依賴 baseBarWidth,滑桿改變就會
  // 重新 fit,兩端柱子應該完整落在 viewBox 內——左邊界:最左邊 rect 的 x 不該
  // 小於 viewBox 的 minX;右邊界(對稱檢查):最右邊 rect 的 x+width 不該大於
  // viewBox 的 minX+width。只挑一邊測不夠,因為 computeAutoFitViewBox 的
  // minX/maxX 邊距公式是對稱的(都是 ±2×baseBarWidth),裁切理論上兩端都會發生。
  const viewBoxMinXAfterSlider = await getViewBoxMinX();
  const viewBoxWidthAfterSlider = await getViewBoxWidth();
  const viewBoxMaxXAfterSlider = viewBoxMinXAfterSlider + viewBoxWidthAfterSlider;
  const leftmostRectXAfterSlider = await getLeftmostRectX();
  const rightmostRectRightAfterSlider = await getRightmostRectRight();
  console.log(
    `leftmost rect x=${leftmostRectXAfterSlider} vs viewBox minX=${viewBoxMinXAfterSlider} (expect leftmost rect x >= viewBox minX, i.e. not clipped)`
  );
  if (leftmostRectXAfterSlider < viewBoxMinXAfterSlider) {
    throw new Error(
      `ASSERTION FAILED: leftmost rect x (${leftmostRectXAfterSlider}) is left of viewBox minX (${viewBoxMinXAfterSlider}) — end bar clipped after a big 柱寬上限 slider drag (stale auto-fit bug)`
    );
  }
  console.log(
    `rightmost rect right-edge=${rightmostRectRightAfterSlider} vs viewBox maxX=${viewBoxMaxXAfterSlider} (expect rightmost rect right-edge <= viewBox maxX, i.e. not clipped)`
  );
  if (rightmostRectRightAfterSlider > viewBoxMaxXAfterSlider) {
    throw new Error(
      `ASSERTION FAILED: rightmost rect right-edge (${rightmostRectRightAfterSlider}) is right of viewBox maxX (${viewBoxMaxXAfterSlider}) — end bar clipped after a big 柱寬上限 slider drag (stale auto-fit bug)`
    );
  }
  console.log("4a-2. no-clip (both edges) after big 柱寬上限 slider drag (auto-fit re-fits on baseBarWidth change) — OK");

  // ---- reload:用 DataUploader(不是 ProjectManager)重建同樣的 2 孔資料 -----

  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(500);

  const lsRightAfterReload = await getBarWidthSettingsLS();
  console.log("localStorage barWidthSettings immediately after reload (expect still maxFraction≈0.05):", JSON.stringify(lsRightAfterReload));
  if (!lsRightAfterReload || Math.abs(lsRightAfterReload.maxFraction - 0.05) > 1e-6) {
    throw new Error(
      `ASSERTION FAILED: localStorage barWidthSettings should survive reload untouched, got ${JSON.stringify(lsRightAfterReload)}`
    );
  }

  await importXlsx();
  await switchTo2D();
  await ensureChecklistExpanded();
  await clickChecklistClearAll();
  await page.waitForTimeout(150);
  const checklistCheckboxes2 = page.locator('label:has(input[type="checkbox"]) input[type="checkbox"]');
  await checklistCheckboxes2.nth(0).check();
  await page.waitForTimeout(80);
  await checklistCheckboxes2.nth(1).check();
  await page.waitForTimeout(300);

  const widthAfterReload = await getMaxRectWidth();
  console.log("max rect width after reload + re-import (expect ≈ pre-reload enlarged width", widthAfterSlider + "):", widthAfterReload);
  if (Math.abs(widthAfterReload - widthAfterSlider) > widthAfterSlider * 0.001) {
    throw new Error(
      `ASSERTION FAILED: rect width after reload (${widthAfterReload}) did not match the persisted enlarged width (${widthAfterSlider})`
    );
  }
  console.log("4b. reload persistence: enlarged bar width + localStorage survive reload (loaded via 柱寬設定, not via 開啟專案) — OK");

  // ---- 恢復預設 --------------------------------------------------------------

  if (await collapsedPanelButton.isVisible().catch(() => false)) {
    await collapsedPanelButton.click();
    await page.waitForTimeout(150);
  }
  const resetBarWidthButton = page.getByRole("button", { name: "恢復預設(2% / 0.35)" });
  await resetBarWidthButton.waitFor({ state: "visible", timeout: 5000 });
  await resetBarWidthButton.click();
  await page.waitForTimeout(250);

  const widthAfterReset = await getMaxRectWidth();
  console.log("max rect width after 恢復預設 (expect ≈ original default width", widthBeforeSlider + "):", widthAfterReset);
  if (Math.abs(widthAfterReset - widthBeforeSlider) > Math.max(widthBeforeSlider * 0.001, 1e-9)) {
    throw new Error(
      `ASSERTION FAILED: rect width after 恢復預設 (${widthAfterReset}) did not return to the original default width (${widthBeforeSlider})`
    );
  }
  const lsAfterReset = await getBarWidthSettingsLS();
  console.log("localStorage barWidthSettings after 恢復預設 (expect defaults):", JSON.stringify(lsAfterReset));
  if (
    !lsAfterReset ||
    Math.abs(lsAfterReset.maxFraction - DEFAULT_MAX_FRACTION) > 1e-9 ||
    Math.abs(lsAfterReset.spacingFactor - DEFAULT_SPACING_FACTOR) > 1e-9
  ) {
    throw new Error(`ASSERTION FAILED: localStorage barWidthSettings not reset to defaults, got ${JSON.stringify(lsAfterReset)}`);
  }
  const resetButtonGoneAfterReset = await resetBarWidthButton.isVisible().catch(() => false);
  console.log("恢復預設 button hidden once settings are back to default (expect false/hidden):", resetButtonGoneAfterReset);
  if (resetButtonGoneAfterReset) {
    throw new Error("ASSERTION FAILED: 恢復預設 button should disappear once settings equal the defaults again");
  }
  console.log("4c. 恢復預設 restores default bar width + localStorage, button hides itself — OK");

  // ===========================================================================
  // 4d. 密度係數(spacingFactor)滑桿確實生效 + 持久化
  // ---------------------------------------------------------------------------
  // 這一段刻意改選同一份 xlsx 資料的「前 3 支」,不是沿用上面 4a-4c 用的前 2 支
  // ——推導過程:spacingFactor 滑桿範圍 [0.1, 0.8],maxFraction 滑桿範圍上限
  // 5%(=0.05,normalizeBarWidthSettings 也 clamp 在同一個上限,無法再往上調)。
  // N=2 支時,spacingFactor/N 的可達範圍是 [0.1/2, 0.8/2] = [0.05, 0.4]——下界
  // 0.05 剛好「精確等於」maxFraction 能調到的最大值 0.05(不是約等於,兩者都是
  // 5/100 這個浮點數,實測 bit-for-bit 相等)。也就是說 min(maxFraction,
  // spacingFactor/N) 在 N=2 時,spacingFactor 於整個可拖動範圍內永遠「打平或
  // 更大」,永遠不會嚴格小於 maxFraction——不管 maxFraction 怎麼選,spacingFactor
  // 都不可能成為真正生效(嚴格取到 min 那一支)的因素,滑桿在 N=2 時全程無感,
  // 這是滑桿範圍設計上的邊界巧合,不是 bug。所以要讓這支滑桿「看得出來有效果」
  // 必須用 N>=3——N=3 時 spacingFactor/N 下界 = 0.1/3 ≈ 0.033,嚴格小於
  // maxFraction 上限 0.05,拖到底時 spacingFactor 才會真的成為生效的那一支,量到
  // 的柱寬才會真的縮小。
  await ensureChecklistExpanded();
  await clickChecklistClearAll();
  await page.waitForTimeout(150);
  const checklistCheckboxesFor3 = page.locator('label:has(input[type="checkbox"]) input[type="checkbox"]');
  await checklistCheckboxesFor3.nth(0).check();
  await page.waitForTimeout(80);
  await checklistCheckboxesFor3.nth(1).check();
  await page.waitForTimeout(80);
  await checklistCheckboxesFor3.nth(2).check();
  await page.waitForTimeout(300);

  const checkedFor3 = await page.locator('label:has(input[type="checkbox"]) input:checked').count();
  console.log("selected borehole count for spacingFactor slider test (expect 3):", checkedFor3);
  if (checkedFor3 !== 3) {
    throw new Error(`ASSERTION FAILED: expected exactly 3 boreholes selected for the spacingFactor slider test, got ${checkedFor3}`);
  }

  if (await collapsedPanelButton.isVisible().catch(() => false)) {
    await collapsedPanelButton.click();
    await page.waitForTimeout(150);
  }

  // 先把柱寬上限拉到 5%(跟 4a 一樣的操作,但這裡是全新的 3 孔選取,設定剛被
  // 4c 重置回預設 2%),讓 maxFraction 固定在它能達到的最大值,才符合上面推導
  // 「N=3 時 spacingFactor 下界仍嚴格小於 maxFraction 上限」這個前提。
  await setRangeValue(maxFractionSlider, 5);
  await page.waitForTimeout(250);

  const spacingFactorSlider = page.locator("label", { hasText: "密度係數" }).locator('input[type="range"]');
  await spacingFactorSlider.waitFor({ state: "visible", timeout: 5000 });

  await setRangeValue(spacingFactorSlider, 0.8);
  await page.waitForTimeout(250);
  const widthAtSpacing08 = await getMaxRectWidth();
  console.log("max rect width at 密度係數=0.8, 柱寬上限=5%, N=3 (expect maxFraction still binding):", widthAtSpacing08);

  await setRangeValue(spacingFactorSlider, 0.1);
  await page.waitForTimeout(250);
  const widthAtSpacing01 = await getMaxRectWidth();
  console.log("max rect width at 密度係數=0.1, 柱寬上限=5%, N=3 (expect spacingFactor now binding, strictly smaller):", widthAtSpacing01);

  if (!(widthAtSpacing01 < widthAtSpacing08)) {
    throw new Error(
      `ASSERTION FAILED: expected rect width to strictly shrink when dragging 密度係數 from 0.8 to 0.1 (with 柱寬上限 pinned at 5%, N=3), before=${widthAtSpacing08}, after=${widthAtSpacing01}`
    );
  }

  const lsAfterSpacingDrag = await getBarWidthSettingsLS();
  console.log("localStorage barWidthSettings after 密度係數 drag (expect spacingFactor≈0.1):", JSON.stringify(lsAfterSpacingDrag));
  if (!lsAfterSpacingDrag || Math.abs(lsAfterSpacingDrag.spacingFactor - 0.1) > 1e-6) {
    throw new Error(`ASSERTION FAILED: localStorage barWidthSettings.spacingFactor not updated to 0.1, got ${JSON.stringify(lsAfterSpacingDrag)}`);
  }
  console.log("4d. dragging 密度係數 slider from 0.8 to 0.1 (柱寬上限 pinned at 5%, N=3) shrinks rect width + updates localStorage — OK");

  // 收尾:清乾淨,恢復預設,不讓這段殘留的設定影響後面的匯出回歸段落。
  const resetButtonAfterSpacing = page.getByRole("button", { name: "恢復預設(2% / 0.35)" });
  if (await resetButtonAfterSpacing.isVisible().catch(() => false)) {
    await resetButtonAfterSpacing.click();
    await page.waitForTimeout(250);
  }

  // ===========================================================================
  // 5. 匯出回歸(重新全選 48 孔,確保匯出內容夠豐富,沿用 pdf-export 腳本的大小門檻)
  // ===========================================================================

  await ensureChecklistExpanded();
  await page.getByRole("button", { name: "全選", exact: true }).first().click();
  await page.waitForTimeout(400);
  await ensureChecklistExpanded();

  async function svgCount() {
    return page.locator("svg").count();
  }

  const exportButton = page.getByRole("button", { name: "匯出 PDF", exact: true });
  await exportButton.waitFor({ state: "visible", timeout: 5000 });
  const exportDisabled = await exportButton.isDisabled();
  console.log("匯出 PDF button disabled with 48 boreholes selected (expect false):", exportDisabled);
  if (exportDisabled) {
    throw new Error("ASSERTION FAILED: 匯出 PDF button should be enabled with 48 boreholes selected");
  }

  const svgCountBeforeExport = await svgCount();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    exportButton.click(),
  ]);
  const suggestedName = download.suggestedFilename();
  console.log("export suggested filename:", suggestedName);
  const filenameRe = /^剖面圖_\d{8}\.pdf$/;
  if (!filenameRe.test(suggestedName)) {
    throw new Error(`ASSERTION FAILED: export filename "${suggestedName}" does not match ${filenameRe}`);
  }

  const pdfPath = path.join(scratchDir, "e2e-bar-width-export.pdf");
  await download.saveAs(pdfPath);
  console.log("saved export PDF to:", pdfPath);

  const KB = 1024;
  const MB = 1024 * 1024;
  const stat = await fs.stat(pdfPath);
  const fh = await fs.open(pdfPath, "r");
  const headerBuf = Buffer.alloc(5);
  await fh.read(headerBuf, 0, 5, 0);
  await fh.close();
  const header = headerBuf.toString("latin1");
  console.log("export PDF header (expect %PDF-):", JSON.stringify(header));
  if (header !== "%PDF-") {
    throw new Error(`ASSERTION FAILED: export PDF header is not %PDF-, got ${JSON.stringify(header)}`);
  }
  console.log("export PDF size (bytes, expect > 50KB and < 5MB):", stat.size, `(${(stat.size / MB).toFixed(2)} MB)`);
  if (stat.size <= 50 * KB) {
    throw new Error(`ASSERTION FAILED: export PDF size ${stat.size} bytes is not > 50KB`);
  }
  if (stat.size >= 5 * MB) {
    throw new Error(`ASSERTION FAILED: export PDF size ${stat.size} bytes is not < 5MB`);
  }

  const svgCountAfterExport = await svgCount();
  console.log("svg count after export (expect back to baseline", svgCountBeforeExport + "):", svgCountAfterExport);
  if (svgCountAfterExport !== svgCountBeforeExport) {
    throw new Error(
      `ASSERTION FAILED: svg count after export (${svgCountAfterExport}) did not return to baseline (${svgCountBeforeExport})`
    );
  }
  console.log("5. 匯出 PDF: filename + header + size + no leaked offscreen svg host — OK");

  // ===========================================================================
  // 2. 疊合並排(腳本現場產生 4 孔專案 .json,透過 ProjectManager「開啟專案」匯入)
  // ===========================================================================

  const craftedProject = {
    version: 1,
    boreholes: [
      {
        id: "bhA",
        name: "BH-A",
        x: 0,
        y: 0,
        groundElevation: 10,
        layers: [
          { topDepth: 0, bottomDepth: 5, soilType: "CL", color: "#8b4513" },
          { topDepth: 5, bottomDepth: 10, soilType: "SM", color: "#e0c068" },
        ],
      },
      {
        id: "bhB",
        name: "BH-B",
        // 刻意放在最遠的一端(不是 50)——疊合並排群(bhC/bhD)因此落在座標範圍
        // 中段,auto-fit 後畫面上大約在水平置中位置,不會被 ProfileDrawer 那個
        // 貼右上角、maxHeight max(200px, calc(100vh - 460px)) 的浮動面板(見下方點擊步驟)蓋住,點擊才點得到
        // 真正的 rect 而不是點到面板。
        x: 100,
        y: 0,
        groundElevation: 10,
        layers: [
          { topDepth: 0, bottomDepth: 4, soilType: "CL", color: "#8b4513" },
          { topDepth: 4, bottomDepth: 10, soilType: "SM", color: "#e0c068" },
        ],
      },
      {
        id: "bhC",
        name: "BH-C",
        x: 50,
        y: 0,
        groundElevation: 10,
        layers: [
          { topDepth: 0, bottomDepth: 6, soilType: "CL", color: "#8b4513" },
          { topDepth: 6, bottomDepth: 10, soilType: "SM", color: "#e0c068" },
        ],
      },
      {
        id: "bhD",
        name: "BH-D",
        x: 51,
        y: 0,
        groundElevation: 10,
        layers: [
          { topDepth: 0, bottomDepth: 3, soilType: "CL", color: "#8b4513" },
          { topDepth: 3, bottomDepth: 10, soilType: "SM", color: "#e0c068" },
        ],
      },
    ],
    sitePlan: null,
    profileData: { lines: [], layers: [] },
    contourSettings: {},
    boreholeGroups: [],
    soilStyles: {},
  };
  const craftedProjectPath = path.join(scratchDir, "e2e-bar-width-dodge-project.json");
  await fs.writeFile(craftedProjectPath, JSON.stringify(craftedProject, null, 2), "utf-8");
  console.log("wrote crafted dodge-layout project to:", craftedProjectPath);

  await jsonInput.setInputFiles(craftedProjectPath);
  await page.waitForTimeout(500);
  await switchTo2D(); // no-op if already in 2D (it should be)
  await ensureChecklistExpanded();
  await page.getByRole("button", { name: "全選", exact: true }).first().click();
  await page.waitForTimeout(400);

  const checkedFor4 = await page.locator('label:has(input[type="checkbox"]) input:checked').count();
  console.log("selected borehole count for dodge project (expect 4):", checkedFor4);
  if (checkedFor4 !== 4) {
    throw new Error(`ASSERTION FAILED: expected exactly 4 boreholes selected after opening the crafted project, got ${checkedFor4}`);
  }

  // 逐一取每個 rect 的 x/width 屬性(世界座標,不受畫面縮放影響)以及像素
  // boundingBox(點擊要用),用 centerX 分組——同一支鑽孔的 2 層土層 rect
  // centerX/width 完全相同,不同鑽孔之間即使是並排群裡的那一對,centerX 差距
  // (≈ baseBarWidth/2,遠大於分組容差)也足以分開成不同組。
  const rectLocators = await page.locator("svg rect").all();
  console.log("rect count for dodge project (expect 8 = 4 boreholes × 2 layers):", rectLocators.length);
  if (rectLocators.length !== 8) {
    throw new Error(`ASSERTION FAILED: expected exactly 8 rects (4 boreholes × 2 layers), got ${rectLocators.length}`);
  }
  const rectInfos = [];
  for (const loc of rectLocators) {
    const xAttr = parseFloat((await loc.getAttribute("x")) ?? "NaN");
    const wAttr = parseFloat((await loc.getAttribute("width")) ?? "NaN");
    const box = await loc.boundingBox();
    rectInfos.push({ centerX: xAttr + wAttr / 2, width: wAttr, box });
  }

  function groupByCenterX(items, tol) {
    const groups = [];
    for (const item of items) {
      const g = groups.find((g) => Math.abs(g.key - item.centerX) < tol);
      if (g) g.items.push(item);
      else groups.push({ key: item.centerX, items: [item] });
    }
    return groups;
  }

  const groups = groupByCenterX(rectInfos, 0.1);
  console.log(
    "rect groups by centerX (expect 4 groups):",
    groups.map((g) => ({ centerX: g.key, width: g.items[0].width, count: g.items.length }))
  );
  if (groups.length !== 4) {
    throw new Error(`ASSERTION FAILED: expected 4 distinct x-groups (one per borehole), got ${groups.length}`);
  }
  for (const g of groups) {
    if (g.items.length !== 2) {
      throw new Error(`ASSERTION FAILED: expected each borehole x-group to have 2 rects (2 soil layers), got ${g.items.length} for centerX=${g.key}`);
    }
  }

  // 全寬並排規則下,疊合的兩支(bhC/bhD)柱寬跟未疊合的兩支(bhA/bhB)完全
  // 一樣寬(不再變細)——沒辦法再靠「寬度比較窄」認出疊合對,改用位置認:
  // 疊合對(bhC x=50、bhD x=51)彼此距離遠小於柱寬,渲染後 centerX 依然是全部
  // 4 組裡最接近的一對;bhA(x=0)/bhB(x=100)離疊合群跟離彼此都很遠。所以「依
  // centerX 排序後,相鄰組距最小的那一對」就是疊合對,其餘兩組是未疊合的
  // wide 組。
  const byX = [...groups].sort((a, b) => a.key - b.key);
  let minGapIdx = 0;
  let minGap = Infinity;
  for (let i = 0; i < byX.length - 1; i++) {
    const gap = byX[i + 1].key - byX[i].key;
    if (gap < minGap) {
      minGap = gap;
      minGapIdx = i;
    }
  }
  const leftDodge = byX[minGapIdx];
  const rightDodge = byX[minGapIdx + 1];
  const dodgePair = [leftDodge, rightDodge];
  const widePair = byX.filter((_, i) => i !== minGapIdx && i !== minGapIdx + 1);
  console.log(
    "identified dodge pair by nearest centerX gap:",
    dodgePair.map((g) => g.key),
    "wide pair:",
    widePair.map((g) => g.key)
  );
  if (widePair.length !== 2) {
    throw new Error(`ASSERTION FAILED: expected exactly 2 non-dodged (wide) groups, got ${widePair.length}`);
  }

  const dodgeW0 = dodgePair[0].items[0].width;
  const dodgeW1 = dodgePair[1].items[0].width;
  const wideW0 = widePair[0].items[0].width;
  const wideW1 = widePair[1].items[0].width;
  console.log("dodge-pair widths (expect ≈ equal):", dodgeW0, dodgeW1);
  console.log("wide-pair widths (expect ≈ equal):", wideW0, wideW1);
  if (Math.abs(dodgeW0 - dodgeW1) > Math.max(wideW0, wideW1) * 0.02) {
    throw new Error(`ASSERTION FAILED: dodge-pair rect widths should be ≈ equal, got ${dodgeW0} vs ${dodgeW1}`);
  }
  if (Math.abs(wideW0 - wideW1) > Math.max(wideW0, wideW1) * 0.02) {
    throw new Error(`ASSERTION FAILED: wide (non-dodged) rect widths should be ≈ equal, got ${wideW0} vs ${wideW1}`);
  }
  // 全寬並排(除以 k 變細規則已廢除):疊合對的柱寬應該跟未疊合的柱寬完全
  // 一樣寬,不再是一半。
  const dodgeAvg = (dodgeW0 + dodgeW1) / 2;
  const wideAvg = (wideW0 + wideW1) / 2;
  console.log(`dodge-pair avg width ${dodgeAvg} (expect ≈ full width, same as wide-pair avg ${wideAvg})`);
  if (Math.abs(dodgeAvg - wideAvg) > wideAvg * 0.02) {
    throw new Error(`ASSERTION FAILED: dodge-pair width (${dodgeAvg}) is not ≈ equal to the non-dodged full width (${wideAvg})`);
  }

  const dodgeByX = [...dodgePair].sort((a, b) => a.key - b.key);
  const leftRightEdge = dodgeByX[0].key + dodgeByX[0].items[0].width / 2;
  const rightLeftEdge = dodgeByX[1].key - dodgeByX[1].items[0].width / 2;
  console.log(`dodge-pair adjacency: left rect right-edge=${leftRightEdge}, right rect left-edge=${rightLeftEdge} (expect right-edge >= left-edge - 0.01)`);
  if (rightLeftEdge < leftRightEdge - 0.01) {
    throw new Error(
      `ASSERTION FAILED: dodge-pair rects overlap — left right-edge=${leftRightEdge}, right left-edge=${rightLeftEdge}`
    );
  }
  console.log("2. 疊合並排: dodge-pair rects are full-width and adjacent without overlap — OK");

  // ===========================================================================
  // 3. 疊合群內點選命中(延續同一個 4 孔專案,啟用畫線模式)
  // ===========================================================================

  // 讀取每支鑽孔名稱標籤 <text> 的 x 座標,用「離點擊柱子中心最近的名稱」判斷
  // 預期的 boreholeId——資料驅動,不是憑數學推導硬編。
  const nameEntries = await page.locator("svg text").evaluateAll((els) =>
    els
      .map((el) => ({ text: el.textContent ?? "", x: parseFloat(el.getAttribute("x") ?? "NaN") }))
      .filter((e) => /^BH-[A-D]$/.test(e.text))
  );
  console.log("borehole name labels found:", JSON.stringify(nameEntries));
  const idByName = { "BH-A": "bhA", "BH-B": "bhB", "BH-C": "bhC", "BH-D": "bhD" };
  if (nameEntries.length !== 4) {
    throw new Error(`ASSERTION FAILED: expected 4 borehole name labels (BH-A..BH-D), got ${nameEntries.length}`);
  }
  function nearestBoreholeId(centerX) {
    let best = null;
    let bestDist = Infinity;
    for (const e of nameEntries) {
      const d = Math.abs(e.x - centerX);
      if (d < bestDist) {
        bestDist = d;
        best = idByName[e.text];
      }
    }
    return best;
  }
  const expectedLeftId = nearestBoreholeId(leftDodge.key);
  const expectedRightId = nearestBoreholeId(rightDodge.key);
  console.log("expected left/right boreholeId for the dodge pair (derived from name-label positions):", expectedLeftId, expectedRightId);
  if (!expectedLeftId || !expectedRightId || expectedLeftId === expectedRightId) {
    throw new Error(
      `ASSERTION FAILED: could not derive distinct left/right boreholeId from name labels, got ${expectedLeftId} / ${expectedRightId}`
    );
  }

  await page.getByText("繪製地層", { exact: true }).click();
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "新增邊界線" }).click();
  await page.waitForTimeout(150);

  await clickBoxCenter(leftDodge.items[0].box);
  await clickBoxCenter(rightDodge.items[0].box);

  await page.getByRole("button", { name: "完成此線" }).click();
  await page.waitForTimeout(200);

  const pdAfterHitTest = await getProfileData();
  const lastLine = pdAfterHitTest?.lines?.[pdAfterHitTest.lines.length - 1];
  console.log("profile line points after clicking dodge-pair left/right rects:", JSON.stringify(lastLine?.points));
  if (!lastLine || lastLine.points.length !== 2) {
    throw new Error(`ASSERTION FAILED: expected exactly 2 points on the new profile line, got ${JSON.stringify(lastLine?.points)}`);
  }
  if (lastLine.points[0].boreholeId !== expectedLeftId) {
    throw new Error(
      `ASSERTION FAILED: clicking the left half of the dodge cluster should hit ${expectedLeftId}, got ${lastLine.points[0].boreholeId}`
    );
  }
  if (lastLine.points[1].boreholeId !== expectedRightId) {
    throw new Error(
      `ASSERTION FAILED: clicking the right half of the dodge cluster should hit ${expectedRightId}, got ${lastLine.points[1].boreholeId}`
    );
  }
  console.log("3. 疊合群內點選命中: left/right clicks hit the correct borehole following the dodge layout — OK");

  // ===========================================================================
  // 6. 0 pageerror(放在最後,前面所有斷言都成立之後才印成功訊息)
  // ===========================================================================

  console.log("total pageerror count:", errorCount);
  if (errorCount > 0) {
    throw new Error(`ASSERTION FAILED: ${errorCount} pageerror(s) occurred during the run`);
  }
  console.log("6. 0 pageerror — OK");

  console.log("\nALL ASSERTIONS PASSED. TOTAL PAGE ERRORS: 0");
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
