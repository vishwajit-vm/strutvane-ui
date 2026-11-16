/**
 * The checks behind `designConformance()`, as pure functions that return problems (`[]` = pass).
 *
 * They are exported on their own so a design's tests can call one directly, and so the kit's own
 * tests can prove that each one catches a design that breaks its rule.
 *
 * @module
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { contrastRatio, parseColor } from '../design/color.ts'
import { type Design, validateDesign } from '../design/define-design.ts'
import {
  declaredAt,
  resolveDeclarations,
  resolveDesignTokens,
  type ThemeName,
} from '../design/stylesheet.ts'
import {
  CONTRAST_PAIRS,
  type CssLength,
  chartVar,
  cssVar,
  type PublicOverrides,
} from '../design/tokens.ts'
import { findHardCodedColours } from './colours.ts'

const THEMES: readonly ThemeName[] = ['light', 'dark']

/** Every slot is present (a component) and every token is well-formed. */
export function checkSlots(design: Design): string[] {
  return validateDesign(design)
}

/** The hues the contrast check tries when a design's colours follow `--brand-hue`. */
export const HUE_STEPS: readonly number[] = Array.from({ length: 24 }, (_, i) => i * 15)

/** Whether any colour of a theme depends on `--brand-hue`. */
function followsBrandHue(design: Design, theme: ThemeName): boolean {
  for (const [, value] of declaredAt(design, theme)) if (value.includes('--brand-hue')) return true
  return false
}

/**
 * Every required pair meets its WCAG minimum in both themes (4.5:1 for text, 3:1 for focus rings,
 * control borders and the lead chart series). When the design's colours follow `--brand-hue`, every
 * hue in 15° steps is checked, so any brand an app picks stays readable. Only the worst hue per
 * pair is reported.
 */
export function checkContrast(design: Design): string[] {
  const problems: string[] = []
  const pairs = [
    ...CONTRAST_PAIRS.map((p) => ({ fg: cssVar(p.fg), bg: cssVar(p.bg), min: p.min })),
    { fg: chartVar(1), bg: cssVar('surface'), min: 3 },
  ]
  for (const theme of THEMES) {
    const hues = followsBrandHue(design, theme) ? HUE_STEPS : [design.defaults.brandHue]
    const worst = new Map<string, { ratio: number; hue: number }>()
    for (const hue of hues) {
      const tokens = resolveDesignTokens(design, theme, { brandHue: hue })
      for (const pair of pairs) {
        const key = `${pair.fg} on ${pair.bg}`
        const fg = parseColor(tokens.get(pair.fg) ?? '')
        const bg = parseColor(tokens.get(pair.bg) ?? '')
        if (!fg || !bg) {
          if (!worst.has(key)) problems.push(`${theme}: ${key} can't be read as colours`)
          worst.set(key, { ratio: Number.POSITIVE_INFINITY, hue })
          continue
        }
        if (fg.alpha < 1 || bg.alpha < 1) {
          if (!worst.has(key)) problems.push(`${theme}: ${key} must be opaque to be checked`)
          worst.set(key, { ratio: Number.POSITIVE_INFINITY, hue })
          continue
        }
        const ratio = contrastRatio(fg, bg)
        const seen = worst.get(key)
        if (!seen || ratio < seen.ratio) worst.set(key, { ratio, hue })
      }
    }
    for (const pair of pairs) {
      const key = `${pair.fg} on ${pair.bg}`
      const seen = worst.get(key)
      if (seen && Number.isFinite(seen.ratio) && seen.ratio < pair.min) {
        const at = hues.length > 1 ? ` at --brand-hue ${seen.hue}` : ''
        problems.push(
          `${theme}: ${key} is ${seen.ratio.toFixed(2)}:1${at}; WCAG AA needs ${pair.min}:1`,
        )
      }
    }
  }
  return problems
}

/** Options for {@link checkSourceColours}. */
export interface SourceOptions {
  /** Files or folders of the design's source to scan (TS, TSX, JS, CSS). */
  readonly sources?: readonly string[]
  /** Files allowed to hold colour literals (the design's token files). */
  readonly tokenFiles?: readonly string[]
  /** Folder that relative paths start from. Default: the current working directory. */
  readonly root?: string
}

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|css)$/

function listFiles(path: string): string[] {
  const stat = statSync(path)
  if (stat.isFile()) return SOURCE_FILE.test(path) ? [path] : []
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.name === 'node_modules' || entry.name.startsWith('.')
      ? []
      : listFiles(join(path, entry.name)),
  )
}

/**
 * No colour literal anywhere but the token files: the design's stylesheet and font faces always,
 * plus every source file listed in `options.sources`. A listed path that doesn't exist is a
 * problem (a typo must not turn the check off).
 */
export function checkSourceColours(design: Design, options: SourceOptions = {}): string[] {
  const root = options.root ?? process.cwd()
  const allowed = new Set((options.tokenFiles ?? []).map((f) => resolve(root, f)))
  const problems = [
    ...findHardCodedColours(`${design.name} stylesheet`, design.stylesheet),
    ...findHardCodedColours(`${design.name} fonts.faces`, design.fonts.faces ?? ''),
  ]
  for (const source of options.sources ?? []) {
    const path = resolve(root, source)
    let files: string[]
    try {
      files = listFiles(path)
    } catch {
      problems.push(`source "${source}" does not exist`)
      continue
    }
    for (const file of files) {
      if (allowed.has(file)) continue
      problems.push(...findHardCodedColours(relative(root, file), readFileSync(file, 'utf8')))
    }
  }
  return problems
}

/** Distinct sample values for each public override token (far from any sensible default). */
export const OVERRIDE_SAMPLES: {
  readonly fontSans: string
  readonly radius: CssLength
  readonly density: number
} = {
  fontSans: '"Conformance Sans", serif',
  radius: '17px',
  density: 1.37,
}

/** Which custom properties must change for each public token, and which the stylesheet must use. */
const OVERRIDE_RULES = [
  {
    token: '--brand-hue',
    vars: ['--sv-accent', '--sv-accent-text', '--sv-ring'],
    usedAs: ['var(--sv-accent', '--sv-ring'],
  },
  { token: '--font-sans', vars: ['--sv-font-sans'], usedAs: ['var(--sv-font-sans'] },
  {
    token: '--radius',
    vars: ['--sv-radius-sm', '--sv-radius-md', '--sv-radius-lg'],
    usedAs: ['var(--sv-radius-'],
  },
  {
    token: '--density',
    vars: ['--sv-control-height', '--sv-row-height'],
    usedAs: ['var(--sv-control-height', 'var(--sv-row-height'],
  },
] as const

/**
 * Each public override token (`--brand-hue`, `--font-sans`, `--radius`, `--density`) changes the
 * rendered result: overriding it changes at least one of the design's mapped tokens in both
 * themes, AND the design's stylesheet uses that token (a mapped token nothing reads changes
 * nothing on screen).
 */
export function checkOverrides(design: Design): string[] {
  const problems: string[] = []
  const samples: Record<(typeof OVERRIDE_RULES)[number]['token'], PublicOverrides> = {
    '--brand-hue': { brandHue: (design.defaults.brandHue + 120) % 360 },
    '--font-sans': { fontSans: OVERRIDE_SAMPLES.fontSans },
    '--radius': { radius: OVERRIDE_SAMPLES.radius },
    '--density': { density: OVERRIDE_SAMPLES.density },
  }
  for (const rule of OVERRIDE_RULES) {
    for (const theme of THEMES) {
      const before = resolveDesignTokens(design, theme)
      const after = resolveDesignTokens(design, theme, samples[rule.token])
      const changed = rule.vars.some((v) => before.get(v) !== after.get(v))
      if (!changed)
        problems.push(
          `${theme}: overriding ${rule.token} changes none of ${rule.vars.join(', ')}; map it in the tokens`,
        )
    }
    if (!rule.usedAs.some((use) => design.stylesheet.includes(use)))
      problems.push(
        `the stylesheet never uses ${rule.usedAs.join(' or ')}, so ${rule.token} can't change the screen`,
      )
  }
  return problems
}

/**
 * The provider really emits the overrides: parse the CSS that was injected (`css`) and check that
 * it resolves the sample overrides into the root's tokens. Used on the rendered `<style>`.
 */
export function checkInjectedOverrides(design: Design, css: string): string[] {
  const root = `[data-sv-design="${design.name}"]`
  const declared = new Map<string, string>()
  for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const selectors = (rule[1] ?? '').split(',').map((s) => s.trim())
    if (
      !selectors.some(
        (s) => s === ':where(:root)' || s === root || s === `${root}[data-sv-theme="light"]`,
      )
    )
      continue
    for (const d of (rule[2] ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g))
      if (d[1] !== undefined && d[2] !== undefined) declared.set(d[1], d[2].trim())
  }
  const resolved = resolveDeclarations(declared)
  const problems: string[] = []
  if (resolved.get('--sv-font-sans') !== OVERRIDE_SAMPLES.fontSans)
    problems.push('the injected stylesheet does not apply the --font-sans override')
  if (resolved.get('--radius') !== OVERRIDE_SAMPLES.radius)
    problems.push('the injected stylesheet does not apply the --radius override')
  return problems
}

/** The widest a phone screen is assumed to be (iPhone SE / mini, decision: blueprint §5.1). */
export const PHONE_WIDTH = 375

/**
 * The structural part of "no horizontal scroll at 375 px", for jsdom (which has no layout):
 * - no fixed `width`/`min-width` above 375 px in the stylesheet (outside `min()`/`clamp()`);
 * - wide content scrolls inside its own box: every table sits in a scroll container whose
 *   computed `overflow-x` is `auto` or `scroll` and that is positioned (spike 14 finding 13:
 *   visually hidden text inside an unpositioned scroll box widened the page);
 * - the `<main>` content column can shrink (`min-width: 0`).
 * The visual check in a real browser is documented in `docs/design-contract.md`.
 */
export function checkOverflowStylesheet(design: Design): string[] {
  const problems: string[] = []
  const css = design.stylesheet.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of css.matchAll(/(?<![\w-])(min-width|width)\s*:\s*([^;}]+)/g)) {
    const value = m[2] ?? ''
    if (/\b(?:min|clamp)\(/.test(value)) continue
    for (const px of value.matchAll(/(\d+(?:\.\d+)?)px/g))
      if (Number(px[1]) > PHONE_WIDTH)
        problems.push(`fixed ${m[1]} ${value.trim()} is wider than ${PHONE_WIDTH}px`)
  }
  return problems
}

/** The DOM half of the overflow check, on a rendered screen (see {@link checkOverflowStylesheet}). */
export function checkOverflowDom(container: Element): string[] {
  const problems: string[] = []
  const view = container.ownerDocument.defaultView
  if (!view) return ['the container is not in a window']
  const scrolls = (el: Element) => /\b(auto|scroll)\b/.test(view.getComputedStyle(el).overflowX)
  for (const table of container.querySelectorAll('table')) {
    let box = table.parentElement
    while (box && box !== container && !scrolls(box)) box = box.parentElement
    if (!box || box === container) {
      problems.push('a table is not inside a horizontal scroll box')
      continue
    }
    const position = view.getComputedStyle(box).position
    if (position === '' || position === 'static')
      problems.push('a table scrolls inside a box that is not positioned')
  }
  for (const main of container.querySelectorAll('main')) {
    const min = view.getComputedStyle(main).minWidth
    if (min !== '0' && min !== '0px') problems.push(`<main> has min-width "${min}", not 0`)
  }
  for (const el of container.querySelectorAll<HTMLElement>('[style]')) {
    const width = Number.parseFloat(el.style.width || el.style.minWidth)
    if (width > PHONE_WIDTH && /px$/.test(el.style.width || el.style.minWidth))
      problems.push(`an element has an inline width of ${width}px`)
  }
  return problems
}
