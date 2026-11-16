/**
 * The front-end half of CSRF protection (decision #17, blueprint §5.2).
 *
 * The framework sets a JavaScript-readable `XSRF-TOKEN` cookie (`SameSite=Lax`) next to the
 * session cookie. Every unsafe request (POST, PUT, PATCH, DELETE) that rides on the session cookie
 * must echo it in the `X-XSRF-TOKEN` header; a cross-site page can't read the cookie, so it can't
 * forge the header, and the server answers 419 (`csrf_token_mismatch`) without it.
 *
 * Why the header is read fresh for every request: the framework rotates the token whenever the
 * session id changes (sign-in, tenant switch), so a token captured at start-up would go stale.
 *
 * Failure scenarios: no `document` (tests, server rendering) or no cookie (a bearer-token API, the
 * first request before a session exists) means no header; the server then decides, so a missing
 * cookie never blocks a request that doesn't need one.
 *
 * @module
 */

/** The cookie the framework writes (`XSRF_COOKIE` in `@strutvane/framework/http`). */
export const XSRF_COOKIE = 'XSRF-TOKEN'

/** The header the framework reads. */
export const XSRF_HEADER = 'X-XSRF-TOKEN'

/** Where the token comes from and where it goes. `false` turns the header off. */
export interface XsrfOptions {
  /** Cookie name. Default `XSRF-TOKEN`. */
  readonly cookie?: string
  /** Header name. Default `X-XSRF-TOKEN`. */
  readonly header?: string
  /** Reads the cookie string (default: `document.cookie`, or `''` without a document). */
  readonly readCookies?: () => string
}

/**
 * The value of one cookie in a `document.cookie` string, URL-decoded, or `undefined`.
 *
 * @example
 * readCookie('a=1; XSRF-TOKEN=abc%3D', 'XSRF-TOKEN') // 'abc='
 */
export function readCookie(cookies: string, name: string): string | undefined {
  for (const part of cookies.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== name) continue
    const raw = part.slice(eq + 1).trim()
    if (raw === '') return undefined
    try {
      return decodeURIComponent(raw)
    } catch {
      // A malformed escape is not a token the server issued; send nothing rather than garbage.
      return undefined
    }
  }
  return undefined
}

/** Whether a method changes state, so the CSRF header must accompany it. */
export function isUnsafeMethod(method: string): boolean {
  const m = method.toUpperCase()
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS'
}

const documentCookies = (): string =>
  typeof document === 'undefined' ? '' : ((document as { cookie?: string }).cookie ?? '')

/**
 * The CSRF header for one request: `{ 'X-XSRF-TOKEN': token }` for unsafe methods when the
 * cookie exists, otherwise `{}`.
 *
 * @example
 * xsrfHeaders('POST', { readCookies: () => 'XSRF-TOKEN=t1' }) // { 'X-XSRF-TOKEN': 't1' }
 */
export function xsrfHeaders(
  method: string,
  options: XsrfOptions | false = {},
): Readonly<Record<string, string>> {
  if (options === false || !isUnsafeMethod(method)) return {}
  const token = readCookie(
    (options.readCookies ?? documentCookies)(),
    options.cookie ?? XSRF_COOKIE,
  )
  return token === undefined ? {} : { [options.header ?? XSRF_HEADER]: token }
}
