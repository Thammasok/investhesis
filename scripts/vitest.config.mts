import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['*.test.ts'],
    globalSetup: ['./lib/global-setup.ts'],
    testTimeout: 30_000,
    // Several cases count rows of auth.users, so the files must not run side by side.
    fileParallelism: false,
  },
})
