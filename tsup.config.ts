import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  target: 'node20',
  // Externalize native modules — they must be loaded from node_modules at runtime
  external: ['longbridge', 'sharp'],
})
