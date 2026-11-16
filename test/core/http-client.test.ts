// The fetch wrapper: routes, query vs POST /query, idempotency keys, problem mapping, malformed
// responses and path safety. `fetch` is stubbed; requests are asserted as the server would see them.
import type { ListQuery } from '@strutvane/framework/contracts'
import { describe, expect, test, vi } from 'vitest'
import { createHttpClient } from '../../src/core/http-client.ts'
import { ApiProblemError } from '../../src/core/problems.ts'

interface Call {
  readonly url: string
  readonly method: string
  readonly headers: Record<string, string>
  readonly body: unknown
}

function stub(...responses: (Response | Error | (() => Response))[]) {
  const calls: Call[] = []
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    const next = responses.shift()
    if (next instanceof Error) throw next
    if (typeof next === 'function') return next()
    return next ?? Response.json({})
  })
  return { fetch, calls }
}

const page = (data: unknown[], extra: Record<string, unknown> = {}) =>
  Response.json({ data, meta: { page: { size: 25, hasMore: false, ...extra } } })

const catchProblem = async (p: Promise<unknown>) => {
  const e = await p.catch((err: unknown) => err)
  if (!(e instanceof ApiProblemError)) throw new Error(`expected ApiProblemError, got ${String(e)}`)
  return e.problem
}

describe('routes and methods', () => {
  test('list with flat filters uses GET and the ADR-0011 query string', async () => {
    const { fetch, calls } = stub(page([{ id: 'a' }]))
    const api = createHttpClient({ baseUrl: 'https://api.test/api/v1/', fetch })
    const query: ListQuery = {
      filter: { op: 'in', field: 'status', values: ['draft', 'sent'] },
      sort: [{ field: 'amount', direction: 'desc' }],
      page: { kind: 'cursor', size: 25 },
    }
    const result = await api.list('invoices', query)
    expect(result).toEqual({ data: [{ id: 'a' }], meta: { page: { size: 25, hasMore: false } } })
    expect(calls[0]?.method).toBe('GET')
    expect(decodeURIComponent(calls[0]?.url ?? '')).toBe(
      'https://api.test/api/v1/invoices?filter[status][in]=draft&filter[status][in]=sent&sort=-amount&page[size]=25',
    )
    expect(calls[0]?.headers['accept']).toBe('application/json, application/problem+json')
    expect(calls[0]?.headers['idempotency-key']).toBeUndefined()
  })

  test('an empty list query has no query string', async () => {
    const { fetch, calls } = stub(page([]))
    await createHttpClient({ baseUrl: 'https://api.test', fetch }).list('/invoices/', {})
    expect(calls[0]?.url).toBe('https://api.test/invoices')
  })

  test('a tree the URL cannot express goes to POST {path}/query as JSON', async () => {
    const { fetch, calls } = stub(page([]))
    const query: ListQuery = {
      filter: {
        op: 'or',
        filters: [
          { op: 'eq', field: 'a', value: 1 },
          { op: 'eq', field: 'b', value: 2 },
        ],
      },
    }
    await createHttpClient({ baseUrl: 'https://api.test', fetch }).list('invoices', query)
    expect(calls[0]).toMatchObject({
      url: 'https://api.test/invoices/query',
      method: 'POST',
      body: query,
    })
    expect(calls[0]?.headers['content-type']).toBe('application/json')
  })

  test('get / create / update / delete', async () => {
    const { fetch, calls } = stub(
      Response.json({ id: 'a/b' }),
      Response.json({ data: { id: 7, n: 1 } }),
      Response.json({ id: 'x' }),
      new Response(null, { status: 204 }),
    )
    let n = 0
    const api = createHttpClient({
      baseUrl: 'https://api.test',
      fetch,
      createIdempotencyKey: () => `key-${++n}`,
    })
    expect(await api.get('invoices', 'a/b')).toEqual({ id: 'a/b' })
    expect(await api.create('invoices', { n: 1 })).toEqual({ id: '7', n: 1 }) // envelope + numeric id
    expect(await api.update('invoices', 'x', { n: 2 }, { idempotencyKey: 'mine' })).toEqual({
      id: 'x',
    })
    await api.delete('invoices', 'x')
    expect(calls.map((c) => [c.method, c.url, c.headers['idempotency-key']])).toEqual([
      ['GET', 'https://api.test/invoices/a%2Fb', undefined],
      ['POST', 'https://api.test/invoices', 'key-1'],
      ['PATCH', 'https://api.test/invoices/x', 'mine'],
      ['DELETE', 'https://api.test/invoices/x', 'key-2'],
    ])
    expect(calls[1]?.body).toEqual({ n: 1 })
  })

  test('headers (static or per request) and credentials are applied', async () => {
    const { fetch } = stub(Response.json({ id: 'a' }), Response.json({ id: 'a' }))
    let token = 't1'
    const api = createHttpClient({
      baseUrl: 'https://api.test',
      fetch,
      credentials: 'include',
      headers: () => ({ authorization: `Bearer ${token}` }),
    })
    await api.get('a', '1')
    token = 't2'
    await api.get('a', '1')
    const inits = fetch.mock.calls.map((c) => c[1] as RequestInit)
    expect(inits.map((i) => (i.headers as Record<string, string>)['authorization'])).toEqual([
      'Bearer t1',
      'Bearer t2',
    ])
    expect(inits[0]?.credentials).toBe('include')
    const staticApi = createHttpClient({
      baseUrl: 'https://api.test',
      fetch: stub(Response.json({ id: 'a' })).fetch,
      headers: { 'x-a': '1' },
    })
    expect(await staticApi.get('a', '1')).toEqual({ id: 'a' })
  })

  test('uses the global fetch by default', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ id: 'g' }))
    expect(await createHttpClient({ baseUrl: 'https://api.test' }).get('a', '1')).toEqual({
      id: 'g',
    })
    expect(spy).toHaveBeenCalledOnce()
  })
})

describe('path safety', () => {
  test.each(['..', '.', ''])('id %j is refused before any request', async (id) => {
    const { fetch } = stub()
    await expect(
      createHttpClient({ baseUrl: 'https://api.test', fetch }).get('invoices', id),
    ).rejects.toThrow(TypeError)
    expect(fetch).not.toHaveBeenCalled()
  })

  test('dot segments in the resource path and an empty path are refused', async () => {
    const api = createHttpClient({ baseUrl: 'https://api.test', fetch: stub().fetch })
    await expect(api.get('../admin', '1')).rejects.toThrow(TypeError)
    await expect(api.get('/', '1')).rejects.toThrow('A resource path is required.')
  })
})

describe('failures never crash and always carry a Problem', () => {
  test('a problem+json error body is kept (sanitized)', async () => {
    const body = {
      type: 't',
      title: 'Invalid',
      status: 422,
      code: 'VALIDATION_FAILED',
      issues: [{ path: ['a'], code: 'x', message: 'm' }, 'junk'],
    }
    const { fetch } = stub(Response.json(body, { status: 422 }))
    const problem = await catchProblem(
      createHttpClient({ baseUrl: 'https://api.test', fetch }).create('a', {}),
    )
    expect(problem.issues).toEqual([{ path: ['a'], code: 'x', message: 'm', params: {} }])
  })

  test('an HTML error page maps by status', async () => {
    const { fetch } = stub(new Response('<html>Bad gateway</html>', { status: 502 }))
    const problem = await catchProblem(
      createHttpClient({ baseUrl: 'https://api.test', fetch }).get('a', '1'),
    )
    expect(problem).toMatchObject({ status: 502, code: 'INTERNAL_ERROR' })
  })

  test.each([
    ['not JSON', () => new Response('{oops')],
    ['list without data', () => Response.json({ items: [] })],
    ['list row without id', () => Response.json({ data: [{ name: 'x' }] })],
    ['record without id', () => Response.json({ name: 'x' })],
    ['empty body for a record', () => new Response('')],
    ['array instead of record', () => Response.json([{ id: 'a' }])],
  ])('2xx with an unexpected shape (%s) → INTERNAL_ERROR', async (name, make) => {
    const { fetch } = stub(make())
    const api = createHttpClient({ baseUrl: 'https://api.test', fetch })
    const call = name.startsWith('list') ? api.list('a', {}) : api.get('a', '1')
    expect(await catchProblem(call)).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' })
  })

  test('page info is normalised: hasMore without a cursor is the last page; bad numbers dropped', async () => {
    const { fetch } = stub(
      Response.json({
        data: [{ id: 'a' }],
        meta: { page: { size: -1, hasMore: true, total: -5 } },
      }),
      Response.json({
        data: [{ id: 'a' }],
        meta: { page: { size: 10, hasMore: true, nextCursor: 'n', total: 30, number: 2 } },
      }),
      Response.json({ data: [] }),
    )
    const api = createHttpClient({ baseUrl: 'https://api.test', fetch })
    expect((await api.list('a', { page: { kind: 'cursor', size: 5 } })).meta.page).toEqual({
      size: 5,
      hasMore: false,
    })
    expect((await api.list('a', {})).meta.page).toEqual({
      size: 10,
      hasMore: true,
      nextCursor: 'n',
      total: 30,
      number: 2,
    })
    expect((await api.list('a', {})).meta.page).toEqual({ size: 0, hasMore: false })
  })

  test('network failure → status 0 NETWORK_ERROR with the cause', async () => {
    const cause = new TypeError('Failed to fetch')
    const { fetch } = stub(cause)
    const e = await createHttpClient({ baseUrl: 'https://api.test', fetch })
      .get('a', '1')
      .catch((err: unknown) => err)
    expect(e).toBeInstanceOf(ApiProblemError)
    expect((e as ApiProblemError).problem).toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
    expect((e as ApiProblemError).cause).toBe(cause)
  })

  test('a body that fails mid-stream → NETWORK_ERROR', async () => {
    const broken = () =>
      new Response(new ReadableStream({ start: (c) => c.error(new Error('reset')) }), {
        status: 200,
      })
    const { fetch } = stub(broken)
    expect(
      await catchProblem(createHttpClient({ baseUrl: 'https://api.test', fetch }).get('a', '1')),
    ).toMatchObject({
      code: 'NETWORK_ERROR',
    })
  })

  test('an abort is re-thrown unchanged (cancellation is not a failure)', async () => {
    const controller = new AbortController()
    controller.abort()
    const abort = new DOMException('aborted', 'AbortError')
    const { fetch } = stub(abort)
    await expect(
      createHttpClient({ baseUrl: 'https://api.test', fetch }).list('a', {}, controller.signal),
    ).rejects.toBe(abort)
    const broken = () =>
      new Response(new ReadableStream({ start: (c) => c.error(abort) }), { status: 200 })
    await expect(
      createHttpClient({ baseUrl: 'https://api.test', fetch: stub(broken).fetch }).get(
        'a',
        '1',
        controller.signal,
      ),
    ).rejects.toBe(abort)
  })

  test('the default key generator produces a UUID per mutation', async () => {
    const { fetch, calls } = stub(Response.json({ id: 'a' }), Response.json({ id: 'b' }))
    const api = createHttpClient({ baseUrl: 'https://api.test', fetch })
    await api.create('a', {})
    await api.create('a', {})
    const [k1, k2] = calls.map((c) => c.headers['idempotency-key'])
    expect(k1).toMatch(/^[0-9a-f-]{36}$/)
    expect(k1).not.toBe(k2)
  })
})
