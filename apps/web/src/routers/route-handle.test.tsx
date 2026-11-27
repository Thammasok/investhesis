import { render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { AppBreadcrumb } from '@/components/layout/app-breadcrumb'
import type { RouteHandle } from './route-handle'

function Shell() {
  return (
    <>
      <AppBreadcrumb />
      <Outlet />
    </>
  )
}

describe('route handle crumb', () => {
  it('TC-U-074: a crumb function can use the route loader data', async () => {
    const router = createMemoryRouter(
      [
        {
          Component: Shell,
          children: [
            {
              path: 'stocks',
              handle: { crumb: 'Stocks' } satisfies RouteHandle,
              children: [
                {
                  path: ':id',
                  loader: () => ({ ticker: 'NVDA' }),
                  handle: {
                    crumb: (_params, data) => (data as { ticker: string }).ticker,
                  } satisfies RouteHandle,
                  element: <p>detail</p>,
                },
              ],
            },
          ],
        },
      ],
      { initialEntries: ['/stocks/abc'] },
    )
    render(<RouterProvider router={router} />)
    expect(await screen.findByText('detail')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Stocks' })).toBeInTheDocument()
    expect(screen.getByText('NVDA')).toHaveAttribute('aria-current', 'page')
  })

  it('TC-U-074: a crumb function receives undefined data on a route without a loader', async () => {
    const router = createMemoryRouter(
      [
        {
          Component: Shell,
          children: [
            { path: 'x/:id', handle: { crumb: (p, data) => `${p.id}:${String(data)}` } satisfies RouteHandle, element: <p>x</p> },
          ],
        },
      ],
      { initialEntries: ['/x/7'] },
    )
    render(<RouterProvider router={router} />)
    expect(await screen.findByText('7:undefined')).toBeInTheDocument()
  })
})
