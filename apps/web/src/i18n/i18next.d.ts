import type { en } from './catalogue/en/index.ts'

// Typed keys: `t('stocks.nope')` fails typecheck, and so does a Thai catalogue that misses a key.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof en }
  }
}
