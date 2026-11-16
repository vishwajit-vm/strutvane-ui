// Type-level tests: the public API accepts correct use and rejects misuse at compile time.
import type { FieldDescriptor, ListQuery, ResourceManifest } from '@strutvane/framework/contracts'
import { describe, expectTypeOf, test } from 'vitest'
import {
  type ApiRecord,
  type BuildResult,
  buildFilter,
  createHttpClient,
  type ListState,
  mergeRegistry,
  parseManifest,
  type Registry,
  type ResourceApi,
  resolveWidget,
  type SimpleFilter,
} from '../src/core/index.ts'
import type { Cell, UiOverrides, Widget, WidgetProps } from '../src/react/index.ts'

declare const field: FieldDescriptor

describe('core', () => {
  test('buildFilter takes protocol operators only and returns a discriminated result', () => {
    expectTypeOf(buildFilter(field, 'eq', ['x'])).toEqualTypeOf<BuildResult>()
    // @ts-expect-error: not a protocol operator
    buildFilter(field, 'like', ['x'])
    const r = buildFilter(field, 'in', ['a'])
    if (r.ok) expectTypeOf(r.filter).toEqualTypeOf<SimpleFilter>()
    else
      expectTypeOf(r.reason).toEqualTypeOf<
        | 'operator_not_allowed'
        | 'operator_not_supported_for_type'
        | 'invalid_value'
        | 'wrong_value_count'
      >()
  })

  test('SimpleFilter: values match the operator', () => {
    const ok: SimpleFilter[] = [
      { field: 'a', op: 'in', values: ['x', 1] },
      { field: 'a', op: 'between', from: 1, to: 2 },
      { field: 'a', op: 'isNull' },
    ]
    expectTypeOf(ok).toEqualTypeOf<SimpleFilter[]>()
    // @ts-expect-error: `in` needs `values`, not `value`
    const bad: SimpleFilter = { field: 'a', op: 'in', value: 'x' }
    // @ts-expect-error: text operators take strings only
    const bad2: SimpleFilter = { field: 'a', op: 'contains', value: 3 }
    void bad
    void bad2
  })

  test('ListState is readonly', () => {
    const s = {} as ListState
    // @ts-expect-error: readonly
    s.search = 'x'
  })

  test('the HTTP client is a ResourceApi; records always have a string id', () => {
    expectTypeOf(createHttpClient({ baseUrl: 'https://x' })).toEqualTypeOf<ResourceApi>()
    expectTypeOf<ApiRecord['id']>().toEqualTypeOf<string>()
    // @ts-expect-error: baseUrl is required
    createHttpClient({})
    const api = {} as ResourceApi
    expectTypeOf(api.list('x', {} as ListQuery)).resolves.toHaveProperty('data')
  })

  test('parseManifest narrows on ok', () => {
    const r = parseManifest({})
    if (r.ok) expectTypeOf(r.manifest).toEqualTypeOf<ResourceManifest>()
    else expectTypeOf(r.errors).toEqualTypeOf<readonly string[]>()
  })

  test('registries are generic over the component type', () => {
    const reg = {} as Registry<number, string>
    expectTypeOf(resolveWidget(reg, { name: 'X' }, field)).toEqualTypeOf<number>()
    // @ts-expect-error: overrides must use the same component type
    mergeRegistry(reg, { widgets: { a: 'not a number' } })
  })
})

const W: Widget = (p) => {
  expectTypeOf(p.id).toEqualTypeOf<string>()
  return null
}
const C: Cell = () => null

describe('react', () => {
  test('widgets and cells receive typed props; overrides are checked', () => {
    expectTypeOf<WidgetProps['onChange']>().toEqualTypeOf<(value: unknown) => void>()
    const overrides: UiOverrides = { fieldWidgets: { 'Invoice.amount': W }, cells: { money: C } }
    void overrides
    // @ts-expect-error: a cell is not a widget
    const wrong: UiOverrides = { widgets: { x: 42 } }
    void wrong
  })
})
