/**
 * LongPort broker raw API types (from LongBridge OpenAPI SDK v4).
 * Aligned to IBKR naming conventions where possible.
 *
 * Note: SDK uses Decimal.js Decimal for all monetary/quantity values.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DecimalLike = { toString(): string; [key: string]: any }

export interface LongPortAccountAsset {
  accountId: string
  netAssets: DecimalLike     // Net liquidation value
  totalCash: DecimalLike     // Total cash
  cashInfos: Array<{
    withdrawCash: DecimalLike
    availableCash: DecimalLike
    frozenCash: DecimalLike
    settlingCash: DecimalLike
    currency: string
  }>
  maxFinanceAmount: DecimalLike
  remainingFinanceAmount: DecimalLike
  riskLevel: number
  marginCall: DecimalLike
  currency: string
  buyPower?: DecimalLike
  initMargin?: DecimalLike
  maintenanceMargin?: DecimalLike
}

export interface LongPortPosition {
  symbol: string
  symbolName: string
  quantity: number
  availableQuantity: number
  dryQuantity: number
  costPrice: DecimalLike
  market: DecimalLike
  unrealizedPl: DecimalLike
  unrealizedPlCcy: DecimalLike
  todayPl: DecimalLike
  todayPlCcy: DecimalLike
  positionSide: 'Long' | 'Short'
}

export interface LongPortOrder {
  orderId: string
  orderType: string
  positionSide: string
  side: string
  status: string
  symbol: string
  submittedPrice: DecimalLike
  submittedQuantity: number
  filledQuantity: number
  avgPrice: DecimalLike
  createdAt: string
  updatedAt: string
  timeInForce: string
  remark?: string
  lastShare: DecimalLike
  lastPrice: DecimalLike
}

export interface LongPortSubmitOrderResponse {
  orderId: string
  status: string
  executedQty?: number
  message?: string
}

export interface LongPortOrderDetail {
  orderId: string
  symbol: string
  orderType: string
  side: string
  positionSide: string
  status: string
  submittedPrice: DecimalLike
  submittedQuantity: number
  filledQuantity: number
  avgPrice: DecimalLike
  createdAt: string
  updatedAt: string
  timeInForce: string
  lastShare: DecimalLike
  lastPrice: DecimalLike
  legs?: Array<{
    orderId: string
    symbol: string
    orderType: string
    side: string
    submittedPrice: DecimalLike
    submittedQuantity: number
    filledQuantity: number
    avgPrice: DecimalLike
  }>
}

export interface LongPortQuote {
  lastPrice: DecimalLike
  lastClose?: DecimalLike
  open?: DecimalLike
  high?: DecimalLike
  low?: DecimalLike
  volume?: number
  timestamp?: number
  tradeSession?: string
}

export interface LongPortSymbolSearchResult {
  symbol: string
  name: string
  exchange: string
  securityType: string
}
