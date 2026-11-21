import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // `pnpm test:coverage`: the auth code must stay at or above 90 % of lines (user-auth T-008).
    coverage: {
      provider: 'v8',
      include: ['src/auth/**'],
      reporter: ['text'],
      thresholds: { lines: 90 },
    },
  },
})
