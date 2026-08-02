import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";

// 端到端驗證「3D 等高線」功能:匯入真實鑽孔資料 -> 畫一條邊界線(至少 3 個
// 不共線的點,對應到不同鑽孔柱子)-> 開啟這條線的等高線開關 -> 拖曳旋轉場景,
// 確認沒有 JS 錯誤、也沒有明顯掉幀。
//
// 螢幕點擊座標(clickPointGroups)是針對本專案固定的測試場地 48 孔資料、
// 在 1920x1005 視窗、且對畫面中心做過 10 格滾輪縮放後的鏡頭框景手動調校出來
// 的——實測發現 OrbitControls 縮放/阻尼(damping)在無頭瀏覽器裡的結算位置
// 會有幾像素等級、跟真實時間有關的微幅漂移(同一份腳本前後兩次執行,縮放後
// 的鏡頭可能差個幾像素),單一固定座標偶爾會因此點空。所以比照專案裡其他
// debug-e2e-*.mjs 腳本(見 debug-e2e-line-editing.mjs 的 clickUntilPointAdded)
// 的做法,每支目標鑽孔柱子準備一小群鄰近候選座標,點了之後檢查點數有沒有真的
// 增加,沒中就換下一個候選點再試,藉此吸收這幾像素的漂移——四組候選點已個別
// 確認在此 fixture、此鏡頭框景下分別會命中 BH-21 / BH-24 / BH-18 / BH-11 這
// 4 支不同的鑽孔柱子。如果未來這份 fixture 或預設鏡頭角度改變,需要重新用
// 「開發伺服器 + 螢幕截圖 + 試點擊」方式重新調校這些候選座標。

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "鑽孔資料", "測試場地.xlsx");

const browser = await chromium.launch({ channel: "chrome", headless: true });
let exitCode = 0;

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1005 } });
  let errorCount = 0;
  page.on("pageerror", (err) => {
    errorCount++;
    console.log("[PAGEERROR]", err.message);
  });

  async function getLine() {
    const profileData = await page.evaluate(() => JSON.parse(localStorage.getItem("profileData") ?? "null"));
    return profileData?.lines?.find((l) => l.name === "測試等高線");
  }

  // 依序嘗試一群鄰近候選座標,點了之後檢查點數是否真的比預期還多(而不是點空),
  // 沒中就換下一個候選點再試——用來吸收 OrbitControls 縮放後鏡頭幾像素等級的漂移
  async function clickUntilPointAdded(candidates, expectedCountAfter) {
    for (const [x, y] of candidates) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(200);
      const line = await getLine();
      const count = line?.points?.length ?? 0;
      if (count >= expectedCountAfter) return true;
    }
    return false;
  }

  await page.goto(E2E_BASE_URL, { waitUntil: "load" });
  await page.waitForTimeout(500);
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles(fixturePath);
  await page.getByText(/成功匯入/).waitFor({ timeout: 20000 });
  await page.waitForTimeout(500); // 讓匯入後的鏡頭自動置中/動畫先穩定下來,座標才對得準

  // 開啟繪製地層模式,選「自由深度」,新增一條邊界線
  await page.getByText("繪製地層", { exact: true }).click();
  await page.waitForTimeout(150);
  await page.getByText("自由深度").click();
  await page.waitForTimeout(150);
  await page.getByPlaceholder("邊界線名稱").fill("測試等高線");
  await page.getByText("新增邊界線", { exact: true }).click();
  await page.waitForTimeout(150);

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();

  // 對準畫面中心滾輪縮放,拉近鏡頭——縮放前柱子在畫面上非常細小,盲點多半會落空
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -100);
  await page.waitForTimeout(300);

  // 在畫面上依序點 4 群位置,各群候選座標互相靠近(在同一支鑽孔柱子附近微調),
  // 分別對應到 BH-21 / BH-24 / BH-18 / BH-11 這 4 支不同的鑽孔柱子
  const clickPointGroups = [
    [[box.x + 340, box.y + 550], [box.x + 325, box.y + 535], [box.x + 355, box.y + 565], [box.x + 340, box.y + 500], [box.x + 340, box.y + 600]],
    [[box.x + 670, box.y + 420], [box.x + 655, box.y + 420], [box.x + 685, box.y + 420], [box.x + 670, box.y + 450], [box.x + 670, box.y + 480]],
    [[box.x + 1020, box.y + 450], [box.x + 1000, box.y + 450], [box.x + 1040, box.y + 450], [box.x + 1020, box.y + 420], [box.x + 1020, box.y + 480]],
    [[box.x + 1500, box.y + 440], [box.x + 1480, box.y + 440], [box.x + 1520, box.y + 440], [box.x + 1500, box.y + 420], [box.x + 1500, box.y + 460]],
  ];
  let expectedCount = 0;
  for (const group of clickPointGroups) {
    expectedCount++;
    const ok = await clickUntilPointAdded(group, expectedCount);
    console.log(`[INFO] 第 ${expectedCount} 個候選群命中: ${ok}`);
  }
  await page.getByText("完成此線", { exact: true }).click();

  const line = await getLine();
  console.log(`[INFO] 邊界線點數: ${line?.points?.length ?? 0}`);
  console.log(`[INFO] 命中的鑽孔: ${JSON.stringify(line?.points?.map((p) => p.boreholeId) ?? [])}`);

  if ((line?.points?.length ?? 0) < 3) {
    console.log("[FAIL] 點數不足 3 點,無法測試等高線開關(可能是點擊位置沒有命中鑽孔柱子)");
    exitCode = 1;
  } else {
    // 開啟這條線的等高線開關
    await page.getByText("等高線開").or(page.getByText("等高線關")).first().click();
    await page.waitForTimeout(500);

    const sceneChildrenAfterEnable = await page.evaluate(() => window.__debugScene?.sceneChildren ?? 0);
    console.log(`[INFO] 開啟等高線後場景物件數: ${sceneChildrenAfterEnable}`);

    // 拖曳旋轉場景 1 秒,量測幀率有沒有明顯掉幀(比照先前 ElevationGrid 效能修正的量測方式)
    const framesBefore = await page.evaluate(() => window.__debugScene?.frames ?? 0);
    const dragStart = Date.now();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 0; i < 20; i++) {
      await page.mouse.move(box.x + box.width / 2 + i * 5, box.y + box.height / 2 + i * 3);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    const dragElapsedMs = Date.now() - dragStart;
    const framesAfter = await page.evaluate(() => window.__debugScene?.frames ?? 0);
    const fps = ((framesAfter - framesBefore) / dragElapsedMs) * 1000;
    console.log(`[INFO] 拖曳期間耗時: ${dragElapsedMs}ms, 渲染幀數: ${framesAfter - framesBefore}, fps: ${fps.toFixed(1)}`);

    if (errorCount > 0) {
      console.log(`[FAIL] 頁面發生 ${errorCount} 個 JS 錯誤`);
      exitCode = 1;
    } else if (fps < 15) {
      console.log(`[FAIL] 拖曳時幀率過低(${fps.toFixed(1)} fps),可能有效能回歸`);
      exitCode = 1;
    } else {
      console.log("[PASS] 等高線功能正常運作,無明顯效能回歸");
    }
  }
} catch (err) {
  console.log("[FAIL] 未預期的錯誤:", err.message);
  exitCode = 1;
} finally {
  await browser.close();
}

process.exit(exitCode);
