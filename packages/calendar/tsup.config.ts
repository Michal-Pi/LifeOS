import { defineConfig } from 'tsup'
import path from 'path'

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/recurrence/rruleAdapter.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'es2022',
    tsconfig: 'tsconfig.tsup.json',
    splitting: false,
    esbuildOptions(options) {
      options.alias = {
        ...(options.alias || {}),
        '@lifeos/calendar/recurrence/rruleAdapter': path.resolve('src/recurrence/rruleAdapter.ts')
      }
    }
  },
  {
    entry: {
      index: 'src/index.ts',
      'recurrence/rruleAdapter': 'src/recurrence/rruleAdapter.cjs.ts'
    },
    format: ['cjs'],
    dts: false,
    clean: false,
    sourcemap: true,
    target: 'es2022',
    tsconfig: 'tsconfig.tsup.json',
    splitting: false,
    outExtension: () => ({ js: '.cjs' }),
    esbuildOptions(options) {
      options.alias = {
        ...(options.alias || {}),
        '@lifeos/calendar/recurrence/rruleAdapter': path.resolve('src/recurrence/rruleAdapter.cjs.ts')
      }
    }
  }
])
