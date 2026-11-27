import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { init, resetLanguage } from '@/i18n'

afterEach(cleanup)

// Load the Thai chunk once per test file, so a test can switch to Thai synchronously (`renderApp(..., { language })`).
beforeAll(async () => {
  await init('th')
  resetLanguage()
})

// Every test starts in English with nothing saved, so the existing English assertions hold (i18n T-004).
beforeEach(() => {
  resetLanguage()
  try {
    localStorage.clear()
  } catch {
    // a test that replaced localStorage with a throwing stub
  }
})

// jsdom has no matchMedia; the sidebar reads it (hooks/use-mobile.ts). Desktop width by default.
vi.stubGlobal(
  'matchMedia',
  (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
)

// jsdom has no ResizeObserver; Radix poppers (tooltip, dropdown) use it, and which test renders one
// under load is timing dependent, so a missing stub made the suite flaky.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

// jsdom has no scrollIntoView; cmdk (the add-to-list picker) scrolls the highlighted option into view.
Element.prototype.scrollIntoView = () => {}

// jsdom lacks the pointer-capture API that Radix Select reads when it opens.
Element.prototype.hasPointerCapture = () => false
Element.prototype.setPointerCapture = () => {}
Element.prototype.releasePointerCapture = () => {}
