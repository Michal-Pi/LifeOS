import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Use exact match for workspace packages to ensure source files are used
      {
        find: '@lifeos/agents',
        replacement: path.resolve(__dirname, '../../packages/agents/src'),
      },
      {
        find: '@lifeos/calendar',
        replacement: path.resolve(__dirname, '../../packages/calendar/src'),
      },
      {
        find: '@lifeos/core',
        replacement: path.resolve(__dirname, '../../packages/core/src'),
      },
      {
        find: '@lifeos/platform-web',
        replacement: path.resolve(__dirname, '../../packages/platform-web/src'),
      },
      {
        find: '@lifeos/habits',
        replacement: path.resolve(__dirname, '../../packages/habits/src'),
      },
      {
        find: '@lifeos/mind',
        replacement: path.resolve(__dirname, '../../packages/mind/src'),
      },
      {
        find: '@lifeos/training',
        replacement: path.resolve(__dirname, '../../packages/training/src'),
      },
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
    ],
    // Ensure we resolve workspace packages from source, not dist
    conditions: ['import', 'module', 'browser', 'default'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // React and React ecosystem
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/react-router-dom')) {
            return 'react-router'
          }
          // Firebase SDK
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'firebase-vendor'
          }
          // TipTap editor (Notes feature only)
          if (id.includes('node_modules/@tiptap') || id.includes('node_modules/katex')) {
            return 'tiptap-vendor'
          }
          // UI libraries
          if (id.includes('node_modules/sonner')) {
            return 'ui-vendor'
          }
          // Calendar domain logic
          if (id.includes('packages/calendar')) {
            return 'calendar'
          }
        },
      },
    },
    // Increase chunk size warning limit since we're now splitting properly
    chunkSizeWarningLimit: 600,
  },
})
