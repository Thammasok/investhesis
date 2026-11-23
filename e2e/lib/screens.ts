import { expect, type Page } from '@playwright/test'
import { adminCreateUser, newEmail, openSignedIn, PASSWORD } from './kit.ts'

export type Screen = {
  name: string
  /** Signed-in screens need a session; the rest are visited signed out. */
  signedIn?: boolean
  /** The primary action of the screen, when it has one. */
  submit?: string
  visit: (page: Page) => Promise<void>
}

const h1 = (page: Page) => page.getByRole('heading', { level: 1 })

async function fillSignInWith(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
}

export const SCREENS: Screen[] = [
  {
    name: 'sign-in',
    submit: 'Sign in',
    visit: async (page) => {
      await page.goto('/auth/sign-in')
      await expect(h1(page)).toHaveText('Sign in to your account')
    },
  },
  {
    name: 'check-email',
    visit: async (page) => {
      // Reached the way a visitor does: an admin-created, unconfirmed account asks for a new link.
      const user = await adminCreateUser(newEmail('screen'), { confirmed: false })
      await page.goto('/auth/sign-in')
      await fillSignInWith(page, user.email, PASSWORD)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.getByRole('button', { name: 'Resend' }).click()
      await expect(h1(page)).toHaveText('Check your email')
    },
  },
  {
    name: 'link-expired',
    submit: 'Resend confirmation',
    visit: async (page) => {
      await page.goto('/auth/link-expired')
      await expect(h1(page)).toHaveText('This link has expired or was already used')
    },
  },
  {
    name: 'forgot-password',
    submit: 'Send reset link',
    visit: async (page) => {
      await page.goto('/auth/forgot-password')
      await expect(h1(page)).toHaveText('Reset your password')
    },
  },
  {
    name: 'forgot-password-sent',
    visit: async (page) => {
      await page.goto('/auth/forgot-password')
      await page.getByLabel('Email').fill(newEmail('screen-nobody'))
      await page.getByRole('button', { name: 'Send reset link' }).click()
      await expect(h1(page)).toHaveText('Check your email')
    },
  },
  {
    name: 'sign-in-error',
    visit: async (page) => {
      await page.goto('/auth/sign-in')
      await fillSignInWith(page, newEmail('screen-nobody'), 'Wrong12345')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page.getByRole('alert')).toBeVisible()
    },
  },
  {
    name: 'reset-password',
    signedIn: true,
    submit: 'Save password',
    visit: async (page) => {
      await page.goto('/auth/reset-password')
      await expect(h1(page)).toHaveText('Choose a new password')
    },
  },
  {
    name: 'account',
    signedIn: true,
    submit: 'Change password',
    visit: async (page) => {
      await page.goto('/account')
      await expect(page.getByRole('button', { name: 'Change password' })).toBeVisible()
    },
  },
]

export const signedOutScreens = SCREENS.filter((s) => !s.signedIn)
export const signedInScreens = SCREENS.filter((s) => s.signedIn)

export { openSignedIn }
