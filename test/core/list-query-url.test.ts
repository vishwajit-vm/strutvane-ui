// List state ⇄ URL (ADR-0011 wire format) and ListQuery → wire. Includes the spike 08 acceptance
// tests, adapted to repeated keys, and a property test over hostile values.
import type { ListQuery } from '@strutvane/framework/contracts'
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import type { SimpleFilter } from '../../src/core/filter-builder.ts'
import {
  listQueryToSearchString,
  parseSearchString,
  toSearchString,
} from '../../src/core/list-query-url.ts'
import { initialListState, type ListState } from '../../src/core/list-state.ts'
import { invoiceResource } from '../fixtures/manifest.ts'

describe('URL round-trip', () => {
  const tricky: ListState = {
    filters: [
      { field: 'number', op: 'contains', value: 'a,b&c=d %25 ü 日本 [x] +' },
      { field: 'status', op: 'in', values: ['draft', 'sent'] },
      { field: 'amount', op: 'between', from: '0', to: '99.5' },
      { field: 'paid', op: 'eq', value: true },
      { field: 'customer', op: 'eq', value: 'c,1' },
    ],
    sort: [
      { field: 'dueDate', direction: 'desc' },
      { field: 'number', direction: 'asc' },
    ],
    search: 'Acme & Co, Ltd',
    pageSize: 50,
    page: 7,
  }

  test('state → URL → state is lossless, including commas, &, =, %, +, brackets and Unicode', () => {
    const { state, rejected } = parseSearchString(toSearchString(tricky), invoiceResource)
    expect(rejected).toEqual([])
    expect(state).toEqual(tricky)
  })

  test('the URL uses the documented wire format: repeated keys for lists, comma-joined sort', () => {
    const s = toSearchString({
      ...initialListState,
      filters: [
        { field: 'status', op: 'in', values: ['draft', 'sent'] },
        { field: 'amount', op: 'isNull' },
      ],
      sort: [{ field: 'dueDate', direction: 'desc' }],
    })
    expect(decodeURIComponent(s)).toBe(
      'filter[status][in]=draft&filter[status][in]=sent&filter[amount][isNull]=true&sort=-dueDate',
    )
  })

  test('defaults are omitted; a leading ? is accepted', () => {
    expect(toSearchString(initialListState)).toBe('')
    expect(toSearchString({ ...initialListState, search: '   ' })).toBe('')
    expect(parseSearchString('?sort=amount', invoiceResource).state.sort).toEqual([
      { field: 'amount', direction: 'asc' },
    ])
  })

  // Values a user could type into a text filter or search box, biased towards URL metacharacters.
  const nasty = fc.string({
    unit: fc.constantFrom(
      'a',
      'Z',
      '0',
      ',',
      '&',
      '=',
      '%',
      '+',
      '[',
      ']',
      '?',
      '#',
      ' ',
      'ü',
      '日',
      '😀',
      "'",
      '"',
    ),
    minLength: 1,
    maxLength: 30,
  })

  test('property: any text filter, search and page survive the round trip exactly', () => {
    fc.assert(
      fc.property(
        nasty,
        nasty,
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 1, max: 100 }),
        (text, search, page, size) => {
          const state: ListState = {
            filters: [
              { field: 'number', op: 'contains', value: text.trim() === '' ? 'x' : text.trim() },
              { field: 'status', op: 'in', values: ['draft', 'paid'] },
            ],
            sort: [{ field: 'amount', direction: 'desc' }],
            search: search.trim(),
            pageSize: size,
            page,
          }
          const parsed = parseSearchString(toSearchString(state), invoiceResource)
          expect(parsed.rejected).toEqual([])
          expect(parsed.state).toEqual(state)
        },
      ),
      { numRuns: 300 },
    )
  })

  test('property: parsing arbitrary query strings never throws and never yields a disallowed filter', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (raw) => {
        const { state } = parseSearchString(raw, invoiceResource)
        for (const f of state.filters) {
          const field = invoiceResource.fields.find((x) => x.name === f.field)
          expect(field?.filterOperators).toContain(f.op)
        }
        for (const s of state.sort) {
          expect(invoiceResource.fields.find((x) => x.name === s.field)?.sortable).toBe(true)
        }
      }),
      { numRuns: 500 },
    )
  })
})

describe('parseSearchString fails closed', () => {
  test.each([
    ['filter[notes][eq]=x', 'operator_not_allowed'],
    ['filter[secret][eq]=x', 'unknown_field'],
    ['filter[__proto__][eq]=x', 'unknown_field'],
    ['filter[status][like]=x', 'operator_not_allowed'],
    ['filter[status][gt]=x', 'operator_not_allowed'],
    ['filter[amount][gte]=abc', 'invalid_value'],
    ['filter[amount][between]=1', 'wrong_value_count'],
    ['filter[amount][gte]=1&filter[amount][gte]=2', 'wrong_value_count'],
    ['filter[paid][eq]=maybe', 'invalid_value'],
    ['filter[status][in]=void', 'invalid_value'],
    ['sort=-notes', 'not_sortable'],
    ['sort=-secret', 'not_sortable'],
    ['page%5Bsize%5D=10&debug=1', 'unknown_parameter'],
    ['page[cursor]=abc', 'unsupported_parameter'],
    ['page[number]=0', 'invalid_value'],
    ['page[number]=x', 'invalid_value'],
    ['page[number]=99999', 'invalid_value'],
    ['search=a&search=b', 'duplicate_parameter'],
    ['page[size]=abc', 'invalid_value'],
    ['page[size]=1000', 'invalid_value'],
  ])('%s → rejected (%s)', (search, reason) => {
    const { rejected } = parseSearchString(search, invoiceResource)
    expect(rejected.map((r) => r.reason)).toContain(reason)
  })

  test('page size is clamped, garbage page size falls back to the default', () => {
    expect(parseSearchString('page%5Bsize%5D=1000', invoiceResource).state.pageSize).toBe(100)
    expect(parseSearchString('page%5Bsize%5D=-3', invoiceResource).state.pageSize).toBe(25)
  })

  test('malformed percent-encoding is decoded leniently (WHATWG) and never throws', () => {
    const { state } = parseSearchString('filter[number][contains]=%E0%A4%A', invoiceResource)
    expect(state.filters).toHaveLength(1)
  })

  test('valid parameters survive next to rejected ones; the first duplicate wins', () => {
    const { state } = parseSearchString(
      'search=a&search=b&filter[secret][eq]=1&sort=amount',
      invoiceResource,
    )
    expect(state.search).toBe('a')
    expect(state.sort).toEqual([{ field: 'amount', direction: 'asc' }])
    expect(state.filters).toEqual([])
  })

  test('a search text the server would refuse (over 200 UTF-16 units, NUL) is dropped, not sent', () => {
    for (const bad of ['x'.repeat(201), '😀'.repeat(101), 'a\u0000b']) {
      const parsed = parseSearchString(
        new URLSearchParams({ search: bad }).toString(),
        invoiceResource,
      )
      expect(parsed.state.search).toBe('')
      expect(parsed.rejected).toEqual([{ key: 'search', reason: 'invalid_value' }])
    }
    expect(
      parseSearchString(`search=${'x'.repeat(200)}`, invoiceResource).state.search,
    ).toHaveLength(200)
  })

  test('no page number means the first page, and page 1 is not written to the URL', () => {
    expect(parseSearchString('', invoiceResource).state.page).toBe(1)
    expect(parseSearchString('page[number]=4', invoiceResource).state.page).toBe(4)
    const parsed = parseSearchString('page[number]=1', invoiceResource)
    expect(toSearchString(parsed.state)).toBe('')
  })
})

describe('listQueryToSearchString (HTTP client wire format)', () => {
  test('flat AND filters, search, sort and pages are expressed in the URL', () => {
    const q: ListQuery = {
      filter: {
        op: 'and',
        filters: [
          { op: 'in', field: 'status', values: ['draft', 'sent'] },
          { op: 'and', filters: [{ op: 'between', field: 'amount', from: 1, to: 2 }] },
          { op: 'isNotNull', field: 'customer' },
          { op: 'contains', field: 'number', value: 'INV' },
          { op: 'eq', field: 'paid', value: false },
        ],
      },
      search: 'x y',
      sort: [{ field: 'amount', direction: 'desc' }],
      page: { kind: 'cursor', size: 500, cursor: 'abc' },
    }
    expect(decodeURIComponent(listQueryToSearchString(q) ?? '')).toBe(
      'filter[status][in]=draft&filter[status][in]=sent&filter[amount][between]=1&filter[amount][between]=2' +
        '&filter[customer][isNotNull]=true&filter[number][contains]=INV&filter[paid][eq]=false' +
        '&search=x+y&sort=-amount&page[size]=100&page[cursor]=abc',
    )
    expect(listQueryToSearchString({ page: { kind: 'offset', size: 10, number: 3 } })).toBe(
      'page%5Bsize%5D=10&page%5Bnumber%5D=3',
    )
    expect(listQueryToSearchString({})).toBe('')
  })

  test.each<[string, ListQuery]>([
    ['or', { filter: { op: 'or', filters: [{ op: 'eq', field: 'a', value: 1 }] } }],
    ['not', { filter: { op: 'not', filter: { op: 'eq', field: 'a', value: 1 } } }],
    ['constant', { filter: { op: 'true' } }],
    ['actor reference', { filter: { op: 'eq', field: 'ownerId', value: { $actor: 'id' } } }],
    ['actor in set', { filter: { op: 'in', field: 'ownerId', values: [{ $actor: 'id' }] } }],
    ['empty set', { filter: { op: 'in', field: 'a', values: [] } }],
    ['actor in between', { filter: { op: 'between', field: 'a', from: { $actor: 'id' }, to: 1 } }],
    ['caseSensitive', { filter: { op: 'contains', field: 'a', value: 'x', caseSensitive: true } }],
    ['nested path', { filter: { op: 'eq', field: 'customer.name', value: 'x' } }],
    [
      'same field+op twice',
      {
        filter: {
          op: 'and',
          filters: [
            { op: 'gte', field: 'a', value: 1 },
            { op: 'gte', field: 'a', value: 2 },
          ],
        },
      },
    ],
    ['include', { include: ['customer'] }],
    ['fields', { fields: { invoice: ['id'] } }],
    ['nested sort path', { sort: [{ field: 'customer.name', direction: 'asc' }] }],
  ])('%s → needs POST /query (undefined)', (_name, q) => {
    expect(listQueryToSearchString(q)).toBeUndefined()
  })
})

describe('chips survive the URL for every operator', () => {
  const chips: SimpleFilter[] = [
    { field: 'status', op: 'ne', value: 'draft' },
    { field: 'amount', op: 'gte', value: '5' },
    { field: 'amount', op: 'lte', value: '7.25' },
    { field: 'customer', op: 'in', values: ['c1'] },
    { field: 'number', op: 'eq', value: 'INV-1' },
  ]
  test('each chip parses back to itself', () => {
    for (const chip of chips) {
      const state = { ...initialListState, filters: [chip] }
      expect(parseSearchString(toSearchString(state), invoiceResource).state.filters).toEqual([
        chip,
      ])
    }
  })
})
