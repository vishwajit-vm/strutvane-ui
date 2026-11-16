/**
 * The ONE place a user-entered filter becomes a typed filter.
 *
 * URL parsing, the filter bar and programmatic filters all go through {@link buildFilter}, so they
 * apply identical rules and the UI can never send a filter the server would reject (ADR-0011,
 * ADR-0014). It fails closed: a field the descriptor does not mark filterable, an operator not in
 * the field's `filterOperators`, or a value that does not fit the field's type is refused with a
 * reason, never "fixed".
 *
 * Value rules mirror the server's list-query parser (spike 05) and the policy semantics (ADR-0008):
 * - numbers must be finite (whole numbers for integer fields), booleans are `true`/`false`;
 * - exact numbers (`decimal`, `money`, `bigInteger`) stay TEXT (`"12345678901234567.89"`):
 *   they travel as strings on the wire, and a JavaScript number would silently round them, so the
 *   server would filter on a different value than the one typed (or reject `1e+21`);
 * - datetimes are ISO-8601 with an explicit offset (`2026-11-14T09:00:00Z`), like the server,
 *   because a zone-less instant means a different moment in every time zone;
 * - text lengths are counted in UTF-16 code units, exactly as the server counts them;
 * - ordering operators (`gt`, `gte`, `lt`, `lte`, `between`) only on numeric or temporal fields;
 * - text operators take 1–200 characters (UTF-16 code units); NUL characters are refused everywhere;
 * - `in` / `nin` take 1–100 values, `between` exactly two.
 *
 * @module
 */
import {
  FILTER_OPERATORS,
  type FieldDescriptor,
  type FilterOperator,
  type QueryFilter,
} from '@strutvane/framework/contracts'
import { isIsoDate, NUMERIC_TYPES, TEMPORAL_TYPES } from './validation.ts'

/** A scalar filter value. */
export type FilterValue = string | number | boolean

/** One UI filter chip: `field op value(s)`. The URL and chips only express an AND of these. */
export type SimpleFilter =
  | {
      readonly field: string
      readonly op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
      readonly value: FilterValue
    }
  | { readonly field: string; readonly op: 'in' | 'nin'; readonly values: readonly FilterValue[] }
  | { readonly field: string; readonly op: 'isNull' | 'isNotNull' }
  | {
      readonly field: string
      readonly op: 'contains' | 'startsWith' | 'endsWith'
      readonly value: string
    }
  | {
      readonly field: string
      readonly op: 'between'
      readonly from: FilterValue
      readonly to: FilterValue
    }

/** Why a filter was refused. Stable codes, rendered by the UI. */
export type FilterRejection =
  | 'operator_not_allowed'
  | 'operator_not_supported_for_type'
  | 'invalid_value'
  | 'wrong_value_count'

/** Result of building a filter. */
export type BuildResult =
  | { readonly ok: true; readonly filter: SimpleFilter }
  | { readonly ok: false; readonly reason: FilterRejection }

/** Field names usable in `filter[<field>][<op>]` (identifier characters only). */
export const FIELD_NAME_PATTERN: RegExp = /^[A-Za-z][A-Za-z0-9_]*$/

/** Operators that order values: only meaningful on numeric or temporal fields (ADR-0008). */
const ORDERING: ReadonlySet<FilterOperator> = new Set(['gt', 'gte', 'lt', 'lte', 'between'])
const TEXT_OPS: ReadonlySet<FilterOperator> = new Set(['contains', 'startsWith', 'endsWith'])
const MAX_TEXT_LENGTH = 200
/** Numeric types exchanged as exact text (decimals and 64-bit integers): never parsed to a number. */
const EXACT_NUMBER_TYPES: ReadonlySet<string> = new Set(['decimal', 'money', 'bigInteger'])
const EXACT_DECIMAL = /^-?\d+(\.\d+)?$/
const EXACT_INTEGER = /^-?\d+$/
/** ISO-8601 instant with an explicit offset (the server's datetime filter format). */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}(:?\d{2})?)$/
const INSTANT_TYPES: ReadonlySet<string> = new Set(['datetime', 'timestamp'])
const MAX_SET_SIZE = 100

/** Convert one raw string to the field's type, or `undefined` if it does not fit. */
export function coerceFilterValue(field: FieldDescriptor, raw: string): FilterValue | undefined {
  if (raw.includes('\u0000')) return undefined
  if (EXACT_NUMBER_TYPES.has(field.type)) {
    const text = raw.trim()
    return (field.type === 'bigInteger' ? EXACT_INTEGER : EXACT_DECIMAL).test(text)
      ? text
      : undefined
  }
  if (NUMERIC_TYPES.has(field.type)) {
    if (raw.trim() === '') return undefined
    const n = Number(raw)
    if (!Number.isFinite(n)) return undefined
    if ((field.type === 'integer' || field.type === 'bigInteger') && !Number.isInteger(n))
      return undefined
    return n
  }
  if (field.type === 'boolean') return raw === 'true' ? true : raw === 'false' ? false : undefined
  if (field.type === 'date') return isIsoDate(raw) ? raw : undefined
  if (INSTANT_TYPES.has(field.type))
    return ISO_INSTANT.test(raw) && Number.isFinite(Date.parse(raw)) ? raw : undefined
  if (TEMPORAL_TYPES.has(field.type))
    return raw !== '' && Number.isFinite(Date.parse(raw)) ? raw : undefined
  if (field.type === 'enum' || field.type === 'set') {
    return field.enumValues === undefined || field.enumValues.includes(raw) ? raw : undefined
  }
  return raw === '' ? undefined : raw
}

/**
 * Build a validated filter from raw string values.
 * `values` holds one string per value: `['draft', 'sent']` for `in`, `['10', '99']` for `between`,
 * `['true']` for `isNull` / `isNotNull`.
 */
export function buildFilter(
  field: FieldDescriptor,
  op: FilterOperator,
  values: readonly string[],
): BuildResult {
  const fail = (reason: FilterRejection): BuildResult => ({ ok: false, reason })
  if (!FIELD_NAME_PATTERN.test(field.name) || !field.filterOperators.includes(op)) {
    return fail('operator_not_allowed')
  }
  if (ORDERING.has(op) && !NUMERIC_TYPES.has(field.type) && !TEMPORAL_TYPES.has(field.type)) {
    return fail('operator_not_supported_for_type')
  }
  const name = field.name
  switch (op) {
    case 'isNull':
    case 'isNotNull':
      return values.length === 1 && values[0] === 'true'
        ? { ok: true, filter: { field: name, op } }
        : fail('invalid_value')
    case 'contains':
    case 'startsWith':
    case 'endsWith': {
      const [value] = values
      if (values.length !== 1 || value === undefined) return fail('wrong_value_count')
      // UTF-16 length, like the server: an emoji counts twice there, so it must here too.
      if (value === '' || value.length > MAX_TEXT_LENGTH || value.includes('\u0000')) {
        return fail('invalid_value')
      }
      return { ok: true, filter: { field: name, op, value } }
    }
    case 'in':
    case 'nin': {
      if (values.length < 1 || values.length > MAX_SET_SIZE) return fail('wrong_value_count')
      const coerced = values.map((v) => coerceFilterValue(field, v))
      if (coerced.some((v) => v === undefined)) return fail('invalid_value')
      return { ok: true, filter: { field: name, op, values: coerced as FilterValue[] } }
    }
    case 'between': {
      if (values.length !== 2) return fail('wrong_value_count')
      const from = coerceFilterValue(field, values[0] ?? '')
      const to = coerceFilterValue(field, values[1] ?? '')
      if (from === undefined || to === undefined) return fail('invalid_value')
      return { ok: true, filter: { field: name, op, from, to } }
    }
    default: {
      const [raw] = values
      if (values.length !== 1 || raw === undefined) return fail('wrong_value_count')
      const value = coerceFilterValue(field, raw)
      return value === undefined
        ? fail('invalid_value')
        : { ok: true, filter: { field: name, op, value } }
    }
  }
}

/** Every operator name the protocol knows (used to validate untrusted input such as URLs). */
export function isFilterOperator(op: string): op is FilterOperator {
  return KNOWN_OPERATORS.has(op)
}

const KNOWN_OPERATORS: ReadonlySet<string> = new Set<string>(FILTER_OPERATORS)

/** Is this a text operator (value matched literally as text)? */
export function isTextOperator(op: FilterOperator): boolean {
  return TEXT_OPS.has(op)
}

/** The raw string values that rebuild `filter` through {@link buildFilter} (URL and chip input). */
export function filterToRawValues(filter: SimpleFilter): string[] {
  switch (filter.op) {
    case 'isNull':
    case 'isNotNull':
      return ['true']
    case 'in':
    case 'nin':
      return filter.values.map(String)
    case 'between':
      return [String(filter.from), String(filter.to)]
    default:
      return [String(filter.value)]
  }
}

/** A chip as a {@link QueryFilter} node. */
export function simpleFilterToQueryFilter(f: SimpleFilter): QueryFilter {
  switch (f.op) {
    case 'in':
    case 'nin':
      return { op: f.op, field: f.field, values: f.values }
    case 'isNull':
    case 'isNotNull':
      return { op: f.op, field: f.field }
    case 'between':
      return { op: 'between', field: f.field, from: f.from, to: f.to }
    case 'contains':
    case 'startsWith':
    case 'endsWith':
      return { op: f.op, field: f.field, value: f.value }
    default:
      return { op: f.op, field: f.field, value: f.value }
  }
}

/** All chips combined (AND), or `undefined` when there are none. */
export function filtersToQueryFilter(filters: readonly SimpleFilter[]): QueryFilter | undefined {
  if (filters.length === 0) return undefined
  if (filters.length === 1 && filters[0]) return simpleFilterToQueryFilter(filters[0])
  return { op: 'and', filters: filters.map(simpleFilterToQueryFilter) }
}
