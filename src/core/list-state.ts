/**
 * The state of a list page (chips, sort, search, page size, page number) and the pure reducer that
 * changes it.
 *
 * Lists use numbered pages (blueprint §5 "Pagination": 25 per page, choices 10/25/50/100, total
 * capped at 10,000), so a page is shareable as a URL and "Previous" never needs a history stack.
 * Any change to what the query MEANS (filters, sort, search, page size) returns to page 1, because
 * page 7 of the old query says nothing about the new one.
 *
 * @module
 */
import {
  LIST_QUERY_LIMITS,
  type ListQuery,
  type SortDirective,
} from '@strutvane/framework/contracts'
import { filtersToQueryFilter, type SimpleFilter } from './filter-builder.ts'

/** What the list page shows. */
export interface ListState {
  readonly filters: readonly SimpleFilter[]
  readonly sort: readonly SortDirective[]
  readonly search: string
  readonly pageSize: number
  /** 1-based page number. */
  readonly page: number
}

/** The page sizes a viewer can pick (blueprint §5). */
export const PAGE_SIZES: readonly number[] = Object.freeze([10, 25, 50, 100])

/** The highest page number the UI asks for; the server caps totals at 10,000 rows anyway. */
export const MAX_PAGE = 10_000

/** The empty list state: no filters, no sort, 25 rows (decision #54), first page. */
export const initialListState: ListState = Object.freeze({
  filters: [],
  sort: [],
  search: '',
  pageSize: LIST_QUERY_LIMITS.defaultPageSize,
  page: 1,
})

/**
 * Clamp a page size to the protocol limits and, when given, the resource's own `maxPerPage`
 * (from the manifest), so the UI never asks for more rows than the server allows. Garbage falls
 * back to the default (itself clamped).
 *
 * @example
 * clampPageSize(500) // 100
 * clampPageSize(50, 20) // 20
 */
export function clampPageSize(size: number, maxPerPage?: number): number {
  const max = Math.min(LIST_QUERY_LIMITS.maxPageSize, maxPerPage ?? LIST_QUERY_LIMITS.maxPageSize)
  if (!Number.isInteger(size) || size < 1) return Math.min(LIST_QUERY_LIMITS.defaultPageSize, max)
  return Math.min(size, max)
}

/** The page sizes offered for a resource: the standard choices up to its `maxPerPage`. */
export function pageSizeChoices(maxPerPage?: number): number[] {
  const max = clampPageSize(LIST_QUERY_LIMITS.maxPageSize, maxPerPage)
  const choices = PAGE_SIZES.filter((size) => size <= max)
  return choices.includes(max) ? choices : [...choices, max]
}

/** Clamp a page number to `1…MAX_PAGE`; garbage means page 1. */
export function clampPage(page: number): number {
  return Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1
}

/** The typed {@link ListQuery} the API client sends for a list state. */
export function toListQuery(state: ListState, maxPerPage?: number): ListQuery {
  const filter = filtersToQueryFilter(state.filters)
  const search = state.search.trim()
  return {
    ...(filter ? { filter } : {}),
    ...(search ? { search } : {}),
    ...(state.sort.length > 0 ? { sort: state.sort } : {}),
    page: {
      kind: 'offset',
      size: clampPageSize(state.pageSize, maxPerPage),
      number: clampPage(state.page),
    },
  }
}

/** Everything that can happen to a list page. */
export type ListAction =
  | { readonly type: 'sort'; readonly sort: readonly SortDirective[] }
  | { readonly type: 'addFilter'; readonly filter: SimpleFilter }
  | { readonly type: 'removeFilter'; readonly index: number }
  | { readonly type: 'clearFilters' }
  | { readonly type: 'search'; readonly search: string }
  | { readonly type: 'pageSize'; readonly size: number; readonly maxPerPage?: number }
  | { readonly type: 'page'; readonly page: number }
  | { readonly type: 'reset'; readonly list: ListState }

/** Back to page 1: used by every action that changes what the query means. */
function firstPage(list: ListState): ListState {
  return list.page === 1 ? list : { ...list, page: 1 }
}

/** Pure reducer for {@link ListState}. Unknown indexes and no-op actions return the same state. */
export function listReducer(state: ListState, action: ListAction): ListState {
  switch (action.type) {
    case 'sort':
      return { ...firstPage(state), sort: action.sort }
    case 'addFilter': {
      // One chip per field + operator: the URL has one `filter[field][op]` key per pair, so a
      // second `status eq` chip would not round-trip. The newer chip replaces the older one.
      const others = state.filters.filter(
        (f) => f.field !== action.filter.field || f.op !== action.filter.op,
      )
      return { ...firstPage(state), filters: [...others, action.filter] }
    }
    case 'removeFilter':
      if (action.index < 0 || action.index >= state.filters.length) return state
      return { ...firstPage(state), filters: state.filters.filter((_, i) => i !== action.index) }
    case 'clearFilters':
      if (state.filters.length === 0 && state.search === '') return state
      return { ...firstPage(state), filters: [], search: '' }
    case 'search':
      if (action.search === state.search) return state
      return { ...firstPage(state), search: action.search }
    case 'pageSize': {
      const size = clampPageSize(action.size, action.maxPerPage)
      if (size === state.pageSize) return state
      return { ...firstPage(state), pageSize: size }
    }
    case 'page': {
      const page = clampPage(action.page)
      return page === state.page ? state : { ...state, page }
    }
    case 'reset':
      return action.list
  }
}

/**
 * The page numbers to show, with `'gap'` where numbers are skipped: always the first and last
 * page, plus one neighbour on each side of the current page.
 *
 * @example
 * pageWindow(6, 12) // [1, 'gap', 5, 6, 7, 'gap', 12]
 */
export function pageWindow(current: number, last: number): (number | 'gap')[] {
  if (last <= 1) return [1]
  const pages = new Set([1, last, current - 1, current, current + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  for (const page of sorted) {
    const previous = out.at(-1)
    if (typeof previous === 'number' && page - previous === 2) out.push(page - 1)
    else if (typeof previous === 'number' && page - previous > 2) out.push('gap')
    out.push(page)
  }
  return out
}
