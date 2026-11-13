/**
 * List state ⇄ URL query string, using the shared REST wire format (ADR-0011, spike 05):
 *
 *   filter[status][in]=draft&filter[status][in]=sent&filter[amount][gte]=100
 *   &sort=-dueDate,number&page[size]=50&page[cursor]=abc&search=acme
 *
 * - Multi-value operators (`in`, `nin`, `between`) REPEAT the key instead of joining with commas,
 *   so values containing commas, brackets, `&`, `=` or any Unicode round-trip exactly.
 * - `isNull` / `isNotNull` take the value `true`. `sort` is comma-joined (field names never contain
 *   commas, see {@link FIELD_NAME_PATTERN}); a leading `-` means descending.
 * - Pure functions with no router dependency: TanStack Router, React Router or Next can all call
 *   them. The URL only expresses an AND of simple chips; complex trees go through `POST /query`.
 * - Fail closed: every filter is rebuilt through the ONE filter builder ({@link buildFilter}), so a
 *   field that is not filterable, an operator the field does not allow, a bad value, an unsortable
 *   sort field or an unknown parameter is dropped AND reported, never sent to the server.
 *
 * @module
 */
import {
  LIST_QUERY_LIMITS,
  type ListQuery,
  type QueryFilter,
  type ResourceDescriptor,
  type SortDirective,
} from '@strutvane/contracts'
import {
  buildFilter,
  FIELD_NAME_PATTERN,
  type FilterRejection,
  filterToRawValues,
  isFilterOperator,
  type SimpleFilter,
} from './filter-builder.ts'
import { clampPageSize, type ListState } from './list-state.ts'

/** Why a URL parameter was dropped. */
export type UrlRejection =
  | FilterRejection
  | 'unknown_field'
  | 'not_sortable'
  | 'unknown_parameter'
  | 'duplicate_parameter'
  | 'unsupported_parameter'

/** A dropped URL parameter and why (for dev tools and logs; never silently "fixed"). */
export interface RejectedParam {
  readonly key: string
  readonly reason: UrlRejection
}

/** Result of parsing a query string. */
export interface ParsedSearch {
  readonly state: ListState
  readonly rejected: readonly RejectedParam[]
}

const FILTER_KEY = /^filter\[([^\]]*)\]\[([^\]]*)\]$/
const SINGLE_KEYS: ReadonlySet<string> = new Set(['search', 'sort', 'page[size]', 'page[cursor]'])

/** Serialize list state to a query string (without the leading `?`). Deterministic order. */
export function toSearchString(state: ListState): string {
  const out = new URLSearchParams()
  for (const f of state.filters) {
    const key = `filter[${f.field}][${f.op}]`
    for (const value of filterToRawValues(f)) out.append(key, value)
  }
  const search = state.search.trim()
  if (search) out.append('search', search)
  if (state.sort.length > 0) {
    out.append(
      'sort',
      state.sort.map((s) => `${s.direction === 'desc' ? '-' : ''}${s.field}`).join(','),
    )
  }
  const size = clampPageSize(state.pageSize)
  if (size !== LIST_QUERY_LIMITS.defaultPageSize) out.append('page[size]', String(size))
  if (state.cursor) out.append('page[cursor]', state.cursor)
  return out.toString()
}

/**
 * Parse a query string into list state for `resource`. Returns the state plus every parameter that
 * was rejected. Never throws, whatever the input.
 */
export function parseSearchString(search: string, resource: ResourceDescriptor): ParsedSearch {
  const fields = new Map(resource.fields.map((f) => [f.name, f]))
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const filters: SimpleFilter[] = []
  const rejected: RejectedParam[] = []
  const reject = (key: string, reason: UrlRejection) => rejected.push({ key, reason })
  let sort: SortDirective[] = []
  let searchText = ''
  let pageSize: number = LIST_QUERY_LIMITS.defaultPageSize
  let cursor: string | undefined

  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    const match = FILTER_KEY.exec(key)
    if (match) {
      const [, name = '', op = ''] = match
      const field = FIELD_NAME_PATTERN.test(name) ? fields.get(name) : undefined
      if (!field) {
        reject(key, 'unknown_field')
        continue
      }
      if (!isFilterOperator(op)) {
        reject(key, 'operator_not_allowed')
        continue
      }
      const built = buildFilter(field, op, values)
      if (built.ok) filters.push(built.filter)
      else reject(key, built.reason)
      continue
    }
    if (!SINGLE_KEYS.has(key)) {
      // `page[number]` is valid on the wire, but these lists paginate by cursor.
      reject(key, key === 'page[number]' ? 'unsupported_parameter' : 'unknown_parameter')
      continue
    }
    if (values.length > 1) reject(key, 'duplicate_parameter') // the first value wins
    const value = values[0] ?? ''
    if (key === 'search') searchText = value
    else if (key === 'page[cursor]') cursor = value || undefined
    else if (key === 'page[size]') {
      const n = Number(value)
      pageSize = clampPageSize(n)
      if (value === '' || pageSize !== n) reject(key, 'invalid_value')
    } else {
      sort = []
      for (const token of value.split(',')) {
        if (token === '') continue
        const desc = token.startsWith('-')
        const name = desc ? token.slice(1) : token
        if (fields.get(name)?.sortable) sort.push({ field: name, direction: desc ? 'desc' : 'asc' })
        else reject(`sort:${token}`, 'not_sortable')
      }
    }
  }
  return {
    state: { filters, sort, search: searchText, pageSize, ...(cursor ? { cursor } : {}) },
    rejected,
  }
}

// ─── ListQuery → wire (HTTP client) ──────────────────────────────────────────────────────────────

function isScalar(v: unknown): v is string | number | boolean {
  return (
    typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))
  )
}

/** Flatten a filter into AND-ed leaves, or `undefined` if it needs the JSON body (`or`, `not`, …). */
function flatLeaves(filter: QueryFilter): QueryFilter[] | undefined {
  if (filter.op === 'and') {
    const out: QueryFilter[] = []
    for (const f of filter.filters) {
      const leaves = flatLeaves(f)
      if (!leaves) return undefined
      out.push(...leaves)
    }
    return out
  }
  if (filter.op === 'or' || filter.op === 'not' || filter.op === 'true' || filter.op === 'false')
    return undefined
  return [filter]
}

/** The raw wire values of one leaf, or `undefined` if the URL cannot express it. */
function leafValues(f: QueryFilter): string[] | undefined {
  switch (f.op) {
    case 'isNull':
    case 'isNotNull':
      return ['true']
    case 'in':
    case 'nin':
      return f.values.length > 0 && f.values.every(isScalar) ? f.values.map(String) : undefined
    case 'between':
      return isScalar(f.from) && isScalar(f.to) ? [String(f.from), String(f.to)] : undefined
    case 'contains':
    case 'startsWith':
    case 'endsWith':
      return f.caseSensitive === undefined ? [f.value] : undefined
    case 'eq':
    case 'ne':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return isScalar(f.value) ? [String(f.value)] : undefined
    default:
      return undefined
  }
}

/**
 * Serialize a typed {@link ListQuery} to the GET query string, or `undefined` when the query cannot
 * be expressed in the URL (an `or` / `not` tree, actor references, `caseSensitive`, two filters on
 * the same field and operator, `include` / `fields`). The HTTP client then sends it as the JSON body
 * of `POST {path}/query` instead (ADR-0011).
 */
export function listQueryToSearchString(query: ListQuery): string | undefined {
  if (query.include !== undefined || query.fields !== undefined) return undefined
  const out = new URLSearchParams()
  if (query.filter) {
    const leaves = flatLeaves(query.filter)
    if (!leaves) return undefined
    const seen = new Set<string>()
    for (const leaf of leaves) {
      if (!('field' in leaf) || !FIELD_NAME_PATTERN.test(leaf.field)) return undefined
      const key = `filter[${leaf.field}][${leaf.op}]`
      const values = leafValues(leaf)
      if (!values || seen.has(key)) return undefined
      seen.add(key)
      for (const v of values) out.append(key, v)
    }
  }
  if (query.search) out.append('search', query.search)
  if (query.sort && query.sort.length > 0) {
    if (!query.sort.every((s) => FIELD_NAME_PATTERN.test(s.field))) return undefined
    out.append(
      'sort',
      query.sort.map((s) => `${s.direction === 'desc' ? '-' : ''}${s.field}`).join(','),
    )
  }
  if (query.page) {
    out.append('page[size]', String(clampPageSize(query.page.size)))
    if (query.page.kind === 'cursor' && query.page.cursor)
      out.append('page[cursor]', query.page.cursor)
    if (query.page.kind === 'offset') out.append('page[number]', String(query.page.number))
  }
  return out.toString()
}
