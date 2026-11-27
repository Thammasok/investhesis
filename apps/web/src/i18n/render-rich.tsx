import { Fragment, type ReactNode } from 'react'
import type { Params } from './catalogue-types.ts'
import { interpolate } from './t.ts'

export type RichComponents = Readonly<Record<string, (children: ReactNode) => ReactNode>>

/**
 * Renders a message with `<name>text</name>` parts through the given components. Only the tag
 * names in `components` are read; everything else, `<img src=x>` included, stays literal text, and
 * nothing is parsed as HTML. Params fill `{name}` inside the text parts.
 */
export function renderRich(text: string, components: RichComponents, params?: Params): ReactNode[] {
  const names = Object.keys(components)
  if (names.length === 0) return [interpolate(text, params)]
  const tag = new RegExp(`<(${names.map(escape).join('|')})>([\\s\\S]*?)</\\1>`, 'g')
  const out: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(tag)) {
    if (match.index > last) out.push(interpolate(text.slice(last, match.index), params))
    const render = components[match[1] as string] as (children: ReactNode) => ReactNode
    out.push(<Fragment key={out.length}>{render(renderRich(match[2] as string, components, params))}</Fragment>)
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(interpolate(text.slice(last), params))
  return out
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
