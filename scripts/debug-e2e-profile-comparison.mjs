import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";

// 端到端驗證「多剖面比對」功能:匯入真實鑽孔資料 -> 切到 2D 剖面 -> 開啟多剖面
// 比對 -> 建立 2 組鑽孔群組(共用第 3 支鑽孔,用來驗證編輯同步)-> 在第一個面板
// 新增一個剖面點,確認第二個(共用同一支鑽孔的)面板也反映出這個點 -> 在第一個
// 面板滾輪縮放,確認第一個面板的視野(水平 minX/width、垂直 minY/height)都變了,
// 而第二個面板的垂直範圍維持不變——自 2026-07-26 比對檢視 UX 調整後,每個面板的
// 垂直縮放刻意各自獨立,不再共用同一份垂直 viewBox。

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

  async function getProfileData() {
    return page.evaluate(() => JSON.parse(localStorage.getItem("profileData") ?? "null"));
  }

  await page.goto(E2E_BASE_URL, { waitUntil: "load" });
  await page.waitForTimeout(500);
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles(fixturePath);
  await page.getByText(/成功匯入/).waitFor({ timeout: 20000 });
  await page.waitForTimeout(300);

  await page.getByText("繪製地層", { exact: true }).click();
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "新增邊界線" }).click();
  await page.waitForTimeout(150);

  await page.getByRole("button", { name: "切換為2D剖面" }).click();
  await page.waitForTimeout(200);

  await page.getByRole("button", { name: "多剖面比對" }).click();
  await page.waitForTimeout(200);

  // 建立群組 1:前 3 支鑽孔——先記下 index 2(等一下群組 2 也會勾選同一支)的
  // 鑽孔名稱,因為 SVG 裡鑽孔柱子是依剖面軸投影距離排序畫出來的,不是依勾選順序,
  // 之後要在畫面上準確找到「這支共用鑽孔」的柱子,不能只靠 rect 的 DOM 順序猜
  await page.getByRole("button", { name: "+ 新增群組" }).click();
  await page.waitForTimeout(150);
  let checkboxes = page.locator('label:has(input[type="checkbox"])');
  const sharedBoreholeName = (await checkboxes.nth(2).innerText()).trim();
  console.log(`[INFO] 共用鑽孔名稱: ${sharedBoreholeName}`);
  for (let i = 0; i < 3; i++) {
    await checkboxes.nth(i).locator("input").check();
    await page.waitForTimeout(80);
  }
  await page.getByRole("button", { name: "建立" }).click();
  await page.waitForTimeout(200);

  // 建立群組 2:第 3~5 支鑽孔(index 2 跟群組 1 共用,用來驗證編輯同步)
  await page.getByRole("button", { name: "+ 新增群組" }).click();
  await page.waitForTimeout(150);
  checkboxes = page.locator('label:has(input[type="checkbox"])');
  for (let i = 2; i < 5; i++) {
    await checkboxes.nth(i).locator("input").check();
    await page.waitForTimeout(80);
  }
  await page.getByRole("button", { name: "建立" }).click();
  await page.waitForTimeout(200);

  const svgs = page.locator("svg");
  const svgCount = await svgs.count();
  console.log(`[INFO] 面板(svg)數量: ${svgCount}`);

  if (svgCount < 2) {
    console.log("[FAIL] 沒有出現 2 個群組面板");
    exitCode = 1;
  } else {
    const panel1 = svgs.nth(0);
    const panel2 = svgs.nth(1);

    // 在面板 1 點「共用鑽孔」那支柱子的 rect 新增剖面點——用鑽孔名稱定位,不是
    // DOM 順序,因為 positioned(繪製順序)是依剖面軸投影距離排序,不是勾選順序
    const rects1 = panel1.locator("rect");
    const rectCount1 = await rects1.count();
    console.log(`[INFO] 面板 1 rect 數: ${rectCount1}`);
    const sharedRectInPanel1 = panel1.locator(`g:has(text:text-is("${sharedBoreholeName}")) rect`).first();
    const box = await sharedRectInPanel1.boundingBox();
    // 先明確移動滑鼠並等待,讓 React 處理 mousemove 觸發的預覽點狀態更新,
    // 再送出點擊——比照既有 debug-e2e-2d-section-interactive.mjs 的 clickRectCenter
    // 寫法;若省略中間的等待,click() 會在預覽點狀態更新前就送出,导致點擊被
    // 判定成「沒有預覽點可以新增」而悄悄什麼都不做。
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(150);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);

    const pdAfterClick = await getProfileData();
    const pointCount = pdAfterClick?.lines?.[0]?.points?.length ?? 0;
    console.log(`[INFO] 新增點後剖面線點數: ${pointCount}`);

    const circlesPanel1 = await panel1.locator("circle").count();
    const circlesPanel2 = await panel2.locator("circle").count();
    console.log(`[INFO] 面板 1 circle 數: ${circlesPanel1}, 面板 2 circle 數: ${circlesPanel2}`);

    // 垂直捲動同步測試——滾輪位置刻意避開畫面正中央(那裡疊著置中的「鑽孔群組」
    // 管理面板,群組數一多會長高,蓋住畫面中央),改用面板左側 1/4 處,確保滑鼠
    // 真的落在這個面板的 SVG 上而不是被疊在上面的浮動面板擋掉
    const viewBox1Before = await panel1.getAttribute("viewBox");
    const viewBox2Before = await panel2.getAttribute("viewBox");
    const panel1Box = await panel1.boundingBox();
    await page.mouse.move(panel1Box.x + panel1Box.width * 0.25, panel1Box.y + panel1Box.height / 2);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(200);
    const viewBox1After = await panel1.getAttribute("viewBox");
    const viewBox2After = await panel2.getAttribute("viewBox");
    console.log(`[INFO] 面板1 viewBox 縮放前: ${viewBox1Before}`);
    console.log(`[INFO] 面板1 viewBox 縮放後: ${viewBox1After}`);
    console.log(`[INFO] 面板2 viewBox 縮放前: ${viewBox2Before}`);
    console.log(`[INFO] 面板2 viewBox 縮放後: ${viewBox2After}`);

    const [, minY1Before, , height1Before] = viewBox1Before.split(" ");
    const [, minY1After, , height1After] = viewBox1After.split(" ");
    const [, minY2Before, , height2Before] = viewBox2Before.split(" ");
    const [, minY2After, , height2After] = viewBox2After.split(" ");
    const verticalIndependent = minY2After === minY2Before && height2After === height2Before;
    // 必須驗證面板 1 的「垂直」分量真的變了——只比整條 viewBox 字串的話,萬一
    // 每面板獨立垂直縮放整個壞掉(minY/height 凍住),光靠水平變化也會讓斷言
    // 空過,綠燈蓋掉真回歸。
    const verticalChangedInPanel1 = minY1After !== minY1Before || height1After !== height1Before;
    const horizontalChangedInPanel1 = viewBox1Before !== viewBox1After;

    if (errorCount > 0) {
      console.log(`[FAIL] 頁面發生 ${errorCount} 個 JS 錯誤`);
      exitCode = 1;
    } else if (pointCount < 1) {
      console.log("[FAIL] 在面板 1 新增剖面點失敗");
      exitCode = 1;
    } else if (circlesPanel2 === 0) {
      console.log("[FAIL] 面板 2(共用同一支鑽孔)沒有反映出剛新增的點,編輯未同步");
      exitCode = 1;
    } else if (!horizontalChangedInPanel1) {
      console.log("[FAIL] 面板 1 滾輪縮放沒有生效");
      exitCode = 1;
    } else if (!verticalChangedInPanel1) {
      console.log("[FAIL] 面板 1 滾輪縮放後垂直範圍(minY/height)沒有變化——每面板獨立垂直縮放可能壞掉");
      exitCode = 1;
    } else if (!verticalIndependent) {
      console.log("[FAIL] 面板 1 縮放後,面板 2 的垂直範圍被連動改變了(應維持獨立)");
      exitCode = 1;
    } else {
      console.log("[PASS] 多剖面比對功能正常運作:群組建立、編輯同步、各面板垂直縮放彼此獨立皆正確");
    }
  }
} catch (err) {
  console.log("[FAIL] 未預期的錯誤:", err.message);
  exitCode = 1;
} finally {
  await browser.close();
}

process.exit(exitCode);
