// The ONE filter builder: rejects fields and operators the descriptor does not allow, and values
// that do not fit the field's type. URL parsing and the filter bar both depend on these rules.
import type { FieldDescriptor } from '@strutvane/contracts'
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import {
  buildFilter,
  coerceFilterValue,
  filtersToQueryFilter,
  filterToRawValues,
  isFilterOperator,
  isTextOperator,
  simpleFilterToQueryFilter,
} from '../../src/core/filter-builder.ts'
import { field, invoiceResource } from '../fixtures/manifest.ts'

const f = (name: string): FieldDescriptor => {
  const found = invoiceResource.fields.find((x) => x.name === name)
  if (!found) throw new Error(name)
  return found
}

describe('buildFilter rejects what the descriptor does not allow', () => {
  test('an operator not in filterOperators', () => {
    expect(buildFilter(f('status'), 'gt', ['a'])).toEqual({
      ok: false,
      reason: 'operator_not_allowed',
    })
    expect(buildFilter(f('notes'), 'eq', ['a'])).toEqual({
      ok: false,
      reason: 'operator_not_allowed',
    })
  })

  test('a field whose name is not a safe identifier, even if it lists the operator', () => {
    const weird = field({ name: 'a]b', type: 'string', label: 'X', filterOperators: ['eq'] })
    expect(buildFilter(weird, 'eq', ['x'])).toEqual({ ok: false, reason: 'operator_not_allowed' })
  })

  test('ordering operators on non-ordered types, even if the manifest lists them', () => {
    const odd = field({
      name: 'code',
      type: 'string',
      label: 'Code',
      filterOperators: ['gt', 'between'],
    })
    expect(buildFilter(odd, 'gt', ['a'])).toEqual({
      ok: false,
      reason: 'operator_not_supported_for_type',
    })
    expect(buildFilter(odd, 'between', ['a', 'b'])).toEqual({
      ok: false,
      reason: 'operator_not_supported_for_type',
    })
  })

  test('values that do not fit the type', () => {
    expect(buildFilter(f('amount'), 'gte', ['abc'])).toEqual({ ok: false, reason: 'invalid_value' })
    expect(buildFilter(f('amount'), 'gte', [''])).toEqual({ ok: false, reason: 'invalid_value' })
    expect(buildFilter(f('amount'), 'gte', ['Infinity'])).toEqual({
      ok: false,
      reason: 'invalid_value',
    })
    expect(buildFilter(f('paid'), 'eq', ['yes'])).toEqual({ ok: false, reason: 'invalid_value' })
    expect(buildFilter(f('status'), 'in', ['draft', 'void'])).toEqual({
      ok: false,
      reason: 'invalid_value',
    })
    expect(buildFilter(f('dueDate'), 'gte', ['2026-02-30'])).toEqual({
      ok: false,
      reason: 'invalid_value',
    })
    expect(buildFilter(f('number'), 'eq', ['a\u0000b'])).toEqual({
      ok: false,
      reason: 'invalid_value',
    })
  })

  test('wrong value counts', () => {
    expect(buildFilter(f('amount'), 'between', ['1'])).toEqual({
      ok: false,
      reason: 'wrong_value_count',
    })
    expect(buildFilter(f('amount'), 'gte', ['1', '2'])).toEqual({
      ok: false,
      reason: 'wrong_value_count',
    })
    expect(buildFilter(f('amount'), 'gte', [])).toEqual({ ok: false, reason: 'wrong_value_count' })
    expect(buildFilter(f('status'), 'in', [])).toEqual({ ok: false, reason: 'wrong_value_count' })
    const many = Array.from({ length: 101 }, () => 'draft')
    expect(buildFilter(f('status'), 'in', many)).toEqual({ ok: false, reason: 'wrong_value_count' })
    expect(buildFilter(f('number'), 'contains', [])).toEqual({
      ok: false,
      reason: 'wrong_value_count',
    })
  })

  test('text operators: 1–200 characters (UTF-16 code units, like the server), no NUL', () => {
    expect(buildFilter(f('number'), 'contains', [''])).toEqual({
      ok: false,
      reason: 'invalid_value',
    })
    expect(buildFilter(f('number'), 'contains', ['x'.repeat(201)])).toEqual({
      ok: false,
      reason: 'invalid_value',
    })
    expect(buildFilter(f('number'), 'contains', ['😀'.repeat(100)]).ok).toBe(true)
    expect(buildFilter(f('number'), 'contains', ['a\u0000'])).toEqual({
      ok: false,
      reason: 'invalid_value',
    })
  })

  test('null checks take exactly "true"', () => {
    const nullable = field({
      name: 'note',
      type: 'string',
      label: 'Note',
      filterOperators: ['isNull', 'isNotNull'],
    })
    expect(buildFilter(nullable, 'isNull', ['true'])).toEqual({
      ok: true,
      filter: { field: 'note', op: 'isNull' },
    })
    expect(buildFilter(nullable, 'isNotNull', ['false'])).toEqual({
      ok: false,
      reason: 'invalid_value',
    })
  })
})

describe('buildFilter accepts and types valid input', () => {
  test.each([
    ['amount', 'gte', ['10.5'], { field: 'amount', op: 'gte', value: '10.5' }],
    ['amount', 'between', ['1', '2'], { field: 'amount', op: 'between', from: '1', to: '2' }],
    ['paid', 'eq', ['false'], { field: 'paid', op: 'eq', value: false }],
    ['status', 'in', ['draft', 'sent'], { field: 'status', op: 'in', values: ['draft', 'sent'] }],
    ['dueDate', 'lte', ['2026-12-31'], { field: 'dueDate', op: 'lte', value: '2026-12-31' }],
    ['number', 'contains', [' a b '], { field: 'number', op: 'contains', value: ' a b ' }],
    ['customer', 'eq', ['c1'], { field: 'customer', op: 'eq', value: 'c1' }],
  ] as const)('%s %s %j', (name, op, values, expected) => {
    expect(buildFilter(f(name), op, values)).toEqual({ ok: true, filter: expected })
  })
})

describe('coerceFilterValue', () => {
  test('integers reject fractions; datetimes need a parseable instant; sets check enum values', () => {
    const qty = field({ name: 'qty', type: 'integer', label: 'Qty' })
    expect(coerceFilterValue(qty, '3')).toBe(3)
    expect(coerceFilterValue(qty, '3.5')).toBeUndefined()
    const at = field({ name: 'at', type: 'datetime', label: 'At' })
    expect(coerceFilterValue(at, '2026-11-13T10:00:00Z')).toBe('2026-11-13T10:00:00Z')
    expect(coerceFilterValue(at, 'soon')).toBeUndefined()
    expect(coerceFilterValue(at, '')).toBeUndefined()
    const tags = field({ name: 'tags', type: 'set', label: 'Tags', enumValues: ['a'] })
    expect(coerceFilterValue(tags, 'a')).toBe('a')
    expect(coerceFilterValue(tags, 'b')).toBeUndefined()
    const free = field({ name: 'kind', type: 'enum', label: 'Kind' }) // no enumValues: any text
    expect(coerceFilterValue(free, 'x')).toBe('x')
    expect(coerceFilterValue(field({ name: 's', type: 'string', label: 'S' }), '')).toBeUndefined()
  })
})

describe('helpers', () => {
  test('isFilterOperator / isTextOperator', () => {
    expect(isFilterOperator('between')).toBe(true)
    expect(isFilterOperator('like')).toBe(false)
    expect(isFilterOperator('__proto__')).toBe(false)
    expect(isTextOperator('startsWith')).toBe(true)
    expect(isTextOperator('eq')).toBe(false)
  })

  test('filterToRawValues inverts buildFilter', () => {
    expect(filterToRawValues({ field: 'a', op: 'isNull' })).toEqual(['true'])
    expect(filterToRawValues({ field: 'a', op: 'in', values: [1, 'b'] })).toEqual(['1', 'b'])
    expect(filterToRawValues({ field: 'a', op: 'between', from: 1, to: 2 })).toEqual(['1', '2'])
    expect(filterToRawValues({ field: 'a', op: 'eq', value: true })).toEqual(['true'])
  })

  test('chips become QueryFilter nodes; several become an AND', () => {
    expect(simpleFilterToQueryFilter({ field: 'a', op: 'nin', values: [1] })).toEqual({
      op: 'nin',
      field: 'a',
      values: [1],
    })
    expect(simpleFilterToQueryFilter({ field: 'a', op: 'isNotNull' })).toEqual({
      op: 'isNotNull',
      field: 'a',
    })
    expect(simpleFilterToQueryFilter({ field: 'a', op: 'endsWith', value: 'x' })).toEqual({
      op: 'endsWith',
      field: 'a',
      value: 'x',
    })
    expect(filtersToQueryFilter([])).toBeUndefined()
    expect(
      filtersToQueryFilter([
        { field: 'a', op: 'eq', value: 1 },
        { field: 'b', op: 'between', from: 1, to: 2 },
      ]),
    ).toEqual({
      op: 'and',
      filters: [
        { op: 'eq', field: 'a', value: 1 },
        { op: 'between', field: 'b', from: 1, to: 2 },
      ],
    })
  })
})

// The server's list-query parser is the authority: a value the UI accepts must reach the server
// unchanged and be accepted there (framework `filterValue`, ADR-0011). These tests pin the class.
describe('buildFilter mirrors the server value rules', () => {
  const typed = (type: string) =>
    field({ name: 'v', type, label: 'V', filterOperators: ['eq', 'in', 'between', 'gte'] })

  test('exact numbers (decimal, money, bigInteger) stay exact text, never a rounded float', () => {
    expect(buildFilter(typed('bigInteger'), 'eq', ['9007199254740993'])).toEqual({
      ok: true,
      filter: { field: 'v', op: 'eq', value: '9007199254740993' },
    })
    expect(buildFilter(typed('decimal'), 'gte', ['12345678901234567.89'])).toEqual({
      ok: true,
      filter: { field: 'v', op: 'gte', value: '12345678901234567.89' },
    })
    expect(buildFilter(typed('money'), 'in', ['0.10', ' 2 '])).toEqual({
      ok: true,
      filter: { field: 'v', op: 'in', values: ['0.10', '2'] },
    })
    expect(buildFilter(typed('decimal'), 'between', ['-1', '1.5'])).toEqual({
      ok: true,
      filter: { field: 'v', op: 'between', from: '-1', to: '1.5' },
    })
  })

  test.each([
    ['decimal', '1e21'],
    ['decimal', '0x10'],
    ['decimal', '1.'],
    ['decimal', '.5'],
    ['decimal', 'Infinity'],
    ['decimal', '1,5'],
    ['decimal', '+1'],
    ['decimal', ''],
    ['bigInteger', '1.5'],
    ['bigInteger', '1e3'],
    ['money', 'NaN'],
  ])('%s refuses %j (the server would reject it, or read a different value)', (type, raw) => {
    expect(buildFilter(typed(type), 'eq', [raw])).toEqual({ ok: false, reason: 'invalid_value' })
  })

  test('property: any exact decimal round-trips through the filter builder digit for digit', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^-?\d{1,30}(\.\d{1,12})?$/), (text) => {
        const built = buildFilter(typed('decimal'), 'eq', [text])
        expect(built).toEqual({ ok: true, filter: { field: 'v', op: 'eq', value: text } })
        if (built.ok) expect(filterToRawValues(built.filter)).toEqual([text])
      }),
      { numRuns: 300 },
    )
  })

  test('datetimes need ISO-8601 with an explicit offset, like the server', () => {
    const at = typed('datetime')
    for (const ok of ['2026-11-14T09:00:00Z', '2026-11-14T09:00:00.123+05:30', '2026-11-14T09:00Z'])
      expect(buildFilter(at, 'gte', [ok]).ok).toBe(true)
    for (const bad of ['Nov 14 2026', '2026-11-14', '2026-11-14T09:00:00', '1731574800000'])
      expect(buildFilter(at, 'gte', [bad])).toEqual({ ok: false, reason: 'invalid_value' })
  })

  test('text values are measured in UTF-16 code units, like the server (an emoji counts 2)', () => {
    const text = field({ name: 't', type: 'string', label: 'T', filterOperators: ['contains'] })
    expect(buildFilter(text, 'contains', ['😀'.repeat(100)]).ok).toBe(true)
    expect(buildFilter(text, 'contains', ['😀'.repeat(101)])).toEqual({
      ok: false,
      reason: 'invalid_value',
    })
  })
})
