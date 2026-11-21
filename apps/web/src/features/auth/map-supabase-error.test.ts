import { describe, expect, it } from 'vitest'
import { isAlreadyRegistered, mapSupabaseError } from './map-supabase-error'

describe('mapSupabaseError', () => {
  // TC-U-019
  it.each([
    [{ code: 'invalid_credentials', status: 400 }, 'invalid_credentials'],
    [{ code: 'email_not_confirmed', status: 400 }, 'email_not_confirmed'],
    [{ code: 'over_email_send_rate_limit', status: 429 }, 'rate_limited'],
    [{ code: 'otp_expired', status: 403 }, 'link_invalid'],
    [{ status: 500, message: 'boom' }, 'unavailable'],
    [new TypeError('Failed to fetch'), 'unavailable'],
    [{ code: 'whatever_new', status: 400 }, 'unknown'],
    [{ code: 'weak_password', status: 422 }, 'weak_password'],
    [{ code: 'same_password', status: 422 }, 'same_password'],
    [{ code: 'flow_state_expired' }, 'link_invalid'],
    [{ code: 'bad_code_verifier' }, 'link_invalid'],
    [{ status: 429 }, 'rate_limited'],
    [{ code: 'over_request_rate_limit' }, 'rate_limited'],
    [{ status: 403, message: 'Error running hook URI: signup_not_allowed' }, 'signup_not_allowed'],
    [{ name: 'AuthRetryableFetchError', status: 0 }, 'unavailable'],
    [{ code: 'current_password_invalid' }, 'wrong_current_password'],
    [{ code: 'current_password_required' }, 'wrong_current_password'],
    [{ code: 'current_password_invalid', status: 400, message: 'anything' }, 'wrong_current_password'],
    ['TypeError: Failed to fetch', 'unavailable'],
    [null, 'unknown'],
  ])('TC-U-019: maps %j to %s', (error, expected) => {
    expect(mapSupabaseError(error)).toBe(expected)
  })

  it('recognises an already-registered sign-up', () => {
    expect(isAlreadyRegistered({ code: 'user_already_exists' })).toBe(true)
    expect(isAlreadyRegistered({ code: 'email_exists' })).toBe(true)
    expect(isAlreadyRegistered({ code: 'weak_password' })).toBe(false)
  })
})
