/**
 * `<DesignProvider>`: puts one design on screen and hands its slots to every behaviour component.
 *
 * ```tsx
 * <DesignProvider design={crisp} theme="system" overrides={{ brandHue: 150 }} nonce={cspNonce}>
 *   <StrutvaneApp apiUrl="/api" />
 * </DesignProvider>
 * ```
 *
 * - **Styles:** the design's generated stylesheet goes into one `<style nonce>` (decision #119:
 *   with a strict CSP, pass the request's nonce). With `injectStyles={false}` nothing is injected;
 *   serve `designStylesheet(design)` as a file instead.
 * - **Theme:** `light`, `dark` or `system` (follows the OS, live). Uncontrolled by default and
 *   remembered per browser; storage that is blocked or full just means it isn't remembered.
 *   `THEME_SCRIPT` (allowed by its CSP hash, `THEME_SCRIPT_HASH`) sets the theme before the first
 *   paint, so a dark-mode user never sees a white flash.
 * - **Overrides:** the four public tokens (`--brand-hue`, `--font-sans`, `--radius`, `--density`).
 *   Invalid values are dropped, never written into CSS.
 *
 * @module
 */
import {
  type Context,
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { Design } from './define-design.ts'
import { designStylesheet, type ThemeName } from './stylesheet.ts'
import type { PublicOverrides } from './tokens.ts'

/** The theme a viewer picked: a fixed one, or follow the operating system. */
export type ThemePreference = ThemeName | 'system'

/** What {@link useDesign} returns. */
export interface DesignContextValue {
  readonly design: Design
  /** The viewer's preference. */
  readonly theme: ThemePreference
  /** The theme on screen now. */
  readonly resolvedTheme: ThemeName
  /** Change (and remember) the preference. */
  readonly setTheme: (theme: ThemePreference) => void
}

/** The context; `null` outside a provider. */
export const DesignContext: Context<DesignContextValue | null> =
  createContext<DesignContextValue | null>(null)

/**
 * The current design, its slots and the theme. Throws outside `<DesignProvider>` with a hint.
 *
 * @example
 * const { design } = useDesign()
 * const { Button } = design.skins
 */
export function useDesign(): DesignContextValue {
  const value = useContext(DesignContext)
  if (!value)
    throw new Error(
      'useDesign() must be used inside <DesignProvider>. Wrap the app in <DesignProvider design={…}> (the plain design is @strutvane/ui/design/plain).',
    )
  return value
}

/** The storage key of the remembered theme (shared with {@link THEME_SCRIPT}). */
export const THEME_STORAGE_KEY = 'strutvane:theme'

/**
 * A tiny inline script for the page `<head>` that sets `data-sv-theme` on `<html>` before the first
 * paint. Static text, so a CSP can allow it by hash (`THEME_SCRIPT_HASH`) without `unsafe-inline`.
 */
export const THEME_SCRIPT: string =
  "try{var t=localStorage.getItem('strutvane:theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-sv-theme',t)}catch(e){}"

/** The CSP source for {@link THEME_SCRIPT}: add it to `script-src` (tested to match the script). */
export const THEME_SCRIPT_HASH: string = "'sha256-gaYM+N++CB09clU4TGkjluer+ggdqwBUHQ+JX404fgY='"

function readStoredTheme(): ThemePreference | undefined {
  try {
    const value =
      typeof localStorage === 'undefined' ? null : localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' || value === 'system' ? value : undefined
  } catch {
    return undefined
  }
}

function storeTheme(theme: ThemePreference): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Blocked or full storage: the choice still applies, it just isn't remembered.
  }
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

function systemTheme(): ThemeName {
  try {
    return typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Follow the operating system's theme while `enabled`. */
function useSystemTheme(enabled: boolean): ThemeName {
  const [theme, setTheme] = useState<ThemeName>(systemTheme)
  useEffect(() => {
    if (!enabled || typeof matchMedia !== 'function') return
    const query = matchMedia(DARK_QUERY)
    const update = () => setTheme(query.matches ? 'dark' : 'light')
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [enabled])
  return theme
}

/** Props of {@link DesignProvider}. */
export interface DesignProviderProps {
  readonly design: Design
  /** Controlled theme. Omit to let the viewer choose (remembered per browser). */
  readonly theme?: ThemePreference
  /** Called when the viewer picks a theme (controlled or not). */
  readonly onThemeChange?: (theme: ThemePreference) => void
  /** Theme for a first visit when nothing is remembered. Default `system`. */
  readonly defaultTheme?: ThemePreference
  /** Public override tokens for this app. */
  readonly overrides?: PublicOverrides
  /** CSP nonce for the injected `<style>` (decision #119). */
  readonly nonce?: string
  /** Inject the design's stylesheet. Default `true`. */
  readonly injectStyles?: boolean
  readonly children?: ReactNode
}

/** Applies a design and provides its slots. */
export function DesignProvider({
  design,
  theme: controlled,
  onThemeChange,
  defaultTheme = 'system',
  overrides,
  nonce,
  injectStyles = true,
  children,
}: DesignProviderProps): ReactElement {
  const [own, setOwn] = useState<ThemePreference>(() => readStoredTheme() ?? defaultTheme)
  const theme = controlled ?? own
  const system = useSystemTheme(theme === 'system')
  const resolvedTheme: ThemeName = theme === 'system' ? system : theme
  const setTheme = useCallback(
    (next: ThemePreference) => {
      storeTheme(next)
      if (controlled === undefined) setOwn(next)
      onThemeChange?.(next)
    },
    [controlled, onThemeChange],
  )
  const css = useMemo(
    () => (injectStyles ? designStylesheet(design, overrides ? { overrides } : {}) : ''),
    [design, overrides, injectStyles],
  )
  const value = useMemo(
    () => ({ design, theme, resolvedTheme, setTheme }),
    [design, theme, resolvedTheme, setTheme],
  )
  return (
    <DesignContext.Provider value={value}>
      {injectStyles ? (
        <style nonce={nonce} data-sv-design-styles={design.name}>
          {css}
        </style>
      ) : null}
      <div data-sv-design={design.name} data-sv-theme={resolvedTheme} data-sv-part="root">
        {children}
      </div>
    </DesignContext.Provider>
  )
}
