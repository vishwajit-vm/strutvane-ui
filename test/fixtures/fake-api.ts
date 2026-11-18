/**
 * In-memory ResourceApi that behaves like a Strutvane server for UI tests:
 * - list: filter (two-valued null-safe semantics, ADR-0008), search, sort (stable, id tiebreak),
 *   numbered pages with a total (cursor pages still work; page size capped at
 *   LIST_QUERY_LIMITS.maxPageSize);
 * - create/update: server-side validation with the SAME catalog as the client, plus server-only
 *   rules (unique fields, a cross-field date rule), returning problems with `issues`;
 * - delete and restore (deleted rows are kept for `restore`); `failNext()` simulates non-validation failures (409, 500, …);
 * - `requests` / `mutations` record what the UI asked for, so tests can assert it.
 */
import {
  LIST_QUERY_LIMITS,
  type ListQuery,
  type ListResult,
  type Problem,
  type QueryFilter,
  type ResourceDescriptor,
  type ResourceManifest,
  type ValidationIssue,
} from '@strutvane/framework/contracts'
import { defaultMessages, formatMessage } from '../../src/core/messages.ts'
import { ApiProblemError } from '../../src/core/problems.ts'
import type { ApiRecord, MutationOptions, ResourceApi } from '../../src/core/types.ts'
import { validateArrayItems, validateField } from '../../src/core/validation.ts'

export type Row = Record<string, unknown> & { id: string }

export interface MutationLog {
  readonly method: 'create' | 'update' | 'delete' | 'restore'
  readonly path: string
  readonly id?: string
  readonly idempotencyKey: string | undefined
}

export class FakeApi implements ResourceApi {
  readonly requests: { path: string; query: ListQuery }[] = []
  readonly gets: { path: string; id: string }[] = []
  readonly mutations: MutationLog[] = []
  private readonly tables = new Map<string, Row[]>()
  private readonly resources: Map<string, ResourceDescriptor>
  private readonly failures: (Problem | Error)[] = []
  private readonly trash = new Map<string, Row>()
  private seq = 0

  constructor(manifest: ResourceManifest, seed: Record<string, Row[]> = {}) {
    this.resources = new Map(manifest.resources.map((r) => [r.path, r]))
    for (const r of manifest.resources) this.tables.set(r.path, [...(seed[r.path] ?? [])])
  }

  /** Make the next mutation fail with this problem (or throw this raw error). */
  failNext(failure: Problem | Error): void {
    this.failures.push(failure)
  }

  rows(path: string): readonly Row[] {
    return this.table(path)
  }

  async list(path: string, query: ListQuery): Promise<ListResult<ApiRecord>> {
    this.requests.push({ path, query })
    const r = this.resource(path)
    let rows = [...this.table(path)]
    if (query.filter) rows = rows.filter((row) => matches(query.filter as QueryFilter, row))
    if (query.search) {
      const needle = query.search.toLowerCase()
      const searchable = r.fields.filter((f) => f.searchable).map((f) => f.name)
      rows = rows.filter((row) =>
        searchable.some((n) =>
          String(row[n] ?? '')
            .toLowerCase()
            .includes(needle),
        ),
      )
    }
    rows.sort(compareBy(query.sort ?? []))
    const size = Math.min(
      query.page?.size ?? LIST_QUERY_LIMITS.defaultPageSize,
      LIST_QUERY_LIMITS.maxPageSize,
    )
    if (query.page?.kind === 'offset') {
      const offset = (query.page.number - 1) * size
      const data = rows.slice(offset, offset + size)
      return {
        data,
        meta: {
          page: {
            size,
            number: query.page.number,
            hasMore: offset + size < rows.length,
            total: rows.length,
          },
        },
      }
    }
    const offset =
      query.page?.kind === 'cursor' && query.page.cursor ? decodeCursor(query.page.cursor) : 0
    const data = rows.slice(offset, offset + size)
    const hasMore = offset + size < rows.length
    return {
      data,
      meta: {
        page: { size, hasMore, ...(hasMore ? { nextCursor: encodeCursor(offset + size) } : {}) },
      },
    }
  }

  async get(path: string, id: string): Promise<ApiRecord> {
    this.gets.push({ path, id })
    const row = this.table(path).find((r) => r.id === id)
    if (!row) {
      throw new ApiProblemError(
        problem(404, 'not_found', 'Not found', 'This record no longer exists.'),
      )
    }
    return row
  }

  async create(
    path: string,
    values: Readonly<Record<string, unknown>>,
    options?: MutationOptions,
  ): Promise<ApiRecord> {
    this.mutations.push({ method: 'create', path, idempotencyKey: options?.idempotencyKey })
    this.throwIfFailing()
    const r = this.resource(path)
    this.validateOrThrow(r, values, undefined)
    const row: Row = {
      ...values,
      id: `${path}-${++this.seq}`,
      createdAt: '2026-11-13T10:00:00.000Z',
    }
    this.table(path).push(row)
    return row
  }

  async update(
    path: string,
    id: string,
    values: Readonly<Record<string, unknown>>,
    options?: MutationOptions,
  ): Promise<ApiRecord> {
    this.mutations.push({ method: 'update', path, id, idempotencyKey: options?.idempotencyKey })
    this.throwIfFailing()
    const r = this.resource(path)
    const table = this.table(path)
    const index = table.findIndex((row) => row.id === id)
    const current = table[index]
    if (index < 0 || !current) {
      throw new ApiProblemError(
        problem(404, 'not_found', 'Not found', 'This record no longer exists.'),
      )
    }
    const merged = { ...current, ...values }
    this.validateOrThrow(r, merged, id)
    const updated: Row = { ...merged, id }
    table[index] = updated
    return updated
  }

  async delete(path: string, id: string, options?: MutationOptions): Promise<void> {
    this.mutations.push({ method: 'delete', path, id, idempotencyKey: options?.idempotencyKey })
    this.throwIfFailing()
    const table = this.table(path)
    const index = table.findIndex((row) => row.id === id)
    if (index < 0) {
      throw new ApiProblemError(
        problem(404, 'not_found', 'Not found', 'This record no longer exists.'),
      )
    }
    const [removed] = table.splice(index, 1)
    if (removed) this.trash.set(`${path}/${id}`, removed)
  }

  async restore(path: string, id: string, options?: MutationOptions): Promise<ApiRecord> {
    this.mutations.push({ method: 'restore', path, id, idempotencyKey: options?.idempotencyKey })
    this.throwIfFailing()
    const row = this.trash.get(`${path}/${id}`)
    if (!row) {
      throw new ApiProblemError(
        problem(404, 'not_found', 'Not found', 'This record no longer exists.'),
      )
    }
    this.trash.delete(`${path}/${id}`)
    this.table(path).push(row)
    return row
  }

  // ── internals ────────────────────────────────────────────────────────────────────────────────

  private validateOrThrow(
    r: ResourceDescriptor,
    values: Readonly<Record<string, unknown>>,
    id: string | undefined,
  ): void {
    const issues: ValidationIssue[] = []
    for (const f of r.fields) {
      if (f.readOnly || f.type === 'id') continue
      issues.push(...validateField(f, values[f.name], defaultMessages))
      if (f.type === 'array') issues.push(...validateArrayItems(f, values[f.name], defaultMessages))
    }
    for (const f of r.fields.filter((x) => x.unique)) {
      const v = values[f.name]
      if (v !== undefined && this.table(r.path).some((row) => row.id !== id && row[f.name] === v)) {
        issues.push({
          path: [f.name],
          field: f.name,
          code: 'unique',
          message: formatMessage(defaultMessages, 'unique', { attribute: f.label.toLowerCase() }),
        })
      }
    }
    const due = values['dueDate']
    const issued = values['issueDate']
    if (
      r.name === 'Invoice' &&
      typeof due === 'string' &&
      typeof issued === 'string' &&
      due < issued
    ) {
      issues.push({
        path: ['dueDate'],
        field: 'dueDate',
        code: 'date_before_field',
        params: { other: 'Issue date' },
        message: formatMessage(defaultMessages, 'date_before_field', {
          attribute: 'Due date',
          other: 'Issue date',
        }),
      })
    }
    if (issues.length > 0) {
      throw new ApiProblemError({
        ...problem(422, 'validation_failed', 'Validation failed'),
        issues,
      })
    }
  }

  private throwIfFailing(): void {
    const failure = this.failures.shift()
    if (failure instanceof Error) throw failure
    if (failure) throw new ApiProblemError(failure)
  }

  private resource(path: string): ResourceDescriptor {
    const r = this.resources.get(path)
    if (!r) throw new ApiProblemError(problem(404, 'not_found', 'Not found'))
    return r
  }

  private table(path: string): Row[] {
    const t = this.tables.get(path)
    if (!t) throw new ApiProblemError(problem(404, 'not_found', 'Not found'))
    return t
  }
}

export function problem(status: number, code: string, title: string, detail?: string): Problem {
  return {
    type: `https://strutvane.dev/errors/${code.toLowerCase()}`,
    title,
    status,
    code,
    traceId: 'trace-0001',
    ...(detail ? { detail } : {}),
  }
}

// ── filtering (two-valued, null-safe: ADR-0008) ────────────────────────────────────────────────

const isNullish = (v: unknown): v is null | undefined => v === null || v === undefined
const scalar = (v: unknown): string | number | boolean | undefined =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : undefined

export function matches(f: QueryFilter, row: Row): boolean {
  switch (f.op) {
    case 'true':
      return true
    case 'false':
      return false
    case 'and':
      return f.filters.every((x) => matches(x, row))
    case 'or':
      return f.filters.some((x) => matches(x, row))
    case 'not':
      return !matches(f.filter, row)
    case 'isNull':
      return isNullish(row[f.field])
    case 'isNotNull':
      return !isNullish(row[f.field])
    case 'eq': {
      const v = row[f.field]
      return !isNullish(v) && v === f.value
    }
    case 'ne': {
      const v = row[f.field]
      return !(!isNullish(v) && v === f.value)
    }
    case 'in': {
      const v = row[f.field]
      return !isNullish(v) && f.values.some((x) => x === v)
    }
    case 'nin': {
      const v = row[f.field]
      return !(!isNullish(v) && f.values.some((x) => x === v))
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const v = scalar(row[f.field])
      const x = scalar(f.value)
      if (v === undefined || x === undefined) return false
      return f.op === 'gt' ? v > x : f.op === 'gte' ? v >= x : f.op === 'lt' ? v < x : v <= x
    }
    case 'between': {
      const v = scalar(row[f.field])
      const a = scalar(f.from)
      const b = scalar(f.to)
      return v !== undefined && a !== undefined && b !== undefined && v >= a && v <= b
    }
    case 'contains':
    case 'startsWith':
    case 'endsWith': {
      const v = row[f.field]
      if (typeof v !== 'string') return false
      const hay = f.caseSensitive ? v : v.toLowerCase()
      const needle = f.caseSensitive ? f.value : f.value.toLowerCase()
      return f.op === 'contains'
        ? hay.includes(needle)
        : f.op === 'startsWith'
          ? hay.startsWith(needle)
          : hay.endsWith(needle)
    }
  }
}

function compareBy(sort: readonly { field: string; direction: 'asc' | 'desc' }[]) {
  return (a: Row, b: Row): number => {
    for (const s of sort) {
      const av = scalar(a[s.field])
      const bv = scalar(b[s.field])
      if (av === bv) continue
      if (av === undefined) return 1 // nulls last regardless of direction
      if (bv === undefined) return -1
      const cmp = av < bv ? -1 : 1
      return s.direction === 'asc' ? cmp : -cmp
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0 // stable tiebreak
  }
}

function encodeCursor(offset: number): string {
  return btoa(JSON.stringify({ o: offset }))
}
function decodeCursor(cursor: string): number {
  try {
    const o = (JSON.parse(atob(cursor)) as { o?: unknown }).o
    return typeof o === 'number' && Number.isInteger(o) && o >= 0 ? o : 0
  } catch {
    return 0
  }
}
