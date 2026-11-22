import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(cleanup)

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
