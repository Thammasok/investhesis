/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    port: 5173,
    // The API does not exist yet; calls to /api go to it once it does, with no CORS in dev.
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000', changeOrigin: true, rewrite: (url) => url.replace(/^\/api/, '') },
    },
  },
  build: { sourcemap: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // `pnpm test:coverage`: the auth feature must stay at or above 90 % of lines (user-auth T-008) and
    // the features as a whole at or above 70 % (stock-lists T-013).
    coverage: {
      provider: 'v8',
      include: ['src/features/**'],
      exclude: ['src/**/*.test.{ts,tsx}'],
      reporter: ['text'],
      thresholds: { 'src/features/auth/**': { lines: 90 }, 'src/features/**': { lines: 70 } },
    },
  },
})
