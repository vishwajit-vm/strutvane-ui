/**
 * A small router for the generated app (History API, no dependency): resource pages are routed
 * automatically, and apps add their own screens as {@link RouteDefinition}s.
 *
 * Paths: `/` home, `/:resource`, `/:resource/new`, `/:resource/:key`, `/:resource/:key/edit`, plus
 * custom routes (`{ path: '/reports', element: <Reports /> }`, `:params` allowed), which win over
 * resource routes. Links are real `<a href>` elements (open in a new tab, keyboard and screen
 * readers work); a plain left click navigates without a reload.
 *
 * Two v2 additions serve the conveniences:
 * - **History depth** (`canGoBack`): every entry this router creates is numbered in
 *   `history.state`, so the Back control knows whether the previous entry is a page of this app
 *   (then it goes back, restoring the list's page and filters from its URL) or not (then it goes
 *   to the parent page instead of leaving the app).
 * - **Blockers** ({@link useNavigationBlocker}): a form with unsaved changes can hold any
 *   navigation (links, Back, the browser's Back button) and ask first. Browser Back can't be
 *   cancelled, so it is undone with `history.go()` and replayed if the person confirms.
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
  useRef,
  useState,
} from 'react'

/** An app-defined screen. */
export interface RouteDefinition {
  /** Path pattern, e.g. `/reports` or `/reports/:year`. */
  readonly path: string
  /** What to render. */
  readonly element: ReactNode
  /** Navigation label; routes with a title (and no `:param`) appear in the sidebar. */
  readonly title?: string
  /** Sidebar icon name (Tabler names). */
  readonly icon?: string
  /** Sidebar group. */
  readonly group?: string
  /** Sidebar order inside its group. */
  readonly order?: number
}

/**
 * Called when a navigation is held: show a confirmation, then call `proceed()` to let it happen
 * (or do nothing to stay).
 */
export type NavigationBlocker = (proceed: () => void) => void

/** The current location, as the app shell sees it. */
export interface RouterState {
  readonly pathname: string
  readonly search: string
  /** Whether the previous history entry is a page of this app. */
  readonly canGoBack: boolean
  /**
   * Go to a path (`replace` replaces the history entry). Same-origin paths only. `force` skips
   * blockers: only for leaving on purpose (another person signed in), never for a user's click.
   */
  navigate(to: string, options?: { readonly replace?: boolean; readonly force?: boolean }): void
  /** Go back one entry (use when `canGoBack`). */
  back(): void
  /** Register a blocker; returns the function that removes it. */
  block(blocker: NavigationBlocker): () => void
}

const RouterContext = createContext<RouterState | null>(null)

/** The router state. Throws outside {@link Router}. */
export function useRouter(): RouterState {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRouter() must be used inside <Router> (or <StrutvaneApp>).')
  return ctx
}

/** The router state, or `null` outside {@link Router} (for components usable on their own). */
export function useOptionalRouter(): RouterState | null {
  return useContext(RouterContext)
}

const readLocation = () => ({ pathname: window.location.pathname, search: window.location.search })

/** The entry number this router stored in `history.state`, if any. */
function entryIndex(state: unknown): number | undefined {
  const value =
    typeof state === 'object' && state !== null
      ? (state as { svIndex?: unknown }).svIndex
      : undefined
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

/** Provides {@link useRouter} from `window.location`, following back/forward navigation. */
export function Router({ children }: { readonly children?: ReactNode }): ReactElement {
  const [location, setLocation] = useState(readLocation)
  const [index, setIndex] = useState(() => {
    const current = entryIndex(window.history.state)
    if (current !== undefined) return current
    window.history.replaceState({ svIndex: 0 }, '')
    return 0
  })
  const indexRef = useRef(index)
  indexRef.current = index
  const blockers = useRef(new Set<NavigationBlocker>())
  // A history move made to undo or replay a blocked Back: its popstate must not be blocked again.
  const internalMove = useRef(false)

  const runBlocked = useCallback((proceed: () => void): boolean => {
    const first = [...blockers.current][0]
    if (!first) return false
    first(proceed)
    return true
  }, [])

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const target = entryIndex(event.state) ?? 0
      if (internalMove.current) {
        internalMove.current = false
        if (target === indexRef.current) return // the undo of a blocked Back landed
      } else if (blockers.current.size > 0) {
        const delta = target - indexRef.current
        if (delta !== 0) {
          internalMove.current = true
          window.history.go(-delta) // put the person back where they were
          runBlocked(() => {
            internalMove.current = true
            blockers.current.clear()
            window.history.go(delta)
          })
          return
        }
      }
      setIndex(target)
      setLocation(readLocation())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [runBlocked])

  const go = useCallback((to: string, replace: boolean) => {
    // Already there: no history entry and no re-render (callers may navigate on every render).
    if (`${window.location.pathname}${window.location.search}` === to) return
    if (replace) {
      window.history.replaceState({ svIndex: indexRef.current }, '', to)
    } else {
      const next = indexRef.current + 1
      window.history.pushState({ svIndex: next }, '', to)
      setIndex(next)
    }
    setLocation(readLocation())
  }, [])

  const navigate = useCallback(
    (to: string, options: { readonly replace?: boolean; readonly force?: boolean } = {}) => {
      // Same-origin paths only: an absolute or protocol-relative URL is never followed.
      if (!to.startsWith('/') || to.startsWith('//')) return
      const replace = options.replace === true
      // Replacing the URL of the same page (list state) is never a "leave", so never blocked.
      const samePage = to.split('?')[0] === window.location.pathname
      if (options.force === true) blockers.current.clear()
      else if (!(replace && samePage) && runBlocked(() => go(to, replace))) return
      go(to, replace)
    },
    [go, runBlocked],
  )
  const back = useCallback(() => {
    if (runBlocked(() => window.history.back())) return
    internalMove.current = false
    window.history.back()
  }, [runBlocked])
  const block = useCallback((blocker: NavigationBlocker) => {
    blockers.current.add(blocker)
    return () => {
      blockers.current.delete(blocker)
    }
  }, [])
  const value = useMemo(
    () => ({ ...location, canGoBack: index > 0, navigate, back, block }),
    [location, index, navigate, back, block],
  )
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

/**
 * Hold every navigation while `active` (unsaved changes), calling `onBlock` with a `proceed`
 * function. The latest `onBlock` is always used. Outside a router it does nothing.
 *
 * @example
 * useNavigationBlocker(dirty, (proceed) => setPending(() => proceed))
 */
export function useNavigationBlocker(active: boolean, onBlock: NavigationBlocker): void {
  const router = useOptionalRouter()
  const block = router?.block
  const latest = useRef(onBlock)
  latest.current = onBlock
  useEffect(() => {
    if (!active || !block) return
    return block((proceed) => latest.current(proceed))
  }, [active, block])
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
    const w = want[i] ?? ''
    const g = got[i] ?? ''
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
