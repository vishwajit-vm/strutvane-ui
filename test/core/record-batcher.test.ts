// Batched relation lookups: one request per tick, chunked, failures isolated per chunk.
import type { ListQuery, ListResult } from '@strutvane/contracts'
import { describe, expect, test, vi } from 'vitest'
import { ApiProblemError } from '../../src/core/problems.ts'
import { createRecordBatcher } from '../../src/core/record-batcher.ts'
import type { ApiRecord, ResourceApi } from '../../src/core/types.ts'
import { customerResource } from '../fixtures/manifest.ts'

const withIn = {
  ...customerResource,
  fields: customerResource.fields.map((f) =>
    f.name === 'id' ? { ...f, filterOperators: ['in' as const] } : f,
  ),
}

function api(overrides: Partial<ResourceApi> = {}): ResourceApi {
  return {
    list: vi.fn(async (_p: string, q: ListQuery): Promise<ListResult<ApiRecord>> => {
      const ids = q.filter && 'values' in q.filter ? (q.filter.values as string[]) : []
      return {
        data: ids.filter((id) => id !== 'missing').map((id) => ({ id, name: `N-${id}` })),
        meta: { page: { size: ids.length, hasMore: false } },
      }
    }),
    get: vi.fn(async (_p: string, id: string) => {
      if (id === 'missing')
        throw new ApiProblemError({ type: 't', title: 'Not found', status: 404, code: 'NOT_FOUND' })
      if (id === 'boom')
        throw new ApiProblemError({ type: 't', title: 'Err', status: 500, code: 'INTERNAL_ERROR' })
      return { id, name: `N-${id}` }
    }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  }
}

describe('createRecordBatcher', () => {
  test('with `id in`: one list request for all ids of the tick; duplicates deduped; missing → undefined', async () => {
    const a = api()
    const b = createRecordBatcher(a, withIn)
    const results = await Promise.all([b.load('1'), b.load('2'), b.load('1'), b.load('missing')])
    expect(results.map((r) => r?.['name'])).toEqual(['N-1', 'N-2', 'N-1', undefined])
    expect(a.list).toHaveBeenCalledTimes(1)
    expect(vi.mocked(a.list).mock.calls[0]?.[1]).toEqual({
      filter: { op: 'in', field: 'id', values: ['1', '2', 'missing'] },
      page: { kind: 'cursor', size: 3 },
    })
  })

  test('more than 100 ids are split into chunks of 100', async () => {
    const a = api()
    const b = createRecordBatcher(a, withIn)
    await Promise.all(Array.from({ length: 250 }, (_, i) => b.load(String(i))))
    expect(
      vi
        .mocked(a.list)
        .mock.calls.map((c) => (c[1].filter as unknown as { values: unknown[] }).values.length),
    ).toEqual([100, 100, 50])
  })

  test('without `id in`: one GET per id; 404/403 → undefined; other failures reject only their chunk', async () => {
    const a = api()
    const b = createRecordBatcher(a, customerResource)
    const [ok, missing] = await Promise.all([b.load('1'), b.load('missing')])
    expect(ok?.['name']).toBe('N-1')
    expect(missing).toBeUndefined()
    await expect(b.load('boom')).rejects.toBeInstanceOf(ApiProblemError)
    expect(await b.load('2')).toMatchObject({ id: '2' }) // the batcher keeps working afterwards
  })

  test('a failing list rejects every waiter of that chunk', async () => {
    const a = api({ list: vi.fn(async () => Promise.reject(new Error('down'))) })
    const b = createRecordBatcher(a, withIn)
    const results = await Promise.allSettled([b.load('1'), b.load('2')])
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
  })
})
