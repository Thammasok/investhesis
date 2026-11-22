export const MARKETS = ['US', 'TH'] as const
export type Market = (typeof MARKETS)[number]
