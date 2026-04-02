/**
 * LongPortBroker — IBroker adapter for LongBridge OpenAPI.
 *
 * Supports:
 *   - US equities (NASDAQ, NYSE, ARCA)
 *   - Hong Kong equities (SEHK)
 *   - Singapore equities (SGX)
 *
 * Uses LongBridge Node.js SDK (longbridge v4) for trading & quotes.
 * Token management supports both manual and auto-refresh (HMAC-SHA256, every 90 days).
 */

import { z } from 'zod'
import Decimal from 'decimal.js'
import {
  BrokerError,
  type IBroker,
  type AccountCapabilities,
  type AccountInfo,
  type Position,
  type PlaceOrderResult,
  type OpenOrder,
  type Quote,
  type MarketClock,
  type BrokerConfigField,
  type TpSlParams,
} from '../types.js'
import { Contract, ContractDescription, ContractDetails, Order, OrderState } from '@traderalice/ibkr'
import { refreshAccessToken, isTokenExpiringSoon } from './longport-auth.js'
import { makeContract, resolveSymbol, makeContractDetails, mapAction, mapStatus } from './longport-contracts.js'
import type {
  LongPortAccountAsset,
  LongPortPosition,
  LongPortOrder,
  LongPortQuote,
  LongPortSubmitOrderResponse,
  LongPortOrderDetail,
} from './longport-types.js'

// Decimal constants (mimicking IBKR UNSET values)
const UNSET_DOUBLE = 0
const UNSET_DECIMAL = new Decimal(0)

// ---- Config Schema ----

export const LongPortBrokerConfigSchema = z.object({
  appKey: z.string().optional(),
  appSecret: z.string().optional(),
  accessToken: z.string().optional(),
  autoRefresh: z.boolean().default(false),
  tokenExpiry: z.string().optional(),
})

export type LongPortBrokerConfig = z.infer<typeof LongPortBrokerConfigSchema>

// ---- Config Fields (for dynamic UI) ----

export const longPortConfigFields: BrokerConfigField[] = [
  {
    name: 'appKey',
    type: 'text',
    label: 'App Key',
    required: true,
    sensitive: true,
    description: 'LongPort App Key from the developer portal (open.longbridge.com).',
  },
  {
    name: 'appSecret',
    type: 'password',
    label: 'App Secret',
    required: true,
    sensitive: true,
    description: 'LongPort App Secret from the developer portal.',
  },
  {
    name: 'accessToken',
    type: 'password',
    label: 'Access Token',
    required: true,
    sensitive: true,
    description: 'LongPort Access Token. Use "Refresh Token" button to renew automatically every 90 days.',
  },
  {
    name: 'autoRefresh',
    type: 'boolean',
    label: 'Auto-refresh Token',
    default: false,
    description:
      'Automatically refresh the access token every 90 days using HMAC-SHA256 signing. ' +
      'Requires appKey and appSecret to be set.',
  },
]

// ---- SDK helpers ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sdk = any

// Lazy import the SDK — LongPort uses `const enum` which is inlined at compile time,
// so we access them as module properties cast to `any` to avoid TS const-enum errors.
async function getSDK(): Promise<Sdk> {
  const mod = await import('longbridge')
  return mod as Sdk
}

// ---- Broker Implementation ----

export class LongPortBroker implements IBroker {
  // ---- Self-registration ----

  static configSchema = LongPortBrokerConfigSchema
  static configFields = longPortConfigFields

  static fromConfig(config: { id: string; label?: string; brokerConfig: Record<string, unknown> }): LongPortBroker {
    const bc = LongPortBrokerConfigSchema.parse(config.brokerConfig)
    return new LongPortBroker({
      id: config.id,
      label: config.label,
      appKey: bc.appKey ?? '',
      appSecret: bc.appSecret ?? '',
      accessToken: bc.accessToken ?? '',
      autoRefresh: bc.autoRefresh,
      tokenExpiry: bc.tokenExpiry,
    })
  }

  // ---- Instance ----

  readonly id: string
  readonly label: string

  private config: LongPortBrokerConfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _tradeCtx: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _quoteCtx: any = null

  constructor(config: {
    id: string
    label?: string
    appKey: string
    appSecret: string
    accessToken: string
    autoRefresh?: boolean
    tokenExpiry?: string
  }) {
    this.id = config.id
    this.label = config.label ?? 'LongPort'
    this.config = {
      appKey: config.appKey,
      appSecret: config.appSecret,
      accessToken: config.accessToken,
      autoRefresh: config.autoRefresh ?? false,
      tokenExpiry: config.tokenExpiry,
    }
  }

  // ---- Token helpers ----

  private get auth() {
    return {
      appKey: this.config.appKey ?? '',
      appSecret: this.config.appSecret ?? '',
      accessToken: this.config.accessToken ?? '',
    }
  }

  /**
   * Auto-refresh token if enabled and close to expiry.
   */
  private async ensureValidToken(): Promise<void> {
    if (!this.config.autoRefresh || !this.config.tokenExpiry) return
    if (!isTokenExpiringSoon(this.config.tokenExpiry, 7)) return

    const { appKey, appSecret, accessToken } = this.auth
    const result = await refreshAccessToken({ appKey, appSecret, accessToken })
    this.config.accessToken = result.token
    this.config.tokenExpiry = result.expiredAt
    console.log(`LongPortBroker[${this.id}]: token auto-refreshed, expires ${result.expiredAt}`)
  }

  /**
   * Manually refresh the access token. Exposed for UI / cron job use.
   */
  async refreshToken(): Promise<{ token: string; expiredAt: string }> {
    const { appKey, appSecret, accessToken } = this.auth
    const result = await refreshAccessToken({ appKey, appSecret, accessToken })
    this.config.accessToken = result.token
    this.config.tokenExpiry = result.expiredAt
    return result
  }

  // ---- SDK Lazy Init ----

  private async getTradeCtx() {
    if (this._tradeCtx) return this._tradeCtx
    const sdk = await getSDK()
    const { Config, TradeContext } = sdk
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const cfg = Config.fromApikey(this.config.appKey!, this.config.appSecret!, this.config.accessToken!)
    this._tradeCtx = TradeContext.new(cfg)
    return this._tradeCtx
  }

  private async getQuoteCtx() {
    if (this._quoteCtx) return this._quoteCtx
    const sdk = await getSDK()
    const { Config, QuoteContext } = sdk
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const cfg = Config.fromApikey(this.config.appKey!, this.config.appSecret!, this.config.accessToken!)
    this._quoteCtx = QuoteContext.new(cfg)
    return this._quoteCtx
  }

  // ---- Lifecycle ----

  async init(): Promise<void> {
    if (!this.config.appKey || !this.config.appSecret || !this.config.accessToken) {
      throw new BrokerError(
        'CONFIG',
        `Missing LongPort credentials. Set appKey, appSecret, and accessToken in accounts.json.`,
      )
    }

    try {
      await this.ensureValidToken()
      const ctx = await this.getTradeCtx()
      const assets = (await ctx.accountBalance()) as LongPortAccountAsset[]
      const total = assets.reduce((sum: number, a: LongPortAccountAsset) => sum + Number(a.netAssets ?? 0), 0)
      console.log(
        `LongPortBroker[${this.id}]: connected (accounts=${assets.length}, net_assets≈$${total.toFixed(2)})`,
      )
    } catch (err) {
      if (err instanceof BrokerError) throw err
      const msg = err instanceof Error ? err.message : String(err)
      if (/401|unauthorized|invalid.*token/i.test(msg)) {
        throw new BrokerError('AUTH', `LongPort authentication failed: ${msg}`)
      }
      throw BrokerError.from(err)
    }
  }

  async close(): Promise<void> {
    this._tradeCtx = null
    this._quoteCtx = null
  }

  // ---- Contract search ----

  async searchContracts(pattern: string): Promise<ContractDescription[]> {
    if (!pattern) return []
    try {
      const desc = new ContractDescription()
      desc.contract = makeContract(pattern.toUpperCase())
      return [desc]
    } catch {
      return []
    }
  }

  async getContractDetails(query: Contract): Promise<ContractDetails | null> {
    const symbol = resolveSymbol(query)
    if (!symbol) return null
    return makeContractDetails(symbol)
  }

  // ---- Trading operations ----

  async placeOrder(contract: Contract, order: Order, _tpsl?: TpSlParams): Promise<PlaceOrderResult> {
    try {
      await this.ensureValidToken()
      const ctx = await this.getTradeCtx()
      const symbol = resolveSymbol(contract)
      if (!symbol) return { success: false, error: 'Cannot resolve contract to LongPort symbol' }

      const sdk = await getSDK()
      const { Decimal: LBDecimal, OrderSide, TimeInForceType } = sdk

      // Map IBKR order type to LongPort OrderType
      const orderTypeToLB: Record<string, number> = {
        MKT: sdk.OrderType.MO,
        LMT: sdk.OrderType.LO,
        STP: sdk.OrderType.LIT,
        'STP LMT': sdk.OrderType.ELO,
      }
      const lbOrderType = orderTypeToLB[order.orderType] ?? sdk.OrderType.MO
      const lbSide = order.action === 'BUY' ? OrderSide.Buy : OrderSide.Sell

      // Map IBKR TIF to LongPort TimeInForceType
      const tifToLB: Record<string, number> = {
        DAY: TimeInForceType.Day,
        GTC: TimeInForceType.GoodTilCanceled,
        GTD: TimeInForceType.GoodTilDate,
      }
      const lbTif = tifToLB[order.tif ?? 'DAY'] ?? TimeInForceType.Day

      const lmtPrice = order.lmtPrice !== UNSET_DOUBLE ? Number(order.lmtPrice) : undefined

      const resp = (await ctx.submitOrder({
        symbol,
        orderType: lbOrderType,
        side: lbSide,
        timeInForce: lbTif,
        submittedPrice: lmtPrice != null ? new LBDecimal(lmtPrice.toString()) : undefined,
        submittedQuantity: new LBDecimal(order.totalQuantity.toString()),
      })) as LongPortSubmitOrderResponse

      const orderState = new OrderState()
      orderState.status = resp.status === 'active' ? 'Submitted' : resp.status

      return {
        success: true,
        orderId: resp.orderId,
        orderState,
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async modifyOrder(orderId: string, changes: Partial<Order>): Promise<PlaceOrderResult> {
    try {
      await this.ensureValidToken()
      const ctx = await this.getTradeCtx()
      const sdk = await getSDK()
      const { Decimal: LBDecimal } = sdk
      const patch: Record<string, unknown> = {}

      if (changes.lmtPrice != null && changes.lmtPrice !== UNSET_DOUBLE) {
        patch.submitted_price = new LBDecimal(changes.lmtPrice.toString())
      }
      if (changes.totalQuantity != null && !changes.totalQuantity.equals(UNSET_DECIMAL)) {
        patch.submitted_quantity = new LBDecimal(changes.totalQuantity.toString())
      }

      const resp = (await ctx.amendOrder(orderId, patch)) as LongPortSubmitOrderResponse
      const orderState = new OrderState()
      orderState.status = mapStatus(resp.status)
      return { success: true, orderId: resp.orderId, orderState }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async cancelOrder(orderId: string): Promise<PlaceOrderResult> {
    try {
      await this.ensureValidToken()
      const ctx = await this.getTradeCtx()
      await ctx.cancelOrder(orderId)
      const orderState = new OrderState()
      orderState.status = 'Cancelled'
      return { success: true, orderId, orderState }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async closePosition(contract: Contract, quantity?: Decimal): Promise<PlaceOrderResult> {
    const symbol = resolveSymbol(contract)
    if (!symbol) return { success: false, error: 'Cannot resolve contract to LongPort symbol' }

    try {
      const positions = await this.getPositions()
      const pos = positions.find((p) => p.contract.symbol === (contract.symbol ?? ''))
      if (!pos) return { success: false, error: `No position for ${symbol}` }

      const order = new Order()
      order.action = pos.side === 'long' ? 'SELL' : 'BUY'
      order.orderType = 'MKT'
      order.totalQuantity = quantity ?? pos.quantity
      order.tif = 'DAY'

      return this.placeOrder(contract, order)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // ---- Queries ----

  async getAccount(): Promise<AccountInfo> {
    try {
      const ctx = await this.getTradeCtx()
      const balances = (await ctx.accountBalance()) as LongPortAccountAsset[]

      let netLiq = 0
      let cash = 0
      let buyingPower = 0

      for (const b of balances) {
        netLiq += Number(b.netAssets ?? 0)
        cash += Number(b.totalCash ?? 0)
        if (b.buyPower) buyingPower += Number(b.buyPower)
      }

      return { netLiquidation: netLiq, totalCashValue: cash, unrealizedPnL: 0, buyingPower }
    } catch (err) {
      throw BrokerError.from(err)
    }
  }

  async getPositions(): Promise<Position[]> {
    try {
      const ctx = await this.getTradeCtx()
      const raw = (await ctx.accountPositions()) as LongPortPosition[]

      return raw.map((p) => ({
        contract: makeContract(p.symbol),
        side: p.positionSide === 'Long' ? 'long' : 'short',
        quantity: new Decimal(p.quantity),
        avgCost: Number(p.costPrice ?? 0),
        marketPrice: Number(p.market ?? 0),
        marketValue: Math.abs(Number(p.market ?? 0)),
        unrealizedPnL: Number(p.unrealizedPl ?? 0),
        realizedPnL: 0,
      }))
    } catch (err) {
      throw BrokerError.from(err)
    }
  }

  async getOrders(_orderIds: string[]): Promise<OpenOrder[]> {
    try {
      const ctx = await this.getTradeCtx()
      const today = (await ctx.todayOrders()) as LongPortOrder[]
      return today.map((o) => this.mapOpenOrder(o))
    } catch (err) {
      throw BrokerError.from(err)
    }
  }

  async getOrder(orderId: string): Promise<OpenOrder | null> {
    try {
      const ctx = await this.getTradeCtx()
      const detail = (await ctx.orderDetail(orderId)) as LongPortOrderDetail
      return this.mapOpenOrderFromDetail(detail)
    } catch {
      return null
    }
  }

  async getQuote(contract: Contract): Promise<Quote> {
    const symbol = resolveSymbol(contract)
    if (!symbol) throw new BrokerError('EXCHANGE', 'Cannot resolve contract to LongPort symbol')

    try {
      const ctx = await this.getQuoteCtx()
      const quotes = (await ctx.quote([symbol])) as LongPortQuote[]
      const q = quotes[0]
      const last = Number(q.lastPrice ?? 0)

      return {
        contract: makeContract(symbol),
        last,
        bid: last * 0.999,
        ask: last * 1.001,
        volume: q.volume ?? 0,
        high: Number(q.high ?? 0) || undefined,
        low: Number(q.low ?? 0) || undefined,
        timestamp: new Date(Number(q.timestamp ?? Date.now())),
      }
    } catch (err) {
      throw BrokerError.from(err)
    }
  }

  // ---- Capabilities ----

  getCapabilities(): AccountCapabilities {
    return {
      supportedSecTypes: ['STK'],
      supportedOrderTypes: ['MKT', 'LMT', 'STP', 'STP LMT'],
    }
  }

  async getMarketClock(): Promise<MarketClock> {
    // LongPort doesn't expose market hours directly.
    // Approximate US market: 14:30–21:00 UTC Mon–Fri.
    const now = new Date()
    const totalMins = now.getUTCHours() * 60 + now.getUTCMinutes()
    const isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5
    const isOpen = isWeekday && totalMins >= 870 && totalMins < 1260

    if (isOpen) {
      return {
        isOpen: true,
        nextClose: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 21, 0)),
        timestamp: now,
      }
    } else if (totalMins < 870) {
      return {
        isOpen: false,
        nextOpen: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 14, 30)),
        timestamp: now,
      }
    } else {
      const daysUntilOpen = now.getUTCDay() === 5 ? 3 : 1
      return {
        isOpen: false,
        nextOpen: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilOpen, 14, 30)),
        timestamp: now,
      }
    }
  }

  // ---- Contract identity ----

  getNativeKey(contract: Contract): string {
    return resolveSymbol(contract)
  }

  resolveNativeKey(nativeKey: string): Contract {
    return makeContract(nativeKey)
  }

  // ---- Internal ----

  private mapOpenOrder(o: LongPortOrder): OpenOrder {
    const contract = makeContract(o.symbol)
    const order = new Order()
    order.action = mapAction(o.side)
    order.totalQuantity = new Decimal(o.submittedQuantity ?? 0)
    order.orderType = o.orderType === 'MO' ? 'MKT' : o.orderType === 'LO' ? 'LMT' : o.orderType
    order.tif = o.timeInForce
    order.orderId = 0

    const orderState = new OrderState()
    orderState.status = mapStatus(o.status)

    return { contract, order, orderState, avgFillPrice: Number(o.avgPrice ?? 0) || undefined }
  }

  private mapOpenOrderFromDetail(d: LongPortOrderDetail): OpenOrder {
    const contract = makeContract(d.symbol)
    const order = new Order()
    order.action = mapAction(d.side)
    order.totalQuantity = new Decimal(d.submittedQuantity ?? 0)
    order.orderType = d.orderType === 'MO' ? 'MKT' : d.orderType === 'LO' ? 'LMT' : d.orderType
    order.tif = d.timeInForce
    order.orderId = 0

    const orderState = new OrderState()
    orderState.status = mapStatus(d.status)

    return { contract, order, orderState, avgFillPrice: Number(d.avgPrice ?? 0) || undefined }
  }
}
