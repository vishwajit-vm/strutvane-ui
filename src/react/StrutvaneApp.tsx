/**
 * `<StrutvaneApp>`: the whole generated UI in one component, what `web/app.tsx` renders.
 *
 * ```tsx
 * import { StrutvaneApp } from '@strutvane/ui/react'
 * import { crisp } from '@strutvane/design-crisp'
 * export function App() {
 *   return <StrutvaneApp apiUrl="/api" appName="Acme" design={crisp} brand={{ brandHue: 150 }} />
 * }
 * ```
 *
 * It provides, from the API alone (session endpoints + the resource manifest):
 * - a sign-in screen (`auth: false` turns it off for APIs without `@strutvane/auth`);
 * - a workspace picker and switcher when the API is multi-tenant (auto-selects a single one);
 * - the sidebar: every resource the actor may list plus app routes and package pages
 *   (decision #50 shape and order), a mobile drawer, and the top bar (search, theme, sign out);
 * - list, create, detail and edit pages for every resource, with breadcrumbs and Back, records
 *   addressed by their route key (`/posts/hello-world`, decision #55), gated by capabilities;
 * - the command palette (Ctrl/Cmd+K), keyboard shortcuts (`?`), toasts with Undo;
 * - app routes (`routes`) that win over resource routes.
 *
 * It renders only through the design's slots. Without a surrounding `<DesignProvider>` it adds
 * one with `design` (default: the plain design).
 *
 * Failure scenarios:
 * - a 401 from any request (session expired, signed out elsewhere) opens "sign in again" OVER the
 *   current screen, so an unsaved form keeps its draft; signing in as someone else clears every
 *   cached record first;
 * - a manifest that cannot load shows an error instead of an empty app;
 * - unknown paths and hidden resources show the same "not found or no access" page (no
 *   enumeration);
 * - a sign-out the server did not confirm (offline, 5xx) keeps the user signed in and says so, so a
 *   live session never hides behind a screen that claims it ended.
 *
 * @module
 */
import type { ResourceDescriptor, ResourceManifest } from '@strutvane/framework/contracts'
import { QueryCache, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createHttpClient } from '../core/http-client.ts'
import { fetchManifest } from '../core/manifest-client.ts'
import { formatMessage } from '../core/messages.ts'
import {
  groupSidebar,
  isCurrentPath,
  type SidebarEntry,
  sidebarEntries,
} from '../core/navigation.ts'
import { isApiProblemError } from '../core/problems.ts'
import { mergeRegistry } from '../core/registry.ts'
import { recordKey } from '../core/resource-extensions.ts'
import {
  createSessionClient,
  type SessionActor,
  type SessionClient,
  type SessionTenant,
} from '../core/session-client.ts'
import type { ApiRecord, ResourceApi } from '../core/types.ts'
import type { XsrfOptions } from '../core/xsrf.ts'
import { DesignContext, DesignProvider, useDesign } from '../design/DesignProvider.tsx'
import type { Design } from '../design/define-design.ts'
import { plain } from '../design/plain/index.ts'
import type { NavLinkProps } from '../design/slots.ts'
import type { PublicOverrides } from '../design/tokens.ts'
import { CommandPalette, type PaletteAction } from './CommandPalette.tsx'
import { defaultRegistry } from './defaults.ts'
import { useIllustrations, useShellSlots, useSkins } from './design-hooks.ts'
import type { Crumb } from './PageHeading.tsx'
import { ResourceDetail } from './ResourceDetail.tsx'
import { ResourceForm } from './ResourceForm.tsx'
import { ResourceList } from './ResourceList.tsx'
import { Link, matchPath, type RouteDefinition, Router, useRouter } from './router.tsx'
import { SignIn, SignInDialog } from './SignIn.tsx'
import { StrutvaneProvider } from './StrutvaneProvider.tsx'
import { ShortcutsHelp, useGlobalShortcuts } from './shortcuts.tsx'
import { ToastProvider } from './toasts.tsx'
import type { UiOverrides, UiRegistry } from './types.ts'

/** Props of {@link StrutvaneApp}. */
export interface StrutvaneAppProps {
  /** API base URL, e.g. `/api` (`VITE_API_URL`). */
  readonly apiUrl: string
  /** Shown in the sidebar, the title and the sign-in screen. */
  readonly appName?: string
  /** App screens; they win over resource routes. Routes with a `title` appear in the sidebar. */
  readonly routes?: readonly RouteDefinition[]
  /** Pages added by packages (a log viewer…), shown when `can(permission)` says yes. */
  readonly sidebar?: readonly SidebarEntry[]
  /** Whether the signed-in actor holds a permission (for package pages). Default: no. */
  readonly can?: (permission: string) => boolean
  /** Widget, cell and message overrides (L1/L2). */
  readonly overrides?: UiOverrides
  readonly locale?: string
  /** Use the session endpoints of `@strutvane/auth` (default `true`). */
  readonly auth?: boolean
  /** The home page (`/`). Default: a welcome with the sidebar's sections. */
  readonly home?: ReactNode
  /** Cookie policy: `include` when the UI is served from another origin than the API. */
  readonly credentials?: RequestCredentials
  /** For tests and custom transports. */
  readonly fetch?: typeof globalThis.fetch
  /** Extra headers for every API and auth request. */
  readonly headers?: Readonly<Record<string, string>> | (() => Readonly<Record<string, string>>)
  /** CSRF header settings (decision #17); `false` turns it off. On by default. */
  readonly xsrf?: XsrfOptions | false
  /** The design, when no `<DesignProvider>` surrounds the app. Default: the plain design. */
  readonly design?: Design
  /** Public override tokens (`--brand-hue`, `--font-sans`, `--radius`, `--density`). */
  readonly brand?: PublicOverrides
  /** CSP nonce for the injected design stylesheet (decision #119). */
  readonly nonce?: string
}

type SessionState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'signed-out'; readonly notice?: string }
  | { readonly kind: 'signed-in'; readonly actor: SessionActor }

/** The app shell. */
export function StrutvaneApp(props: StrutvaneAppProps): ReactElement {
  const outer = useContext(DesignContext)
  const app = (
    <Router>
      <AppRoot {...props} />
    </Router>
  )
  if (outer) return app
  return (
    <DesignProvider
      design={props.design ?? plain}
      {...(props.brand ? { overrides: props.brand } : {})}
      {...(props.nonce !== undefined ? { nonce: props.nonce } : {})}
    >
      {app}
    </DesignProvider>
  )
}

function AppRoot(props: StrutvaneAppProps): ReactElement {
  const appName = props.appName ?? 'Strutvane'
  const locale = props.locale ?? 'en'
  const { navigate } = useRouter()
  const registry: UiRegistry = useMemo(
    () => mergeRegistry(defaultRegistry, props.overrides),
    [props.overrides],
  )
  const t = useCallback(
    (key: string, params: Record<string, string | number> = {}) =>
      formatMessage(registry.messages, key, params, locale),
    [registry, locale],
  )
  const fetchFn = props.fetch
  const credentials = props.credentials ?? 'same-origin'
  const { headers, xsrf } = props
  const session: SessionClient = useMemo(
    () =>
      createSessionClient({
        apiUrl: props.apiUrl,
        credentials,
        ...(fetchFn ? { fetch: fetchFn } : {}),
        ...(headers ? { headers } : {}),
        ...(xsrf !== undefined ? { xsrf } : {}),
      }),
    [props.apiUrl, credentials, fetchFn, headers, xsrf],
  )
  const [state, setState] = useState<SessionState>(
    props.auth === false
      ? { kind: 'signed-in', actor: { id: 'anonymous', type: 'user', roles: [] } }
      : { kind: 'loading' },
  )
  // "Sign in again" over the current screen (any 401 while signed in).
  const [reauth, setReauth] = useState(false)
  const openReauth = useRef<() => void>(() => undefined)
  openReauth.current = () => {
    if (props.auth !== false) setReauth(true)
  }
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
        queryCache: new QueryCache({
          onError: (error) => {
            if (isApiProblemError(error) && error.problem.status === 401) openReauth.current()
          },
        }),
      }),
  )

  useEffect(() => {
    if (props.auth === false) return
    const controller = new AbortController()
    session
      .me(controller.signal)
      .then((actor) => setState(actor ? { kind: 'signed-in', actor } : { kind: 'signed-out' }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'signed-out' })
      })
    return () => controller.abort()
  }, [session, props.auth])

  useEffect(() => {
    document.title = appName
  }, [appName])

  if (state.kind === 'loading')
    return (
      <p data-sv-part="loading" aria-live="polite">
        {t('ui.app.loading')}
      </p>
    )
  if (state.kind === 'signed-out')
    return (
      <SignIn
        session={session}
        appName={appName}
        messages={registry.messages}
        locale={locale}
        {...(state.notice ? { notice: state.notice } : {})}
        onSignedIn={(actor) => {
          queryClient.clear()
          setState({ kind: 'signed-in', actor })
        }}
      />
    )
  const current = state.actor
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider dismissLabel={t('ui.list.dismiss')}>
        <SignedIn
          {...props}
          appName={appName}
          locale={locale}
          t={t}
          registry={registry}
          session={session}
          actor={current}
          credentials={credentials}
          onUnauthenticated={() => openReauth.current()}
          onActor={(actor) => {
            queryClient.clear()
            setState({ kind: 'signed-in', actor })
          }}
          onSignedOut={() => {
            queryClient.clear()
            setReauth(false)
            setState({ kind: 'signed-out' })
          }}
        />
        {reauth ? (
          <SignInDialog
            session={session}
            messages={registry.messages}
            locale={locale}
            onSignOut={() => {
              queryClient.clear()
              setReauth(false)
              setState({ kind: 'signed-out', notice: t('ui.app.sessionExpired') })
            }}
            onSignedIn={(actor) => {
              setReauth(false)
              if (actor.id === current.id && actor.tenantId === current.tenantId) {
                // The same person: keep the screen (and any draft); refetch what failed.
                void queryClient.invalidateQueries()
              } else {
                // Someone else: nothing cached for the previous person may stay on screen.
                queryClient.clear()
                setState({ kind: 'signed-in', actor })
                navigate('/', { replace: true, force: true })
              }
            }}
          />
        ) : null}
      </ToastProvider>
    </QueryClientProvider>
  )
}

interface SignedInProps extends StrutvaneAppProps {
  readonly appName: string
  readonly locale: string
  readonly t: (key: string, params?: Record<string, string | number>) => string
  readonly registry: UiRegistry
  readonly session: SessionClient
  readonly actor: SessionActor
  readonly credentials: RequestCredentials
  readonly onActor: (actor: SessionActor) => void
  readonly onSignedOut: () => void
  readonly onUnauthenticated: () => void
}

function SignedIn(props: SignedInProps): ReactElement {
  const { t, session, actor } = props
  const auth = props.auth !== false
  const { Shell, Sidebar, TopBar } = useShellSlots()
  const { Button, Select, Alert, Icon } = useSkins()
  const { theme, setTheme } = useDesign()
  const router = useRouter()
  const { pathname, navigate } = router
  // A client-side page change moves focus to the new content (WCAG 2.4.3): otherwise keyboard and
  // screen-reader users stay on the link or button they used, which may be gone (focus on <body>).
  // Not on the first render (nothing changed yet) and not for query-only changes (list state).
  const shownPath = useRef(pathname)
  const [navOpen, setNavOpen] = useState(false)
  useEffect(() => {
    if (shownPath.current === pathname) return
    shownPath.current = pathname
    setNavOpen(false)
    document.getElementById('sv-main')?.focus()
  }, [pathname])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  useGlobalShortcuts({
    openPalette: () => setPaletteOpen(true),
    openHelp: () => setHelpOpen(true),
    goHome: () => navigate('/'),
  })

  const tenants = useQuery({
    queryKey: ['strutvane', 'session', 'tenants', actor.id],
    enabled: auth,
    queryFn: ({ signal }) => session.tenants(signal).catch(() => [] as SessionTenant[]),
  })
  const [switching, setSwitching] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [headerError, setHeaderError] = useState<string | undefined>()
  // Sign-out must be CONFIRMED by the server (or answered 401: already gone) before the UI shows
  // the sign-in screen. Showing it after a failed request would leave a live session behind a
  // screen that says it ended: on a shared computer, the next person reloads and is signed in.
  const signOut = async () => {
    setSigningOut(true)
    setHeaderError(undefined)
    try {
      await session.signOut()
    } catch {
      setSigningOut(false)
      setHeaderError(t('ui.app.signOutFailed'))
      return
    }
    props.onSignedOut()
  }
  // A refused or failed switch (403, offline, 5xx) is shown in the header, never left as an
  // unhandled promise rejection; the select keeps showing the workspace that is still active.
  const { onActor } = props
  const switchTo = useCallback(
    async (tenantId: string) => {
      setSwitching(true)
      setHeaderError(undefined)
      try {
        onActor(await session.switchTenant(tenantId))
      } catch {
        setHeaderError(t('ui.app.switchFailed'))
      } finally {
        setSwitching(false)
      }
    },
    [session, onActor, t],
  )
  // Exactly one workspace and none active yet: select it, ONCE per workspace. Retrying on every
  // render after a failure would hammer the server (and its rate limiter) in a loop.
  const only = tenants.data?.length === 1 ? tenants.data[0] : undefined
  const autoSelected = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!only || actor.tenantId || switching || autoSelected.current === only.tenantId) return
    autoSelected.current = only.tenantId
    void switchTo(only.tenantId)
  }, [only, actor.tenantId, switching, switchTo])

  const { headers, xsrf, fetch: fetchFn, credentials, apiUrl } = props
  const api: ResourceApi = useMemo(
    () =>
      createHttpClient({
        baseUrl: apiUrl,
        credentials,
        ...(fetchFn ? { fetch: fetchFn } : {}),
        ...(headers ? { headers } : {}),
        ...(xsrf !== undefined ? { xsrf } : {}),
      }),
    [apiUrl, credentials, fetchFn, headers, xsrf],
  )
  const manifest = useQuery({
    queryKey: ['strutvane', 'manifest', actor.id, actor.tenantId ?? ''],
    queryFn: ({ signal }) =>
      fetchManifest({
        baseUrl: new URL(apiUrl, window.location.href).toString(),
        signal,
        credentials,
        ...(fetchFn ? { fetch: fetchFn } : {}),
      }),
  })

  const { can, sidebar: extraPages, routes } = props
  const entries = useMemo(() => {
    const home: SidebarEntry = {
      name: 'home',
      label: t('ui.app.home'),
      path: '/',
      icon: 'home',
      group: undefined,
      order: Number.NEGATIVE_INFINITY,
      permission: 'home',
    }
    const appRoutes = (routes ?? [])
      .filter((r) => r.title && !r.path.includes(':'))
      .map(
        (r): SidebarEntry => ({
          name: r.path,
          label: r.title ?? r.path,
          path: r.path,
          icon: r.icon ?? 'file',
          group: r.group,
          order: r.order,
          permission: 'app',
        }),
      )
    const fromManifest = manifest.data
      ? sidebarEntries(manifest.data, {
          ...(extraPages ? { extra: extraPages } : {}),
          ...(can ? { can } : {}),
        })
      : []
    return [home, ...appRoutes, ...fromManifest]
  }, [manifest.data, extraPages, can, routes, t])

  const sidebarNode = (
    <Sidebar
      label={t('ui.app.nav')}
      brand={<Link to="/">{props.appName}</Link>}
      Link={NavLink}
      Icon={Icon}
      groups={groupSidebar(entries).map((group) => ({
        label: group.label,
        links: group.entries.map((entry) => ({
          entry,
          current: entry.path === '/' ? pathname === '/' : isCurrentPath(entry.path, pathname),
          accessibleName:
            entry.badge === undefined ? entry.label : `${entry.label}, ${String(entry.badge)}`,
        })),
      }))}
    />
  )

  const themeId = 'sv-theme-select'
  const topBar = (
    <TopBar
      menuButton={
        <Button
          variant="ghost"
          icon="menu"
          data-sv-part="menu-button"
          aria-expanded={navOpen}
          aria-label={navOpen ? t('ui.nav.closeMenu') : t('ui.nav.openMenu')}
          onClick={() => setNavOpen((o) => !o)}
        >
          ☰
        </Button>
      }
      search={
        <Button variant="secondary" icon="search" onClick={() => setPaletteOpen(true)}>
          {t('ui.palette.open')} <kbd>Ctrl K</kbd>
        </Button>
      }
      actions={
        <>
          <span>
            <label htmlFor={themeId}>{t('ui.theme.label')}</label>{' '}
            <Select
              id={themeId}
              value={theme}
              onChange={(e) => {
                const next = e.target.value
                if (next === 'light' || next === 'dark' || next === 'system') setTheme(next)
              }}
            >
              <option value="system">{t('ui.theme.system')}</option>
              <option value="light">{t('ui.theme.light')}</option>
              <option value="dark">{t('ui.theme.dark')}</option>
            </Select>
          </span>
          {auth && tenants.data && tenants.data.length > 0 ? (
            <span>
              <label htmlFor="sv-workspace-select">{t('ui.app.workspace')}</label>{' '}
              <Select
                id="sv-workspace-select"
                value={actor.tenantId ?? ''}
                disabled={switching}
                onChange={(e) => {
                  if (e.target.value) void switchTo(e.target.value)
                }}
              >
                {!actor.tenantId ? <option value="">{t('ui.app.chooseWorkspace')}</option> : null}
                {tenants.data.map((tenant) => (
                  <option key={tenant.tenantId} value={tenant.tenantId}>
                    {tenant.name}
                  </option>
                ))}
              </Select>
            </span>
          ) : null}
          {auth ? (
            <Button disabled={signingOut} onClick={() => void signOut()}>
              {t('ui.app.signOut')}
            </Button>
          ) : null}
        </>
      }
    />
  )

  const palette =
    paletteOpen && manifest.data ? (
      <CommandPalette
        screens={entries}
        actions={paletteActions(manifest.data, t, navigate, setTheme, () => setHelpOpen(true))}
        onNavigate={navigate}
        onClose={() => setPaletteOpen(false)}
      />
    ) : null

  let content: ReactNode
  if (manifest.isPending) content = <p aria-live="polite">{t('ui.app.loading')}</p>
  else if (manifest.isError) content = <ManifestFailed t={t} />
  else {
    const noWorkspace =
      auth && tenants.isSuccess && tenants.data.length === 0 && manifest.data.resources.length === 0
    content = noWorkspace ? (
      <p role="status">{t('ui.app.noWorkspace')}</p>
    ) : (
      <Pages {...props} manifest={manifest.data} entries={entries} />
    )
  }

  const shell = (
    <Shell
      navOpen={navOpen}
      onCloseNav={() => setNavOpen(false)}
      skipLink={
        <a href="#sv-main" data-sv-part="skip-link">
          {t('ui.app.skip')}
        </a>
      }
      sidebar={sidebarNode}
      topBar={topBar}
      main={
        <main id="sv-main" tabIndex={-1}>
          {headerError ? (
            <Alert tone="danger" role="alert">
              {headerError}
            </Alert>
          ) : null}
          {content}
        </main>
      }
    />
  )

  if (!manifest.data) return shell
  return (
    <StrutvaneProvider
      api={api}
      manifest={manifest.data}
      locale={props.locale}
      base={props.registry}
      onUnauthenticated={props.onUnauthenticated}
    >
      {shell}
      {palette}
      {helpOpen ? <ShortcutsHelp onClose={() => setHelpOpen(false)} /> : null}
    </StrutvaneProvider>
  )
}

/** The sidebar's link: a router link that marks the current page. */
function NavLink({ to, current, ...rest }: NavLinkProps): ReactElement {
  return <Link to={to} aria-current={current ? 'page' : undefined} {...rest} />
}

/** Palette actions: New <resource> for creatable resources, theme choices, the shortcuts list. */
function paletteActions(
  manifest: ResourceManifest,
  t: SignedInProps['t'],
  navigate: (to: string) => void,
  setTheme: (theme: 'light' | 'dark' | 'system') => void,
  openHelp: () => void,
): PaletteAction[] {
  return [
    ...manifest.resources
      .filter((r) => r.capabilities.create)
      .map((r) => ({
        id: `new-${r.path}`,
        label: t('ui.palette.newRecord', { resource: r.label.toLowerCase() }),
        run: () => navigate(`/${r.path}/new`),
      })),
    ...(['light', 'dark', 'system'] as const).map((theme) => ({
      id: `theme-${theme}`,
      label: t('ui.palette.theme', { theme: t(`ui.theme.${theme}`) }),
      run: () => setTheme(theme),
    })),
    { id: 'shortcuts', label: t('ui.shortcuts.title'), run: openHelp },
  ]
}

function ManifestFailed(props: { readonly t: SignedInProps['t'] }): ReactElement {
  const { Error: ErrorPicture } = useIllustrations()
  return (
    <div data-sv-part="empty" role="alert">
      <ErrorPicture />
      <p>{props.t('ui.app.manifestFailed')}</p>
    </div>
  )
}

/**
 * The resource a URL belongs to: the one whose path (one or more segments, e.g. `admin/accounts`)
 * is the longest prefix of the URL, plus the remaining segments DECODED (`/:key`, `/:key/edit`).
 * Keys are encoded once when links are built, so they must be decoded once here; otherwise a key
 * such as `a b` reaches the API encoded twice (`a%2520b`). A malformed encoding matches nothing.
 */
function matchResource(
  resources: readonly ResourceDescriptor[],
  segments: readonly string[],
): { readonly resource: ResourceDescriptor; readonly rest: readonly string[] } | undefined {
  let best: ResourceDescriptor | undefined
  let length = 0
  for (const r of resources) {
    const parts = r.path.split('/').filter(Boolean)
    if (parts.length > length && parts.every((part, i) => segments[i] === part)) {
      best = r
      length = parts.length
    }
  }
  if (!best) return undefined
  try {
    return { resource: best, rest: segments.slice(length).map((s) => decodeURIComponent(s)) }
  } catch {
    return undefined
  }
}

/** The page for the current path. */
function Pages(
  props: SignedInProps & {
    readonly manifest: ResourceManifest
    readonly entries: readonly SidebarEntry[]
  },
): ReactElement {
  const { pathname, search, navigate } = useRouter()
  const { NotFound, Forbidden } = useIllustrations()
  const { t } = props
  for (const route of props.routes ?? []) {
    if (matchPath(route.path, pathname)) return <>{route.element}</>
  }
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return <>{props.home ?? <Welcome {...props} />}</>
  const notice = (picture: ReactNode, text: string) => (
    <div data-sv-part="empty" role="alert">
      {picture}
      <p>{text}</p>
    </div>
  )
  const notFound = notice(<NotFound />, t('ui.app.notFound'))
  const match = matchResource(props.manifest.resources, segments)
  if (!match || match.rest.length > 2) return notFound
  const { resource } = match
  const base = `/${resource.path}`
  const home: Crumb = { label: t('ui.app.home'), to: '/' }
  const listCrumb: Crumb = { label: resource.pluralLabel, to: base }
  const keyOf = (r: ApiRecord) => encodeURIComponent(recordKey(resource, r))
  const open = (r: ApiRecord) => navigate(`${base}/${keyOf(r)}`)
  const edit = (r: ApiRecord) => navigate(`${base}/${keyOf(r)}/edit`)
  const listParent = { to: base, label: resource.pluralLabel }
  const [key, action] = match.rest
  if (key === undefined) {
    if (!resource.capabilities.list) return notFound
    return (
      <ResourceList
        key={resource.path}
        resource={resource}
        breadcrumbs={[home, listCrumb]}
        initialSearch={search.replace(/^\?/, '')}
        onSearchStringChange={(next) =>
          navigate(`${base}${next ? `?${next}` : ''}`, { replace: true })
        }
        onCreate={() => navigate(`${base}/new`)}
        onView={open}
        onEdit={edit}
        deletable
      />
    )
  }
  if (key === 'new' && action === undefined) {
    if (!resource.capabilities.create) return notice(<Forbidden />, t('ui.app.forbidden'))
    return (
      <ResourceForm
        resource={resource}
        breadcrumbs={[
          home,
          listCrumb,
          { label: t('ui.form.create', { resource: resource.label.toLowerCase() }) },
        ]}
        parent={listParent}
        onSaved={open}
        onCancel={() => navigate(base)}
      />
    )
  }
  if (action === 'edit') {
    if (!resource.capabilities.update) return notice(<Forbidden />, t('ui.app.forbidden'))
    const detail = `${base}/${encodeURIComponent(key)}`
    return (
      <ResourceForm
        key={key}
        resource={resource}
        recordId={key}
        breadcrumbs={[
          home,
          listCrumb,
          { label: t('ui.form.edit', { resource: resource.label.toLowerCase() }) },
        ]}
        parent={{ to: detail, label: resource.label }}
        onSaved={open}
        onCancel={() => navigate(detail)}
      />
    )
  }
  if (action !== undefined) return notFound
  return (
    <ResourceDetail
      key={key}
      resource={resource}
      recordId={key}
      breadcrumbs={[home, listCrumb]}
      parent={listParent}
      onEdit={edit}
      deletable
      onDeleted={() => navigate(base)}
      onOpenRelated={(child, r) =>
        navigate(`/${child.path}/${encodeURIComponent(recordKey(child, r))}`)
      }
    />
  )
}

/** The default home page: a welcome and the sidebar's sections as links. */
function Welcome(props: {
  readonly appName: string
  readonly t: SignedInProps['t']
  readonly entries: readonly SidebarEntry[]
}): ReactElement {
  const { Card } = useSkins()
  return (
    <section aria-labelledby="sv-welcome" data-sv-part="home">
      <h1 id="sv-welcome">{props.t('ui.app.welcome', { app: props.appName })}</h1>
      <p>{props.t('ui.app.chooseSection')}</p>
      <Card>
        <ul>
          {props.entries
            .filter((e) => e.path !== '/')
            .map((e) => (
              <li key={e.path}>
                <Link to={e.path}>{e.label}</Link>
              </li>
            ))}
        </ul>
      </Card>
    </section>
  )
}
