// 產生 public/features.html —「功能視覺導覽」單頁(附圖+說明,比照專案慣用的
// HTML 報告形式)。圖片以 data URI 內嵌 docs/images 的文件截圖,頁面隨 vite build
// 原樣進 dist,線上 Demo 網址 /features.html 直接可開。
// 截圖更新後重跑本腳本再 commit 兩者。用法:node scripts/generate-features-page.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imagesDir = path.join(projectRoot, "docs", "images");
const outPath = path.join(projectRoot, "public", "features.html");

const img = (name) =>
  `data:image/png;base64,${fs.readFileSync(path.join(imagesDir, name)).toString("base64")}`;

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<title>鑽孔柱狀圖 3D 視覺化工具 — 功能導覽</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { --paper:#f5f6f4; --card:#ffffff; --ink:#232a20; --muted:#68705f; --line:#dde1d6; --accent:#5f7a3d; }
  @media (prefers-color-scheme: dark) { :root { --paper:#181c15; --card:#22271d; --ink:#e9ece4; --muted:#a3ab97; --line:#353c2e; --accent:#93b364; } }
  * { box-sizing:border-box; }
  body { background:var(--paper); color:var(--ink); font-family:"Noto Sans TC","Microsoft JhengHei","PingFang TC",system-ui,sans-serif; line-height:1.65; margin:0; padding:2rem 1rem 4rem; }
  main { max-width:940px; margin:0 auto; display:flex; flex-direction:column; gap:2.2rem; }
  header { border-bottom:2px solid var(--accent); padding-bottom:1.1rem; }
  .eyebrow { color:var(--accent); font-size:.8rem; letter-spacing:.12em; font-weight:600; }
  h1 { margin:.25rem 0 .4rem; font-size:1.7rem; line-height:1.3; }
  .sub { color:var(--muted); font-size:.92rem; }
  .sub a { color:var(--accent); }
  figure { margin:0; background:var(--card); border:1px solid var(--line); border-radius:6px; overflow:hidden; }
  figure img { display:block; width:100%; height:auto; }
  figcaption { padding:.9rem 1.1rem 1rem; border-top:1px solid var(--line); font-size:.92rem; }
  figcaption b { display:block; margin-bottom:.15rem; font-size:1.05rem; }
  .hl { color:var(--accent); font-weight:600; }
  footer { color:var(--muted); font-size:.85rem; border-left:3px solid var(--line); padding-left:.9rem; }
  footer a { color:var(--accent); }
</style>
</head>
<body>
<main>
  <header>
    <div class="eyebrow">BOREHOLE 3D VIEWER</div>
    <h1>功能視覺導覽</h1>
    <div class="sub">用截圖快速認識主要功能;完整操作說明見 <a href="https://github.com/bensonhualien-bit/borehole-3d-viewer/blob/master/docs/%E4%BD%BF%E7%94%A8%E6%89%8B%E5%86%8A.md">使用手冊</a>,線上試用回 <a href="./">Demo 首頁</a>(可載入 examples/ 範例專案)。</div>
  </header>

  <figure>
    <img src="${img("hero-3d.png")}" alt="3D 場景全景:實體地層塊、彩色等高線曲面、鑽孔柱與 CPT 曲線同框" loading="lazy" />
    <figcaption><b>3D 場景總覽</b>
    依真實座標把每支鑽孔畫成可旋轉/縮放的 3D 柱狀圖;圖中同時開啟了<span class="hl">半透明實體地層塊</span>、<span class="hl">Kriging 彩色等高線曲面</span>與 <span class="hl">CPT 貫入曲線</span>(右側藍色折線)。左上角是土質圖例與等高線數值圖例,各面板可即時調整。</figcaption>
  </figure>

  <figure>
    <img src="${img("layer-solid.png")}" alt="3D 實體地層建模:半透明地層塊與右下角建模面板" loading="lazy" />
    <figcaption><b>3D 地層建模(實體地層塊)</b>
    指定頂/底兩條邊界線的「地層」可一鍵變成有厚度的半透明 3D 實體——兩界面各自用 TIN/Kriging 內插成曲面後封閉成塊。右下角面板控制<span class="hl">每地層獨立的開關與透明度</span>、外插範圍;內插法跟隨等高線全域設定,實體與等高線曲面疊圖可對齊。尖滅區域(頂界低於底界)厚度自動歸零並提示。</figcaption>
  </figure>

  <figure>
    <img src="${img("cpt-curve.png")}" alt="CPT 測點旁的 qc 貫入曲線,hover 顯示數值行" loading="lazy" />
    <figcaption><b>CPT 貫入曲線</b>
    CPT 測點旁<span class="hl">常駐顯示 qc-深度折線</span>(深青色、自動面向鏡頭),全部 CPT 孔共用同一把比例尺,同深度可直接目視比較;滑鼠移到孔上會顯示各樣本的 qc 數值(字級與密度自動調整不疊字)。qc&lt;0 異常值以 0 繪製並標紅色「0」。曲線同樣出現在 2D 剖面與匯出 PDF,也能直接在曲線上點選地層分層點(吸附最近的量測樣本深度),參與等高線與實體建模。</figcaption>
  </figure>

  <figure>
    <img src="${img("siteplan-quick-insert.png")}" alt="配置圖快速插入:俯視顯示置中貼地的配置圖與寬度/角度欄位" loading="lazy" />
    <figcaption><b>廠區配置圖:快速插入</b>
    沒有參考點座標也能放:輸入高程按「快速插入」,圖片跟著滑鼠、左鍵點擊放置。之後可<span class="hl">拖曳平移</span>、拖右下角把手<span class="hl">同時縮放+旋轉</span>(中心錨定),或在面板的「圖片寬度(m)」「角度(°)」欄精確輸入;鎖定後全部停用防誤觸。傳統的兩點校準流程完整保留,兩種放法並存。</figcaption>
  </figure>

  <footer>本頁由 <code>scripts/generate-features-page.mjs</code> 從文件截圖產生;所有畫面皆為真實程式實拍,使用虛構範例場地資料。<a href="https://github.com/bensonhualien-bit/borehole-3d-viewer">GitHub 專案頁</a></footer>
</main>
</body>
</html>
`;
fs.writeFileSync(outPath, html);
console.log("public/features.html written:", (fs.statSync(outPath).size / 1024).toFixed(0), "KB");
