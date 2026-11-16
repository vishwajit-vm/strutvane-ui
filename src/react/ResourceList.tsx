/**
 * `<ResourceList>`: the list page for one resource, built entirely from its descriptor and drawn
 * through the design's slots.
 *
 * Columns (`ui.listColumns`, else sensible defaults) feed TanStack Table v9, which supplies ONLY the
 * header/cell model and the sort state. Filtering, search, sorting and pagination all run on the
 * server (`manualSorting`, ADR-0014) through `useListQuery` → `ListQuery` → `api.list`.
 *
 * - **Pages:** numbered, 25 rows by default (choices 10/25/50/100, never above the resource's
 *   `maxPerPage`), with "Showing 26–50 of 312 posts". The page, size, sort, search and filters
 *   live in the URL, so Back, reloads and shared links restore the exact view.
 * - **Sorting:** the first click is always ascending (`sortDescFirst: false`); TanStack otherwise
 *   starts numeric columns descending (spike 08 defect).
 * - **Filter chips:** the search text and every filter show as removable chips, plus Clear all.
 * - **Preferences:** a Columns menu (the title column always stays) and a compact-rows toggle,
 *   remembered per viewer and resource; storage failures just mean "not remembered".
 * - **Delete:** the shared flow (confirm, type-to-confirm for permanent deletes, Undo).
 * - **Capabilities:** New / Edit / Delete appear only when the manifest allows them (the API still
 *   enforces every rule).
 * - **Accessibility:** a real `<table>` with caption, `scope="col"`, sortable headers as buttons with
 *   `aria-sort`, a labelled pagination nav, and a polite live region announcing result counts.
 * - **Performance:** above `virtualizeThreshold` rows only the visible window is rendered, with
 *   spacer rows and `aria-rowcount` / `aria-rowindex`; a container that cannot be measured still
 *   shows the first rows (fail-safe window, spike 08 defect).
 *
 * @module
 */
import type {
  FieldDescriptor,
  ResourceDescriptor,
  SortDirective,
} from '@strutvane/framework/contracts'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
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
import { MAX_SEARCH_LENGTH } from '../core/list-query-url.ts'
import { MAX_PAGE, pageSizeChoices, pageWindow } from '../core/list-state.ts'
import { isApiProblemError, problemBannerText } from '../core/problems.ts'
import { resolveCell } from '../core/registry.ts'
import { maxPerPage } from '../core/resource-extensions.ts'
import type { ApiRecord } from '../core/types.ts'
import { COLLECTION_RELATION_TYPES } from '../core/validation.ts'
import { loadViewPrefs, saveViewPrefs, type ViewPrefs } from '../core/view-prefs.ts'
import { CellFallback } from './cells.tsx'
import { useStrutvane } from './context.ts'
import { useIllustrations, useSkins } from './design-hooks.ts'
import { describeFilter, FilterBar } from './FilterBar.tsx'
import { type Crumb, PageHeading } from './PageHeading.tsx'
import { RenderBoundary } from './RenderBoundary.tsx'
import { recordTitle, useDebouncedValue } from './relations.ts'
import { useDeleteRecord } from './useDeleteRecord.tsx'
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
/** Totals at or above this are the server's cap ("more than 10,000", blueprint §5). */
export const TOTAL_CAP = 10_000

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
  /** Shows an Open button per row (when the actor may view). */
  readonly onView?: (record: ApiRecord) => void
  /** Shows an Edit button per row (when the actor may update). */
  readonly onEdit?: (record: ApiRecord) => void
  /** Shows a Delete button per row (when the actor may delete). */
  readonly deletable?: boolean
  /** Called after a record was deleted. */
  readonly onDeleted?: (record: ApiRecord) => void
  /** Render only visible rows above this many rows. Default 100. */
  readonly virtualizeThreshold?: number
  /** Page size when the URL does not set one (clamped to the limits). Default 25. */
  readonly pageSize?: number
  /** Extra toolbar content (L2 slot: `<resource>.list.toolbar`). */
  readonly toolbar?: ReactNode
  /** Breadcrumbs of the page heading (the app shell passes Home › Posts). */
  readonly breadcrumbs?: readonly Crumb[]
  /**
   * Inside another page (a detail page's related list): no page heading, labelled by
   * `embeddedLabel`, and no remembered preferences.
   */
  readonly embedded?: boolean
  readonly embeddedLabel?: string
}

/** The list page for one resource. */
export function ResourceList({
  resource,
  initialSearch = '',
  onSearchStringChange,
  onCreate,
  onView,
  onEdit,
  deletable = false,
  onDeleted,
  virtualizeThreshold = 100,
  pageSize,
  toolbar,
  breadcrumbs,
  embedded = false,
  embeddedLabel,
}: ResourceListProps): ReactElement {
  const { api, registry, t, locale, onUnauthenticated } = useStrutvane()
  const { Button, Input, Select, Table, Skeleton, Alert, Chip } = useSkins()
  const { Empty } = useIllustrations()
  const ids = useId()
  const titleId = `${ids}-title`
  const list = useListQuery(resource, initialSearch, pageSize === undefined ? {} : { pageSize })
  const { setSort, setSearch } = list
  const resourceText = resource.pluralLabel.toLowerCase()
  const removal = useDeleteRecord(resource, onDeleted)

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
  const clearAll = () => {
    setSearchText('')
    list.clearFilters()
  }

  // Per-viewer preferences: hidden columns and density (not for embedded lists).
  const [prefs, setPrefs] = useState<ViewPrefs>(() =>
    embedded ? { hidden: [], density: 'default' } : loadViewPrefs(resource.path),
  )
  const updatePrefs = (next: ViewPrefs) => {
    setPrefs(next)
    if (!embedded) saveViewPrefs(resource.path, next)
  }

  const query = useQuery({
    queryKey: ['strutvane', 'list', resource.path, list.listQuery],
    queryFn: ({ signal }) => api.list(resource.path, list.listQuery, signal),
    placeholderData: keepPreviousData,
    enabled: resource.capabilities.list,
  })
  const unauthenticated = isApiProblemError(query.error) && query.error.problem.status === 401
  useEffect(() => {
    if (unauthenticated) onUnauthenticated?.()
  }, [unauthenticated, onUnauthenticated])

  const allFields = useMemo(() => listFields(resource), [resource])
  const titleField = resource.titleField
  const hiddenKey = prefs.hidden.join('\u0000')
  // Memoised on the hidden names' CONTENT: a new array every render would give the table new
  // cell components and remount every cell (spike 14 finding 13, the third time this bit).
  const hidden = useMemo(
    () => new Set(hiddenKey === '' ? [] : hiddenKey.split('\u0000')),
    [hiddenKey],
  )
  const fields = useMemo(
    () => allFields.filter((f) => f.name === titleField || !hidden.has(f.name)),
    [allFields, hidden, titleField],
  )
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

  const caps = resource.capabilities
  const canView = caps.view && onView !== undefined
  const canEdit = caps.update && onEdit !== undefined
  const canDelete = caps.delete && deletable
  const hasActions = canView || canEdit || canDelete
  const hasSearch = resource.fields.some((f) => f.searchable)
  const colSpan = fields.length + (hasActions ? 1 : 0)
  const pageInfo = query.data?.meta.page
  const page = list.state.page
  const size = list.state.pageSize
  const total = pageInfo?.total
  const lastPage =
    total === undefined ? undefined : Math.min(MAX_PAGE, Math.max(1, Math.ceil(total / size)))
  const hasNext = lastPage === undefined ? pageInfo?.hasMore === true : page < lastPage
  const from = rows.length === 0 ? 0 : (page - 1) * size + 1
  const to = (page - 1) * size + rows.length
  const filtersActive = list.state.filters.length > 0 || list.state.search !== ''
  const loadError = query.error
    ? isApiProblemError(query.error)
      ? problemBannerText(query.error.problem, registry.messages, locale)
      : t('ui.list.loadFailed')
    : null

  const status = query.isLoading
    ? t('ui.list.loading', { resource: resourceText })
    : rows.length === 0
      ? t('ui.list.showing', { count: 0, resource: resourceText })
      : total === undefined
        ? t('ui.list.showingRangeOpen', { from, to, resource: resourceText })
        : total >= TOTAL_CAP
          ? t('ui.list.showingRangeCapped', { from, to, total: TOTAL_CAP, resource: resourceText })
          : t('ui.list.showingRange', { from, to, total, resource: resourceText })

  const label = embedded ? (embeddedLabel ?? resource.pluralLabel) : resource.pluralLabel
  const newButton =
    caps.create && onCreate ? (
      <Button variant="primary" icon="plus" data-sv-shortcut="new" onClick={onCreate}>
        {t('ui.list.new', { resource: resource.label.toLowerCase() })}
      </Button>
    ) : null

  return (
    <section
      {...(embedded ? { 'aria-label': label } : { 'aria-labelledby': titleId })}
      data-sv-part="list"
    >
      {embedded ? null : (
        <PageHeading
          title={resource.pluralLabel}
          titleId={titleId}
          {...(breadcrumbs ? { breadcrumbs } : {})}
          actions={newButton}
        />
      )}

      <div data-sv-part="toolbar">
        {hasSearch && (
          <div>
            <label htmlFor={`${ids}-search`}>
              {t('ui.list.search', { resource: resource.pluralLabel })}
            </label>
            <Input
              id={`${ids}-search`}
              type="search"
              maxLength={MAX_SEARCH_LENGTH}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        )}
        {embedded ? newButton : null}
        {embedded ? null : (
          <ColumnsMenu
            menuId={`${ids}-columns`}
            fields={allFields}
            titleField={titleField}
            hidden={hidden}
            onToggle={(name) =>
              updatePrefs({
                ...prefs,
                hidden: hidden.has(name)
                  ? prefs.hidden.filter((h) => h !== name)
                  : [...prefs.hidden, name],
              })
            }
          />
        )}
        {embedded ? null : (
          <Button
            aria-pressed={prefs.density === 'compact'}
            onClick={() =>
              updatePrefs({
                ...prefs,
                density: prefs.density === 'compact' ? 'default' : 'compact',
              })
            }
          >
            {t('ui.list.compact')}
          </Button>
        )}
        {toolbar}
      </div>

      <FilterBar
        resource={resource}
        filters={list.state.filters}
        onAdd={list.addFilter}
        onRemove={list.removeFilter}
        showChips={false}
      />

      {filtersActive && (
        <div data-sv-part="chips">
          <ul aria-label={t('ui.filter.active')} data-sv-part="chip-list">
            {list.state.search !== '' && (
              <li>
                <Chip
                  remove={
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('ui.list.removeSearch', { text: list.state.search })}
                      onClick={() => {
                        setSearchText('')
                        setSearch('')
                      }}
                    >
                      ×
                    </Button>
                  }
                >
                  {t('ui.list.searchChip', { text: list.state.search })}
                </Chip>
              </li>
            )}
            {list.state.filters.map((f, i) => {
              const text = describeFilter(
                f,
                resource.fields.find((x) => x.name === f.field),
                t,
              )
              return (
                <li key={`${f.field}-${f.op}`}>
                  <Chip
                    remove={
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('ui.filter.remove', { filter: text })}
                        onClick={() => list.removeFilter(i)}
                      >
                        ×
                      </Button>
                    }
                  >
                    {text}
                  </Chip>
                </li>
              )
            })}
          </ul>
          <Button size="sm" variant="ghost" onClick={clearAll}>
            {t('ui.list.clearAll')}
          </Button>
        </div>
      )}

      {(loadError ?? removal.error) && (
        <Alert tone="danger" role="alert">
          {loadError ?? removal.error}
        </Alert>
      )}
      <p role="status" aria-live="polite">
        {status}
      </p>

      {query.isLoading ? (
        <div aria-busy="true">
          <Skeleton lines={5} />
        </div>
      ) : !loadError && rows.length === 0 ? (
        <div data-sv-part="empty">
          <Empty />
          <p>
            {filtersActive
              ? t('ui.list.empty', { resource: resourceText })
              : t('ui.list.emptyNoFilters', { resource: resourceText })}
          </p>
          {filtersActive ? <Button onClick={clearAll}>{t('ui.list.clearAll')}</Button> : newButton}
        </div>
      ) : rows.length === 0 ? null : (
        <Table
          density={prefs.density}
          regionProps={{
            ref: scrollRef,
            // A scrollable region must be reachable by keyboard (axe: scrollable-region-focusable).
            tabIndex: 0,
            role: 'region',
            // Not the same name as the page's own region: landmarks must be told apart.
            'aria-label': t('ui.list.tableRegion', { resource: label }),
          }}
          tableProps={{
            'aria-rowcount': virtualize ? rows.length + 1 : undefined,
            'aria-busy': query.isFetching || undefined,
          }}
        >
          <caption>{label}</caption>
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
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t('ui.list.view', { title })}
                          onClick={() => onView?.(row.original)}
                        >
                          {t('ui.list.viewShort')}
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t('ui.list.edit', { title })}
                          onClick={() => onEdit?.(row.original)}
                        >
                          {t('ui.list.editShort')}
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t('ui.list.delete', { title })}
                          disabled={removal.busyId === row.id}
                          onClick={() => removal.request(row.original)}
                        >
                          {t('ui.list.deleteShort')}
                        </Button>
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
          </tbody>
        </Table>
      )}

      <nav
        aria-label={t('ui.list.pagination', { resource: resource.pluralLabel })}
        data-sv-part="pagination"
      >
        <Button size="sm" disabled={page <= 1} onClick={() => list.setPage(page - 1)}>
          {t('ui.list.previous')}
        </Button>
        {lastPage !== undefined &&
          lastPage > 1 &&
          pageWindow(page, lastPage).map((p, i) =>
            p === 'gap' ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: gaps have no identity of their own.
              <span key={`gap-${i}`} aria-hidden="true">
                …
              </span>
            ) : (
              <Button
                key={p}
                size="sm"
                aria-label={t('ui.list.page', { page: p })}
                aria-current={p === page ? 'page' : undefined}
                onClick={() => list.setPage(p)}
              >
                {p}
              </Button>
            ),
          )}
        <Button size="sm" disabled={!hasNext} onClick={() => list.setPage(page + 1)}>
          {t('ui.list.next')}
        </Button>
        {embedded ? null : (
          <span>
            <label htmlFor={`${ids}-size`}>{t('ui.list.pageSize')}</label>{' '}
            <Select
              id={`${ids}-size`}
              value={String(size)}
              onChange={(e) => list.setPageSize(Number(e.target.value))}
            >
              {pageSizeChoices(maxPerPage(resource)).map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </Select>
          </span>
        )}
      </nav>
      {removal.dialog}
    </section>
  )
}

/** The Columns menu: a toggle button and a popover of checkboxes (the title column stays). */
function ColumnsMenu(props: {
  readonly menuId: string
  readonly fields: readonly FieldDescriptor[]
  readonly titleField: string
  readonly hidden: ReadonlySet<string>
  readonly onToggle: (name: string) => void
}): ReactElement | null {
  const { t } = useStrutvane()
  const { Button, Popover, Checkbox } = useSkins()
  const [open, setOpen] = useState(false)
  if (props.fields.length < 2) return null
  const close = (key: string) => {
    if (key === 'Escape') setOpen(false)
  }
  return (
    <div data-sv-part="menu-anchor">
      <Button
        aria-expanded={open}
        aria-controls={open ? props.menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => close(e.key)}
      >
        {t('ui.list.columns')}
      </Button>
      {open ? (
        <Popover
          panelProps={{
            id: props.menuId,
            role: 'group',
            'aria-label': t('ui.list.columns'),
            onKeyDown: (e) => close(e.key),
          }}
        >
          {props.fields.map((field) => (
            <div key={field.name}>
              <Checkbox
                id={`${props.menuId}-${field.name}`}
                checked={!props.hidden.has(field.name)}
                disabled={field.name === props.titleField}
                onChange={() => props.onToggle(field.name)}
              />{' '}
              <label htmlFor={`${props.menuId}-${field.name}`}>{field.label}</label>
            </div>
          ))}
        </Popover>
      ) : null}
    </div>
  )
}
