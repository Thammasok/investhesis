import type { Locator } from '@playwright/test'

export type Measured = { ratio: number; fg: string; bg: string; text: string }

/**
 * WCAG contrast of an element's text: the computed text colour over the effective background, where
 * every semi-transparent layer from the element up to the root is composited over its real parent
 * (not over the page background). Colours of any CSS syntax are read through a canvas.
 */
export async function measureContrast(target: Locator, property: 'color' | 'borderTopColor' = 'color'): Promise<Measured> {
  return target.evaluate((el, prop) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const rgba = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      return [d[0]!, d[1]!, d[2]!, d[3]! / 255]
    }
    const over = (top: number[], below: number[]): [number, number, number, number] => {
      const a = top[3]! + below[3]! * (1 - top[3]!)
      const c = (i: number) => (a === 0 ? 0 : (top[i]! * top[3]! + below[i]! * below[3]! * (1 - top[3]!)) / a)
      return [c(0), c(1), c(2), a]
    }
    // Backgrounds from the element up, composited from the root down over white.
    const layers: number[][] = []
    for (let node: Element | null = el; node; node = node.parentElement) layers.push(rgba(getComputedStyle(node).backgroundColor))
    let bg: number[] = [255, 255, 255, 1]
    for (const layer of layers.reverse()) bg = over(layer, bg)
    const fgRaw = rgba(getComputedStyle(el)[prop])
    const fg = over(fgRaw, bg)
    const lum = (c: number[]) => {
      const f = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!)
    }
    const [hi, lo] = [Math.max(lum(fg), lum(bg)), Math.min(lum(fg), lum(bg))]
    const hex = (c: number[]) => `rgb(${c.slice(0, 3).map(Math.round).join(',')})`
    return { ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100, fg: hex(fg), bg: hex(bg), text: (el.textContent ?? '').trim().slice(0, 40) }
  }, property)
}

/**
 * Contrast of the focus indicator of the focused element: its outline when it has one, else the first colour of its
 * box-shadow ring, composited over the element's real background. `null` when nothing is drawn.
 */
export async function focusRingContrast(target: Locator): Promise<{ ratio: number; kind: 'outline' | 'ring' } | null> {
  return target.evaluate((el) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const rgba = (css: string): number[] => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      return [d[0]!, d[1]!, d[2]!, d[3]! / 255]
    }
    const over = (top: number[], below: number[]) => {
      const a = top[3]! + below[3]! * (1 - top[3]!)
      const c = (i: number) => (a === 0 ? 0 : (top[i]! * top[3]! + below[i]! * below[3]! * (1 - top[3]!)) / a)
      return [c(0), c(1), c(2), a]
    }
    const style = getComputedStyle(el)
    let kind: 'outline' | 'ring' | null = null
    let color = ''
    if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) {
      kind = 'outline'
      color = style.outlineColor
    } else if (style.boxShadow && style.boxShadow !== 'none') {
      // Shadows are comma separated (commas inside colour functions do not count); the ring is the one with a spread.
      const parts: string[] = []
      let depth = 0
      let current = ''
      for (const ch of style.boxShadow) {
        if (ch === '(') depth++
        if (ch === ')') depth--
        if (ch === ',' && depth === 0) {
          parts.push(current.trim())
          current = ''
        } else current += ch
      }
      parts.push(current.trim())
      for (const part of parts) {
        const m = /(rgba?\([^)]*\)|oklab\([^)]*\)|oklch\([^)]*\)|color\([^)]*\)|lab\([^)]*\)|lch\([^)]*\))/.exec(part)
        const lengths = [...part.replace(m?.[1] ?? '', '').matchAll(/(-?[\d.]+)px/g)].map((l) => parseFloat(l[1]!))
        if (m && (lengths[3] ?? 0) > 0 && rgba(m[1]!)[3]! > 0) {
          kind = 'ring'
          color = m[1]!
          break
        }
      }
    }
    if (!kind) return null
    const layers: number[][] = []
    // The ring is drawn outside the element, over its parent's background.
    for (let node: Element | null = el.parentElement; node; node = node.parentElement) layers.push(rgba(getComputedStyle(node).backgroundColor))
    let bg: number[] = [255, 255, 255, 1]
    for (const layer of layers.reverse()) bg = over(layer, bg)
    const fg = over(rgba(color), bg)
    const lum = (c: number[]) => {
      const f = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!)
    }
    const [hi, lo] = [Math.max(lum(fg), lum(bg)), Math.min(lum(fg), lum(bg))]
    return { ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100, kind }
  })
}
