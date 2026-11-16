/**
 * The state of a list page (chips, sort, search, page size, cursor) and the pure reducer that
 * changes it.
 *
 * Cursor pagination keeps a stack of previous cursors so "Previous" works without the server
 * supporting backwards cursors. Any change to what the query MEANS (filters, sort, search, page
 * size) resets to the first page, because a cursor is only valid for the query it was issued for.
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
  /** Cursor of the current page (`undefined` = first page). */
  readonly cursor?: string
}

/** The empty list state: no filters, no sort, default page size, first page. */
export const initialListState: ListState = Object.freeze({
  filters: [],
  sort: [],
  search: '',
  pageSize: LIST_QUERY_LIMITS.defaultPageSize,
})

/** Clamp a page size to the protocol limits; garbage falls back to the default. */
export function clampPageSize(size: number): number {
  if (!Number.isInteger(size) || size < 1) return LIST_QUERY_LIMITS.defaultPageSize
  return Math.min(size, LIST_QUERY_LIMITS.maxPageSize)
}

/** The typed {@link ListQuery} the API client sends for a list state. */
export function toListQuery(state: ListState): ListQuery {
  const filter = filtersToQueryFilter(state.filters)
  const search = state.search.trim()
  return {
    ...(filter ? { filter } : {}),
    ...(search ? { search } : {}),
    ...(state.sort.length > 0 ? { sort: state.sort } : {}),
    page: {
      kind: 'cursor',
      size: clampPageSize(state.pageSize),
      ...(state.cursor ? { cursor: state.cursor } : {}),
    },
  }
}

/** List state plus the cursor history that makes "Previous" possible. */
export interface ListPageState {
  readonly list: ListState
  readonly previousCursors: readonly (string | undefined)[]
}

/** Everything that can happen to a list page. */
export type ListAction =
  | { readonly type: 'sort'; readonly sort: readonly SortDirective[] }
  | { readonly type: 'addFilter'; readonly filter: SimpleFilter }
  | { readonly type: 'removeFilter'; readonly index: number }
  | { readonly type: 'search'; readonly search: string }
  | { readonly type: 'pageSize'; readonly size: number }
  | { readonly type: 'next'; readonly cursor: string }
  | { readonly type: 'previous' }
  | { readonly type: 'reset'; readonly list: ListState }

/** Drop the cursor: used by every action that changes what the query means. */
function firstPage(list: ListState): ListState {
  const { cursor: _dropped, ...rest } = list
  return rest
}

/** Pure reducer for {@link ListPageState}. Unknown indexes and no-op actions return the same state. */
export function listReducer(state: ListPageState, action: ListAction): ListPageState {
  switch (action.type) {
    case 'sort':
      return { list: { ...firstPage(state.list), sort: action.sort }, previousCursors: [] }
    case 'addFilter': {
      // One chip per field + operator: the URL has one `filter[field][op]` key per pair, so a
      // second `status eq` chip would not round-trip. The newer chip replaces the older one.
      const others = state.list.filters.filter(
        (f) => f.field !== action.filter.field || f.op !== action.filter.op,
      )
      return {
        list: { ...firstPage(state.list), filters: [...others, action.filter] },
        previousCursors: [],
      }
    }
    case 'removeFilter':
      if (action.index < 0 || action.index >= state.list.filters.length) return state
      return {
        list: {
          ...firstPage(state.list),
          filters: state.list.filters.filter((_, i) => i !== action.index),
        },
        previousCursors: [],
      }
    case 'search':
      if (action.search === state.list.search) return state
      return { list: { ...firstPage(state.list), search: action.search }, previousCursors: [] }
    case 'pageSize': {
      const size = clampPageSize(action.size)
      if (size === state.list.pageSize) return state
      return { list: { ...firstPage(state.list), pageSize: size }, previousCursors: [] }
    }
    case 'next':
      return {
        list: { ...state.list, cursor: action.cursor },
        previousCursors: [...state.previousCursors, state.list.cursor],
      }
    case 'previous': {
      // A page opened by link has a cursor but no history: "Previous" goes back to page 1.
      if (state.previousCursors.length === 0)
        return state.list.cursor === undefined
          ? state
          : { list: firstPage(state.list), previousCursors: [] }
      const previous = state.previousCursors[state.previousCursors.length - 1]
      const base = firstPage(state.list)
      return {
        list: previous === undefined ? base : { ...base, cursor: previous },
        previousCursors: state.previousCursors.slice(0, -1),
      }
    }
    case 'reset':
      return { list: action.list, previousCursors: [] }
  }
}
