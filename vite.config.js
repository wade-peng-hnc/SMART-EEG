import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // 引入插件

export default defineConfig({
  base: '/SMART-EEG/',
  build: {
    outDir: 'docs',
  },
  plugins: [
    react(),
    tailwindcss(), // 啟用 Tailwind
  ],
})