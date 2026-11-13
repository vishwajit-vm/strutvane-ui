/**
 * Data hooks for relation fields (belongsTo picker and cell).
 *
 * - {@link useRelationOptions}: a searchable, cursor-paginated option list for the picker. It loads
 *   100 records per page (the protocol maximum) and fetches more on demand, so a target with
 *   thousands of records is fully reachable (ADR-0014 follow-up: "beyond the first 100").
 * - {@link useRelationLabel}: the title of ONE related record, through a per-resource batcher, so a
 *   list of 100 rows costs one request per page of distinct ids, not one per row.
 *
 * @module
 */
import type { FieldDescriptor, ListQuery, ResourceDescriptor } from '@strutvane/contracts'
import { LIST_QUERY_LIMITS } from '@strutvane/contracts'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { createRecordBatcher, type RecordBatcher } from '../core/record-batcher.ts'
import type { ApiRecord, ResourceApi } from '../core/types.ts'
import { useResource, useStrutvane } from './context.ts'

/** One option of a relation picker. */
export interface RelationOption {
  readonly value: string
  readonly label: string
}

/** The display title of a record of `resource` (falls back to the id). */
export function recordTitle(resource: ResourceDescriptor | undefined, record: ApiRecord): string {
  const title = resource ? record[resource.titleField] : undefined
  return typeof title === 'string' || typeof title === 'number' ? String(title) : record.id
}

/** The related id stored in a relation value: a plain id, or an embedded record (`include`). */
export function relationId(value: unknown): string | undefined {
  if (typeof value === 'string' && value !== '') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'object' && value !== null && 'id' in value)
    return relationId((value as { id: unknown }).id)
  return undefined
}

/** A value that updates `delay` ms after the input stops changing (search-as-you-type). */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** Result of {@link useRelationOptions}. */
export interface RelationOptionsResult {
  readonly target: ResourceDescriptor | undefined
  readonly options: readonly RelationOption[]
  readonly isLoading: boolean
  readonly isError: boolean
  readonly hasMore: boolean
  readonly isLoadingMore: boolean
  readonly loadMore: () => void
  /** Whether the target has searchable fields (else the search box is hidden). */
  readonly searchable: boolean
}

const EMPTY: readonly RelationOption[] = []

/** Searchable, paginated options for a relation field's target resource. */
export function useRelationOptions(field: FieldDescriptor, search: string): RelationOptionsResult {
  const { api } = useStrutvane()
  const target = useResource(field.relation?.target)
  const searchable = target?.fields.some((f) => f.searchable) === true
  const text = searchable ? search.trim() : ''
  const titleField = target?.fields.find((f) => f.name === target.titleField)
  const query = useInfiniteQuery({
    queryKey: ['strutvane', 'relation-options', target?.path, text],
    enabled: target !== undefined,
    staleTime: 60_000,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      if (!target) return { data: [], meta: { page: { size: 0, hasMore: false } } }
      const listQuery: ListQuery = {
        ...(text ? { search: text } : {}),
        // Only sort when the server allows it; an unsortable sort would be rejected.
        ...(titleField?.sortable
          ? { sort: [{ field: titleField.name, direction: 'asc' as const }] }
          : {}),
        page: {
          kind: 'cursor',
          size: LIST_QUERY_LIMITS.maxPageSize,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      }
      return api.list(target.path, listQuery, signal)
    },
    getNextPageParam: (last) => (last.meta.page.hasMore ? last.meta.page.nextCursor : undefined),
  })
  const options = useMemo(() => {
    if (!query.data) return EMPTY
    const seen = new Set<string>()
    const out: RelationOption[] = []
    for (const page of query.data.pages) {
      for (const record of page.data) {
        if (seen.has(record.id)) continue // a record can move between pages while paginating
        seen.add(record.id)
        out.push({ value: record.id, label: recordTitle(target, record) })
      }
    }
    return out
  }, [query.data, target])
  const { fetchNextPage } = query
  return {
    target,
    options,
    isLoading: query.isLoading,
    isError: query.isError,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => void fetchNextPage(),
    searchable,
  }
}

const batchers = new WeakMap<ResourceApi, Map<string, RecordBatcher>>()

function batcherFor(api: ResourceApi, resource: ResourceDescriptor): RecordBatcher {
  let perApi = batchers.get(api)
  if (!perApi) {
    perApi = new Map()
    batchers.set(api, perApi)
  }
  let batcher = perApi.get(resource.path)
  if (!batcher) {
    batcher = createRecordBatcher(api, resource)
    perApi.set(resource.path, batcher)
  }
  return batcher
}

/**
 * The title of the record a relation value points to. An embedded record is used directly; a bare
 * id is looked up (batched, cached). Returns `undefined` while loading or when it cannot be found.
 */
export function useRelationLabel(field: FieldDescriptor, value: unknown): string | undefined {
  const { api } = useStrutvane()
  const target = useResource(field.relation?.target)
  const id = relationId(value)
  const embedded = typeof value === 'object' && value !== null ? (value as ApiRecord) : undefined
  const query = useQuery({
    queryKey: ['strutvane', 'relation-label', target?.path, id],
    enabled: target !== undefined && id !== undefined && embedded === undefined,
    staleTime: 60_000,
    queryFn: async () => {
      if (!target || id === undefined) return null
      return (await batcherFor(api, target).load(id)) ?? null
    },
  })
  if (embedded && id !== undefined) return recordTitle(target, { ...embedded, id })
  return query.data ? recordTitle(target, query.data) : undefined
}
