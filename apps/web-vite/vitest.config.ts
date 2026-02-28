import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@lifeos/agents': path.resolve(__dirname, '../../packages/agents/src'),
      '@lifeos/calendar': path.resolve(__dirname, '../../packages/calendar/src'),
      '@lifeos/core': path.resolve(__dirname, '../../packages/core/src'),
      '@lifeos/habits': path.resolve(__dirname, '../../packages/habits/src'),
      '@lifeos/mind': path.resolve(__dirname, '../../packages/mind/src'),
      '@lifeos/notes': path.resolve(__dirname, '../../packages/notes/src'),
      '@lifeos/platform-web': path.resolve(__dirname, '../../packages/platform-web/src'),
      '@lifeos/todos': path.resolve(__dirname, '../../packages/todos/src'),
      '@lifeos/training': path.resolve(__dirname, '../../packages/training/src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
