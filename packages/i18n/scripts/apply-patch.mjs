#!/usr/bin/env node
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../../..')

const PATCHES = [
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
  '0016-i18n-en-ts.patch',
  '0017-i18n-zh-ts.patch',
  '0018-i18n-index-tsx.patch',
]

function patch(patchFile) {
  try {
    const out = execSync(`patch -p1 -N < "${patchFile}" 2>&1`, { cwd: ROOT, encoding: 'utf8' })
    console.log(`✓ ${patchFile.split('/').pop()}`)
    return true
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '')
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
