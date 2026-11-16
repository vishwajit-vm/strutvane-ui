/**
 * `useListQuery`: list state for a resource page (chips, sort, search, numbered pages), exposed
 * as a typed {@link ListQuery} plus a URL search string.
 *
 * Router-agnostic: pass `initialSearch` from the router and persist `searchString` back however the
 * router likes (the URL is the list's memory: Back, deep links and reloads restore it). The state
 * logic itself is the pure `listReducer` from core.
 *
 * Page sizes are clamped to the resource's `maxPerPage` (manifest), so the list never asks for
 * more rows than the server allows.
 *
 * @module
 */
import type { ListQuery, ResourceDescriptor, SortDirective } from '@strutvane/framework/contracts'
import { useCallback, useMemo, useReducer, useState } from 'react'
import type { SimpleFilter } from '../core/filter-builder.ts'
import { parseSearchString, type RejectedParam, toSearchString } from '../core/list-query-url.ts'
import { clampPageSize, type ListState, listReducer, toListQuery } from '../core/list-state.ts'
import { maxPerPage } from '../core/resource-extensions.ts'

/** Result of {@link useListQuery}. */
export interface UseListQueryResult {
  readonly state: ListState
  readonly listQuery: ListQuery
  readonly searchString: string
  /** URL parameters dropped at mount (unknown field, operator not allowed, bad value…). */
  readonly rejected: readonly RejectedParam[]
  /** Increases each time the state was reset from a new URL (inputs mirroring it resync then). */
  readonly generation: number
  readonly setSort: (sort: readonly SortDirective[]) => void
  readonly addFilter: (filter: SimpleFilter) => void
  readonly removeFilter: (index: number) => void
  /** Remove every filter and the search text. */
  readonly clearFilters: () => void
  readonly setSearch: (search: string) => void
  readonly setPageSize: (size: number) => void
  readonly setPage: (page: number) => void
}

/** Options for {@link useListQuery}. */
export interface UseListQueryOptions {
  /** Page size when the URL does not set `page[size]` (clamped to the limits). Default 25. */
  readonly pageSize?: number
}

/** List state for `resource`, initialised from a URL query string. */
export function useListQuery(
  resource: ResourceDescriptor,
  initialSearch = '',
  options: UseListQueryOptions = {},
): UseListQueryResult {
  const limit = maxPerPage(resource)
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
      urlHasSize || options.pageSize === undefined ? parsed.state.pageSize : options.pageSize
    return { ...parsed.state, pageSize: clampPageSize(pageSize, limit) }
  }
  const [state, dispatch] = useReducer(listReducer, undefined, () =>
    fromUrl(initial, initialSearch),
  )
  const [seenSearch, setSeenSearch] = useState(initialSearch)
  const [generation, setGeneration] = useState(0)
  if (seenSearch !== initialSearch) {
    // Derived-state pattern: adjust during render, no effect round trip and no flash.
    setSeenSearch(initialSearch)
    const next = fromUrl(initial, initialSearch)
    if (toSearchString(next) !== toSearchString(state)) {
      dispatch({ type: 'reset', list: next })
      setGeneration((g) => g + 1)
    }
  }
  const listQuery = useMemo(() => toListQuery(state, limit), [state, limit])
  const searchString = useMemo(() => toSearchString(state), [state])
  return {
    state,
    listQuery,
    searchString,
    rejected: initial.rejected,
    generation,
    setSort: useCallback((sort: readonly SortDirective[]) => dispatch({ type: 'sort', sort }), []),
    addFilter: useCallback((filter: SimpleFilter) => dispatch({ type: 'addFilter', filter }), []),
    removeFilter: useCallback((index: number) => dispatch({ type: 'removeFilter', index }), []),
    clearFilters: useCallback(() => dispatch({ type: 'clearFilters' }), []),
    setSearch: useCallback((search: string) => dispatch({ type: 'search', search }), []),
    setPageSize: useCallback(
      (size: number) =>
        dispatch({ type: 'pageSize', size, ...(limit !== undefined ? { maxPerPage: limit } : {}) }),
      [limit],
    ),
    setPage: useCallback((page: number) => dispatch({ type: 'page', page }), []),
  }
}
