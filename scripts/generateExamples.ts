// 用法:npx vite-node scripts/generateExamples.ts
import { mkdirSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { buildExampleCsv, buildExampleWorkbook, buildExampleProjectJson, buildExampleBoreholes } from "./exampleSite";

mkdirSync("examples", { recursive: true });
// 前置 UTF-8 BOM:App 匯入器不受影響(TextDecoder 會吃掉 BOM),但繁中使用者
// 雙擊用 Excel 開啟時,沒有 BOM 會被當成 Big5 而顯示亂碼(external review 6-11)。
writeFileSync("examples/範例鑽孔資料.csv", "﻿" + buildExampleCsv(), "utf8");
// XLSX.writeFile 依賴模組內部對 Node `require('fs')` 的偵測來直接寫檔,
// vite-node 底下以 ESM 執行時偵測不到,會丟出「cannot save file」。
// 改用 XLSX.write 產生 buffer 後自行以 node:fs 寫檔即可繞過。
const xlsxBuffer = XLSX.write(buildExampleWorkbook(), { type: "buffer", bookType: "xlsx" }) as Buffer;
writeFileSync("examples/範例鑽探報告.xlsx", xlsxBuffer);
writeFileSync("examples/範例專案.json", buildExampleProjectJson(), "utf8");
console.log("examples/ 三檔已產生");

// 內建預設場景(App.tsx 首次載入時顯示)直接沿用同一份虛構範例場地,
// 讓公開 demo 的第一印象與文件截圖一致(external review item 5-11)。
const mockBoreholesSource = `// 此檔由 scripts/generateExamples.ts 產生,勿手改;資料來源 scripts/exampleSite.ts
import type { Borehole } from "../types/borehole";

export const mockBoreholes: Borehole[] = ${JSON.stringify(buildExampleBoreholes(), null, 2)};
`;
writeFileSync("src/data/mockBoreholes.ts", mockBoreholesSource, "utf8");
console.log("src/data/mockBoreholes.ts 已產生");
