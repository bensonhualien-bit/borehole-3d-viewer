import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";

// 端到端驗證「Kriging 內插」功能:匯入真實鑽孔資料 -> 畫一條至少 3 點的邊界線
// (不同鑽孔柱子)-> 開啟這條線的等高線 -> 切到 Kriging 演算法 -> 確認 localStorage
// 的 contourSettings.interpolator 真的變成 "kriging"、只有 Kriging 模式才有的
// 「自訂變異函數參數」按鈕真的出現、場景仍有畫出東西、且沒有 JS 錯誤 -> 切回 TIN
// 確認狀態與按鈕都正確跟著切回去。
//
// 場景物件數(scene.children.length)本身不足以證明「真的切換成 Kriging」——
// ContourSurface.tsx 在 TIN/Kriging 兩種模式下固定畫出同樣形狀的 mesh/lineSegments,
// 只有 BufferGeometry 裡的頂點資料不同,所以物件數在兩種模式下天生就會一樣;這裡只
// 拿它當「有沒有整個畫面壞掉、變成完全空白」的最低限度檢查,實際驗證演算法切換
// 生效的是 localStorage 狀態與 UI 按鈕可見度這兩個獨立訊號。

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
    return profileData?.lines?.find((l) => l.name === "測試Kriging");
  }

  async function clickUntilPointAdded(candidates, expectedCountAfter) {
    for (const [x, y] of candidates) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(150);
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
  await page.waitForTimeout(500);

  await page.getByText("繪製地層", { exact: true }).click();
  await page.waitForTimeout(150);
  await page.getByText("自由深度").click();
  await page.waitForTimeout(150);
  await page.getByPlaceholder("邊界線名稱").fill("測試Kriging");
  await page.getByText("新增邊界線", { exact: true }).click();
  await page.waitForTimeout(150);

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -100);
  await page.waitForTimeout(300);

  // 跟既有 debug-e2e-contour.mjs 用同一份 fixture、同一組候選座標(同一個鏡頭
  // 框景下命中 BH-21 / BH-24 / BH-18 這 3 支不同的鑽孔柱子)
  const clickPointGroups = [
    [[box.x + 340, box.y + 550], [box.x + 325, box.y + 535], [box.x + 355, box.y + 565], [box.x + 340, box.y + 500], [box.x + 340, box.y + 600]],
    [[box.x + 670, box.y + 420], [box.x + 655, box.y + 420], [box.x + 685, box.y + 420], [box.x + 670, box.y + 450], [box.x + 670, box.y + 480]],
    [[box.x + 1020, box.y + 450], [box.x + 1000, box.y + 450], [box.x + 1040, box.y + 450], [box.x + 1020, box.y + 420], [box.x + 1020, box.y + 480]],
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

  if ((line?.points?.length ?? 0) < 3) {
    console.log("[FAIL] 點數不足 3 點,無法測試 Kriging 切換(可能是點擊位置沒有命中鑽孔柱子)");
    exitCode = 1;
  } else {
    await page.getByText("等高線開").or(page.getByText("等高線關")).first().click();
    await page.waitForTimeout(500);

    const sceneChildrenWithTin = await page.evaluate(() => window.__debugScene?.sceneChildren ?? 0);
    console.log(`[INFO] TIN 模式場景物件數: ${sceneChildrenWithTin}`);

    async function getContourSettings() {
      return page.evaluate(() => JSON.parse(localStorage.getItem("contourSettings") ?? "null"));
    }

    // 「內插演算法」那組 radio 用 name="contourInterpolator" 屬性直接定位(見
    // ProfileDrawer.tsx 的實作),TIN 是宣告順序上的第一個(index 0),Kriging 第二個
    const interpolatorRadios = page.locator('input[name="contourInterpolator"]');
    await interpolatorRadios.nth(1).check();
    await page.waitForTimeout(500);

    const sceneChildrenWithKriging = await page.evaluate(() => window.__debugScene?.sceneChildren ?? 0);
    console.log(`[INFO] Kriging 模式場景物件數: ${sceneChildrenWithKriging}`);
    // 場景物件數在 TIN/Kriging 之間本來就不會變(ContourSurface.tsx 固定畫同樣形狀
    // 的 mesh/lineSegments,只有 BufferGeometry 裡面的頂點資料不同),物件數 !== 0
    // 只能證明「有畫出東西」,證明不了「真的切換成 Kriging 演算法」——所以額外直接
    // 讀 localStorage 確認 contourSettings.interpolator 真的變成 "kriging",並確認
    // 只有 Kriging 模式才會出現的「自訂變異函數參數」按鈕真的顯示出來
    const settingsAfterKriging = await getContourSettings();
    console.log(`[INFO] 切到 Kriging 後 localStorage interpolator: ${settingsAfterKriging?.interpolator}`);
    const krigingParamsButtonVisible = await page.getByText("自訂變異函數參數").isVisible();
    console.log(`[INFO] 「自訂變異函數參數」按鈕可見: ${krigingParamsButtonVisible}`);

    // 切回 TIN,確認能正常切換回去
    await interpolatorRadios.nth(0).check();
    await page.waitForTimeout(500);
    const sceneChildrenBackToTin = await page.evaluate(() => window.__debugScene?.sceneChildren ?? 0);
    console.log(`[INFO] 切回 TIN 後場景物件數: ${sceneChildrenBackToTin}`);
    const settingsBackToTin = await getContourSettings();
    console.log(`[INFO] 切回 TIN 後 localStorage interpolator: ${settingsBackToTin?.interpolator}`);
    const krigingParamsButtonHiddenAfterSwitchBack = !(await page.getByText("自訂變異函數參數").isVisible());

    if (errorCount > 0) {
      console.log(`[FAIL] 頁面發生 ${errorCount} 個 JS 錯誤`);
      exitCode = 1;
    } else if (settingsAfterKriging?.interpolator !== "kriging") {
      console.log("[FAIL] 切到 Kriging 後,localStorage 的 contourSettings.interpolator 沒有變成 \"kriging\"");
      exitCode = 1;
    } else if (!krigingParamsButtonVisible) {
      console.log("[FAIL] 切到 Kriging 後,「自訂變異函數參數」按鈕沒有出現(只有 Kriging 模式才該顯示)");
      exitCode = 1;
    } else if (settingsBackToTin?.interpolator !== "tin") {
      console.log("[FAIL] 切回 TIN 後,localStorage 的 contourSettings.interpolator 沒有變回 \"tin\"");
      exitCode = 1;
    } else if (!krigingParamsButtonHiddenAfterSwitchBack) {
      console.log("[FAIL] 切回 TIN 後,「自訂變異函數參數」按鈕沒有跟著消失");
      exitCode = 1;
    } else if (sceneChildrenWithKriging === 0 || sceneChildrenBackToTin === 0) {
      console.log("[FAIL] 切換演算法後場景沒有畫出等高線物件");
      exitCode = 1;
    } else {
      console.log("[PASS] Kriging 內插切換功能正常運作,無 JS 錯誤");
    }
  }
} catch (err) {
  console.log("[FAIL] 未預期的錯誤:", err.message);
  exitCode = 1;
} finally {
  await browser.close();
}

process.exit(exitCode);
