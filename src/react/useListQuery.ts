/**
 * `useListQuery`: list state for a resource page (chips, sort, search, cursor pagination), exposed
 * as a typed {@link ListQuery} plus a URL search string.
 *
 * Router-agnostic: pass `initialSearch` from the router and persist `searchString` back however the
 * router likes. The state logic itself is the pure `listReducer` from core.
 *
 * @module
 */
import type { ListQuery, ResourceDescriptor, SortDirective } from '@strutvane/framework/contracts'
import { useCallback, useMemo, useReducer, useState } from 'react'
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
  /** Increases each time the state was reset from a new URL (inputs mirroring it resync then). */
  readonly generation: number
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
  // This hook owns the state and reports it back as `searchString`. When the router hands in a
  // DIFFERENT URL than the one reported (a menu link to this list, Back/Forward), the state is reset
  // to that URL; the URL it reported itself comes back unchanged and changes nothing.
  const initial = useMemo(
    () => parseSearchString(initialSearch, resource),
    [initialSearch, resource],
  )
  const fromUrl = (parsed: typeof initial, search: string): ListState => {
    const urlHasSize = new URLSearchParams(search).has('page[size]')
    const pageSize =
      urlHasSize || options.pageSize === undefined
        ? parsed.state.pageSize
        : clampPageSize(options.pageSize)
    return { ...parsed.state, pageSize }
  }
  const [state, dispatch] = useReducer(
    listReducer,
    undefined,
    (): ListPageState => ({ list: fromUrl(initial, initialSearch), previousCursors: [] }),
  )
  const [seenSearch, setSeenSearch] = useState(initialSearch)
  const [generation, setGeneration] = useState(0)
  if (seenSearch !== initialSearch) {
    // Derived-state pattern: adjust during render, no effect round trip and no flash.
    setSeenSearch(initialSearch)
    const next = fromUrl(initial, initialSearch)
    if (toSearchString(next) !== toSearchString(state.list)) {
      dispatch({ type: 'reset', list: next })
      setGeneration((g) => g + 1)
    }
  }
  const listQuery = useMemo(() => toListQuery(state.list), [state.list])
  const searchString = useMemo(() => toSearchString(state.list), [state.list])
  return {
    state: state.list,
    listQuery,
    searchString,
    rejected: initial.rejected,
    generation,
    hasPrevious: state.previousCursors.length > 0 || state.list.cursor !== undefined,
    setSort: useCallback((sort: readonly SortDirective[]) => dispatch({ type: 'sort', sort }), []),
    addFilter: useCallback((filter: SimpleFilter) => dispatch({ type: 'addFilter', filter }), []),
    removeFilter: useCallback((index: number) => dispatch({ type: 'removeFilter', index }), []),
    setSearch: useCallback((search: string) => dispatch({ type: 'search', search }), []),
    setPageSize: useCallback((size: number) => dispatch({ type: 'pageSize', size }), []),
    nextPage: useCallback((cursor: string) => dispatch({ type: 'next', cursor }), []),
    previousPage: useCallback(() => dispatch({ type: 'previous' }), []),
  }
}
