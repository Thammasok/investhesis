import { parseSync } from 'oxc-parser'

export type LiteralFinding = { file: string; line: number; text: string }

const BRAND = new Set(['Investhesis'])
const ATTRIBUTES = new Set(['aria-label', 'aria-description', 'placeholder', 'title', 'alt'])

type Node = { type: string; start: number; [key: string]: unknown }

function walk(node: unknown, visit: (node: Node) => void) {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
  } else if (typeof node === 'object' && node !== null) {
    const n = node as Node
    if (typeof n.type === 'string') visit(n)
    for (const value of Object.values(n)) if (typeof value === 'object') walk(value, visit)
  }
}

const readable = (text: string) => /[A-Za-z]{2}/.test(text) && !BRAND.has(text.trim())

/**
 * Finds English literals a reader would see: JSX text and the `aria-label`, `placeholder`, `title`,
 * `alt` and `aria-description` attributes written as plain strings. Anything that goes through
 * `t(...)` is an expression and is not reported. Parsed with oxc, so code is never mistaken for text.
 */
export function scanSource(file: string, source: string): LiteralFinding[] {
  if (!file.endsWith('.tsx')) return []
  const { program } = parseSync(file, source, { lang: 'tsx' })
  const findings: LiteralFinding[] = []
  const lineOf = (offset: number) => source.slice(0, offset).split('\n').length
  walk(program, (node) => {
    if (node.type === 'JSXText') {
      const text = String(node.value)
      if (readable(text)) findings.push({ file, line: lineOf(node.start + text.length - text.trimStart().length), text: text.trim() })
    } else if (node.type === 'JSXAttribute') {
      const name = (node.name as { name?: unknown }).name
      let value = node.value as { type?: string; value?: unknown; expression?: { type?: string; value?: unknown } } | null
      if (value?.type === 'JSXExpressionContainer' && value.expression?.type === 'Literal') value = value.expression
      if (typeof name === 'string' && ATTRIBUTES.has(name) && value?.type === 'Literal' && typeof value.value === 'string' && readable(value.value)) {
        findings.push({ file, line: lineOf(node.start), text: value.value })
      }
    }
  })
  return findings
}
