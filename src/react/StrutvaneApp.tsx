/**
 * `<StrutvaneApp>`: the whole generated UI in one component, what `web/app.tsx` renders.
 *
 * ```tsx
 * import { StrutvaneApp } from '@strutvane/ui/react'
 * import { routes } from './router.tsx'
 * export function App() {
 *   return <StrutvaneApp apiUrl={import.meta.env.VITE_API_URL} appName="Acme" routes={routes} />
 * }
 * ```
 *
 * It provides, from the API alone (session endpoints + the resource manifest):
 * - a sign-in screen (`auth: false` turns it off for APIs without `@strutvane/auth`);
 * - a workspace picker and switcher when the API is multi-tenant (auto-selects a single one);
 * - a menu of every resource the signed-in actor may list (grouped by `ui.group`) plus app routes
 *   with a `title`;
 * - list (`/:resource`), create (`/:resource/new`), detail (`/:resource/:id`) and edit
 *   (`/:resource/:id/edit`) pages for every resource, gated by the actor's capabilities;
 * - app routes (`routes`) that win over resource routes.
 *
 * Failure scenarios: a 401 from any request (session expired, signed out elsewhere) returns to the
 * sign-in screen with a notice; a manifest that cannot load shows an error instead of an empty app;
 * unknown paths and hidden resources show the same "not found or no access" page (no enumeration);
 * a sign-out the server did not confirm (offline, 5xx) keeps the user signed in and says so, so a
 * live session never hides behind a screen that claims it ended.
 *
 * @module
 */
import type { ResourceDescriptor, ResourceManifest } from '@strutvane/contracts'
import { QueryCache, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createHttpClient } from '../core/http-client.ts'
import { fetchManifest } from '../core/manifest-client.ts'
import { formatMessage } from '../core/messages.ts'
import { isApiProblemError } from '../core/problems.ts'
import { mergeRegistry } from '../core/registry.ts'
import {
  createSessionClient,
  type SessionActor,
  type SessionClient,
  type SessionTenant,
} from '../core/session-client.ts'
import type { ApiRecord, ResourceApi } from '../core/types.ts'
import { APP_STYLES } from './app-styles.ts'
import { defaultRegistry } from './defaults.ts'
import { ResourceDetail } from './ResourceDetail.tsx'
import { ResourceForm } from './ResourceForm.tsx'
import { ResourceList } from './ResourceList.tsx'
import { Link, matchPath, type RouteDefinition, Router, useRouter } from './router.tsx'
import { SignIn } from './SignIn.tsx'
import { StrutvaneProvider } from './StrutvaneProvider.tsx'
import type { UiOverrides, UiRegistry } from './types.ts'

/** Props of {@link StrutvaneApp}. */
export interface StrutvaneAppProps {
  /** API base URL, e.g. `/api/v1` (`VITE_API_URL`). */
  readonly apiUrl: string
  /** Shown in the header, the title and the sign-in screen. */
  readonly appName?: string
  /** App screens; they win over resource routes. Routes with a `title` appear in the menu. */
  readonly routes?: readonly RouteDefinition[]
  /** Widget, cell and message overrides (L1/L2). */
  readonly overrides?: UiOverrides
  readonly locale?: string
  /** Use the session endpoints of `@strutvane/auth` (default `true`). */
  readonly auth?: boolean
  /** The home page (`/`). Default: a welcome with the menu entries. */
  readonly home?: ReactNode
  /** Cookie policy: `include` when the UI is served from another origin than the API. */
  readonly credentials?: RequestCredentials
  /** For tests and custom transports. */
  readonly fetch?: typeof globalThis.fetch
  /** Inject the default stylesheet (`APP_STYLES`, themable with `--sv-*` variables). Default `true`. */
  readonly styles?: boolean
}

type SessionState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'signed-out'; readonly notice?: string }
  | { readonly kind: 'signed-in'; readonly actor: SessionActor }

/** The app shell. */
export function StrutvaneApp(props: StrutvaneAppProps): ReactElement {
  return (
    <Router>
      {props.styles === false ? null : <style>{APP_STYLES}</style>}
      <AppShell {...props} />
    </Router>
  )
}

function AppShell(props: StrutvaneAppProps): ReactElement {
  const appName = props.appName ?? 'Strutvane'
  const locale = props.locale ?? 'en'
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
  const session: SessionClient = useMemo(
    () =>
      createSessionClient({
        apiUrl: props.apiUrl,
        credentials,
        ...(fetchFn ? { fetch: fetchFn } : {}),
      }),
    [props.apiUrl, credentials, fetchFn],
  )
  const [state, setState] = useState<SessionState>(
    props.auth === false
      ? { kind: 'signed-in', actor: { id: 'anonymous', type: 'user', roles: [] } }
      : { kind: 'loading' },
  )
  const expired = useRef<() => void>(() => undefined)
  expired.current = () => {
    if (props.auth !== false) setState({ kind: 'signed-out', notice: t('ui.app.sessionExpired') })
  }
  // One QueryClient per app; any 401 from any query sends the user back to the sign-in screen.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
        queryCache: new QueryCache({
          onError: (error) => {
            if (isApiProblemError(error) && error.problem.status === 401) expired.current()
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
      <p className="sv-loading" aria-live="polite">
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
  return (
    <QueryClientProvider client={queryClient}>
      <SignedIn
        {...props}
        appName={appName}
        locale={locale}
        t={t}
        registry={registry}
        session={session}
        actor={state.actor}
        credentials={credentials}
        onActor={(actor) => {
          queryClient.clear()
          setState({ kind: 'signed-in', actor })
        }}
        onSignedOut={() => {
          queryClient.clear()
          setState({ kind: 'signed-out' })
        }}
        onExpired={() => expired.current()}
      />
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
  readonly onExpired: () => void
}

function SignedIn(props: SignedInProps): ReactElement {
  const { t, session, actor } = props
  const auth = props.auth !== false
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
  const switchTo = useCallback(
    async (tenantId: string) => {
      setSwitching(true)
      setHeaderError(undefined)
      try {
        props.onActor(await session.switchTenant(tenantId))
      } catch {
        setHeaderError(t('ui.app.switchFailed'))
      } finally {
        setSwitching(false)
      }
    },
    [session, props.onActor, t],
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

  const api: ResourceApi = useMemo(
    () =>
      createHttpClient({
        baseUrl: props.apiUrl,
        credentials: props.credentials,
        ...(props.fetch ? { fetch: props.fetch } : {}),
      }),
    [props.apiUrl, props.credentials, props.fetch],
  )
  const manifest = useQuery({
    queryKey: ['strutvane', 'manifest', actor.id, actor.tenantId ?? ''],
    queryFn: ({ signal }) =>
      fetchManifest({
        baseUrl: new URL(props.apiUrl, window.location.href).toString(),
        signal,
        credentials: props.credentials,
        ...(props.fetch ? { fetch: props.fetch } : {}),
      }),
  })

  const header = (
    <header className="sv-app-header">
      <a className="sv-skip" href="#sv-main">
        {t('ui.app.skip')}
      </a>
      <Link to="/" className="sv-brand">
        {props.appName}
      </Link>
      {auth && tenants.data && tenants.data.length > 0 ? (
        <label className="sv-workspace">
          <span>{t('ui.app.workspace')}</span>
          <select
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
          </select>
        </label>
      ) : null}
      {auth ? (
        <button
          type="button"
          className="sv-signout"
          disabled={signingOut}
          onClick={() => void signOut()}
        >
          {t('ui.app.signOut')}
        </button>
      ) : null}
      {headerError ? (
        <p role="alert" className="sv-error">
          {headerError}
        </p>
      ) : null}
    </header>
  )

  if (manifest.isPending)
    return (
      <>
        {header}
        <main id="sv-main">
          <p aria-live="polite">{t('ui.app.loading')}</p>
        </main>
      </>
    )
  if (manifest.isError) {
    if (isApiProblemError(manifest.error) && manifest.error.problem.status === 401)
      props.onExpired()
    return (
      <>
        {header}
        <main id="sv-main">
          <p role="alert">{t('ui.app.manifestFailed')}</p>
        </main>
      </>
    )
  }
  const noWorkspace =
    auth && tenants.isSuccess && tenants.data.length === 0 && manifest.data.resources.length === 0
  return (
    <StrutvaneProvider
      api={api}
      manifest={manifest.data}
      locale={props.locale}
      base={props.registry}
    >
      {header}
      <div className="sv-app-body">
        <Nav manifest={manifest.data} routes={props.routes ?? []} t={t} />
        <main id="sv-main" className="sv-app-main" tabIndex={-1}>
          {noWorkspace ? (
            <p role="status">{t('ui.app.noWorkspace')}</p>
          ) : (
            <Pages {...props} manifest={manifest.data} />
          )}
        </main>
      </div>
    </StrutvaneProvider>
  )
}

/** The menu: app routes with a title, then resources the actor may list, grouped. */
function Nav(props: {
  readonly manifest: ResourceManifest
  readonly routes: readonly RouteDefinition[]
  readonly t: SignedInProps['t']
}): ReactElement {
  const { pathname } = useRouter()
  const groups = new Map<string, ResourceDescriptor[]>()
  for (const r of props.manifest.resources) {
    if (!r.capabilities.list) continue
    const group = r.ui?.group ?? ''
    groups.set(group, [...(groups.get(group) ?? []), r])
  }
  const current = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`) ? ('page' as const) : undefined
  return (
    <nav aria-label={props.t('ui.app.nav')} className="sv-app-nav">
      <ul>
        <li>
          <Link to="/" aria-current={pathname === '/' ? 'page' : undefined}>
            {props.t('ui.app.home')}
          </Link>
        </li>
        {props.routes
          .filter((r) => r.title && !r.path.includes(':'))
          .map((r) => (
            <li key={r.path}>
              <Link to={r.path} aria-current={current(r.path)}>
                {r.title}
              </Link>
            </li>
          ))}
      </ul>
      {[...groups].map(([group, resources]) => (
        <section key={group || '_'} aria-label={group || undefined}>
          {group ? <h2 className="sv-nav-group">{group}</h2> : null}
          <ul>
            {resources.map((r) => (
              <li key={r.name}>
                <Link to={`/${r.path}`} aria-current={current(`/${r.path}`)}>
                  {r.pluralLabel}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}

/** The page for the current path. */
function Pages(props: SignedInProps & { readonly manifest: ResourceManifest }): ReactElement {
  const { pathname, search, navigate } = useRouter()
  const { t } = props
  for (const route of props.routes ?? []) {
    if (matchPath(route.path, pathname)) return <>{route.element}</>
  }
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) {
    return (
      <>
        {props.home ?? (
          <section className="sv-home">
            <h1>{t('ui.app.welcome', { app: props.appName })}</h1>
            <p>{t('ui.app.chooseSection')}</p>
          </section>
        )}
      </>
    )
  }
  const resource = props.manifest.resources.find((r) => r.path === segments[0])
  const notFound = <p role="alert">{t('ui.app.notFound')}</p>
  if (!resource || segments.length > 3) return notFound
  const base = `/${resource.path}`
  const open = (r: ApiRecord) => navigate(`${base}/${encodeURIComponent(r.id)}`)
  const confirmDelete = (r: ApiRecord) =>
    window.confirm(t('ui.list.confirmDelete', { title: String(r[resource.titleField] ?? r.id) }))
  const [, id, action] = segments
  if (id === undefined) {
    return (
      <ResourceList
        key={resource.path}
        resource={resource}
        initialSearch={search.replace(/^\?/, '')}
        onSearchStringChange={(next) =>
          navigate(`${base}${next ? `?${next}` : ''}`, { replace: true })
        }
        onCreate={() => navigate(`${base}/new`)}
        onView={open}
        onEdit={(r) => navigate(`${base}/${encodeURIComponent(r.id)}/edit`)}
        confirmDelete={confirmDelete}
      />
    )
  }
  if (id === 'new' && action === undefined) {
    if (!resource.capabilities.create) return <p role="alert">{t('ui.app.forbidden')}</p>
    return <ResourceForm resource={resource} onSaved={open} onCancel={() => navigate(base)} />
  }
  if (action === 'edit') {
    if (!resource.capabilities.update) return <p role="alert">{t('ui.app.forbidden')}</p>
    return (
      <ResourceForm
        key={id}
        resource={resource}
        recordId={id}
        onSaved={open}
        onCancel={() => navigate(`${base}/${encodeURIComponent(id)}`)}
      />
    )
  }
  if (action !== undefined) return notFound
  return (
    <ResourceDetail
      key={id}
      resource={resource}
      recordId={id}
      onEdit={(r) => navigate(`${base}/${encodeURIComponent(r.id)}/edit`)}
      confirmDelete={confirmDelete}
      onDeleted={() => navigate(base)}
      onOpenRelated={(child, r) => navigate(`/${child.path}/${encodeURIComponent(r.id)}`)}
    />
  )
}
