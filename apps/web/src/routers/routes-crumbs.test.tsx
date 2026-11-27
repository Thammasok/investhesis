import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { emptyApi } from '@/test/stub-api'
import { renderApp } from '@/test/render-app'

describe('crumbs and tab titles follow the language', () => {
  it('TC-U-1032: /stocks in Thai', async () => {
    renderApp('/stocks', emptyApi(), { language: 'th' })
    const nav = await screen.findByRole('navigation', { name: 'เส้นทางหน้า' })
    expect(nav).toHaveTextContent('หุ้น')
    expect(await screen.findByRole('heading', { level: 1, name: 'หุ้น' })).toBeInTheDocument()
    expect(document.title).toBe('หุ้น · Investhesis')
  })

  it('crumbs and the sidebar read Thai on the account page', async () => {
    renderApp('/account', emptyApi(), { language: 'th' })
    expect(await screen.findByRole('heading', { level: 1, name: 'บัญชี' })).toBeInTheDocument()
    expect(document.title).toBe('บัญชี · Investhesis')
  })
})
