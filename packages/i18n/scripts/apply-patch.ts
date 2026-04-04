/**
 * i18n patch installer for OpenAlice UI.
 *
 * Run from the OpenAlice root directory:
 *   node packages/i18n/scripts/apply-patch.ts
 */

import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '../../..')

const PATCHES = [
  // UI i18n + feature patches
  '0001-main-tsx.patch',
  '0002-Sidebar-tsx.patch',
  '0003-SettingsPage-tsx.patch',
  '0004-DevPage-tsx.patch',
  '0005-AIProviderPage-tsx.patch',
  '0006-TradingPage-tsx.patch',
  '0007-ToolsPage-tsx.patch',
  '0008-ConnectorsPage-tsx.patch',
  '0009-NewsPage-tsx.patch',
  '0010-MarketDataPage-tsx.patch',
  '0011-HeartbeatPage-tsx.patch',
  '0012-AgentStatusPage-tsx.patch',
  '0013-EventsPage-tsx.patch',
  '0014-PortfolioPage-tsx.patch',
  '0015-ChatPage-tsx.patch',
  // i18n translation files (markers — content comes from copied packages/i18n/)
  '0016-i18n-en-ts.patch',
  '0017-i18n-zh-ts.patch',
  '0018-i18n-index-tsx.patch',
  // Backend + integration patches
  '0019-model-factory.patch',
  '0020-config-minimax.patch',
  '0021-trading-config-oauth.patch',
  '0022-broker-registry.patch',
  '0023-broker-index.patch',
  '0024-package-json.patch',
  '0025-trading-api.patch',
  '0026-trading-types.patch',
]

function patch(patchFile: string): boolean {
  try {
    execSync(`patch -p1 -N < "${patchFile}" 2>&1`, { cwd: ROOT, stdio: 'inherit' })
    console.log(`✓ ${patchFile.split('/').pop()}`)
    return true
  } catch (e) {
    const out = ((e as { stdout?: string }).stdout || '') + ((e as { stderr?: string }).stderr || '')
    // Already applied or target missing — not fatal
    if (out.includes('Skipping patch') || out.includes('No such file') || out.includes('file not found')) {
      console.log(`⚠ ${patchFile.split('/').pop()} — skipped (already patched or file missing)`)
      // Clean up any .rej files created by patch -N
      const base = patchFile.replace(/\.patch$/, '')
      try { execSync(`rm -f "${base}.rej"`, { stdio: 'ignore' }) } catch {}
      return true
    }
    // Genuine failure
    console.log(`✗ ${patchFile.split('/').pop()} — failed`)
    return false
  }
}

console.log('\n🔧 Applying i18n patches...\n')

let allOk = true
for (const p of PATCHES) {
  const patchFile = resolve(__dirname, '../patches', p)
  if (!existsSync(patchFile)) {
    console.log(`⚠ ${p} not found — skipping`)
    continue
  }
  if (!patch(patchFile)) allOk = false
}

if (allOk) {
  console.log('\n✅ All i18n patches applied successfully!')
} else {
  console.log('\n⚠ Some patches failed — check above')
}
