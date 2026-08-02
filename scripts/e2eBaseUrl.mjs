// 所有 debug-e2e 腳本共用的目標網址。
// 預設 5199(安全的「腳本自用」port)——port 5173 是使用者本人的 live dev server,
// 任何自動化預設都不准指向它。要跑別的目標,設環境變數:
//   E2E_BASE_URL=http://localhost:5199/ node scripts/debug-e2e-xxx.mjs
// (刻意沒有任何邏輯會 fallback 到 5173;要打 5173 必須人為明確設定。)
export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5199/";
