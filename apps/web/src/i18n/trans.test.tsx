import { render, screen } from '@testing-library/react'
import { Trans } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { i18n } from './i18n'

describe('Trans', () => {
  it('TC-U-1028: renders tagged parts with components and no HTML parsing', () => {
    i18n.addResourceBundle('en', 'translation', { tagged: 'Read the <anchor>guide</anchor> <b>now</b>', stray: '<img src=x>' }, true)
    const { container } = render(
      <>
        <Trans
          i18nKey={'tagged' as never}
          components={{ anchor: <a href="/guide" />, b: <strong /> }}
          transKeepBasicHtmlNodesFor={[]}
        />
        <p>
          <Trans i18nKey={'stray' as never} transKeepBasicHtmlNodesFor={[]} />
        </p>
      </>,
    )
    expect(screen.getByRole('link', { name: 'guide' })).toBeInTheDocument()
    expect(screen.getByText('now').tagName).toBe('STRONG')
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img src=x>')
  })
})
