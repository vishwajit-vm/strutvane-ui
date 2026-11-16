/**
 * The token vocabulary of the Design contract: which colours, sizes and fonts every design
 * provides, the CSS custom property each one becomes, the text/background pairs that must meet
 * WCAG AA, and the four public override tokens apps use to brand any design.
 *
 * Why roles, not colours: `@strutvane/ui` names a ROLE (`accentText` on `surface`), never a colour.
 * A design maps each role to a value for light and dark, so swapping Crisp for Vivid changes every
 * screen without touching one, and the conformance kit can check every pair the screens use.
 *
 * @module
 */

/**
 * A colour a token may hold. Only these forms, because the conformance kit computes contrast from
 * them exactly: hex (`#rgb`, `#rrggbb`, with optional alpha), `rgb()`/`rgba()`, and `oklch()`, whose
 * hue may be `var(--brand-hue)` or `calc(var(--brand-hue) + N)` so an app can rebrand the accent.
 */
export type CssColor = `#${string}` | `rgb(${string})` | `rgba(${string})` | `oklch(${string})`

/** A length a size token may hold: px, rem, or a `calc()`/`var()` built from the public tokens. */
export type CssLength = `${number}px` | `${number}rem` | `calc(${string})` | `var(${string})`

/** Every colour role a design must define, in both themes. */
export const COLOR_TOKENS = [
  'bg',
  'surface',
  'surfaceSubtle',
  'surfaceMuted',
  'fg',
  'fgMuted',
  'border',
  'input',
  'accent',
  'accentHover',
  'accentFg',
  'accentSubtle',
  'accentText',
  'ring',
  'danger',
  'dangerHover',
  'dangerFg',
  'dangerSubtle',
  'dangerText',
  'success',
  'successSubtle',
  'successText',
  'warning',
  'warningSubtle',
  'warningText',
  'overlay',
  'mark',
  'markFg',
] as const

/** One colour role name. */
export type ColorToken = (typeof COLOR_TOKENS)[number]

/** The colours of one theme: every role, each a {@link CssColor}. */
export type ColorTokens = { readonly [K in ColorToken]: CssColor }

/** One theme (light or dark): its colours and its two shadows. */
export interface ThemeTokens {
  readonly color: ColorTokens
  /** Shadows may contain colour functions; they are tokens, so that is allowed here. */
  readonly shadow: { readonly sm: string; readonly pop: string }
}

/** Every size role a design must define (theme-independent). */
export const SCALE_TOKENS = [
  'radiusSm',
  'radiusMd',
  'radiusLg',
  'controlHeight',
  'rowHeight',
  'space',
  'sidebarWidth',
  'fontSizeSm',
  'fontSize',
  'fontSizeLg',
] as const

/** One size role name. */
export type ScaleToken = (typeof SCALE_TOKENS)[number]

/**
 * The sizes of a design. Radii must be built from `var(--radius)` and control/row heights from
 * `var(--density)`, so the public overrides reach them (checked by the conformance kit).
 */
export type ScaleTokens = { readonly [K in ScaleToken]: CssLength }

/**
 * The public override tokens (decision #31): the four CSS custom properties an app sets (in
 * `resources/ui/theme.css` or through `<DesignProvider overrides>`) to brand ANY design.
 */
export const PUBLIC_OVERRIDE_TOKENS = [
  '--brand-hue',
  '--font-sans',
  '--radius',
  '--density',
] as const

/** One public override token. */
export type PublicOverrideToken = (typeof PUBLIC_OVERRIDE_TOKENS)[number]

/** Values for the public override tokens, as `<DesignProvider overrides>` takes them. */
export interface PublicOverrides {
  /** Accent hue in degrees, 0–360 (`--brand-hue`). */
  readonly brandHue?: number
  /** Font stack for UI text (`--font-sans`), such as `"Acme Sans", system-ui, sans-serif`. */
  readonly fontSans?: string
  /** Base corner radius (`--radius`), such as `8px`. */
  readonly radius?: CssLength
  /** Spacing scale for controls and rows (`--density`), 0.5–2; 1 is the design's own. */
  readonly density?: number
}

/** A design's defaults for the public tokens (`--font-sans` comes from `fonts.sans`). */
export interface PublicDefaults {
  readonly brandHue: number
  readonly radius: CssLength
  readonly density: number
}

/** A text/background (or non-text/background) pair and its minimum contrast ratio. */
export interface ContrastPair {
  readonly fg: ColorToken
  readonly bg: ColorToken
  /** 4.5 for text (WCAG 1.4.3), 3 for focus rings and control boundaries (WCAG 1.4.11). */
  readonly min: number
}

const text = (fg: ColorToken, bg: ColorToken): ContrastPair => ({ fg, bg, min: 4.5 })
const ui = (fg: ColorToken, bg: ColorToken): ContrastPair => ({ fg, bg, min: 3 })

/**
 * Every pair the behaviour actually renders, in both themes. A design that passes these can't
 * produce unreadable text on any built-in screen.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = Object.freeze([
  text('fg', 'bg'),
  text('fg', 'surface'),
  text('fg', 'surfaceSubtle'),
  text('fg', 'surfaceMuted'),
  text('fg', 'accentSubtle'),
  text('fgMuted', 'bg'),
  text('fgMuted', 'surface'),
  text('fgMuted', 'surfaceSubtle'),
  text('accentFg', 'accent'),
  text('accentFg', 'accentHover'),
  text('accentText', 'surface'),
  text('accentText', 'bg'),
  text('accentText', 'accentSubtle'),
  text('dangerFg', 'danger'),
  text('dangerFg', 'dangerHover'),
  text('dangerText', 'surface'),
  text('dangerText', 'dangerSubtle'),
  text('successText', 'surface'),
  text('successText', 'successSubtle'),
  text('warningText', 'surface'),
  text('warningText', 'warningSubtle'),
  text('markFg', 'mark'),
  ui('ring', 'surface'),
  ui('ring', 'bg'),
  ui('input', 'surface'),
  ui('accent', 'surface'),
])

/** `surfaceSubtle` → `--sv-surface-subtle`. */
export function cssVar(token: ColorToken | ScaleToken): string {
  return `--sv-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
}

/** The custom property of chart colour `n` (1-based): `--sv-chart-1`. */
export function chartVar(n: number): string {
  return `--sv-chart-${n}`
}

/** The custom properties every design stylesheet may use, besides the colour and scale roles. */
export const EXTRA_VARS = {
  fontSans: '--sv-font-sans',
  fontMono: '--sv-font-mono',
  shadowSm: '--sv-shadow-sm',
  shadowPop: '--sv-shadow-pop',
} as const
