/**
 * A small router for the generated app (History API, no dependency): resource pages are routed
 * automatically, and apps add their own screens as {@link RouteDefinition}s.
 *
 * Paths: `/` home, `/:resource`, `/:resource/new`, `/:resource/:id`, `/:resource/:id/edit`, plus
 * custom routes (`{ path: '/reports', element: <Reports /> }`, `:params` allowed), which win over
 * resource routes. Links are real `<a href>` elements (open in a new tab, keyboard and screen
 * readers work); a plain left click navigates without a reload.
 *
 * @module
 */
import {
  type AnchorHTMLAttributes,
  createContext,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

/** An app-defined screen. */
export interface RouteDefinition {
  /** Path pattern, e.g. `/reports` or `/reports/:year`. */
  readonly path: string
  /** What to render. */
  readonly element: ReactNode
  /** Navigation label; routes with a title appear in the app's menu. */
  readonly title?: string
}

/** The current location, as the app shell sees it. */
export interface RouterState {
  readonly pathname: string
  readonly search: string
  /** Go to a path (`replace` replaces the history entry). */
  navigate(to: string, options?: { readonly replace?: boolean }): void
}

const RouterContext = createContext<RouterState | null>(null)

/** The router state. Throws outside {@link Router}. */
export function useRouter(): RouterState {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRouter() must be used inside <Router> (or <StrutvaneApp>).')
  return ctx
}

const readLocation = () =>
  typeof window === 'undefined'
    ? { pathname: '/', search: '' }
    : { pathname: window.location.pathname, search: window.location.search }

/** Provides {@link useRouter} from `window.location`, following back/forward navigation. */
export function Router({ children }: { readonly children?: ReactNode }): ReactElement {
  const [location, setLocation] = useState(readLocation)
  useEffect(() => {
    const onPop = () => setLocation(readLocation())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const navigate = useCallback((to: string, options: { readonly replace?: boolean } = {}) => {
    // Same-origin paths only: an absolute or protocol-relative URL is never followed.
    if (!to.startsWith('/') || to.startsWith('//')) return
    // Already there: no history entry and no re-render (callers may navigate on every render).
    if (`${window.location.pathname}${window.location.search}` === to) return
    if (options.replace) window.history.replaceState(null, '', to)
    else window.history.pushState(null, '', to)
    setLocation(readLocation())
  }, [])
  const value = useMemo(() => ({ ...location, navigate }), [location, navigate])
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

/** Match `pattern` (`/reports/:year`) against `pathname`; the params, or `undefined`. */
export function matchPath(
  pattern: string,
  pathname: string,
): Readonly<Record<string, string>> | undefined {
  const want = pattern.split('/').filter(Boolean)
  const got = pathname.split('/').filter(Boolean)
  if (want.length !== got.length) return undefined
  const params: Record<string, string> = {}
  for (let i = 0; i < want.length; i++) {
    const w = want[i] as string
    const g = got[i] as string
    if (w.startsWith(':')) {
      try {
        params[w.slice(1)] = decodeURIComponent(g)
      } catch {
        return undefined
      }
    } else if (w !== g) return undefined
  }
  return params
}

/** Props of {@link Link}. */
export type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  readonly to: string
}

/** An in-app link: a real anchor that navigates without reloading on a plain left click. */
export function Link({ to, onClick, children, ...rest }: LinkProps): ReactElement {
  const { navigate } = useRouter()
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return
    event.preventDefault()
    navigate(to)
  }
  return (
    <a href={to} onClick={handle} {...rest}>
      {children}
    </a>
  )
}
