#!/usr/bin/env node
/**
 * LongPort broker patch uninstaller for OpenAlice.
 *
 * Run from the OpenAlice root directory:
 *   node packages/longport/scripts/remove-patch.mjs
 */

import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n')
}

// ---- 1. Remove longport files from src/ ----

const longportDir = resolve(ROOT, 'src/domain/trading/brokers/longport')
if (existsSync(longportDir)) {
  rmSync(longportDir, { recursive: true, force: true })
  console.log('✓ Removed src/domain/trading/brokers/longport/')
}

// ---- 2. Patch registry.ts ----

const registryPath = resolve(ROOT, 'src/domain/trading/brokers/registry.ts')
if (existsSync(registryPath)) {
  let content = readFileSync(registryPath, 'utf8')
  content = content.replace(
    /import \{ LongPortBroker \} from '\.\/longport\/LongPortBroker\.js'\n?/,
    '',
  )
  content = content.replace(
    /\n  longport: \{[\s\S]*?guardCategory: 'securities',\n  \},\n/,
    '\n',
  )
  writeFileSync(registryPath, content)
  console.log('✓ registry.ts cleaned')
}

// ---- 3. Patch index.ts ----

const indexPath = resolve(ROOT, 'src/domain/trading/brokers/index.ts')
if (existsSync(indexPath)) {
  let content = readFileSync(indexPath, 'utf8')
  content = content.replace(
    /\n\n\/\/ LongPort\nexport \{ LongPortBroker \} from '\.\/longport\/LongPortBroker\.js'\nexport \{ longPortConfigFields \} from '\.\/longport\/LongPortBroker\.js'/,
    '',
  )
  writeFileSync(indexPath, content)
  console.log('✓ index.ts cleaned')
}

// ---- 4. Remove longbridge from root package.json ----

const rootPkgPath = resolve(ROOT, 'package.json')
if (existsSync(rootPkgPath)) {
  const pkg = readJson(rootPkgPath)
  delete pkg.dependencies?.longbridge
  writeJson(rootPkgPath, pkg)
  console.log('✓ package.json cleaned')
}

// ---- 5. Remove root tsup.config.ts ----

const tsupPath = resolve(ROOT, 'tsup.config.ts')
if (existsSync(tsupPath)) {
  rmSync(tsupPath)
  console.log('✓ tsup.config.ts removed')
}

console.log('\n✅ LongPort broker patch removed successfully!\n')
console.log('Next steps:')
console.log('  1. pnpm install     # remove longbridge dependency')
console.log('  2. pnpm build:backend')
