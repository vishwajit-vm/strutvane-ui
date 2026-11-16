/**
 * The plain design's tokens: quiet greys, one accent built from `--brand-hue`, readable in both
 * themes at every hue (the conformance kit sweeps 0–345° in 15° steps).
 *
 * This is the ONLY file of the plain design that may contain colour literals; the conformance
 * kit's "no hard-coded colours" rule scans every other file.
 *
 * @module
 */
import type { ChartPalette } from '../define-design.ts'
import type { ScaleTokens, ThemeTokens } from '../tokens.ts'

/** Light theme. */
export const light: ThemeTokens = {
  color: {
    bg: '#f6f6f7',
    surface: '#ffffff',
    surfaceSubtle: '#f1f1f3',
    surfaceMuted: '#e7e7eb',
    fg: '#16161a',
    fgMuted: '#55555f',
    border: '#d9d9de',
    input: '#7f7f8a',
    accent: 'oklch(0.48 0.15 var(--brand-hue))',
    accentHover: 'oklch(0.42 0.15 var(--brand-hue))',
    accentFg: '#ffffff',
    accentSubtle: 'oklch(0.95 0.025 var(--brand-hue))',
    accentText: 'oklch(0.45 0.15 var(--brand-hue))',
    ring: 'oklch(0.48 0.15 var(--brand-hue))',
    danger: '#b42318',
    dangerHover: '#912018',
    dangerFg: '#ffffff',
    dangerSubtle: '#fdecea',
    dangerText: '#a51c14',
    success: '#1a7f45',
    successSubtle: '#e8f5ee',
    successText: '#156638',
    warning: '#b25e00',
    warningSubtle: '#fdf3e2',
    warningText: '#8a4600',
    overlay: 'rgb(10 10 15 / 0.45)',
    mark: '#fff1a8',
    markFg: '#16161a',
  },
  shadow: {
    sm: '0 1px 2px rgb(10 10 15 / 0.08)',
    pop: '0 8px 24px rgb(10 10 15 / 0.16)',
  },
}

/** Dark theme. */
export const dark: ThemeTokens = {
  color: {
    bg: '#111114',
    surface: '#18181c',
    surfaceSubtle: '#202026',
    surfaceMuted: '#2a2a31',
    fg: '#ededf0',
    fgMuted: '#a9a9b4',
    border: '#33333b',
    input: '#80808b',
    accent: 'oklch(0.68 0.13 var(--brand-hue))',
    accentHover: 'oklch(0.74 0.12 var(--brand-hue))',
    accentFg: '#000000',
    accentSubtle: 'oklch(0.3 0.05 var(--brand-hue))',
    accentText: 'oklch(0.8 0.1 var(--brand-hue))',
    ring: 'oklch(0.72 0.13 var(--brand-hue))',
    danger: '#c4352b',
    dangerHover: '#a52a22',
    dangerFg: '#ffffff',
    dangerSubtle: '#3a1513',
    dangerText: '#ff9b91',
    success: '#2f9e60',
    successSubtle: '#13291c',
    successText: '#6fd69a',
    warning: '#d08a1a',
    warningSubtle: '#2e2210',
    warningText: '#f2c063',
    overlay: 'rgb(0 0 0 / 0.6)',
    mark: '#5c4a00',
    markFg: '#fff6cc',
  },
  shadow: {
    sm: '0 1px 2px rgb(0 0 0 / 0.5)',
    pop: '0 8px 24px rgb(0 0 0 / 0.6)',
  },
}

/** Sizes: radii follow `--radius`, controls and rows follow `--density`. */
export const scale: ScaleTokens = {
  radiusSm: 'calc(var(--radius) * 0.5)',
  radiusMd: 'var(--radius)',
  radiusLg: 'calc(var(--radius) * 1.5)',
  controlHeight: 'calc(36px * var(--density))',
  rowHeight: 'calc(40px * var(--density))',
  space: 'calc(4px * var(--density))',
  sidebarWidth: '240px',
  fontSizeSm: '0.8125rem',
  fontSize: '0.875rem',
  fontSizeLg: '1.25rem',
}

/** Chart colours: the accent first, then distinct hues. */
export const chartPalette: ChartPalette = {
  light: [
    'oklch(0.48 0.15 var(--brand-hue))',
    'oklch(0.6 0.12 calc(var(--brand-hue) + 120))',
    'oklch(0.6 0.12 calc(var(--brand-hue) + 240))',
    '#7f7f8a',
  ],
  dark: [
    'oklch(0.72 0.13 var(--brand-hue))',
    'oklch(0.72 0.11 calc(var(--brand-hue) + 120))',
    'oklch(0.72 0.11 calc(var(--brand-hue) + 240))',
    '#80808b',
  ],
}
