import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import { emptyApi } from '@/test/stub-api'
import { LANGUAGE_STORAGE_KEY } from './detect'
import { getLanguage, setLanguage } from './language'

describe('pages follow the language', () => {
  it('TC-U-1032: crumbs and tab titles are Thai in Thai', async () => {
    renderApp('/stocks', emptyApi(), { language: 'th' })
    await screen.findByRole('heading', { level: 1, name: 'หุ้น' })
    expect(document.title).toBe('หุ้น · Investhesis')
    const trail = within(screen.getByRole('navigation', { name: 'breadcrumb', hidden: true }))
    expect(trail.getByText('หุ้น')).toHaveAttribute('aria-current', 'page')
  })

  it('TC-U-1032: switching the language re-renders the open page in place', async () => {
    const { router } = renderApp('/stocks', emptyApi())
    await screen.findByRole('heading', { level: 1, name: 'Stocks' })
    const location = router.state.location
    await setLanguage('th')
    await screen.findByRole('heading', { level: 1, name: 'หุ้น' })
    await waitFor(() => expect(document.title).toBe('หุ้น · Investhesis'))
    expect(router.state.location).toBe(location)
  })

  it('TC-U-1033: a test that switched to Thai leaves the next one in English (part 1)', async () => {
    await setLanguage('th')
    expect(getLanguage()).toBe('th')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('th')
  })

  it('TC-U-1033: the next test starts in English with nothing saved (part 2)', () => {
    expect(getLanguage()).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull()
  })
})
