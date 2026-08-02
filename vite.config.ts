import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Rolldown-Vite 預設不切分 chunk;沒開這個的話動態 import("jspdf") 仍會被
    // 打進主 bundle,PDF 匯出功能就會拖慢所有使用者的初始載入——這正是選它做
    // 動態 import 的原因,所以這裡明確打開 code splitting。
    rolldownOptions: {
      output: {
        codeSplitting: true,
      },
    },
  },
})
