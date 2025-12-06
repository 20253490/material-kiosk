import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/material-kiosk/', // 이 줄이 꼭 있어야 합니다!
})
