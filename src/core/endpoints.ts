/**
 * Where the UI sends each kind of request (UI-1, demo acceptance run).
 *
 * The URL contract (hub docs/05, docs/17 "HTTP + manifest"):
 * - **API**: under the API base, `/api/v1` by default (`VITE_API_URL`);
 * - **auth** (`@strutvane/auth`): under the API base, `{api}/auth/*`;
 * - **resource manifest** (ADR-0014): at the API server's **origin**, `/.well-known/strutvane.json`,
 *   never under the API base: it describes the whole app, and well-known URIs live at the root
 *   (RFC 8615).
 *
 * So one setting (`apiUrl`) gives all three, and `authUrl` / `manifestUrl` override one of them
 * when an app serves it elsewhere (auth on another prefix, a manifest from a CDN). Before this,
 * the shell tied both to `apiUrl` implicitly and an app on `/api` signed in at `/api/auth/*` while
 * auth answered at `/api/v1/auth/*` (AUTH-1).
 *
 * A relative `apiUrl` such as `api/v1` is read from the site root (`/api/v1`): the admin is a
 * single-page app with client-side routes, so resolving it against the current page would send
 * requests to `/customers/42/api/v1` on a deep link.
 *
 * @module
 */
import { MANIFEST_PATH } from '@strutvane/framework/contracts'

/** The default API base (hub docs/05: `VITE_API_URL=/api/v1`). */
export const DEFAULT_API_URL = '/api/v1'

/** Inputs of {@link resolveEndpoints}. */
export interface EndpointOptions {
  /** The API base: `/api/v1` or `https://api.example.com/api/v1`. */
  readonly apiUrl: string
  /** The auth endpoints' base. Default: `{apiUrl}/auth`. */
  readonly authUrl?: string | undefined
  /** The manifest's full URL. Default: `/.well-known/strutvane.json` at the API's origin. */
  readonly manifestUrl?: string | undefined
  /** The page URL relative values resolve against. Default: `window.location.href`. */
  readonly pageUrl?: string | undefined
}

/** The three URLs the UI calls. Absolute; `api` and `auth` have no trailing slash. */
export interface Endpoints {
  readonly api: string
  readonly auth: string
  readonly manifest: string
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i

/** `api/v1` → `/api/v1`; absolute paths and URLs are kept as they are. */
const rooted = (url: string): string => (SCHEME.test(url) || url.startsWith('/') ? url : `/${url}`)

/** Absolute, without a trailing slash, so callers can append `/auth` or `/customers`. */
const absolute = (url: string, page: string): string => {
  const resolved = new URL(rooted(url), page)
  resolved.search = ''
  resolved.hash = ''
  const path = resolved.pathname.replace(/\/+$/, '')
  return `${resolved.origin}${path}`
}

/**
 * Work out the API, auth and manifest URLs from the app's settings.
 *
 * @example
 * resolveEndpoints({ apiUrl: '/api/v1', pageUrl: 'https://acme.test/customers' })
 * // { api: 'https://acme.test/api/v1', auth: 'https://acme.test/api/v1/auth',
 * //   manifest: 'https://acme.test/.well-known/strutvane.json' }
 */
export function resolveEndpoints(options: EndpointOptions): Endpoints {
  const page = options.pageUrl ?? globalThis.location?.href
  if (page === undefined)
    throw new TypeError(
      'resolveEndpoints needs a page URL outside the browser: pass pageUrl (for example the app URL).',
    )
  const api = absolute(options.apiUrl.trim() === '' ? DEFAULT_API_URL : options.apiUrl, page)
  const auth =
    options.authUrl !== undefined && options.authUrl.trim() !== ''
      ? absolute(options.authUrl, page)
      : `${api}/auth`
  const manifest =
    options.manifestUrl !== undefined && options.manifestUrl.trim() !== ''
      ? new URL(rooted(options.manifestUrl), page).href
      : new URL(MANIFEST_PATH, new URL(api).origin).href
  return { api, auth, manifest }
}
