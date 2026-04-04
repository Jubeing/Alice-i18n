#!/usr/bin/env node
/**
 * Longbridge token refresh cron script.
 *
 * Auto-refreshes Longbridge access tokens for all Longbridge accounts
 * on the 1st of every month (or when manually triggered).
 *
 * Crontab entry (runs on the 1st of every month at 4 AM):
 *   0 4 1 * * cd /home/ubuntu/OpenAlice && node packages/longport/scripts/refresh-token.mjs
 *
 * Tokens are refreshed via HMAC-SHA256 signing and last 90 days.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// ROOT is OpenAlice root when run via cron
const ROOT = process.env.ALICE_ROOT || '/home/ubuntu/OpenAlice'

async function main() {
  const accountsPath = resolve(ROOT, 'data/config/accounts.json')
  if (!existsSync(accountsPath)) {
    console.error('accounts.json not found at:', accountsPath)
    process.exit(1)
  }

  const accounts = JSON.parse(readFileSync(accountsPath, 'utf8'))
  // Process ALL Longbridge accounts (autoRefresh field removed, always refresh on 1st of month)
  const longbridgeAccounts = accounts.filter((a) => a.type === 'longbridge')

  if (longbridgeAccounts.length === 0) {
    console.log('No Longbridge accounts found.')
    return
  }

  const { refreshAccessToken } = await import(resolve(ROOT, 'packages/longport/dist/longbridge-auth.js'))

  for (const account of longbridgeAccounts) {
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
