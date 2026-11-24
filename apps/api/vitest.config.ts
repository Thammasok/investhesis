import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // `pnpm test:coverage`: the auth code must stay at or above 90 % of lines (user-auth T-008), the
    // stocks, lists, imports, settings and exports modules at or above 85 % (stock-lists T-013).
    coverage: {
      provider: 'v8',
      include: ['src/auth/**', 'src/modules/stocks/**', 'src/modules/lists/**', 'src/modules/imports/**', 'src/modules/settings/**', 'src/modules/exports/**'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text'],
      thresholds: {
        'src/auth/**': { lines: 90 },
        'src/modules/stocks/**': { lines: 85 },
        'src/modules/lists/**': { lines: 85 },
        'src/modules/imports/**': { lines: 85 },
        'src/modules/settings/**': { lines: 85 },
        'src/modules/exports/**': { lines: 85 },
      },
    },
  },
})
