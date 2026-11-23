/** All user-facing validation text lives here so i18n can replace the map later. */
export const MESSAGES = {
  required: 'is required',
  tickerFormat: 'must be 1-12 characters from A-Z, 0-9, "." and "-", starting with a letter or digit',
  nameLength: 'must be 1-200 characters',
  listNameLength: 'must be 1-60 characters',
  valueChainLength: 'must be 1-60 characters',
  themeLength: 'each theme must be 1-40 characters',
  themesMax: 'at most 20 themes',
  oneOf: (values: readonly string[]) => `must be one of: ${values.join(', ')}`,
  exchangeForMarket: (market: string, allowed: readonly string[]) =>
    `must be ${allowed.join(' or ')} for market ${market}`,
  indexForMarket: (market: string, allowed: readonly string[]) =>
    `must be ${allowed.join(' or ')} for market ${market}`,
  thNeedsGics: 'is required when the SET industry group is set',
  thNeedsSetGroup: 'is required when the GICS sector is set',
  usNoSetGroup: 'applies to TH stocks only',
  chainNeedsName: 'is required when the value chain position is not None',
  unknownField: 'is not an accepted field',
  rowBadValue: 'is not valid',
  decimalString: 'must be a decimal number written as text',
  sharesFormat: 'must be greater than 0, with at most 14 digits before and 4 after the decimal point',
  averageCostFormat: 'must be 0 or more, with at most 14 digits before and 4 after the decimal point',
  thresholdRange: 'must be a whole number from 1 to 100',
  usdThbRateFormat: 'must be greater than 0, with at most 12 digits before and 6 after the decimal point',
} as const

/** Lens names shown in the concentration page, in FR-006 order. */
export const LENS_LABELS = {
  gicsSector: 'Sector (GICS)',
  setIndustryGroup: 'SET industry group',
  valueChainPosition: 'Value chain position',
  valueChain: 'Value chain name',
  size: 'Size',
  style: 'Style',
  economicCycle: 'Economic cycle',
  lynchType: 'Lynch type',
  lifeCycle: 'Life cycle',
  customers: 'Customers',
  revenueTypes: 'Revenue types',
  moat: 'Moat',
  themes: 'Themes',
  volatility: 'Volatility',
  market: 'Market',
  indexMembership: 'Index membership',
} as const

export const NOT_SET_LABEL = 'Not set'
