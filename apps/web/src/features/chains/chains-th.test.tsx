import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import { apiOf, stockOf } from './cases-helpers'

describe('value chains in Thai', () => {
  it('TC-U-1058: lanes are translated, chain names are not', async () => {
    const stub = apiOf([stockOf('PTTEP', { name: 'PTT Exploration', valueChain: 'Oil & Gas', valueChainPosition: 'Upstream' })])
    renderApp('/chains', stub, { language: 'th' })
    expect(await screen.findByRole('heading', { level: 1, name: 'ห่วงโซ่คุณค่า' })).toBeInTheDocument()
    const card = await screen.findByRole('region', { name: 'Oil & Gas' })
    expect(within(card).getByRole('heading', { level: 2, name: 'Oil & Gas' })).toBeInTheDocument()
    expect(within(card).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['ต้นน้ำ', 'กลางน้ำ', 'ปลายน้ำ'])
    expect(within(card).getByRole('button', { name: 'เปลี่ยนชื่อ' })).toBeInTheDocument()
  })
})
