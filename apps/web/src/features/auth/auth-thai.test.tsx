import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { getLanguage } from '@/i18n/language'
import { createRoutes } from '@/routers/router'
import { FakeAuthClient } from '@/test/fake-auth-client'
import { setLanguageNow } from '@/test/render-app'

function renderAt(path: string, fake = FakeAuthClient.signedOut()) {
  const router = createMemoryRouter(createRoutes(fake), { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return { router, fake }
}

describe('auth pages in Thai', () => {
  it('TC-U-1049: auth errors read in Thai', async () => {
    setLanguageNow('th')
    const { fake } = renderAt('/auth/sign-in')
    expect(await screen.findByRole('heading', { level: 1, name: 'เข้าสู่ระบบ' })).toBeInTheDocument()
    fake.nextError = 'invalid_credentials'
    await userEvent.type(screen.getByLabelText('อีเมล'), 'a@example.test')
    await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))
    expect(await screen.findByText('อีเมลหรือรหัสผ่านไม่ถูกต้อง')).toBeInTheDocument()
  })

  it('TC-U-1041: pressing ไทย on sign-in changes the heading at once', async () => {
    renderAt('/auth/sign-in')
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in to your account' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'ไทย' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'เข้าสู่ระบบ' })).toBeInTheDocument()
    await waitFor(() => expect(getLanguage()).toBe('th'))
    expect(document.title).toBe('เข้าสู่ระบบ · Investhesis')
  })

  it('TC-U-1049: password rules and the auth panel read in Thai', async () => {
    setLanguageNow('th')
    renderAt('/auth/forgot-password')
    expect(await screen.findByRole('heading', { level: 1, name: 'รีเซ็ตรหัสผ่าน' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'กลับไปเข้าสู่ระบบ' })).toBeInTheDocument()
  })
})
