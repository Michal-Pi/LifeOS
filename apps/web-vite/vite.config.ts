import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@lifeos/calendar': path.resolve(__dirname, '../../packages/calendar/src'),
      '@lifeos/core': path.resolve(__dirname, '../../packages/core/src'),
      '@lifeos/platform-web': path.resolve(__dirname, '../../packages/platform-web/src'),
    },
  }
})
