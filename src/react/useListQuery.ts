/**
 * `useListQuery`: list state for a resource page (chips, sort, search, cursor pagination), exposed
 * as a typed {@link ListQuery} plus a URL search string.
 *
 * Router-agnostic: pass `initialSearch` from the router and persist `searchString` back however the
 * router likes. The state logic itself is the pure `listReducer` from core.
 *
 * @module
 */
import type { ListQuery, ResourceDescriptor, SortDirective } from '@strutvane/contracts'
import { useCallback, useMemo, useReducer } from 'react'
import type { SimpleFilter } from '../core/filter-builder.ts'
import { parseSearchString, type RejectedParam, toSearchString } from '../core/list-query-url.ts'
import {
  clampPageSize,
  type ListPageState,
  type ListState,
  listReducer,
  toListQuery,
} from '../core/list-state.ts'

/** Result of {@link useListQuery}. */
export interface UseListQueryResult {
  readonly state: ListState
  readonly listQuery: ListQuery
  readonly searchString: string
  /** URL parameters dropped at mount (unknown field, operator not allowed, bad value…). */
  readonly rejected: readonly RejectedParam[]
  readonly hasPrevious: boolean
  readonly setSort: (sort: readonly SortDirective[]) => void
  readonly addFilter: (filter: SimpleFilter) => void
  readonly removeFilter: (index: number) => void
  readonly setSearch: (search: string) => void
  readonly setPageSize: (size: number) => void
  readonly nextPage: (cursor: string) => void
  readonly previousPage: () => void
}

/** Options for {@link useListQuery}. */
export interface UseListQueryOptions {
  /** Page size when the URL does not set `page[size]` (clamped to the protocol maximum). */
  readonly pageSize?: number
}

/** List state for `resource`, initialised from a URL query string. */
export function useListQuery(
  resource: ResourceDescriptor,
  initialSearch = '',
  options: UseListQueryOptions = {},
): UseListQueryResult {
  // The URL is read once at mount; afterwards this hook owns the state and reports it back.
  const initial = useMemo(
    () => parseSearchString(initialSearch, resource),
    [initialSearch, resource],
  )
  const [state, dispatch] = useReducer(listReducer, undefined, (): ListPageState => {
    const urlHasSize = new URLSearchParams(initialSearch).has('page[size]')
    const pageSize =
      urlHasSize || options.pageSize === undefined
        ? initial.state.pageSize
        : clampPageSize(options.pageSize)
    return { list: { ...initial.state, pageSize }, previousCursors: [] }
  })
  const listQuery = useMemo(() => toListQuery(state.list), [state.list])
  const searchString = useMemo(() => toSearchString(state.list), [state.list])
  return {
    state: state.list,
    listQuery,
    searchString,
    rejected: initial.rejected,
    hasPrevious: state.previousCursors.length > 0,
    setSort: useCallback((sort: readonly SortDirective[]) => dispatch({ type: 'sort', sort }), []),
    addFilter: useCallback((filter: SimpleFilter) => dispatch({ type: 'addFilter', filter }), []),
    removeFilter: useCallback((index: number) => dispatch({ type: 'removeFilter', index }), []),
    setSearch: useCallback((search: string) => dispatch({ type: 'search', search }), []),
    setPageSize: useCallback((size: number) => dispatch({ type: 'pageSize', size }), []),
    nextPage: useCallback((cursor: string) => dispatch({ type: 'next', cursor }), []),
    previousPage: useCallback(() => dispatch({ type: 'previous' }), []),
  }
}
