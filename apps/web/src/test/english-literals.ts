/**
 * The static English-literal scan (i18n T-004). Every visible string must come from `t`, so a
 * `.tsx` file may hold no JSX text with words in it and no `aria-label`, `placeholder`, `title`
 * or `alt` attribute set to a plain string. Text is read with patterns, not a parser: it is a
 * guard against new literals, not a proof, and a false positive goes on the allow-list.
 */
export type Finding = { line: number; text: string }

const ATTRIBUTES = ['aria-label', 'aria-description', 'aria-placeholder', 'placeholder', 'title', 'alt']

const hasWords = (text: string): boolean => /[A-Za-z]{2,}/.test(text.replace(/&[a-z]+;|&#\d+;/gi, ' '))
// Text that is code, not words between tags.
const looksLikeCode = (text: string): boolean =>
  /[;=|&[\]`]/.test(text) ||
  /\b(return|function|const|import|export|if|else|from)\b/.test(text) && /['"(){}:]/.test(text) ||
  /^\s*(?:[:,)(]|satisfies\b|return\b)/.test(text) ||
  /\b\w+\??:\s*(?:React\.|Promise\b|Record\b|Array\b)/.test(text) ||
  /\(\s*\n/.test(text)
const BRAND = /^\s*Investhesis\s*$/

/** Blanks comments and keeps every newline, so line numbers stay right. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (_m, pre: string) => pre)
}

export function scanSource(source: string): Finding[] {
  const code = withoutComments(source)
  const findings: Finding[] = []
  const lineOf = (index: number): number => code.slice(0, index).split('\n').length
  const add = (index: number, text: string) => {
    if (!hasWords(text) || BRAND.test(text) || looksLikeCode(text)) return
    findings.push({ line: lineOf(index) + (text.length - text.trimStart().length > 0 ? text.slice(0, text.length - text.trimStart().length).split('\n').length - 1 : 0), text: text.trim() })
  }

  for (const m of code.matchAll(/(?<![=-])>([^<>{}]+)(?=[<{])/g)) add(m.index + 1, m[1] as string)
  for (const m of code.matchAll(/\}([^<>{}]+)(?=<)/g)) add(m.index + 1, m[1] as string)
  for (const name of ATTRIBUTES) {
    for (const m of code.matchAll(new RegExp(`(?<![\\w-])${name}="([^"]*)"`, 'g'))) {
      if (hasWords(m[1] as string)) findings.push({ line: lineOf(m.index), text: `${name}="${m[1]}"` })
    }
  }
  return findings.sort((a, b) => a.line - b.line)
}
