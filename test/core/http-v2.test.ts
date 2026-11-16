// HTTP and session clients, v2: the CSRF header on writes (#17), retries on reads only, restore
// (#56), totals for numbered pages, and the session client's `headers` option.
import { describe, expect, test, vi } from 'vitest'
import { createHttpClient, isRetryableRead } from '../../src/core/http-client.ts'
import { ApiProblemError } from '../../src/core/problems.ts'
import { createSessionClient } from '../../src/core/session-client.ts'

interface Call {
  readonly url: string
  readonly method: string
  readonly headers: Record<string, string>
}

function stub(...responses: (Response | Error)[]) {
  const calls: Call[] = []
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
    })
    const next = responses.shift()
    if (next instanceof Error) throw next
    return next ?? Response.json({ id: 'a' })
  })
  return { fetch, calls }
}

const problemResponse = (status: number) =>
  Response.json({ type: 'about:blank', title: 'x', status, code: 'x' }, { status })
const list = () =>
  Response.json({ data: [{ id: 'a' }], meta: { page: { size: 25, hasMore: false } } })
const instant = () => Promise.resolve()
const xsrf = { readCookies: () => 'XSRF-TOKEN=tok%2B1' }

describe('CSRF header on writes', () => {
  test('POST, PATCH, DELETE and restore send X-XSRF-TOKEN; reads never do', async () => {
    const { fetch, calls } = stub(
      list(),
      Response.json({ id: 'a' }),
      Response.json({ id: 'a' }),
      Response.json({ id: 'a' }),
      new Response(null, { status: 204 }),
      Response.json({ id: 'a' }),
    )
    const api = createHttpClient({ baseUrl: 'https://api.test/api', fetch, xsrf })
    await api.list('posts', {})
    await api.get('posts', 'a')
    await api.create('posts', {})
    await api.update('posts', 'a', {})
    await api.delete('posts', 'a')
    await api.restore?.('posts', 'a')
    expect(calls.map((c) => [c.method, c.headers['X-XSRF-TOKEN']])).toEqual([
      ['GET', undefined],
      ['GET', undefined],
      ['POST', 'tok+1'],
      ['PATCH', 'tok+1'],
      ['DELETE', 'tok+1'],
      ['POST', 'tok+1'],
    ])
    expect(calls.at(-1)?.url).toBe('https://api.test/api/posts/a/restore')
  })

  test('xsrf: false sends nothing (bearer-token APIs)', async () => {
    const { fetch, calls } = stub(Response.json({ id: 'a' }))
    await createHttpClient({ baseUrl: 'https://api.test', fetch, xsrf: false }).create('p', {})
    expect(calls[0]?.headers['X-XSRF-TOKEN']).toBeUndefined()
  })

  test('restore with an empty answer resolves to undefined', async () => {
    const { fetch } = stub(new Response(null, { status: 204 }))
    const api = createHttpClient({ baseUrl: 'https://api.test', fetch })
    expect(await api.restore?.('posts', 'a')).toBeUndefined()
  })
})

describe('retry on reads only', () => {
  test('a GET is retried after a 503 and after no answer, then succeeds', async () => {
    const { fetch, calls } = stub(problemResponse(503), new TypeError('offline'), list())
    const sleep = vi.fn((_ms: number, _signal?: AbortSignal) => instant())
    const api = createHttpClient({ baseUrl: 'https://api.test', fetch, sleep })
    expect((await api.list('posts', {})).data).toHaveLength(1)
    expect(calls).toHaveLength(3)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([300, 600])
  })

  test('gives up after readRetries and reports the last problem', async () => {
    const { fetch, calls } = stub(problemResponse(502), problemResponse(502), problemResponse(500))
    const api = createHttpClient({ baseUrl: 'https://api.test', fetch, sleep: instant })
    const error = await api.get('posts', 'a').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiProblemError)
    expect((error as ApiProblemError).problem.status).toBe(500)
    expect(calls).toHaveLength(3)
  })

  test('never retries a 4xx, and never retries a write', async () => {
    const reads = stub(problemResponse(404))
    await createHttpClient({ baseUrl: 'https://api.test', fetch: reads.fetch, sleep: instant })
      .get('posts', 'a')
      .catch(() => undefined)
    expect(reads.calls).toHaveLength(1)
    const writes = stub(problemResponse(503), problemResponse(503))
    await createHttpClient({ baseUrl: 'https://api.test', fetch: writes.fetch, sleep: instant })
      .create('posts', {})
      .catch(() => undefined)
    expect(writes.calls).toHaveLength(1)
  })

  test('the read-only POST /query is retried like a GET', async () => {
    const { fetch, calls } = stub(problemResponse(503), list())
    const api = createHttpClient({ baseUrl: 'https://api.test', fetch, sleep: instant })
    await api.list('posts', {
      filter: {
        op: 'or',
        filters: [
          { op: 'eq', field: 'a', value: 1 },
          { op: 'eq', field: 'b', value: 2 },
        ],
      },
    })
    expect(calls.map((c) => c.method)).toEqual(['POST', 'POST'])
    expect(calls[0]?.url).toBe('https://api.test/posts/query')
  })

  test('an abort while waiting stops at once', async () => {
    const controller = new AbortController()
    const { fetch, calls } = stub(problemResponse(503), list())
    const api = createHttpClient({ baseUrl: 'https://api.test', fetch, retryDelay: () => 10_000 })
    const pending = api.list('posts', {}, controller.signal)
    await new Promise((resolve) => setTimeout(resolve, 5))
    controller.abort(new DOMException('stop', 'AbortError'))
    await expect(pending).rejects.toThrow('stop')
    expect(calls).toHaveLength(1)
  })

  test('an already aborted signal never sleeps', async () => {
    const controller = new AbortController()
    controller.abort(new DOMException('gone', 'AbortError'))
    const { fetch } = stub(problemResponse(503))
    const api = createHttpClient({ baseUrl: 'https://api.test', fetch })
    await expect(api.get('posts', 'a', controller.signal)).rejects.toBeDefined()
  })

  test('isRetryableRead: no answer or 5xx only', () => {
    const p = (status: number) =>
      new ApiProblemError({ type: 'about:blank', title: 'x', status, code: 'x' })
    expect(isRetryableRead(p(0))).toBe(true)
    expect(isRetryableRead(p(503))).toBe(true)
    expect(isRetryableRead(p(429))).toBe(false)
    expect(isRetryableRead(new Error('x'))).toBe(false)
  })
})

describe('numbered pages ask for the total', () => {
  test('an offset page adds page[total]=true; a cursor page does not', async () => {
    const { fetch, calls } = stub(list(), list(), list())
    const api = createHttpClient({ baseUrl: 'https://api.test', fetch })
    await api.list('posts', { page: { kind: 'offset', size: 25, number: 2 } })
    await api.list('posts', { page: { kind: 'offset', size: 25, number: 1 } })
    await api.list('posts', { page: { kind: 'cursor', size: 25 } })
    expect(calls.map((c) => decodeURIComponent(c.url))).toEqual([
      'https://api.test/posts?page[size]=25&page[number]=2&page[total]=true',
      'https://api.test/posts?page[size]=25&page[number]=1&page[total]=true',
      'https://api.test/posts?page[size]=25',
    ])
  })
})

describe('session client v2', () => {
  test('headers (static or computed) go on every auth request; CSRF on POSTs', async () => {
    const { fetch, calls } = stub(
      Response.json({ actor: { id: 'u', roles: [] } }),
      Response.json({ actor: { id: 'u', roles: [] } }),
    )
    let n = 0
    const session = createSessionClient({
      apiUrl: '/api',
      fetch,
      headers: () => ({ 'x-tenant-hint': String(++n), accept: 'text/plain' }),
      xsrf,
    })
    await session.me()
    await session.signIn('a@example.com', 'pw')
    expect(calls[0]?.headers['x-tenant-hint']).toBe('1')
    expect(calls[0]?.headers['X-XSRF-TOKEN']).toBeUndefined()
    // An app header can't replace what the protocol needs.
    expect(calls[0]?.headers['accept']).toBe('application/json, application/problem+json')
    expect(calls[1]?.headers['x-tenant-hint']).toBe('2')
    expect(calls[1]?.headers['X-XSRF-TOKEN']).toBe('tok+1')
  })

  test('static headers work too, and xsrf: false sends no token', async () => {
    const { fetch, calls } = stub(new Response(null, { status: 204 }))
    await createSessionClient({
      apiUrl: '/api',
      fetch,
      headers: { 'x-app': 'admin' },
      xsrf: false,
    }).signOut()
    expect(calls[0]?.headers['x-app']).toBe('admin')
    expect(calls[0]?.headers['X-XSRF-TOKEN']).toBeUndefined()
  })
})
