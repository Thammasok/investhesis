/** Exact decimal arithmetic on scaled BigInt. Money, shares and rates never pass through number. */

const DECIMAL = /^(\d+)(?:\.(\d+))?$/

const pow10 = (n: number): bigint => 10n ** BigInt(n)

/** Parses non-negative decimal text to an integer scaled by 10^scale; null when malformed or too precise. */
export function parseDecimal(text: string, scale: number): bigint | null {
  const m = DECIMAL.exec(text)
  if (!m) return null
  const fraction = m[2] ?? ''
  if (fraction.length > scale) return null
  return BigInt(m[1] + fraction.padEnd(scale, '0'))
}

/** Formats a scaled integer with a fixed number of decimal places, rounding half away from zero. */
export function formatDecimal(value: bigint, scale: number, places: number = scale): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  let scaled: bigint
  if (places >= scale) {
    scaled = abs * pow10(places - scale)
  } else {
    const divisor = pow10(scale - places)
    scaled = (abs + divisor / 2n) / divisor
  }
  const unit = pow10(places)
  const whole = (scaled / unit).toString()
  const fraction = places === 0 ? '' : `.${(scaled % unit).toString().padStart(places, '0')}`
  return `${negative && scaled !== 0n ? '-' : ''}${whole}${fraction}`
}

/** part / total as a percentage with one decimal, half up ("66.7"); total must be positive. */
export function percentOneDecimal(part: bigint, total: bigint): string {
  if (total <= 0n) throw new RangeError('total must be positive')
  const tenths = (part * 2000n + total) / (2n * total)
  return formatDecimal(tenths, 1, 1)
}

/** Exact test part / total >= threshold %, by cross-multiplication; false when total is not positive. */
export function atLeastPercent(part: bigint, total: bigint, threshold: number): boolean {
  return total > 0n && part * 100n >= BigInt(threshold) * total
}
