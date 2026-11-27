import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderRich } from './render-rich'

describe('Rich', () => {
  it('TC-U-1028: renders tagged parts through the given components', () => {
    render(
      <p>
        {renderRich('Read the <link>guide</link> <b>now</b>', {
          link: (c) => <a href="/guide">{c}</a>,
          b: (c) => <strong>{c}</strong>,
        })}
      </p>,
    )
    expect(screen.getByRole('link', { name: 'guide' })).toHaveAttribute('href', '/guide')
    expect(screen.getByText('now').tagName).toBe('STRONG')
  })

  it('TC-U-1028: text that is not a known tag stays literal, and nothing is parsed as HTML', () => {
    const { container } = render(<p>{renderRich('<img src=x>', { b: (c) => <strong>{c}</strong> })}</p>)
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('<img src=x>')
  })

  it('TC-U-1028: params fill placeholders inside and outside tags', () => {
    render(<p>{renderRich('<b>{name}</b> has {count}', { b: (c) => <strong>{c}</strong> }, { name: 'A', count: 3 })}</p>)
    expect(screen.getByText('A').tagName).toBe('STRONG')
    expect(screen.getByText(/has 3/)).toBeInTheDocument()
  })
})
