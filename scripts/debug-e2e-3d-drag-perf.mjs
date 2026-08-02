import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_BASE_URL } from "./e2eBaseUrl.mjs";

// 量測拖曳旋轉視角時的即時幀率(window.__debugScene.frames,由 Scene.tsx 的
// WindowDebugHook 每幀累加),用來防止未來對 3D 場景的變動(例如再加新的參考線/
// 網格系統)重蹈 ElevationGrid 最初版本的覆轍——當時每個高程層、每面牆各自是一個
// 獨立的 drei <Line>(粗線技術,各自一個 draw call),真實案場的高程範圍(~70m)
// 換算下來有兩三百個獨立物件,拖曳旋轉時實測幀率被砍半(140fps -> 74fps)。

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "鑽孔資料", "測試場地.xlsx");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1005 } });

await page.goto(E2E_BASE_URL, { waitUntil: "load" });
await page.waitForTimeout(500);
await page.locator('input[type="file"][accept*="csv"]').setInputFiles(fixturePath);
await page.getByText(/成功匯入/).waitFor({ timeout: 20000 });
await page.waitForTimeout(500);

async function measureDragFps(label) {
  await page.evaluate(() => { window.__debugScene = undefined; });
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => window.__debugScene?.frames ?? 0);

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const start = Date.now();
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: "left" });
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(cx + i * 3, cy + Math.sin(i / 5) * 20, { steps: 2 });
    await page.waitForTimeout(30);
  }
  await page.mouse.up({ button: "left" });
  const elapsedMs = Date.now() - start;

  const after = await page.evaluate(() => window.__debugScene?.frames ?? 0);
  const frames = after - before;
  const fps = (frames / elapsedMs) * 1000;
  console.log(`[${label}] frames=${frames} elapsedMs=${elapsedMs} fps=${fps.toFixed(1)}`);
  return fps;
}

console.log("--- drag-rotate FPS, showGrid ON (default, 48 boreholes) ---");
const fps1 = await measureDragFps("grid-on-run1");
const fps2 = await measureDragFps("grid-on-run2");
const avg = (fps1 + fps2) / 2;
console.log("\naverage fps:", avg.toFixed(1));
if (avg < 60) {
  console.log("WARNING: below 60fps with grid on — check for newly-added per-level/per-object 3D meshes");
}

await browser.close();
