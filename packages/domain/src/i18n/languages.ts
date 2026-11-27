export const LANGUAGES = ['en', 'th'] as const
export type Language = (typeof LANGUAGES)[number]
