/**
 * LongPort contract helpers — maps between LongPort symbols and IBKR Contract objects.
 *
 * LongPort uses unified symbols:
 *   - US: "AAPL.US", "TSLA.US", "NVDA.US"
 *   - HK: "700.HK", "9988.HK"
 *   - SG: "D05.SI"
 *
 * These are mapped to/from IBKR Contract objects using the same conventions
 * as the AlpacaBroker (ticker-based native key for stocks).
 */

import { Contract, ContractDetails } from '@traderalice/ibkr'

/**
 * Build an IBKR Contract from a LongPort symbol string.
 */
export function makeContract(symbol: string): Contract {
  const c = new Contract()
  c.symbol = symbol.replace(/\.(US|HK|SG)$/, '') // Strip suffix for localSymbol
  c.localSymbol = symbol

  if (symbol.endsWith('.HK')) {
    c.exchange = 'SEHK'
    c.currency = 'HKD'
    c.secType = 'STK'
  } else if (symbol.endsWith('.SG')) {
    c.exchange = 'SGX'
    c.currency = 'SGD'
    c.secType = 'STK'
  } else {
    // US stocks
    c.exchange = 'SMART'
    c.currency = 'USD'
    c.secType = 'STK'
  }

  return c
}

/**
 * Resolve a contract to its LongPort symbol string.
 */
export function resolveSymbol(contract: Contract): string {
  if (!contract) return ''

  // If already a LongPort-format localSymbol
  if (contract.localSymbol && /\.(US|HK|SG)$/.test(contract.localSymbol)) {
    return contract.localSymbol
  }

  // Fall back to symbol + exchange inference
  const sym = contract.symbol ?? ''
  const ex = contract.exchange?.toUpperCase() ?? ''
  const cur = contract.currency?.toUpperCase() ?? ''

  if (ex === 'SEHK' || cur === 'HKD') return `${sym}.HK`
  if (ex === 'SGX' || cur === 'SGD') return `${sym}.SI`
  return `${sym}.US`
}

/**
 * Build ContractDetails for a LongPort symbol.
 */
export function makeContractDetails(symbol: string): ContractDetails {
  const details = new ContractDetails()
  details.contract = makeContract(symbol)

  // LongPort covers US (NASDAQ/NYSE), HK, SG
  details.validExchanges = 'SMART,NYSE,NASDAQ,ARCA,SEHK,SGX'
  details.orderTypes = 'MKT,LO,MO,STOP,STOP_LIMIT,TSLP'
  details.stockType = 'COMMON'

  return details
}

/**
 * Map LongPort order side to IBKR action.
 */
export function mapSide(side: string): 'BUY' | 'SELL' {
  return side === 'Buy' ? 'BUY' : 'SELL'
}

/**
 * Map IBKR action to LongPort order side.
 */
export function mapAction(action: string): 'Buy' | 'Sell' {
  return action === 'BUY' ? 'Buy' : 'Sell'
}

/**
 * Map LongPort order status string to IBKR order status.
 */
export function mapStatus(status: string): string {
  const map: Record<string, string> = {
    Filled: 'Filled',
    Cancelled: 'Cancelled',
    Submitted: 'Submitted',
    PartialFilled: 'PartiallyFilled',
    Rejected: 'Rejected',
    Expired: 'Expired',
  }
  return map[status] ?? status
}
