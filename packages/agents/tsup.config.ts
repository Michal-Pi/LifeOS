import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  // Bundle zod instead of externalizing it
  // This ensures zod is available when the package is used
  noExternal: ['zod'],
  // Externalize workspace packages (they'll be resolved by the consumer)
  external: ['@lifeos/core'],
})
