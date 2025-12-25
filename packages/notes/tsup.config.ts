import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'es2022',
    tsconfig: 'tsconfig.tsup.json',
    splitting: false,
  },
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['cjs'],
    dts: false,
    clean: false,
    sourcemap: true,
    target: 'es2022',
    tsconfig: 'tsconfig.tsup.json',
    splitting: false,
    outExtension: () => ({ js: '.cjs' }),
  },
])
