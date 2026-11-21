import { useCallback, useEffect, useState } from 'react'

export const RESEND_COOLDOWN_SECONDS = 60

/** A countdown in whole seconds, matching Supabase's 60 s minimum between emails. */
export function useCooldown(initial = 0) {
  const [remaining, setRemaining] = useState(initial)
  const active = remaining > 0

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [active])

  const start = useCallback(() => setRemaining(RESEND_COOLDOWN_SECONDS), [])
  return { remaining, start }
}
