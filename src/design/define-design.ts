/**
 * `defineDesign()`: how a design package (Crisp, Vivid, a community design) declares its look.
 *
 * ```ts
 * import { defineDesign } from '@strutvane/ui/design'
 * export const crisp = defineDesign({
 *   name: 'crisp',
 *   tokens: { light, dark },          // every colour role, both themes
 *   scale,                            // radii, control and row heights, type sizes
 *   defaults: { brandHue: 264, radius: '6px', density: 1 },
 *   fonts: { sans: "'Inter Variable', system-ui, sans-serif", mono: "'Geist Mono', monospace" },
 *   shell: { Shell, Sidebar, TopBar, AuthLayout, PageHeader },
 *   skins: { Button, Input, … },
 *   chartPalette: { light: [...], dark: [...] },
 *   illustrations: { Empty, NotFound, Forbidden, Error },
 *   stylesheet,                       // the design's CSS, using only var(--sv-*) colours
 * })
 * ```
 *
 * TypeScript checks the shape (a missing slot, a token that is not a colour, a wrong prop type
 * fail to compile). At runtime `defineDesign` checks it again, fail closed, because a design can
 * come from plain JavaScript or a cast: a missing slot, an unreadable colour or a value that could
 * break out of the generated stylesheet throws a {@link DesignError} listing every problem at once.
 * The full quality bar (contrast, axe, no literal colours, overflow, overrides) is
 * `designConformance()` in `@strutvane/ui/testing`.
 *
 * @module
 */
import { parseColor } from './color.ts'
import {
  ILLUSTRATION_SLOTS,
  type IllustrationSlots,
  SHELL_SLOTS,
  type ShellSlots,
  SKIN_SLOTS,
  type SkinSlots,
} from './slots.ts'
import {
  COLOR_TOKENS,
  type CssColor,
  type PublicDefaults,
  type PublicOverrides,
  SCALE_TOKENS,
  type ScaleTokens,
  type ThemeTokens,
} from './tokens.ts'

/** The design's fonts. `sans` is the default of the public `--font-sans` token. */
export interface DesignFonts {
  /** Font stack for UI text. */
  readonly sans: string
  /** Font stack for ids, amounts and code. */
  readonly mono: string
  /** Optional `@font-face` rules (self-hosted files); put in the generated stylesheet. */
  readonly faces?: string
}

/** Chart colours, in series order. At least four per theme; series 1 is the lead series. */
export interface ChartPalette {
  readonly light: readonly [CssColor, CssColor, CssColor, CssColor, ...CssColor[]]
  readonly dark: readonly [CssColor, CssColor, CssColor, CssColor, ...CssColor[]]
}

/** Everything a design declares. */
export interface DesignDefinition {
  /** Lowercase id, such as `crisp` (used in `config/ui.ts` and as a CSS hook). */
  readonly name: string
  /** One sentence for the installer and the docs. */
  readonly description?: string
  readonly tokens: { readonly light: ThemeTokens; readonly dark: ThemeTokens }
  readonly scale: ScaleTokens
  readonly defaults: PublicDefaults
  readonly fonts: DesignFonts
  readonly shell: ShellSlots
  readonly skins: SkinSlots
  readonly chartPalette: ChartPalette
  readonly illustrations: IllustrationSlots
  /**
   * The design's CSS: class recipes for its slots and the `data-sv-part` hooks the behaviour
   * renders. Colours only through `var(--sv-*)`; no `</style>`.
   */
  readonly stylesheet: string
}

/** A checked design, as `defineDesign` returns it. Frozen. */
export type Design = DesignDefinition & { readonly __strutvaneDesign: 1 }

/** Thrown by {@link defineDesign} with every problem found. */
export class DesignError extends Error {
  /** One readable line per problem. */
  readonly problems: readonly string[]
  constructor(name: string, problems: readonly string[]) {
    super(`Design "${name}" is invalid:\n- ${problems.join('\n- ')}`)
    this.name = 'DesignError'
    this.problems = problems
  }
}

const NAME = /^[a-z][a-z0-9-]{0,39}$/
/** Characters that could end a declaration or rule in the generated stylesheet. */
const UNSAFE_CSS_VALUE = /[;{}<>\\]|\/\*/
const LENGTH = /^(?:-?\d+(?:\.\d+)?(?:px|rem)|calc\(.+\)|var\(.+\))$/

/** Whether a token value can't break out of its declaration. */
export function isSafeCssValue(value: string): boolean {
  return value.trim() !== '' && !UNSAFE_CSS_VALUE.test(value)
}

/**
 * Whether a colour token value is in a supported, parseable form. `var(--brand-hue)` is tried
 * with a sample hue, the only reference a colour may hold.
 */
export function isColorValue(value: string): boolean {
  if (!isSafeCssValue(value)) return false
  const sample = value.replaceAll('var(--brand-hue)', '200')
  return !sample.includes('var(') && parseColor(sample) !== undefined
}

/** Whether a length token value is in a supported form. */
export function isLengthValue(value: string): boolean {
  return isSafeCssValue(value) && LENGTH.test(value.trim())
}

const isComponent = (value: unknown): boolean =>
  typeof value === 'function' || (typeof value === 'object' && value !== null)

/**
 * Every structural problem of a design definition, or `[]`. Pure; `defineDesign` throws on them.
 *
 * @example
 * validateDesign({ ...plain, name: 'Bad Name' }) // ['name "Bad Name" must be …']
 */
export function validateDesign(design: DesignDefinition): string[] {
  const problems: string[] = []
  const d = design as Partial<DesignDefinition> & Record<string, unknown>
  if (typeof d.name !== 'string' || !NAME.test(d.name))
    problems.push(`name "${String(d.name)}" must be lowercase letters, digits and dashes`)
  const slotGroups: [string, unknown, readonly string[]][] = [
    ['shell', d.shell, SHELL_SLOTS],
    ['skins', d.skins, SKIN_SLOTS],
    ['illustrations', d.illustrations, ILLUSTRATION_SLOTS],
  ]
  for (const [group, value, names] of slotGroups) {
    const slots = (typeof value === 'object' && value !== null ? value : {}) as Record<
      string,
      unknown
    >
    for (const slot of names)
      if (!isComponent(slots[slot])) problems.push(`${group}.${slot} is missing (a component)`)
  }
  for (const theme of ['light', 'dark'] as const) {
    const t = d.tokens?.[theme]
    for (const token of COLOR_TOKENS) {
      const value: unknown = t?.color?.[token]
      if (typeof value !== 'string' || !isColorValue(value))
        problems.push(`tokens.${theme}.color.${token} "${String(value)}" is not a supported colour`)
    }
    for (const shadow of ['sm', 'pop'] as const) {
      const value: unknown = t?.shadow?.[shadow]
      if (typeof value !== 'string' || !isSafeCssValue(value))
        problems.push(`tokens.${theme}.shadow.${shadow} is missing or unsafe`)
    }
    const palette: unknown = d.chartPalette?.[theme]
    if (!Array.isArray(palette) || palette.length < 4)
      problems.push(`chartPalette.${theme} needs at least 4 colours`)
    else
      palette.forEach((c: unknown, i) => {
        if (typeof c !== 'string' || !isColorValue(c))
          problems.push(`chartPalette.${theme}[${i}] "${String(c)}" is not a supported colour`)
      })
  }
  for (const token of SCALE_TOKENS) {
    const value: unknown = d.scale?.[token]
    if (typeof value !== 'string' || !isLengthValue(value))
      problems.push(`scale.${token} "${String(value)}" is not a supported length`)
  }
  const defaults = d.defaults
  if (!defaults || overrideProblems({ ...defaults }).length > 0)
    problems.push('defaults must hold a brandHue (0–360), a radius length and a density (0.5–2)')
  for (const font of ['sans', 'mono'] as const) {
    const value: unknown = d.fonts?.[font]
    if (typeof value !== 'string' || !isSafeCssValue(value))
      problems.push(`fonts.${font} is missing or unsafe`)
  }
  if (d.fonts?.faces !== undefined && /<\/?\s*style/i.test(d.fonts.faces))
    problems.push('fonts.faces must not contain a style tag')
  if (typeof d.stylesheet !== 'string') problems.push('stylesheet must be a string of CSS')
  else if (/<\/?\s*style/i.test(d.stylesheet))
    problems.push('stylesheet must not contain a style tag')
  return problems
}

/**
 * Check a design and return it frozen. Throws {@link DesignError} with every problem when the
 * definition is incomplete or unsafe.
 *
 * @example
 * export const plain = defineDesign({ name: 'plain', tokens, scale, defaults, fonts, shell, skins,
 *   chartPalette, illustrations, stylesheet })
 */
export function defineDesign<const D extends DesignDefinition>(definition: D): D & Design {
  const problems = validateDesign(definition)
  if (problems.length > 0) throw new DesignError(String(definition.name), problems)
  const design: D & Design = { ...definition, __strutvaneDesign: 1 }
  Object.freeze(design)
  return design
}

/**
 * Every problem with a set of public override values, or `[]`. Values that fail are never
 * written into a stylesheet.
 *
 * @example
 * overrideProblems({ brandHue: 400 }) // ['brandHue must be a number from 0 to 360']
 */
export function overrideProblems(overrides: PublicOverrides): string[] {
  const problems: string[] = []
  const { brandHue, fontSans, radius, density } = overrides
  if (brandHue !== undefined && !(Number.isFinite(brandHue) && brandHue >= 0 && brandHue <= 360))
    problems.push('brandHue must be a number from 0 to 360')
  if (fontSans !== undefined && (typeof fontSans !== 'string' || !isSafeCssValue(fontSans)))
    problems.push('fontSans must be a font stack without ; { } < > \\ or comments')
  if (radius !== undefined && (typeof radius !== 'string' || !isLengthValue(radius)))
    problems.push('radius must be a px, rem, calc() or var() length')
  if (density !== undefined && !(Number.isFinite(density) && density >= 0.5 && density <= 2))
    problems.push('density must be a number from 0.5 to 2')
  return problems
}

/** The valid part of a set of overrides (invalid values dropped). */
export function safeOverrides(overrides: PublicOverrides): PublicOverrides {
  const out: { -readonly [K in keyof PublicOverrides]: PublicOverrides[K] } = {}
  for (const key of ['brandHue', 'fontSans', 'radius', 'density'] as const) {
    const single = { [key]: overrides[key] } as PublicOverrides
    if (overrides[key] !== undefined && overrideProblems(single).length === 0)
      Object.assign(out, single)
  }
  return out
}
