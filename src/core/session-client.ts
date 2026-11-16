/**
 * The session client: sign-in, sign-out, the current actor and tenant switching, against the auth
 * endpoints a Strutvane API serves under its base path (`/api/v1/auth/*`, `@strutvane/auth`).
 *
 * Framework-free, like the rest of `core`. Every failure is an {@link ApiProblemError} carrying the
 * server's RFC 9457 problem (401 wrong password, 429 with `Retry-After`, 403 cross-site…), so the
 * screens render the same messages as every other request. Cookies are the session: requests use
 * `credentials: 'same-origin'` by default (`include` for a UI served from another origin).
 *
 * @module
 */
import type { Actor } from '@strutvane/framework/contracts'
import { ApiProblemError, networkProblem, problemFromResponse } from './problems.ts'
import { type XsrfOptions, xsrfHeaders } from './xsrf.ts'

/** The signed-in actor as the API reports it (`GET /auth/me`). */
export type SessionActor = Pick<Actor, 'id' | 'type' | 'roles'> & { readonly tenantId?: string }

/** A tenant (workspace) the signed-in user belongs to. */
export interface SessionTenant {
  readonly tenantId: string
  readonly name: string
  readonly slug: string
  readonly roles: readonly string[]
}

/** Options for {@link createSessionClient}. */
export interface SessionClientOptions {
  /** API base URL, e.g. `/api/v1` or `https://api.example.com/api/v1`. */
  readonly apiUrl: string
  readonly fetch?: typeof globalThis.fetch
  readonly credentials?: RequestCredentials
  /**
   * Extra headers for every auth request, static or computed per request (an app-wide header such
   * as a tenant hint). They can't override `accept`, `content-type` or the CSRF header.
   */
  readonly headers?: Readonly<Record<string, string>> | (() => Readonly<Record<string, string>>)
  /** The CSRF header on sign-in, sign-out and switches (decision #17). `false` turns it off. */
  readonly xsrf?: XsrfOptions | false
}

/** What {@link createSessionClient} returns. */
export interface SessionClient {
  /** The current actor, or `null` when nobody is signed in (401). */
  me(signal?: AbortSignal): Promise<SessionActor | null>
  signIn(email: string, password: string): Promise<SessionActor>
  signOut(): Promise<void>
  tenants(signal?: AbortSignal): Promise<readonly SessionTenant[]>
  switchTenant(tenantId: string): Promise<SessionActor>
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function actorFrom(body: unknown): SessionActor {
  const actor = isObject(body) ? body['actor'] : undefined
  if (!isObject(actor) || typeof actor['id'] !== 'string' || !Array.isArray(actor['roles'])) {
    throw new ApiProblemError({
      type: 'about:blank',
      title: 'Unexpected response',
      status: 500,
      code: 'INTERNAL_ERROR',
      detail: 'The session response has no actor.',
    })
  }
  return {
    id: actor['id'],
    type: (actor['type'] as Actor['type']) ?? 'user',
    roles: actor['roles'].filter((r): r is string => typeof r === 'string'),
    ...(typeof actor['tenantId'] === 'string' ? { tenantId: actor['tenantId'] } : {}),
  }
}

/** Create a session client for one API. */
export function createSessionClient(options: SessionClientOptions): SessionClient {
  const doFetch =
    options.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args))
  const base = options.apiUrl.replace(/\/+$/, '')
  const credentials = options.credentials ?? 'same-origin'

  const call = async (
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<Response> => {
    let response: Response
    try {
      response = await doFetch(`${base}/auth${path}`, {
        method,
        credentials,
        headers: {
          ...(typeof options.headers === 'function' ? options.headers() : options.headers),
          accept: 'application/json, application/problem+json',
          ...xsrfHeaders(method, options.xsrf),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        ...(signal ? { signal } : {}),
      })
    } catch (cause) {
      if (signal?.aborted) throw cause
      throw new ApiProblemError(networkProblem(), { cause })
    }
    if (!response.ok) {
      const problem = await problemFromResponse(response)
      // Rate limits: keep the server's wait (seconds) so the screen can say how long.
      const retryAfter = Number(response.headers.get('retry-after'))
      throw new ApiProblemError(
        response.status === 429 && Number.isFinite(retryAfter) && retryAfter >= 0
          ? ({ ...problem, retryAfter } as typeof problem)
          : problem,
      )
    }
    return response
  }

  return {
    async me(signal) {
      try {
        return actorFrom(await (await call('GET', '/me', undefined, signal)).json())
      } catch (error) {
        if (error instanceof ApiProblemError && error.problem.status === 401) return null
        throw error
      }
    },
    async signIn(email, password) {
      return actorFrom(await (await call('POST', '/sign-in', { email, password })).json())
    },
    async signOut() {
      try {
        await call('POST', '/sign-out', {})
      } catch (error) {
        // Already signed out (expired session): the goal is reached.
        if (!(error instanceof ApiProblemError && error.problem.status === 401)) throw error
      }
    },
    async tenants(signal) {
      const body: unknown = await (await call('GET', '/tenants', undefined, signal)).json()
      const data = isObject(body) && Array.isArray(body['data']) ? body['data'] : []
      return data.filter(
        (t): t is SessionTenant =>
          isObject(t) && typeof t['tenantId'] === 'string' && typeof t['name'] === 'string',
      )
    },
    async switchTenant(tenantId) {
      return actorFrom(await (await call('POST', '/switch-tenant', { tenantId })).json())
    },
  }
}
