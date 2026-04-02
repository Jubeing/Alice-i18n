/**
 * LongPort authentication & token management.
 *
 * Supports two modes:
 * 1. Manual mode — user provides APP_KEY, APP_SECRET, ACCESS_TOKEN directly
 * 2. Auto-refresh mode — uses HMAC-SHA256 to refresh the ACCESS_TOKEN every 90 days
 *
 * Token refresh follows the LongBridge OpenAPI V1 signing algorithm.
 */

import crypto from 'crypto'
import https from 'https'

const LB_HTTP_URL = 'https://openapi.longportapp.com'

export interface AuthConfig {
  appKey: string
  appSecret: string
  accessToken: string
}

export interface TokenRefreshResult {
  token: string
  expiredAt: string
}

/**
 * Build HMAC-SHA256 canonical request signature for LongBridge V1 API.
 */
function buildSignature(
  method: string,
  uri: string,
  params: string,
  body: string,
  accessToken: string,
  appKey: string,
  appSecret: string,
  timestamp: string,
): string {
  const canonicalParams = `expired_at=${encodeURIComponent(params)}`
  const canonicalRequest =
    `${method}|${uri}|${canonicalParams}|authorization:${accessToken}\nx-api-key:${appKey}\nx-timestamp:${timestamp}\n|authorization;x-api-key;x-timestamp|`

  let toSign = `HMAC-SHA256|${crypto.createHash('sha1').update(canonicalRequest, 'utf8').digest('hex')}`
  if (body !== '') {
    const payloadHash = crypto.createHash('sha1').update(body, 'utf8').digest('hex')
    toSign = canonicalRequest + payloadHash
  }

  const signStr = `HMAC-SHA256|${crypto.createHash('sha1').update(toSign, 'utf8').digest('hex')}`
  const signature = crypto
    .createHmac('sha256', appSecret)
    .update(signStr, 'utf8')
    .digest('hex')

  return `HMAC-SHA256 SignedHeaders=authorization;x-api-key;x-timestamp, Signature=${signature}`
}

/**
 * Refresh the LongPort ACCESS_TOKEN using HMAC-SHA256 signing.
 * The new token is valid for 90 days.
 */
export async function refreshAccessToken(config: AuthConfig): Promise<TokenRefreshResult> {
  const timestamp = Date.now().toString()

  // Set expiry to 90 days from now (ISO8601)
  const expireDate = new Date()
  expireDate.setDate(expireDate.getDate() + 90)
  const expiredAt = expireDate.toISOString()

  const uri = '/v1/token/refresh'
  const signature = buildSignature('GET', uri, expiredAt, '', config.accessToken, config.appKey, config.appSecret, timestamp)

  const url = `${LB_HTTP_URL}${uri}?expired_at=${encodeURIComponent(expiredAt)}`

  const result = await new Promise<{ code: number; data?: { token: string; expired_at: string }; message?: string }>(
    (resolve, reject) => {
      const req = https.request(
        url,
        {
          method: 'GET',
          headers: {
            Authorization: config.accessToken,
            'x-api-key': config.appKey,
            'x-timestamp': timestamp,
            'x-api-signature': signature,
          },
        },
        (res) => {
          let data = ''
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () => {
            try {
              resolve(JSON.parse(data))
            } catch {
              reject(new Error(`Invalid JSON response: ${data}`))
            }
          })
        },
      )
      req.on('error', reject)
      req.end()
    },
  )

  if (result.code !== 0 || !result.data?.token) {
    throw new Error(`Token refresh failed (code=${result.code}): ${result.message ?? 'Unknown error'}`)
  }

  return {
    token: result.data.token,
    expiredAt: result.data.expired_at,
  }
}

/**
 * Check if a token is close to expiry (within `days` threshold).
 */
export function isTokenExpiringSoon(expiredAt: string, days = 7): boolean {
  const expiry = new Date(expiredAt).getTime()
  const now = Date.now()
  return expiry - now < days * 24 * 60 * 60 * 1000
}

/**
 * Parse an ISO8601 expiry string into a Date.
 */
export function parseExpiry(isoDate: string): Date {
  return new Date(isoDate)
}
