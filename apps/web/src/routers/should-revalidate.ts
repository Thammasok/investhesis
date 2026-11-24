import type { ShouldRevalidateFunction } from 'react-router'

/**
 * Re-read a page's data only after a form submission or when the path changes. The view state
 * (sort, search, filters, grouping) lives in the query string and is applied in the browser, so
 * changing only the query must send no request (NFR-001).
 */
export const revalidateOnSubmitOrPathChange: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}) => (formMethod || currentUrl.pathname !== nextUrl.pathname ? defaultShouldRevalidate : false)
