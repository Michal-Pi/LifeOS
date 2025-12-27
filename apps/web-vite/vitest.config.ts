import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@lifeos/calendar': path.resolve(__dirname, '../../packages/calendar/src'),
      '@lifeos/core': path.resolve(__dirname, '../../packages/core/src'),
      '@lifeos/platform-web': path.resolve(__dirname, '../../packages/platform-web/src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
