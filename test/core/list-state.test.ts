// The list reducer (numbered pages), page-size limits and ListState → ListQuery.
import { describe, expect, test } from 'vitest'
import {
  clampPage,
  clampPageSize,
  initialListState,
  type ListState,
  listReducer,
  MAX_PAGE,
  pageSizeChoices,
  pageWindow,
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
      page: { kind: 'offset', size: 25, number: 1 },
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
      page: 3,
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
      page: { kind: 'offset', size: 100, number: 3 },
    })
  })

  test('the default page size is 25 (decision #54)', () => {
    expect(initialListState.pageSize).toBe(25)
  })

  test("a resource's maxPerPage lowers the size the UI asks for", () => {
    expect(toListQuery({ ...initialListState, pageSize: 100 }, 20).page).toEqual({
      kind: 'offset',
      size: 20,
      number: 1,
    })
  })

  test('clampPageSize', () => {
    expect(clampPageSize(10)).toBe(10)
    expect(clampPageSize(1000)).toBe(100)
    expect(clampPageSize(0)).toBe(25)
    expect(clampPageSize(2.5)).toBe(25)
    expect(clampPageSize(Number.NaN)).toBe(25)
    expect(clampPageSize(50, 20)).toBe(20)
    expect(clampPageSize(0, 10)).toBe(10)
  })

  test('clampPage', () => {
    expect(clampPage(3)).toBe(3)
    expect(clampPage(0)).toBe(1)
    expect(clampPage(-2)).toBe(1)
    expect(clampPage(1.5)).toBe(1)
    expect(clampPage(MAX_PAGE + 5)).toBe(MAX_PAGE)
  })

  test('pageSizeChoices: 10/25/50/100, cut at maxPerPage (which is offered itself)', () => {
    expect(pageSizeChoices()).toEqual([10, 25, 50, 100])
    expect(pageSizeChoices(50)).toEqual([10, 25, 50])
    expect(pageSizeChoices(30)).toEqual([10, 25, 30])
    expect(pageSizeChoices(5)).toEqual([5])
  })

  test('pageWindow: first, last, neighbours, gaps', () => {
    expect(pageWindow(1, 1)).toEqual([1])
    expect(pageWindow(1, 3)).toEqual([1, 2, 3])
    expect(pageWindow(6, 12)).toEqual([1, 'gap', 5, 6, 7, 'gap', 12])
    expect(pageWindow(3, 12)).toEqual([1, 2, 3, 4, 'gap', 12])
    expect(pageWindow(12, 12)).toEqual([1, 'gap', 11, 12])
  })
})

describe('listReducer', () => {
  const start: ListState = initialListState
  const page3: ListState = { ...initialListState, page: 3 }

  test('page moves to a page; garbage goes to page 1; the same page returns the same state', () => {
    expect(listReducer(start, { type: 'page', page: 4 }).page).toBe(4)
    expect(listReducer(page3, { type: 'page', page: -1 }).page).toBe(1)
    expect(listReducer(page3, { type: 'page', page: 3 })).toBe(page3)
  })

  test('sort resets to page 1', () => {
    const sorted = listReducer(page3, {
      type: 'sort',
      sort: [{ field: 'amount', direction: 'asc' }],
    })
    expect(sorted.page).toBe(1)
    expect(sorted.sort).toEqual([{ field: 'amount', direction: 'asc' }])
  })

  test('filters: add resets the page; same field+op replaces; remove by index; bad index is a no-op', () => {
    const a = listReducer(page3, {
      type: 'addFilter',
      filter: { field: 'status', op: 'eq', value: 'draft' },
    })
    expect(a.page).toBe(1)
    const b = listReducer(a, {
      type: 'addFilter',
      filter: { field: 'amount', op: 'gte', value: 1 },
    })
    const c = listReducer(b, {
      type: 'addFilter',
      filter: { field: 'status', op: 'eq', value: 'paid' },
    })
    expect(c.filters).toEqual([
      { field: 'amount', op: 'gte', value: 1 },
      { field: 'status', op: 'eq', value: 'paid' },
    ])
    expect(listReducer(c, { type: 'removeFilter', index: 5 })).toBe(c)
    expect(listReducer(c, { type: 'removeFilter', index: -1 })).toBe(c)
    expect(listReducer(c, { type: 'removeFilter', index: 0 }).filters).toEqual([
      { field: 'status', op: 'eq', value: 'paid' },
    ])
  })

  test('clearFilters drops every filter and the search; nothing to clear is a no-op', () => {
    const busy: ListState = {
      ...page3,
      search: 'acme',
      filters: [{ field: 'status', op: 'eq', value: 'draft' }],
    }
    expect(listReducer(busy, { type: 'clearFilters' })).toEqual({ ...initialListState })
    expect(listReducer(start, { type: 'clearFilters' })).toBe(start)
  })

  test('search and page size reset the page; unchanged values return the same state', () => {
    const s = listReducer(page3, { type: 'search', search: 'acme' })
    expect(s).toEqual({ ...initialListState, search: 'acme' })
    expect(listReducer(s, { type: 'search', search: 'acme' })).toBe(s)
    const size = listReducer(page3, { type: 'pageSize', size: 50 })
    expect(size.pageSize).toBe(50)
    expect(size.page).toBe(1)
    expect(listReducer(size, { type: 'pageSize', size: 50 })).toBe(size)
    expect(listReducer(size, { type: 'pageSize', size: 9999 }).pageSize).toBe(100)
    expect(listReducer(size, { type: 'pageSize', size: 100, maxPerPage: 20 }).pageSize).toBe(20)
  })

  test('reset replaces the state', () => {
    const list = { ...initialListState, search: 'x' }
    expect(listReducer(page3, { type: 'reset', list })).toBe(list)
  })
})
