// 產生 docs/使用手冊.md / README.md 用的「新功能」實機截圖(2026-08 批:實體地層
// 建模、CPT 貫入曲線、配置圖快速插入)+ 重拍 hero 主圖。
//
// 慣例沿用 scripts/generate-doc-screenshots.mjs:
// - server 由外部先起在 E2E_BASE_URL(預設 5199,拒絕 5173),這支只截圖
// - hero 用獨立低 deviceScaleFactor context 控制檔案大小(CSS 版面不變)
// - 失敗直接丟例外,不做 PASS/FAIL 統計
//
// 用法:npx vite --port 5199 & npx vite-node scripts/generate-feature-screenshots.mjs
// (要用 vite-node:配置圖那段 import 了 src/ 的 TS 模組;需要私有示意圖
//  「Demo影片」資料夾內的虛構廠區配置圖.png,公開 repo 無法執行該段)
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";
import { placementToCalibration } from "../src/utils/sitePlanQuickInsert";
import { mockBoreholes } from "../src/data/mockBoreholes";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imagesDir = path.join(projectRoot, "docs", "images");
const projectJsonPath = path.join(projectRoot, "examples", "範例專案.json");

const PORT = new URL(E2E_BASE_URL).port || "5199";
if (PORT === "5173") {
  throw new Error("REFUSING TO RUN: E2E_BASE_URL points at port 5173 (user's live dev session).");
}

await fs.mkdir(imagesDir, { recursive: true });
const VIEWPORT = { width: 1600, height: 900 };
const HERO_DEVICE_SCALE_FACTOR = 0.4;
const FEATURE_DEVICE_SCALE_FACTOR = 0.45; // 0.6 會讓全視窗場景圖(layer-solid)衝破 300KB 預算

const browser = await chromium.launch({ channel: "chrome", headless: true });

function waitFrames(page) {
  return page.waitForFunction(() => window.__debugScene && window.__debugScene.frames > 20, null, {
    timeout: 20000,
  });
}

async function freshPage(context) {
  const page = await context.newPage();
  await page.goto(E2E_BASE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(E2E_BASE_URL);
  await waitFrames(page);
  return page;
}

async function openExampleProject(page) {
  await page.locator('input[accept=".json,application/json"]').setInputFiles(projectJsonPath);
  await page.waitForTimeout(1500);
  await waitFrames(page);
}

// ---- hero:範例專案(實體地層塊 + Kriging 彩色等高線 + 鑽孔柱)----
{
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: HERO_DEVICE_SCALE_FACTOR,
  });
  const page = await freshPage(context);
  await openExampleProject(page);
  // 維持預設 45° 視角:實測拖抬視角容易越過地面變成由下往上看實體底面,
  // 預設角度就能同框實體塊/等高線/柱狀,也跟名稱標籤的正面方向一致(非 billboard)
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(imagesDir, "hero-3d.png") });
  console.log("hero-3d.png done");
  await context.close();
}

const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: FEATURE_DEVICE_SCALE_FACTOR,
});

// ---- 實體地層建模:範例專案 + 建模面板展開 ----
{
  const page = await freshPage(context);
  await openExampleProject(page);
  await page.getByText("3D 地層建模", { exact: false }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(imagesDir, "layer-solid.png") });
  console.log("layer-solid.png done");
  await page.close();
}

// ---- CPT 貫入曲線:內建場景 hover CH-01 顯示 qc 數值 ----
{
  const page = await freshPage(context);
  // 掃描找 CPT 孔 hover 點(HoverTooltip 只顯示孔名 = CPT)
  let found = null;
  outer: for (let y = 200; y <= 820; y += 30) {
    for (let x = 220; x <= 1380; x += 30) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(25);
      const hit = await page.evaluate(() => {
        const strongs = Array.from(document.querySelectorAll("strong"));
        return strongs.some((s) => s.textContent === "CH-01");
      });
      if (hit) {
        found = { x, y };
        break outer;
      }
    }
  }
  if (!found) throw new Error("CPT hover scan failed: CH-01 not found");
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(imagesDir, "cpt-curve.png"),
    clip: {
      x: Math.min(Math.max(found.x - 450, 0), VIEWPORT.width - 900),
      y: Math.min(Math.max(found.y - 350, 0), VIEWPORT.height - 700),
      width: 900,
      height: 700,
    },
  });
  console.log("cpt-curve.png done");
  await page.close();
}

// ---- 配置圖快速插入:置中放置後俯視(圖面+右下把手清楚可見) ----
// 決定性作法:用功能自己的 placementToCalibration 合成「置中於內建場景」的
// calibration 注入 localStorage(等同放置完成的狀態),再轉俯視截圖——放置模式的
// 滑鼠互動(跟隨/點擊)不入鏡,由使用手冊文字描述;實測用 UI 點擊放置的截法對
// 放置落點/鏡頭角度太敏感,產出的圖不穩定。
{
  const demoPlan = path.join(projectRoot, "Benson", "Demo影片", "虛構廠區配置圖.png");
  const planPng = await fs.readFile(demoPlan).catch(() => {
    throw new Error("需要私有示意圖(「Demo影片」資料夾內的虛構廠區配置圖.png),公開 repo 無法執行此段");
  });
  const xs = mockBoreholes.map((b) => b.x);
  const ys = mockBoreholes.map((b) => b.y);
  const calibration = placementToCalibration(
    {
      centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
      centerY: (Math.min(...ys) + Math.max(...ys)) / 2,
      widthMeters: Math.max(...xs) - Math.min(...xs) + 30,
      rotationDeg: 0,
    },
    {
      dataUrl: `data:image/png;base64,${planPng.toString("base64")}`,
      width: planPng.readUInt32BE(16), // PNG IHDR
      height: planPng.readUInt32BE(20),
    },
    Math.round((mockBoreholes.reduce((s, b) => s + b.groundElevation, 0) / mockBoreholes.length) * 100) / 100,
  );

  const page = await context.newPage();
  await page.goto(E2E_BASE_URL);
  await page.evaluate((json) => {
    localStorage.clear();
    localStorage.setItem("sitePlanCalibration", json);
  }, JSON.stringify(calibration));
  await page.goto(E2E_BASE_URL);
  await waitFrames(page);
  await page.waitForTimeout(1000);
  // 俯視:起點要同時避開圖面(按住會變成拖圖)與左下/右下的浮動面板(會變成
  // 選取面板文字)——取右下偏中的純畫布區
  await page.mouse.move(1300, 780);
  await page.mouse.down();
  for (let y = 780; y >= 380; y -= 25) {
    await page.mouse.move(1300, y);
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.evaluate(() => window.getSelection()?.removeAllRanges()); // 清掉誤選取的反白
  // 拉遠讓整張圖含右下角把手入鏡
  await page.mouse.move(800, 450);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(imagesDir, "siteplan-quick-insert.png") });
  console.log("siteplan-quick-insert.png done");
  await page.close();
}

await browser.close();

// 檔案大小健檢:文件圖預算 300KB(hero 例外放寬到 400KB)
const budget = { "hero-3d.png": 400, "layer-solid.png": 300, "cpt-curve.png": 300, "siteplan-quick-insert.png": 300 };
for (const [name, kb] of Object.entries(budget)) {
  const size = (await fs.stat(path.join(imagesDir, name))).size / 1024;
  console.log(`${name}: ${size.toFixed(0)}KB (budget ${kb}KB)`);
  if (size > kb) throw new Error(`${name} exceeds ${kb}KB budget`);
}
console.log("ALL FEATURE SCREENSHOTS DONE");
