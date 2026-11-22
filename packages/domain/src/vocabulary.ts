export const MARKETS = ['US', 'TH'] as const
export type Market = (typeof MARKETS)[number]

export const EXCHANGES_BY_MARKET = {
  US: ['NYSE', 'NASDAQ'],
  TH: ['SET', 'mai'],
} as const satisfies Record<Market, readonly string[]>
export type Exchange = (typeof EXCHANGES_BY_MARKET)[Market][number]
export const ALL_EXCHANGES = [...EXCHANGES_BY_MARKET.US, ...EXCHANGES_BY_MARKET.TH] as const

export const CURRENCY_BY_MARKET = { US: 'USD', TH: 'THB' } as const satisfies Record<Market, string>
export type Currency = (typeof CURRENCY_BY_MARKET)[Market]

export const INDEXES_BY_MARKET = {
  US: ['S&P 500', 'Nasdaq-100'],
  TH: ['SET50', 'SET100'],
} as const satisfies Record<Market, readonly string[]>
export type IndexName = (typeof INDEXES_BY_MARKET)[Market][number]
export const ALL_INDEXES = [...INDEXES_BY_MARKET.US, ...INDEXES_BY_MARKET.TH] as const

/** Enumerated lens values in the canonical spelling of requirements FR-003. */
export const LENS_VALUES = {
  gicsSector: [
    'Communication Services',
    'Consumer Discretionary',
    'Consumer Staples',
    'Energy',
    'Financials',
    'Health Care',
    'Industrials',
    'Information Technology',
    'Materials',
    'Real Estate',
    'Utilities',
  ],
  setIndustryGroup: [
    'Agro & Food Industry',
    'Consumer Products',
    'Financials',
    'Industrials',
    'Property & Construction',
    'Resources',
    'Services',
    'Technology',
  ],
  valueChainPosition: ['Upstream', 'Midstream', 'Downstream', 'Integrated', 'None'],
  size: ['Mega', 'Large', 'Mid', 'Small', 'Micro'],
  style: ['Growth', 'Value', 'Dividend', 'Quality'],
  economicCycle: ['Cyclical', 'Sensitive', 'Defensive'],
  lynchType: ['Fast Grower', 'Stalwart', 'Slow Grower', 'Cyclical', 'Turnaround', 'Asset Play'],
  lifeCycle: ['Growth', 'Mature', 'Turnaround', 'Decline'],
  customers: ['B2B', 'B2C', 'Government'],
  revenueTypes: ['Subscription', 'Transaction fee', 'Product sale', 'Ads', 'Rent', 'Interest'],
  moat: ['Brand', 'Network effect', 'Switching cost', 'Cost advantage', 'Efficient scale', 'Intangibles', 'Unclear'],
  volatility: ['High', 'Mid', 'Low'],
} as const

export type GicsSector = (typeof LENS_VALUES.gicsSector)[number]
export type SetIndustryGroup = (typeof LENS_VALUES.setIndustryGroup)[number]
export type ValueChainPosition = (typeof LENS_VALUES.valueChainPosition)[number]
export type EconomicCycle = (typeof LENS_VALUES.economicCycle)[number]

export const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,11}$/

/** Trims, then upper-cases ASCII letters only, so `ß` or `ſ` can never become `SS` or `S`. */
export function normaliseTicker(raw: string): string {
  return raw.trim().replace(/[a-z]/g, (c) => c.toUpperCase())
}

/** Length in characters (code points), as Postgres `char_length` counts them. */
export function charLength(s: string): number {
  return [...s].length
}
