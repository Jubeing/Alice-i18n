#!/usr/bin/env node
/**
 * LongPort token refresh cron script.
 *
 * Run this via crontab to auto-refresh LongPort tokens every 90 days.
 *
 * Crontab entry (runs on the 1st of every month at 4 AM):
 *   0 4 1 * * cd /home/ubuntu/OpenAlice && node packages/longport/scripts/refresh-token.mjs
 *
 * Alternatively, call `api.trading.refreshLongPortToken(accountId)` via the MCP tool interface.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')

async function main() {
  const accountsPath = resolve(ROOT, 'data/config/accounts.json')
  if (!existsSync(accountsPath)) {
    console.error('accounts.json not found')
    process.exit(1)
  }

  const accounts = JSON.parse(readFileSync(accountsPath, 'utf8'))
  const longportAccounts = accounts.filter((a) => a.type === 'longport' && a.brokerConfig?.autoRefresh)

  if (longportAccounts.length === 0) {
    console.log('No LongPort accounts with auto-refresh enabled.')
    return
  }

  const { refreshAccessToken } = await import('../src/longport-auth.js').catch(() => {
    // Try built dist
    return import('../../packages/longport/dist/longport-auth.js')
  })

  for (const account of longportAccounts) {
    const { appKey, appSecret, accessToken } = account.brokerConfig
    if (!appKey || !appSecret || !accessToken) {
      console.warn(`Skipping ${account.id}: missing credentials`)
      continue
    }

    try {
      console.log(`Refreshing token for ${account.id}...`)
      const { token, expiredAt } = await refreshAccessToken({ appKey, appSecret, accessToken })

      account.brokerConfig.accessToken = token
      account.brokerConfig.tokenExpiry = expiredAt

      writeFileSync(accountsPath, JSON.stringify(accounts, null, 2))
      console.log(`✓ ${account.id}: token refreshed, expires ${expiredAt}`)
    } catch (err) {
      console.error(`✗ ${account.id}: refresh failed — ${err.message}`)
    }
  }

  console.log('\nToken refresh complete.')
}

main().catch(console.error)
