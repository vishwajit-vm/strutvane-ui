// The list reducer (cursor stack) and ListState → ListQuery.
import { describe, expect, test } from 'vitest'
import {
  clampPageSize,
  initialListState,
  type ListPageState,
  listReducer,
  toListQuery,
} from '../../src/core/list-state.ts'

describe('toListQuery', () => {
  test('single filter is sent as-is; several become an AND; page size is clamped to the protocol max', () => {
    const one = toListQuery({
      ...initialListState,
      filters: [{ field: 'status', op: 'eq', value: 'draft' }],
    })
    expect(one).toEqual({
      filter: { op: 'eq', field: 'status', value: 'draft' },
      page: { kind: 'cursor', size: 25 },
    })
    const two = toListQuery({
      ...initialListState,
      pageSize: 5000,
      filters: [
        { field: 'status', op: 'in', values: ['draft', 'sent'] },
        { field: 'amount', op: 'between', from: 10, to: 20 },
      ],
      sort: [{ field: 'amount', direction: 'desc' }],
      search: '  acme ',
      cursor: 'c',
    })
    expect(two).toEqual({
      filter: {
        op: 'and',
        filters: [
          { op: 'in', field: 'status', values: ['draft', 'sent'] },
          { op: 'between', field: 'amount', from: 10, to: 20 },
        ],
      },
      search: 'acme',
      sort: [{ field: 'amount', direction: 'desc' }],
      page: { kind: 'cursor', size: 100, cursor: 'c' },
    })
  })

  test('clampPageSize', () => {
    expect(clampPageSize(10)).toBe(10)
    expect(clampPageSize(1000)).toBe(100)
    expect(clampPageSize(0)).toBe(25)
    expect(clampPageSize(2.5)).toBe(25)
    expect(clampPageSize(Number.NaN)).toBe(25)
  })
})

describe('listReducer', () => {
  const start: ListPageState = { list: initialListState, previousCursors: [] }

  test('next/previous walk the cursor stack; changing the query resets to page 1', () => {
    const p2 = listReducer(start, { type: 'next', cursor: 'c2' })
    const p3 = listReducer(p2, { type: 'next', cursor: 'c3' })
    expect(p3.list.cursor).toBe('c3')
    const back = listReducer(p3, { type: 'previous' })
    expect(back.list.cursor).toBe('c2')
    const first = listReducer(back, { type: 'previous' })
    expect(first.list.cursor).toBeUndefined()
    expect(listReducer(first, { type: 'previous' })).toBe(first) // no-op at page 1
    const sorted = listReducer(p3, { type: 'sort', sort: [{ field: 'amount', direction: 'asc' }] })
    expect(sorted.list.cursor).toBeUndefined()
    expect(sorted.previousCursors).toEqual([])
  })

  test('filters: add resets the page; same field+op replaces; remove by index; bad index is a no-op', () => {
    const p2 = listReducer(start, { type: 'next', cursor: 'c2' })
    const a = listReducer(p2, {
      type: 'addFilter',
      filter: { field: 'status', op: 'eq', value: 'draft' },
    })
    expect(a.list.cursor).toBeUndefined()
    const b = listReducer(a, {
      type: 'addFilter',
      filter: { field: 'amount', op: 'gte', value: 1 },
    })
    const c = listReducer(b, {
      type: 'addFilter',
      filter: { field: 'status', op: 'eq', value: 'paid' },
    })
    expect(c.list.filters).toEqual([
      { field: 'amount', op: 'gte', value: 1 },
      { field: 'status', op: 'eq', value: 'paid' },
    ])
    expect(listReducer(c, { type: 'removeFilter', index: 5 })).toBe(c)
    expect(listReducer(c, { type: 'removeFilter', index: -1 })).toBe(c)
    expect(listReducer(c, { type: 'removeFilter', index: 0 }).list.filters).toEqual([
      { field: 'status', op: 'eq', value: 'paid' },
    ])
  })

  test('search and page size reset the page; unchanged values return the same state', () => {
    const p2 = listReducer(start, { type: 'next', cursor: 'c2' })
    const s = listReducer(p2, { type: 'search', search: 'acme' })
    expect(s.list).toEqual({ ...initialListState, search: 'acme' })
    expect(listReducer(s, { type: 'search', search: 'acme' })).toBe(s)
    const size = listReducer(p2, { type: 'pageSize', size: 50 })
    expect(size.list.pageSize).toBe(50)
    expect(size.list.cursor).toBeUndefined()
    expect(listReducer(size, { type: 'pageSize', size: 50 })).toBe(size)
    expect(listReducer(size, { type: 'pageSize', size: 9999 }).list.pageSize).toBe(100)
  })

  test('reset replaces the state and clears history', () => {
    const p2 = listReducer(start, { type: 'next', cursor: 'c2' })
    const list = { ...initialListState, search: 'x' }
    expect(listReducer(p2, { type: 'reset', list })).toEqual({ list, previousCursors: [] })
  })
})
