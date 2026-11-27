import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Trans } from 'react-i18next'
import { i18n } from './i18n'

// Keys that exist only in this test, so they are added at run time and cast for the typed `Trans`.
const KEYS = { guide: 'test.guide', stray: 'test.stray', param: 'test.param' } as never as Record<string, never>

i18n.addResources('en', 'translation', {
  'test.guide': 'Read the <anchor>guide</anchor> <b>now</b>',
  'test.stray': '<img src=x>',
  'test.param': 'Hello <b>{{name}}</b>',
})

// The tag is <anchor>, not <link>: react-i18next parses messages with html-parse-stringify, which treats
// `link` (like `img`, `br`, `input`) as a void element, so `<link>guide</link>` loses its children.
describe('Trans', () => {
  it('TC-U-1028: renders tagged parts with components and no HTML parsing', () => {
    const { container } = render(
      <Trans
        i18nKey={KEYS.guide}
        components={{ anchor: <a href="/guide" />, b: <strong /> }}
        transKeepBasicHtmlNodesFor={[]}
      />,
    )
    expect(screen.getByRole('link', { name: 'guide' })).toHaveAttribute('href', '/guide')
    expect(container.querySelector('strong')).toHaveTextContent('now')
    expect(container).toHaveTextContent('Read the guide now')
  })

  it('TC-U-1028: a stray tag the message does not name renders as literal text', () => {
    const { container } = render(<Trans i18nKey={KEYS.stray} components={{ b: <strong /> }} transKeepBasicHtmlNodesFor={[]} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('<img src=x>')
  })

  it('TC-U-1028: a parameter holding markup is text, and the app instance keeps no basic HTML nodes by default', () => {
    const { container } = render(<Trans i18nKey={KEYS.param} values={{ name: '<img src=x>' }} components={{ b: <strong /> }} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('strong')).toHaveTextContent('<img src=x>')
  })
})
