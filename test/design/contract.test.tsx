// @vitest-environment jsdom
// The Design contract: colour maths, defineDesign's runtime checks (fail closed), the generated
// stylesheet, override handling, and <DesignProvider> (theme, nonce, storage failures, CSP hash).
import { createHash } from 'node:crypto'
import { act, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { contrastRatio, parseColor, resolveVars } from '../../src/design/color.ts'
import {
  DesignProvider,
  THEME_SCRIPT,
  THEME_SCRIPT_HASH,
  THEME_STORAGE_KEY,
  useDesign,
} from '../../src/design/DesignProvider.tsx'
import {
  type Design,
  DesignError,
  defineDesign,
  isColorValue,
  isLengthValue,
  overrideProblems,
  safeOverrides,
  validateDesign,
} from '../../src/design/define-design.ts'
import { plain } from '../../src/design/plain/index.ts'
import {
  COMPACT_STEP,
  customPropertiesFor,
  designStylesheet,
  resolveDesignTokens,
} from '../../src/design/stylesheet.ts'
import { cssVar } from '../../src/design/tokens.ts'

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-sv-theme')
})

/** A copy of the plain design with one part replaced, checked by validateDesign only. */
const variant = (over: Record<string, unknown>): Design => ({ ...plain, ...over }) as Design

describe('colour maths', () => {
  test.each([
    ['#fff', 1],
    ['#ffffff', 1],
    ['#ffff', 1],
    ['#000000ff', 1],
    ['#00000080', 0.502],
    ['rgb(255 255 255)', 1],
    ['rgb(255, 255, 255)', 1],
    ['rgba(0, 0, 0, 0.5)', 0.5],
    ['rgb(100% 100% 100% / 50%)', 0.5],
    ['oklch(0.5 0.1 200)', 1],
    ['oklch(50% 0.1 200)', 1],
    ['oklch(0.5 0.1 calc(200 + 18))', 1],
    ['oklch(0.5 0.1 calc(200 - 18) / 0.4)', 0.4],
    ['transparent', 0],
  ])('parses %s', (value, alpha) => {
    expect(parseColor(value)?.alpha).toBeCloseTo(alpha, 2)
  })

  test.each([
    'blue',
    '#ggg',
    'rgb(1 2)',
    'rgb(a b c)',
    'rgb(1 2 3 / x)',
    'oklch(0.5 0.1)',
    'oklch(0.5 0.1 calc(1 * 2))',
    'oklch(0.5 0.1 200 / 1 / 2)',
    'hsl(0 0% 0%)',
    '#ffffff/2',
  ])('refuses %s', (value) => {
    expect(parseColor(value)).toBeUndefined()
  })

  test('contrast: black on white is 21:1, a colour on itself 1:1', () => {
    const black = parseColor('#000')
    const white = parseColor('#fff')
    if (!black || !white) throw new Error('parse')
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5)
    expect(contrastRatio(white, white)).toBe(1)
  })

  test('var() resolution: nested, fallbacks, missing and cycles', () => {
    const vars = new Map([
      ['--a', 'var(--b)'],
      ['--b', '10'],
      ['--loop', 'var(--loop)'],
    ])
    expect(resolveVars('calc(var(--a) + 1)', vars)).toBe('calc(10 + 1)')
    expect(resolveVars('var(--nope, var(--b))', vars)).toBe('10')
    expect(resolveVars('var(--nope)', vars)).toBeUndefined()
    expect(resolveVars('var(--loop)', vars)).toBeUndefined()
    expect(resolveVars('var(--a', vars)).toBeUndefined()
  })
})

describe('defineDesign (runtime, fail closed)', () => {
  test('the plain design is valid', () => {
    expect(validateDesign(plain)).toEqual([])
    expect(Object.isFrozen(plain)).toBe(true)
  })

  test('throws one DesignError listing every problem', () => {
    const broken = { ...plain, name: 'Bad Name', stylesheet: '</style><script>' }
    let error: unknown
    try {
      defineDesign(broken)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(DesignError)
    expect((error as DesignError).problems).toEqual([
      'name "Bad Name" must be lowercase letters, digits and dashes',
      'stylesheet must not contain a style tag',
    ])
    expect((error as DesignError).message).toMatch(/^Design "Bad Name" is invalid:/)
  })

  test('each kind of problem is caught', () => {
    const { Button: _gone, ...skins } = plain.skins
    const problems = validateDesign(
      variant({
        skins,
        shell: { ...plain.shell, Sidebar: 'nope' },
        illustrations: undefined,
        tokens: {
          light: {
            ...plain.tokens.light,
            color: { ...plain.tokens.light.color, accent: 'blue', fg: '#000;}body{x:y' },
            shadow: { sm: '', pop: 'x' },
          },
          dark: plain.tokens.dark,
        },
        scale: { ...plain.scale, radiusMd: '6 px' },
        defaults: { brandHue: 400, radius: '6px', density: 1 },
        fonts: { sans: 'a;b', mono: 'x', faces: '<style>' },
        chartPalette: { light: ['#fff'], dark: ['#fff', '#000', '#111', 'pink'] },
        stylesheet: 42,
      }),
    )
    expect(problems).toEqual(
      expect.arrayContaining([
        'skins.Button is missing (a component)',
        'shell.Sidebar is missing (a component)',
        'illustrations.Empty is missing (a component)',
        'tokens.light.color.accent "blue" is not a supported colour',
        'tokens.light.color.fg "#000;}body{x:y" is not a supported colour',
        'tokens.light.shadow.sm is missing or unsafe',
        'chartPalette.light needs at least 4 colours',
        'chartPalette.dark[3] "pink" is not a supported colour',
        'scale.radiusMd "6 px" is not a supported length',
        'defaults must hold a brandHue (0–360), a radius length and a density (0.5–2)',
        'fonts.sans is missing or unsafe',
        'fonts.faces must not contain a style tag',
        'stylesheet must be a string of CSS',
      ]),
    )
    expect(validateDesign(variant({ defaults: undefined }))).toContain(
      'defaults must hold a brandHue (0–360), a radius length and a density (0.5–2)',
    )
  })

  test('value forms', () => {
    expect(isColorValue('oklch(0.5 0.2 var(--brand-hue))')).toBe(true)
    expect(isColorValue('oklch(0.5 0.2 var(--other))')).toBe(false)
    expect(isLengthValue('calc(var(--radius) * 2)')).toBe(true)
    expect(isLengthValue('1.5rem')).toBe(true)
    expect(isLengthValue('auto')).toBe(false)
  })
})

describe('public overrides', () => {
  test('invalid values are reported and dropped, never written into CSS', () => {
    expect(
      overrideProblems({ brandHue: 400, fontSans: 'x;}', radius: 'big' as '1px', density: 9 }),
    ).toEqual([
      'brandHue must be a number from 0 to 360',
      'fontSans must be a font stack without ; { } < > \\ or comments',
      'radius must be a px, rem, calc() or var() length',
      'density must be a number from 0.5 to 2',
    ])
    expect(safeOverrides({ brandHue: 120, fontSans: 'x;}', density: 1.2 })).toEqual({
      brandHue: 120,
      density: 1.2,
    })
    const css = designStylesheet(plain, { overrides: { fontSans: 'evil;} body{', brandHue: 10 } })
    expect(css).not.toContain('evil')
    expect(css).toContain('[data-sv-design="plain"]{--brand-hue:10;}')
  })
})

describe('the generated stylesheet', () => {
  const css = designStylesheet(plain)

  test('public defaults sit at zero specificity, so an app theme.css wins', () => {
    expect(css).toContain(':where(:root){--brand-hue:255;--font-sans:system-ui')
    expect(css).toContain('--radius:6px;--density:1;}')
  })

  test('both themes declare every colour role, the chart palette and color-scheme', () => {
    for (const theme of ['light', 'dark'] as const) {
      const vars = customPropertiesFor(
        css,
        (s) => s === `[data-sv-design="plain"][data-sv-theme="${theme}"]`,
      )
      expect(vars.get(cssVar('accent'))).toBe(plain.tokens[theme].color.accent)
      expect(vars.get('--sv-chart-4')).toBe(plain.chartPalette[theme][3])
    }
  })

  test('compact rows shrink the row and control heights where the toggle is', () => {
    const normal = resolveDesignTokens(plain, 'light')
    const compact = resolveDesignTokens(plain, 'light', {}, 'compact')
    expect(normal.get('--sv-row-height')).toBe('calc((calc(40px * 1)) * 1)')
    expect(compact.get('--sv-row-height')).toBe(`calc((calc(40px * 1)) * ${COMPACT_STEP})`)
  })

  test('customPropertiesFor reads only plain rules, last declaration wins', () => {
    const found = customPropertiesFor(
      '/* x */ .a{--x:1} @media (y){.a{--x:2}} .a{--x:3;--y: 4 }',
      (s) => s === '.a',
    )
    expect(Object.fromEntries(found)).toEqual({ '--x': '3', '--y': '4' })
  })
})

describe('<DesignProvider>', () => {
  test('injects one <style> with the nonce and marks the root with design and theme', () => {
    const { container } = render(
      <DesignProvider design={plain} theme="dark" nonce="n0nce">
        <p>hi</p>
      </DesignProvider>,
    )
    const style = container.querySelector('style')
    expect(style?.nonce || style?.getAttribute('nonce')).toBe('n0nce')
    expect(style?.textContent).toContain('[data-sv-design="plain"]')
    const root = container.querySelector('[data-sv-design="plain"]')
    expect(root?.getAttribute('data-sv-theme')).toBe('dark')
  })

  test('injectStyles={false} injects nothing (serve designStylesheet() as a file)', () => {
    const { container } = render(
      <DesignProvider design={plain} injectStyles={false}>
        <p>hi</p>
      </DesignProvider>,
    )
    expect(container.querySelector('style')).toBeNull()
  })

  test('system theme follows the operating system live', () => {
    let dark = false
    const listeners = new Set<() => void>()
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return dark
      },
      addEventListener: (_: string, f: () => void) => listeners.add(f),
      removeEventListener: (_: string, f: () => void) => listeners.delete(f),
    }))
    const { container } = render(
      <DesignProvider design={plain}>
        <p>hi</p>
      </DesignProvider>,
    )
    const root = () => container.querySelector('[data-sv-design]')?.getAttribute('data-sv-theme')
    expect(root()).toBe('light')
    dark = true
    act(() => {
      for (const f of listeners) f()
    })
    expect(root()).toBe('dark')
  })

  test('the viewer choice is remembered; blocked storage still applies it', () => {
    const wrapper = ({ children }: { children?: ReactNode }) => (
      <DesignProvider design={plain} defaultTheme="light">
        {children}
      </DesignProvider>
    )
    const { result } = renderHook(() => useDesign(), { wrapper })
    expect(result.current.theme).toBe('light')
    act(() => result.current.setTheme('dark'))
    expect(result.current.resolvedTheme).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    act(() => result.current.setTheme('light'))
    expect(result.current.theme).toBe('light')
    setItem.mockRestore()
  })

  test('a remembered choice is read back; garbage is ignored', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const { result } = renderHook(() => useDesign(), {
      wrapper: ({ children }) => <DesignProvider design={plain}>{children}</DesignProvider>,
    })
    expect(result.current.theme).toBe('dark')
    localStorage.setItem(THEME_STORAGE_KEY, 'neon')
    const second = renderHook(() => useDesign(), {
      wrapper: ({ children }) => (
        <DesignProvider design={plain} defaultTheme="light">
          {children}
        </DesignProvider>
      ),
    })
    expect(second.result.current.theme).toBe('light')
  })

  test('a controlled theme reports changes and stays controlled', () => {
    const onThemeChange = vi.fn()
    const { result } = renderHook(() => useDesign(), {
      wrapper: ({ children }) => (
        <DesignProvider design={plain} theme="light" onThemeChange={onThemeChange}>
          {children}
        </DesignProvider>
      ),
    })
    act(() => result.current.setTheme('dark'))
    expect(onThemeChange).toHaveBeenCalledWith('dark')
    expect(result.current.theme).toBe('light')
  })

  test('useDesign outside a provider says what to do', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => renderHook(() => useDesign())).toThrow(/inside <DesignProvider>/)
  })

  test('without matchMedia, system means light', () => {
    vi.stubGlobal('matchMedia', undefined)
    render(
      <DesignProvider design={plain}>
        <p>x</p>
      </DesignProvider>,
    )
    expect(screen.getByText('x').closest('[data-sv-theme]')?.getAttribute('data-sv-theme')).toBe(
      'light',
    )
  })

  test('the inline theme script is allowed by exactly its published CSP hash (#119)', () => {
    const hash = createHash('sha256').update(THEME_SCRIPT, 'utf8').digest('base64')
    expect(THEME_SCRIPT_HASH).toBe(`'sha256-${hash}'`)
    // It runs: it sets the theme on <html> before the first paint, and survives blocked storage.
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    new Function(THEME_SCRIPT)()
    expect(document.documentElement.getAttribute('data-sv-theme')).toBe('dark')
  })
})
