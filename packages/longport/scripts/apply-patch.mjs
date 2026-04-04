#!/usr/bin/env node
/**
 * Longbridge broker patch installer for OpenAlice.
 *
 * Run from the OpenAlice root directory:
 *   node packages/longport/scripts/apply-patch.mjs
 *
 * This script:
 *   1. Copies longport-mcp to packages/longport-mcp/
 *   2. Copies broker files to src/domain/trading/brokers/longbridge/
 *   3. Patches src/domain/trading/brokers/registry.ts  (adds longbridge entry)
 *   4. Patches src/domain/trading/brokers/index.ts      (adds longbridge export)
 *   5. Adds longbridge dependency to the root package.json
 *   6. Creates tsup.config.ts for the root build
 *   7. Installs systemd service (auto-start + crash recovery)
 */

import { readFileSync, writeFileSync, existsSync, cpSync, rmSync, readdirSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = process.cwd()
const LONGPORT_PKG = resolve(__dirname, '..')
// Alice-Longbridge source root — set ALICE_LONGBRIDGE_ROOT env var to override
const ALICE_LONGBRIDGE_ROOT = process.env.ALICE_LONGBRIDGE_ROOT
  || resolve(ROOT, '../Alice-Longbridge')
const LONGBP_PORT_MCP_PKG = resolve(ALICE_LONGBRIDGE_ROOT, 'packages/longport-mcp')
const LONGBRIDGE_SRC_DEST = resolve(ROOT, 'src/domain/trading/brokers/longbridge')
const LONGPORT_MCP_DEST = resolve(ROOT, 'packages/longport-mcp')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n')
}

function patchFile(filePath, patches) {
  let content = readFileSync(filePath, 'utf8')
  for (const { find, replace } of patches) {
    if (!content.includes(find)) {
      console.error(`⚠  Could not find patch marker in ${filePath}:`)
      console.error(`   ${find}`)
    } else {
      content = content.replace(find, replace)
    }
  }
  writeFileSync(filePath, content)
  console.log(`✓ Patched ${filePath}`)
}

console.log('\n📦 Installing Longbridge broker patch...\n')

// ---- Step 0: Copy longport-mcp to OpenAlice packages ----

console.log('\n🔧 Installing longport-mcp...')
if (!existsSync(LONGBP_PORT_MCP_PKG)) {
  console.error('❌ longport-mcp not found in Alice-Longbridge/packages/longport-mcp')
  process.exit(1)
}

if (!existsSync(LONGPORT_MCP_DEST)) {
  mkdirSync(LONGPORT_MCP_DEST, { recursive: true })
}

// Copy longport-mcp files (excluding node_modules and dist)
const mcpFiles = readdirSync(LONGBP_PORT_MCP_PKG).filter(f => f !== 'node_modules' && f !== 'dist')
for (const f of mcpFiles) {
  cpSync(resolve(LONGBP_PORT_MCP_PKG, f), resolve(LONGPORT_MCP_DEST, f), { force: true, recursive: true })
}
console.log(`✓ Copied longport-mcp to packages/longport-mcp/`)

// ---- Step 1: Copy broker files to src/ ----

if (!existsSync(resolve(LONGPORT_PKG, 'src'))) {
  console.error('❌ Source files not found in packages/longport/src')
  process.exit(1)
}

if (!existsSync(LONGBRIDGE_SRC_DEST)) {
  mkdirSync(LONGBRIDGE_SRC_DEST, { recursive: true })
}

const srcFiles = readdirSync(resolve(LONGPORT_PKG, 'src'))
for (const f of srcFiles) {
  cpSync(resolve(LONGPORT_PKG, 'src', f), resolve(LONGBRIDGE_SRC_DEST, f), { force: true })
}
console.log(`✓ Copied ${srcFiles.length} source files to src/domain/trading/brokers/longbridge/`)

// ---- Step 2: Add longbridge to root dependencies ----

console.log('\n🔧 Adding longbridge dependency...')
const rootPkg = readJson(resolve(ROOT, 'package.json'))

if (!rootPkg.dependencies?.longbridge) {
  rootPkg.dependencies = { ...rootPkg.dependencies, longbridge: '^4.0.0' }
}

writeJson(resolve(ROOT, 'package.json'), rootPkg)
console.log('✓ package.json updated')

// ---- Step 3: Create root tsup.config.ts ----

const tsupPath = resolve(ROOT, 'tsup.config.ts')
const tsupContent = `import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  target: 'node20',
  external: ['longbridge', 'sharp'],
})
`

if (!existsSync(tsupPath)) {
  writeFileSync(tsupPath, tsupContent)
  console.log('✓ Created tsup.config.ts')
}

// ---- Step 4: Patch registry.ts ----

console.log('\n🔧 Patching broker registry...')
const registryPath = resolve(ROOT, 'src/domain/trading/brokers/registry.ts')
const registryContent = readFileSync(registryPath, 'utf8')

if (registryContent.includes("'longbridge'")) {
  console.log('✓ registry.ts already contains longbridge — skipping')
} else {
  patchFile(registryPath, [
    {
      find: `import { IbkrBroker } from './ibkr/IbkrBroker.js'`,
      replace: `import { IbkrBroker } from './ibkr/IbkrBroker.js'\nimport { LongbridgeBroker } from './longbridge/LongbridgeBroker.js'`,
    },
  ])

  const insertAfter = `  ibkr: {`
  const entry = `  longbridge: {
    configSchema: LongbridgeBroker.configSchema,
    configFields: LongbridgeBroker.configFields,
    fromConfig: LongbridgeBroker.fromConfig,
    name: 'Longbridge (HK/US/SG)',
    description: 'Longbridge — Hong Kong, US, and Singapore equities. Commission-free trading with integrated market data.',
    badge: 'LB',
    badgeColor: 'text-blue-400',
    subtitleFields: [
      { field: 'autoRefresh', label: 'Auto-refresh' },
    ],
    guardCategory: 'securities',
  },
  ibkr: {`

  let content = readFileSync(registryPath, 'utf8')
  writeFileSync(registryPath, content.replace(insertAfter, entry))
  console.log('✓ registry.ts patched')
}

// ---- Step 5: Patch index.ts ----

console.log('\n🔧 Patching broker index...')
const indexPath = resolve(ROOT, 'src/domain/trading/brokers/index.ts')
const indexContent = readFileSync(indexPath, 'utf8')

if (indexContent.includes("'./longbridge'") || indexContent.includes('@traderalice/longbridge')) {
  console.log('✓ index.ts already contains longbridge export — skipping')
} else {
  patchFile(indexPath, [
    {
      find: `export { IbkrBroker } from './ibkr/index.js'`,
      replace: `export { IbkrBroker } from './ibkr/index.js'\n\n// Longbridge\nexport { LongbridgeBroker } from './longbridge/LongbridgeBroker.js'\nexport { longbridgeConfigFields } from './longbridge/LongbridgeBroker.js'`,
    },
  ])
}

// ---- Step 6: Install systemd service (auto-start + crash recovery) ----

console.log('\n🔧 Installing systemd service (auto-start + crash recovery)...')

const systemdSrc = resolve(LONGPORT_PKG, 'systemd/openalice.service')
const systemdDest = '/etc/systemd/system/openalice.service'

if (!existsSync(systemdSrc)) {
  console.log('⚠ systemd service file not found — skipping')
} else {
  let serviceContent = readFileSync(systemdSrc, 'utf8')
  serviceContent = serviceContent.replace(/\{\{OPENALICE_ROOT\}\}/g, ROOT)
  serviceContent = serviceContent.replace(/\{\{LONGBRIDGE_MCP_ROOT\}\}/g, resolve(ROOT, 'packages/longport-mcp'))

  const tmpPath = '/tmp/openalice.service'
  writeFileSync(tmpPath, serviceContent)

  try {
    execSync(`sudo cp ${tmpPath} ${systemdDest}`, { stdio: 'pipe' })
    execSync('sudo systemctl daemon-reload', { stdio: 'pipe' })
    execSync('sudo systemctl enable openalice', { stdio: 'pipe' })
    execSync('sudo systemctl start openalice', { stdio: 'pipe' })
    console.log('✓ systemd service installed')
    console.log('  • Status: sudo systemctl status openalice')
    console.log('  • Logs:   sudo journalctl -u openalice -f')
  } catch (e) {
    console.log('⚠ Could not install systemd service (may need sudo):', e.message)
  }
}

console.log('\n✅ Longbridge broker patch applied successfully!\n')
console.log('Next steps:')
console.log('  1. pnpm install                  # install all dependencies (including longport-mcp)')
console.log('  2. pnpm build                    # build everything (broker + MCP server)')
console.log('  3. sudo systemctl restart openalice   # reload with new build')
console.log('\n🎉 All done!')
