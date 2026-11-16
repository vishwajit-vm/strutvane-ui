/**
 * Colour maths for the Design contract: parse the colour forms a token may hold, resolve
 * `var(--x, fallback)` references, and compute WCAG 2.x contrast.
 *
 * Why exact maths instead of axe: jsdom has no layout and no computed colours, so axe can't
 * measure contrast there. Token values are plain hex, `rgb()` or `oklch()`, so the luminance is
 * computed exactly: OKLCH → OKLab → linear sRGB (clamped to the gamut) → WCAG luminance. The
 * `--brand-hue` override is a number substituted into `oklch()`, which lets the kit check the
 * accent at every hue an app might pick.
 *
 * Every function is pure and never throws; an unreadable value is `undefined`, and callers
 * report it as a problem.
 *
 * @module
 */

/** A colour in linear-light sRGB (0–1 per channel) plus alpha (0–1). */
export interface LinearRgb {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly alpha: number
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

/** sRGB gamma channel (0–1) to linear light. */
function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function parseAlpha(raw: string | undefined): number | undefined {
  if (raw === undefined) return 1
  const t = raw.trim()
  const n = t.endsWith('%') ? Number(t.slice(0, -1)) / 100 : Number(t)
  return Number.isFinite(n) ? clamp01(n) : undefined
}

function parseHex(value: string): LinearRgb | undefined {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value)
  if (!m?.[1]) return undefined
  let hex = m[1]
  if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('')
  const byte = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16) / 255
  return {
    r: toLinear(byte(0)),
    g: toLinear(byte(2)),
    b: toLinear(byte(4)),
    alpha: hex.length === 8 ? byte(6) : 1,
  }
}

/** Split `a b c / d` or `a, b, c, d` into channels and an optional alpha. */
function channels(body: string): { parts: string[]; alpha: string | undefined } | undefined {
  const slash = body.split('/')
  if (slash.length > 2) return undefined
  const main = (slash[0] ?? '').trim()
  const parts = main.includes(',') ? main.split(',').map((p) => p.trim()) : main.split(/\s+/)
  if (parts.length === 4 && slash.length === 1) return { parts: parts.slice(0, 3), alpha: parts[3] }
  return { parts, alpha: slash[1] }
}

function parseRgb(value: string): LinearRgb | undefined {
  const m = /^rgba?\((.*)\)$/i.exec(value)
  if (!m?.[1]) return undefined
  const c = channels(m[1])
  if (c?.parts.length !== 3) return undefined
  const nums = c.parts.map((p) =>
    p.endsWith('%') ? (Number(p.slice(0, -1)) / 100) * 255 : Number(p),
  )
  const alpha = parseAlpha(c.alpha)
  if (nums.some((n) => !Number.isFinite(n)) || alpha === undefined) return undefined
  const [r = 0, g = 0, b = 0] = nums.map((n) => toLinear(clamp01(n / 255)))
  return { r, g, b, alpha }
}

/** Evaluate a hue: a number, or `calc(A + B)` / `calc(A - B)` of numbers (after var resolution). */
function parseHue(raw: string): number | undefined {
  const t = raw.trim().replace(/deg$/, '')
  if (/^-?[\d.]+$/.test(t)) return Number(t)
  const m = /^calc\(\s*(-?[\d.]+)\s*([+-])\s*(-?[\d.]+)\s*\)$/.exec(t)
  if (!m) return undefined
  const a = Number(m[1])
  const b = Number(m[3])
  return m[2] === '+' ? a + b : a - b
}

function parseOklch(value: string): LinearRgb | undefined {
  const m = /^oklch\((.*)\)$/i.exec(value)
  if (!m?.[1]) return undefined
  // Keep a calc() hue together while splitting on spaces.
  const [main = '', alphaText] = m[1].split('/')
  const tokens = main.trim().match(/calc\([^)]*\)|\S+/g) ?? []
  if (tokens.length !== 3) return undefined
  const [lText = '', cText = '', hText = ''] = tokens
  const l = lText.endsWith('%') ? Number(lText.slice(0, -1)) / 100 : Number(lText)
  const c = Number(cText)
  const h = parseHue(hText)
  const alpha = parseAlpha(alphaText)
  if (!Number.isFinite(l) || !Number.isFinite(c) || h === undefined || alpha === undefined)
    return undefined
  const a = c * Math.cos((h * Math.PI) / 180)
  const bb = c * Math.sin((h * Math.PI) / 180)
  const lp = (l + 0.3963377774 * a + 0.2158037573 * bb) ** 3
  const mp = (l - 0.1055613458 * a - 0.0638541728 * bb) ** 3
  const sp = (l - 0.0894841775 * a - 1.291485548 * bb) ** 3
  return {
    r: clamp01(4.0767416621 * lp - 3.3077115913 * mp + 0.2309699292 * sp),
    g: clamp01(-1.2684380046 * lp + 2.6097574011 * mp - 0.3413193965 * sp),
    b: clamp01(-0.0041960863 * lp - 0.7034186147 * mp + 1.707614701 * sp),
    alpha,
  }
}

/**
 * Parse a fully resolved colour (no `var()` left). `transparent` is accepted (alpha 0).
 *
 * @example
 * parseColor('#fff')?.alpha // 1
 * parseColor('oklch(0.5 0.2 264)') // a LinearRgb
 */
export function parseColor(value: string): LinearRgb | undefined {
  const v = value.trim()
  if (v.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, alpha: 0 }
  if (v.startsWith('#')) return parseHex(v)
  if (/^rgba?\(/i.test(v)) return parseRgb(v)
  if (/^oklch\(/i.test(v)) return parseOklch(v)
  return undefined
}

/** WCAG relative luminance of an opaque colour. */
export function luminance(color: LinearRgb): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b
}

/**
 * WCAG contrast ratio of two colours (1–21). Both must be opaque: a translucent colour has no
 * single contrast, so the kit requires opaque tokens for every checked pair.
 *
 * @example
 * const black = { r: 0, g: 0, b: 0, alpha: 1 }
 * const white = { r: 1, g: 1, b: 1, alpha: 1 }
 * contrastRatio(black, white) // 21
 */
export function contrastRatio(a: LinearRgb, b: LinearRgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Find the `)` that closes the `(` at `open`, or -1. */
function closing(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Replace every `var(--name[, fallback])` in `value` with the value of `--name` in `vars`
 * (itself resolved), else the fallback. `undefined` when a variable has neither, or when the
 * references loop. Mirrors how browsers compute custom properties, enough for token values.
 *
 * @example
 * resolveVars('oklch(0.5 0.2 var(--brand-hue))', new Map([['--brand-hue', '200']]))
 * // 'oklch(0.5 0.2 200)'
 */
export function resolveVars(
  value: string,
  vars: ReadonlyMap<string, string>,
  seen: ReadonlySet<string> = new Set(),
): string | undefined {
  let out = ''
  let i = 0
  while (i < value.length) {
    const start = value.indexOf('var(', i)
    if (start === -1) {
      out += value.slice(i)
      break
    }
    out += value.slice(i, start)
    const end = closing(value, start + 3)
    if (end === -1) return undefined
    const inner = value.slice(start + 4, end)
    const comma = inner.indexOf(',')
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim()
    const fallback = comma === -1 ? undefined : inner.slice(comma + 1).trim()
    let replacement: string | undefined
    const raw = vars.get(name)
    if (raw !== undefined) {
      if (seen.has(name)) return undefined
      replacement = resolveVars(raw, vars, new Set([...seen, name]))
    } else if (fallback !== undefined) replacement = resolveVars(fallback, vars, seen)
    if (replacement === undefined) return undefined
    out += replacement
    i = end + 1
  }
  return out
}
