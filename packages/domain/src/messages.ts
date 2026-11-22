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
} as const
