import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router'

/**
 * Closes a route-backed dialog. Opened from another page it goes back there (so Back never
 * reopens the dialog); opened from a typed or reloaded URL there is nothing to go back to, so it
 * goes to `fallback`.
 */
export function useRouteDialogClose(fallback: string) {
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(() => {
    if (location.key === 'default') void navigate(fallback, { replace: true })
    else void navigate(-1)
  }, [navigate, location.key, fallback])
}
