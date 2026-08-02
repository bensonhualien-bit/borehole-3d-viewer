import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // .claude/ 底下可能有 harness 管理的 git worktree(自己的一份完整 src/ 副本),
    // 預設的 exclude 清單不包含這種專案自訂路徑,不排除的話同名測試檔會被跑兩次
    // (一次是這個 repo 真正的檔案,一次是巢狀 worktree 裡舊分支的副本),測試結果
    // 數量會虛胖、也可能被舊分支的行為蓋掉真正的結果。
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
