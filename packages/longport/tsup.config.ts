import { defineConfig } from 'tsup'

export default defineConfig([
  // Broker build
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'node20',
    external: ['longbridge'],
    outDir: 'dist',
  },
  // MCP server build
  {
    entry: ['mcp/index.ts'],
    format: ['esm'],
    clean: false,
    sourcemap: true,
    target: 'node20',
    external: ['longbridge', '@modelcontextprotocol/sdk'],
    outDir: 'dist-mcp',
  },
])
