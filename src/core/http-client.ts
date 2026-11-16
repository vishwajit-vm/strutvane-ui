/**
 * The default {@link ResourceApi}: a small `fetch` wrapper for Strutvane REST APIs (ADR-0011).
 *
 * Routes (docs/05 §2): `GET {path}` (list), `GET {path}/{id}`, `POST {path}`, `PATCH {path}/{id}`,
 * `DELETE {path}/{id}`, and `POST {path}/query` for filter trees the URL cannot express.
 *
 * Failure handling (RFC-0003 §4):
 * - Every non-2xx response becomes an {@link ApiProblemError} carrying a sanitized {@link Problem};
 *   a body that is not a problem maps to a code by status, else `INTERNAL_ERROR` (row 16).
 * - A 2xx response with an unexpected shape is ALSO an `INTERNAL_ERROR` problem, never a crash
 *   further down in a component.
 * - Transport failures (offline, DNS, CORS) become status `0` / `NETWORK_ERROR`. An abort is
 *   re-thrown unchanged so callers (TanStack Query) can tell cancellation from failure.
 * - Mutations always send an `Idempotency-Key` header (row 12). Pass the same key to retry the same
 *   user action; when none is given, a fresh one is generated per call.
 *
 * Paths and ids are encoded per segment, and `.`/`..` segments are refused, so a record id or a
 * manifest path can never escape the API base URL.
 *
 * @module
 */
import type { ListQuery, ListResult, PageInfo, Problem } from '@strutvane/framework/contracts'
import { createIdempotencyKey } from './ids.ts'
import { listQueryToSearchString } from './list-query-url.ts'
import { ApiProblemError, networkProblem, problemFromResponse } from './problems.ts'
import type { ApiRecord, MutationOptions, ResourceApi } from './types.ts'
import { type XsrfOptions, xsrfHeaders } from './xsrf.ts'

/** Options for {@link createHttpClient}. */
export interface HttpClientOptions {
  /** API base URL, e.g. `https://api.example.com/api/v1`. Resource paths are appended to it. */
  readonly baseUrl: string
  /** Custom fetch (tests, SSR, instrumentation). Defaults to the global `fetch`. */
  readonly fetch?: typeof globalThis.fetch
  /** Extra headers for every request (e.g. an `Authorization` header from your auth provider). */
  readonly headers?: Readonly<Record<string, string>> | (() => Readonly<Record<string, string>>)
  /** Cookie policy; `include` for cookie sessions on another origin. */
  readonly credentials?: RequestCredentials
  /** Override key generation (tests). */
  readonly createIdempotencyKey?: () => string
  /**
   * The CSRF header (decision #17): on by default, reading the `XSRF-TOKEN` cookie and sending
   * `X-XSRF-TOKEN` on every write. `false` turns it off (a bearer-token API needs no CSRF check).
   */
  readonly xsrf?: XsrfOptions | false
  /**
   * How many times a READ is retried after no answer (offline) or a 5xx. Default 2. Writes are
   * never retried here: only the user decides to send a write again, with the same idempotency key.
   */
  readonly readRetries?: number
  /** Wait before retry number `attempt` (1-based), in ms. Default `300 * attempt`. */
  readonly retryDelay?: (attempt: number) => number
  /** Sleep used between retries (tests pass an instant one). */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

/** A sleep that ends early (rejecting) when the signal aborts. */
function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}

/** Whether a failed read may be tried again: no answer, or a server-side failure. Never a 4xx. */
export function isRetryableRead(error: unknown): boolean {
  return (
    error instanceof ApiProblemError && (error.problem.status === 0 || error.problem.status >= 500)
  )
}

const JSON_ACCEPT = 'application/json, application/problem+json'

/** A problem for a 2xx response whose body does not have the documented shape (RFC-0003 row 16). */
function unexpectedShape(detail: string): ApiProblemError {
  const problem: Problem = {
    type: 'about:blank',
    title: 'Unexpected response',
    status: 500,
    code: 'INTERNAL_ERROR',
    detail,
  }
  return new ApiProblemError(problem)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A record with a usable id (numeric ids are accepted and normalised to strings). */
function toApiRecord(value: unknown): ApiRecord | undefined {
  if (!isRecord(value)) return undefined
  const id = value['id']
  if (typeof id === 'string' && id !== '') return value as ApiRecord
  if (typeof id === 'number' && Number.isFinite(id)) return { ...value, id: String(id) }
  return undefined
}

/** Accept a bare record or a `{ data: record }` envelope. */
function readRecord(body: unknown): ApiRecord {
  const record = toApiRecord(body) ?? (isRecord(body) ? toApiRecord(body['data']) : undefined)
  if (!record) throw unexpectedShape('Expected a record with an id.')
  return record
}

function readPageInfo(value: unknown, fallbackSize: number, count: number): PageInfo {
  const page = isRecord(value) && isRecord(value['page']) ? value['page'] : {}
  const size = typeof page['size'] === 'number' && page['size'] > 0 ? page['size'] : fallbackSize
  const nextCursor =
    typeof page['nextCursor'] === 'string' && page['nextCursor'] !== ''
      ? page['nextCursor']
      : undefined
  // `hasMore` without a cursor is useless for cursor pagination; treat it as the last page.
  const hasMore =
    page['hasMore'] === true && (nextCursor !== undefined || typeof page['number'] === 'number')
  return {
    size,
    hasMore,
    ...(nextCursor !== undefined ? { nextCursor } : {}),
    ...(typeof page['number'] === 'number' ? { number: page['number'] } : {}),
    ...(typeof page['total'] === 'number' && page['total'] >= count
      ? { total: page['total'] }
      : {}),
  }
}

function readList(body: unknown, query: ListQuery): ListResult<ApiRecord> {
  if (!isRecord(body) || !Array.isArray(body['data']))
    throw unexpectedShape('Expected { data: [...] }.')
  const data: ApiRecord[] = []
  for (const row of body['data']) {
    const record = toApiRecord(row)
    if (!record) throw unexpectedShape('A list row has no usable id.')
    data.push(record)
  }
  return {
    data,
    meta: { page: readPageInfo(body['meta'], query.page?.size ?? data.length, data.length) },
  }
}

/** Encode one path segment; refuse dot segments and empty segments. */
function segment(raw: string): string {
  if (raw === '' || raw === '.' || raw === '..')
    throw new TypeError(`Invalid path segment "${raw}".`)
  return encodeURIComponent(raw)
}

/** Create a {@link ResourceApi} that talks to a Strutvane REST API over `fetch`. */
export function createHttpClient(options: HttpClientOptions): ResourceApi {
  const doFetch =
    options.fetch ??
    ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init))
  const base = options.baseUrl.replace(/\/+$/, '')
  const newKey = options.createIdempotencyKey ?? createIdempotencyKey

  const url = (path: string, ...rest: string[]): string => {
    const parts = path.split('/').filter((p) => p !== '')
    if (parts.length === 0) throw new TypeError('A resource path is required.')
    return [base, ...parts.map(segment), ...rest.map(segment)].join('/')
  }

  async function send(
    method: string,
    target: string,
    init: {
      body?: unknown
      signal?: AbortSignal | undefined
      idempotencyKey?: string | undefined
    } = {},
  ): Promise<unknown> {
    const extra =
      typeof options.headers === 'function' ? options.headers() : (options.headers ?? {})
    const headers: Record<string, string> = {
      accept: JSON_ACCEPT,
      ...extra,
      ...xsrfHeaders(method, options.xsrf),
    }
    if (init.body !== undefined) headers['content-type'] = 'application/json'
    if (init.idempotencyKey !== undefined) headers['idempotency-key'] = init.idempotencyKey
    let response: Response
    try {
      response = await doFetch(target, {
        method,
        headers,
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        ...(init.signal ? { signal: init.signal } : {}),
        ...(options.credentials ? { credentials: options.credentials } : {}),
      })
    } catch (cause) {
      if (init.signal?.aborted) throw cause
      throw new ApiProblemError(networkProblem(), { cause })
    }
    if (!response.ok) throw new ApiProblemError(await problemFromResponse(response))
    if (response.status === 204) return undefined
    let text: string
    try {
      text = await response.text()
    } catch (cause) {
      if (init.signal?.aborted) throw cause
      throw new ApiProblemError(networkProblem(), { cause })
    }
    if (text === '') return undefined
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw unexpectedShape('The response body is not valid JSON.')
    }
  }

  const retries = Math.max(0, Math.floor(options.readRetries ?? 2))
  const delay = options.retryDelay ?? ((attempt: number) => 300 * attempt)
  const sleep = options.sleep ?? defaultSleep

  /**
   * Send a request. Reads (GET, and the read-only `POST …/query`) are retried on no answer or a
   * 5xx, at most `readRetries` times; an abort stops at once. Writes go out exactly once.
   */
  async function request(
    method: string,
    target: string,
    init: {
      body?: unknown
      signal?: AbortSignal | undefined
      idempotencyKey?: string | undefined
      read?: boolean
    } = {},
  ): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await send(method, target, init)
      } catch (error) {
        if (!init.read || attempt >= retries || init.signal?.aborted || !isRetryableRead(error))
          throw error
        await sleep(delay(attempt + 1), init.signal)
      }
    }
  }

  const mutationKey = (o: MutationOptions | undefined) => o?.idempotencyKey ?? newKey()

  return {
    async list(path, query, signal) {
      const plain = listQueryToSearchString(query)
      // Numbered pages need the total to show "Showing 26–50 of 312" and the last page number.
      const search =
        plain !== undefined && query.page?.kind === 'offset'
          ? [plain, 'page[total]=true'].filter((part) => part !== '').join('&')
          : plain
      const body =
        search === undefined
          ? await request('POST', url(path, 'query'), { body: query, signal, read: true })
          : await request('GET', search ? `${url(path)}?${search}` : url(path), {
              signal,
              read: true,
            })
      return readList(body, query)
    },
    async get(path, id, signal) {
      return readRecord(await request('GET', url(path, id), { signal, read: true }))
    },
    async create(path, values, o) {
      return readRecord(
        await request('POST', url(path), {
          body: values,
          signal: o?.signal,
          idempotencyKey: mutationKey(o),
        }),
      )
    },
    async update(path, id, values, o) {
      return readRecord(
        await request('PATCH', url(path, id), {
          body: values,
          signal: o?.signal,
          idempotencyKey: mutationKey(o),
        }),
      )
    },
    async delete(path, id, o) {
      await request('DELETE', url(path, id), { signal: o?.signal, idempotencyKey: mutationKey(o) })
    },
    async restore(path, id, o) {
      // `POST {path}/{id}/restore` (decision #56): undoes a soft delete.
      const body = await request('POST', url(path, id, 'restore'), {
        signal: o?.signal,
        idempotencyKey: mutationKey(o),
      })
      return body === undefined ? undefined : readRecord(body)
    },
  }
}
