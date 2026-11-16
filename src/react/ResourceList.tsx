/**
 * `<ResourceList>`: the list page for one resource, built entirely from its descriptor.
 *
 * Columns (`ui.listColumns`, else sensible defaults) feed TanStack Table v9, which supplies ONLY the
 * header/cell model and the sort state. Filtering, search, sorting and cursor pagination all run on
 * the server (`manualSorting`, ADR-0014) through `useListQuery` → `ListQuery` → `api.list`.
 *
 * - **Sorting:** the first click is always ascending (`sortDescFirst: false`); TanStack otherwise
 *   starts numeric columns descending (spike 08 defect).
 * - **Capabilities:** New / Edit / Delete appear only when the manifest allows them for this actor
 *   (the API still enforces every rule).
 * - **Accessibility:** a real `<table>` with caption, `scope="col"`, sortable headers as buttons with
 *   `aria-sort`, a labelled pagination nav, and a polite live region announcing result counts.
 * - **Performance:** above `virtualizeThreshold` rows only the visible window is rendered, with
 *   spacer rows and `aria-rowcount` / `aria-rowindex`. A container that cannot be measured still
 *   shows the first rows (fail-safe window, spike 08 defect: never an empty table when data exists).
 *
 * @module
 */
import type {
  FieldDescriptor,
  ResourceDescriptor,
  SortDirective,
} from '@strutvane/framework/contracts'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type ColumnDef,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  type Updater,
  useTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createIdempotencyKey } from '../core/ids.ts'
import { MAX_SEARCH_LENGTH } from '../core/list-query-url.ts'
import { isApiProblemError, problemBannerText } from '../core/problems.ts'
import { resolveCell } from '../core/registry.ts'
import type { ApiRecord } from '../core/types.ts'
import { COLLECTION_RELATION_TYPES } from '../core/validation.ts'
import { CellFallback } from './cells.tsx'
import { useStrutvane } from './context.ts'
import { FilterBar } from './FilterBar.tsx'
import { RenderBoundary } from './RenderBoundary.tsx'
import { recordTitle, useDebouncedValue } from './relations.ts'
import { useListQuery } from './useListQuery.ts'

const features = tableFeatures({ rowSortingFeature })
const EMPTY_ROWS: ApiRecord[] = []
/** Field types not shown as list columns by default (long, structured or secret). */
const NOT_LISTED: ReadonlySet<string> = new Set([
  'id',
  'array',
  'text',
  'json',
  'password',
  'richText',
  'markdown',
])
const DEFAULT_COLUMNS = 6
/** Row height used for virtualization estimates and spacer rows (px). */
export const ROW_HEIGHT = 40
/** Viewport assumed when the scroll container cannot be measured (px). */
const FALLBACK_VIEWPORT = 600
const OVERSCAN = 10
const SEARCH_DEBOUNCE_MS = 300

/** Columns shown for a resource: explicit `ui.listColumns`, else up to 6 simple fields. */
export function listFields(resource: ResourceDescriptor): FieldDescriptor[] {
  const byName = new Map(resource.fields.map((f) => [f.name, f]))
  const explicit = resource.ui?.listColumns
  if (explicit)
    return explicit.map((n) => byName.get(n)).filter((f): f is FieldDescriptor => f !== undefined)
  return resource.fields
    .filter((f) => !NOT_LISTED.has(f.type) && !COLLECTION_RELATION_TYPES.has(f.type))
    .slice(0, DEFAULT_COLUMNS)
}

const toSorting = (sort: readonly SortDirective[]): SortingState =>
  sort.map((s) => ({ id: s.field, desc: s.direction === 'desc' }))
const fromSorting = (sorting: SortingState): SortDirective[] =>
  sorting.map((s) => ({ field: s.id, direction: s.desc ? 'desc' : 'asc' }))

/** The window of rows to render; falls back to the first rows when nothing was measured. */
export function virtualWindow(
  measured: readonly { index: number; start: number; end: number }[],
  rowCount: number,
): { index: number; start: number; end: number }[] {
  if (measured.length > 0 || rowCount === 0) return [...measured]
  const count = Math.min(Math.ceil(FALLBACK_VIEWPORT / ROW_HEIGHT) + OVERSCAN, rowCount)
  return Array.from({ length: count }, (_, index) => ({
    index,
    start: index * ROW_HEIGHT,
    end: (index + 1) * ROW_HEIGHT,
  }))
}

/** Props of {@link ResourceList}. */
export interface ResourceListProps {
  readonly resource: ResourceDescriptor
  /** Initial URL query string (from the router), e.g. `filter[status][eq]=paid&sort=-amount`. */
  readonly initialSearch?: string
  /** Called with the new query string whenever the list state changes (persist it in the URL). */
  readonly onSearchStringChange?: (search: string) => void
  /** Shows "New …" (when the actor may create). */
  readonly onCreate?: () => void
  /** Shows a View button per row that opens the record (when the actor may view). */
  readonly onView?: (record: ApiRecord) => void
  /** Shows an Edit button per row (when the actor may update). */
  readonly onEdit?: (record: ApiRecord) => void
  /**
   * Ask the user before deleting. A Delete button is shown per row only when this is provided AND
   * the actor may delete. Return `true` to delete.
   */
  readonly confirmDelete?: (record: ApiRecord) => boolean | Promise<boolean>
  /** Called after a record was deleted. */
  readonly onDeleted?: (record: ApiRecord) => void
  /** Render only visible rows above this many rows. Default 100. */
  readonly virtualizeThreshold?: number
  /** Page size when the URL does not set one (clamped to the protocol maximum). */
  readonly pageSize?: number
  /** Extra toolbar content (L2 slot: `<resource>.list.toolbar`). */
  readonly toolbar?: ReactNode
}

/** The list page for one resource. */
export function ResourceList({
  resource,
  initialSearch = '',
  onSearchStringChange,
  onCreate,
  onView,
  onEdit,
  confirmDelete,
  onDeleted,
  virtualizeThreshold = 100,
  pageSize,
  toolbar,
}: ResourceListProps): ReactElement {
  const { api, registry, t, locale } = useStrutvane()
  const queryClient = useQueryClient()
  const ids = useId()
  const list = useListQuery(resource, initialSearch, pageSize === undefined ? {} : { pageSize })
  const { setSort, setSearch } = list
  const resourceText = resource.pluralLabel.toLowerCase()

  // Report only real state changes: an inline callback (a new function every render) must not
  // re-fire the effect, or a parent that re-renders on the callback (a router) would loop.
  const reportSearch = useRef(onSearchStringChange)
  reportSearch.current = onSearchStringChange
  useEffect(() => {
    reportSearch.current?.(list.searchString)
  }, [list.searchString])

  // Search box: debounced so typing "acme" sends one request, not four.
  const [searchText, setSearchText] = useState(list.state.search)
  const debouncedSearch = useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS)
  // The URL was replaced from outside: the search box shows the new URL's text.
  const [seenGeneration, setSeenGeneration] = useState(list.generation)
  if (seenGeneration !== list.generation) {
    setSeenGeneration(list.generation)
    setSearchText(list.state.search)
  }
  useEffect(() => setSearch(debouncedSearch), [debouncedSearch, setSearch])

  const query = useQuery({
    queryKey: ['strutvane', 'list', resource.path, list.listQuery],
    queryFn: ({ signal }) => api.list(resource.path, list.listQuery, signal),
    placeholderData: keepPreviousData,
    enabled: resource.capabilities.list,
  })

  const fields = useMemo(() => listFields(resource), [resource])
  const columns = useMemo<ColumnDef<typeof features, ApiRecord>[]>(
    () =>
      fields.map((field) => {
        const CellComponent = resolveCell(registry, resource, field)
        return {
          id: field.name,
          accessorFn: (row: ApiRecord) => row[field.name],
          header: field.label,
          enableSorting: field.sortable,
          // One crashing cell (an override, an unexpected value) must not blank the whole list.
          cell: (ctx) => (
            <RenderBoundary fallback={<CellFallback />} resetKey={ctx.row.original[field.name]}>
              <CellComponent
                field={field}
                value={ctx.row.original[field.name]}
                record={ctx.row.original}
                resource={resource}
              />
            </RenderBoundary>
          ),
        }
      }),
    [fields, registry, resource],
  )

  const sorting = useMemo(() => toSorting(list.state.sort), [list.state.sort])
  const table = useTable({
    features,
    columns,
    data: (query.data?.data as ApiRecord[] | undefined) ?? EMPTY_ROWS,
    getRowId: (row) => row.id,
    state: { sorting },
    onSortingChange: (updater: Updater<SortingState>) => {
      setSort(fromSorting(typeof updater === 'function' ? updater(sorting) : updater))
    },
    manualSorting: true,
    enableMultiSort: false,
    // TanStack picks the first direction from the data (numbers start DESC). A generated UI must
    // behave the same on every column: the first click is always ascending.
    sortDescFirst: false,
  })

  const rows = table.getRowModel().rows
  const virtualize = rows.length > virtualizeThreshold
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: virtualize ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    // Layout-free environments (tests, SSR) report no element size; assume a typical viewport.
    initialRect: { width: 1024, height: FALLBACK_VIEWPORT },
  })
  const windowItems = virtualize ? virtualWindow(virtualizer.getVirtualItems(), rows.length) : []
  const visible = virtualize
    ? windowItems.map((v) => ({ row: rows[v.index], index: v.index }))
    : rows.map((row, index) => ({ row, index }))
  const padTop = virtualize ? (windowItems[0]?.start ?? 0) : 0
  const padBottom = virtualize
    ? Math.max(0, rows.length * ROW_HEIGHT - (windowItems.at(-1)?.end ?? 0))
    : 0

  // Delete: one idempotency key per record until the delete succeeds, so a retry is safe.
  const deleteKeys = useRef(new Map<string, string>())
  const [deleting, setDeleting] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const handleDelete = async (record: ApiRecord) => {
    if (!confirmDelete || !(await confirmDelete(record))) return
    const key = deleteKeys.current.get(record.id) ?? createIdempotencyKey()
    deleteKeys.current.set(record.id, key)
    setDeleting(record.id)
    setActionError(null)
    try {
      await api.delete(resource.path, record.id, { idempotencyKey: key })
      deleteKeys.current.delete(record.id)
      queryClient.removeQueries({ queryKey: ['strutvane', 'record', resource.path, record.id] })
      await queryClient.invalidateQueries({ queryKey: ['strutvane', 'list', resource.path] })
      onDeleted?.(record)
    } catch (error) {
      const title = recordTitle(resource, record)
      setActionError(
        isApiProblemError(error)
          ? `${t('ui.list.deleteFailed', { title })} ${problemBannerText(error.problem, registry.messages, locale)}`
          : t('ui.list.deleteFailed', { title }),
      )
    } finally {
      setDeleting(null)
    }
  }

  const caps = resource.capabilities
  const canView = caps.view && onView !== undefined
  const canEdit = caps.update && onEdit !== undefined
  const canDelete = caps.delete && confirmDelete !== undefined
  const hasActions = canView || canEdit || canDelete
  const hasSearch = resource.fields.some((f) => f.searchable)
  const colSpan = fields.length + (hasActions ? 1 : 0)
  const pageInfo = query.data?.meta.page
  const loadError = query.error
    ? isApiProblemError(query.error)
      ? problemBannerText(query.error.problem, registry.messages, locale)
      : t('ui.list.loadFailed')
    : null

  return (
    <section aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`}>{resource.pluralLabel}</h2>

      <div>
        {hasSearch && (
          <>
            <label htmlFor={`${ids}-search`}>
              {t('ui.list.search', { resource: resource.pluralLabel })}
            </label>
            <input
              id={`${ids}-search`}
              type="search"
              maxLength={MAX_SEARCH_LENGTH}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </>
        )}
        {caps.create && onCreate && (
          <button type="button" onClick={onCreate}>
            {t('ui.list.new', { resource: resource.label.toLowerCase() })}
          </button>
        )}
        {toolbar}
      </div>

      <FilterBar
        resource={resource}
        filters={list.state.filters}
        onAdd={list.addFilter}
        onRemove={list.removeFilter}
      />

      {(loadError ?? actionError) && <p role="alert">{loadError ?? actionError}</p>}
      <p role="status" aria-live="polite">
        {query.isLoading
          ? t('ui.list.loading', { resource: resourceText })
          : t('ui.list.showing', { count: rows.length, resource: resourceText })}
      </p>

      <div
        ref={scrollRef}
        style={virtualize ? { maxHeight: FALLBACK_VIEWPORT, overflowY: 'auto' } : undefined}
        // A scrollable region must be reachable by keyboard (axe: scrollable-region-focusable).
        {...(virtualize ? { tabIndex: 0, role: 'region', 'aria-label': resource.pluralLabel } : {})}
      >
        <table
          aria-rowcount={virtualize ? rows.length + 1 : undefined}
          aria-busy={query.isFetching || undefined}
        >
          <caption>{resource.pluralLabel}</caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} aria-rowindex={virtualize ? 1 : undefined}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  const canSort = header.column.getCanSort()
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        canSort
                          ? sorted === 'asc'
                            ? 'ascending'
                            : sorted === 'desc'
                              ? 'descending'
                              : 'none'
                          : undefined
                      }
                    >
                      {canSort ? (
                        <button type="button" onClick={header.column.getToggleSortingHandler()}>
                          <table.FlexRender header={header} />
                          <span aria-hidden="true">
                            {sorted === 'asc' ? ' ▲' : sorted === 'desc' ? ' ▼' : ''}
                          </span>
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  )
                })}
                {hasActions && <th scope="col">{t('ui.list.actions')}</th>}
              </tr>
            ))}
          </thead>
          <tbody>
            {padTop > 0 && (
              // biome-ignore lint/a11y/noAriaHiddenOnFocusable: an empty spacer row is not focusable; it only reserves scroll height.
              <tr aria-hidden="true" data-sv-spacer="">
                <td colSpan={colSpan} style={{ height: padTop, padding: 0 }} />
              </tr>
            )}
            {visible.map(({ row, index }) => {
              if (!row) return null
              const title = recordTitle(resource, row.original)
              return (
                <tr
                  key={row.id}
                  aria-rowindex={virtualize ? index + 2 : undefined}
                  style={virtualize ? { height: ROW_HEIGHT } : undefined}
                >
                  {row.getAllCells().map((cell) => (
                    <td key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                  {hasActions && (
                    <td>
                      {canView && (
                        <button
                          type="button"
                          aria-label={t('ui.list.view', { title })}
                          onClick={() => onView?.(row.original)}
                        >
                          {t('ui.list.viewShort')}
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          aria-label={t('ui.list.edit', { title })}
                          onClick={() => onEdit?.(row.original)}
                        >
                          {t('ui.list.editShort')}
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          aria-label={t('ui.list.delete', { title })}
                          disabled={deleting === row.id}
                          onClick={() => void handleDelete(row.original)}
                        >
                          {t('ui.list.deleteShort')}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
            {padBottom > 0 && (
              // biome-ignore lint/a11y/noAriaHiddenOnFocusable: an empty spacer row is not focusable; it only reserves scroll height.
              <tr aria-hidden="true" data-sv-spacer="">
                <td colSpan={colSpan} style={{ height: padBottom, padding: 0 }} />
              </tr>
            )}
            {!query.isLoading && !loadError && rows.length === 0 && (
              <tr>
                <td colSpan={colSpan}>{t('ui.list.empty', { resource: resourceText })}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <nav aria-label={t('ui.list.pagination', { resource: resource.pluralLabel })}>
        <button type="button" disabled={!list.hasPrevious} onClick={list.previousPage}>
          {t('ui.list.previous')}
        </button>
        <button
          type="button"
          disabled={!pageInfo?.hasMore || !pageInfo.nextCursor}
          onClick={() => {
            if (pageInfo?.nextCursor) list.nextPage(pageInfo.nextCursor)
          }}
        >
          {t('ui.list.next')}
        </button>
      </nav>
    </section>
  )
}
