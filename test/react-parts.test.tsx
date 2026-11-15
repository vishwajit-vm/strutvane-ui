// @vitest-environment jsdom
// Smaller React pieces: provider, widgets, cells, FieldShell, FilterBar helpers, useListQuery.
import type { FieldDescriptor } from '@strutvane/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { type ReactNode, useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { defaultMessages, formatMessage } from '../src/core/messages.ts'
import {
  ArrayCell,
  BooleanCell,
  DateCell,
  DecimalCell,
  DefaultCell,
  NumberCell,
} from '../src/react/cells.tsx'
import { useResource, useStrutvane } from '../src/react/context.ts'
import { FieldShell } from '../src/react/FieldShell.tsx'
import { describeFilter, rawFilterValues } from '../src/react/FilterBar.tsx'
import { detailFields } from '../src/react/ResourceDetail.tsx'
import {
  emptyValue,
  formFields,
  keepIdempotencyKey,
  orderedFieldNames,
  ResourceForm,
} from '../src/react/ResourceForm.tsx'
import { listFields } from '../src/react/ResourceList.tsx'
import { recordTitle, relationId } from '../src/react/relations.ts'
import { StrutvaneProvider } from '../src/react/StrutvaneProvider.tsx'
import type { Cell, Widget } from '../src/react/types.ts'
import { useListQuery } from '../src/react/useListQuery.ts'
import {
  CheckboxWidget,
  DateWidget,
  NumberWidget,
  parseTypedNumber,
  ReadOnlyWidget,
  SelectWidget,
  TextareaWidget,
  TextWidget,
} from '../src/react/widgets.tsx'
import { FakeApi } from './fixtures/fake-api.ts'
import { field, invoiceResource, manifest, resource } from './fixtures/manifest.ts'
import { renderWithUI, seededApi } from './helpers.tsx'

const t = (key: string, params = {}) => formatMessage(defaultMessages, key, params)

describe('StrutvaneProvider and hooks', () => {
  test('hooks outside the provider fail with a clear message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useStrutvane())).toThrow(
      'useStrutvane() must be used inside <StrutvaneProvider>.',
    )
  })

  test('works inside an app-owned QueryClientProvider; t() uses the locale; useResource finds by name', () => {
    const client = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <StrutvaneProvider api={seededApi()} manifest={manifest} locale="de">
          {children}
        </StrutvaneProvider>
      </QueryClientProvider>
    )
    const { result } = renderHook(
      () => ({
        ctx: useStrutvane(),
        customer: useResource('Customer'),
        none: useResource(undefined),
      }),
      {
        wrapper,
      },
    )
    expect(result.current.ctx.locale).toBe('de')
    expect(result.current.ctx.t('too_long', { attribute: 'X', max: 1000 })).toBe(
      'X must be at most 1.000 characters.',
    )
    expect(result.current.customer?.path).toBe('customers')
    expect(result.current.none).toBeUndefined()
  })
})

/** Render a widget as a controlled field, the way FieldShell would. */
function Controlled({
  widget: W,
  f,
  initial = null,
  readOnly = false,
  onValue,
}: {
  widget: Widget
  f: FieldDescriptor
  initial?: unknown
  readOnly?: boolean
  onValue?: (v: unknown) => void
}) {
  const [value, setValue] = useState<unknown>(initial)
  return (
    <>
      <FieldShell
        name={f.name}
        field={f}
        widget={W}
        value={value}
        errors={[]}
        readOnly={readOnly}
        onBlur={() => {}}
        onChange={(v) => {
          setValue(v)
          onValue?.(v)
        }}
      />
      <button type="button" onClick={() => setValue(99)}>
        external
      </button>
    </>
  )
}

describe('widgets', () => {
  test('number: draft text is kept, values are numbers / null / raw text, external changes resync', async () => {
    const values: unknown[] = []
    const amount = field({ name: 'amount', type: 'decimal', label: 'Amount' })
    renderWithUI(
      <Controlled widget={NumberWidget} f={amount} initial={5} onValue={(v) => values.push(v)} />,
    )
    const input = screen.getByLabelText('Amount')
    expect(input).toHaveValue('5')
    const user = userEvent.setup()
    await user.clear(input)
    await user.type(input, '-1.')
    expect(input).toHaveValue('-1.')
    expect(values).toEqual([null, '-', -1, -1])
    await user.type(input, 'x')
    expect(values.at(-1)).toBe('-1.x')
    await user.click(screen.getByRole('button', { name: 'external' }))
    expect(input).toHaveValue('99')
  })

  test('number: integer fields get the numeric keyboard; the locale decimal comma is accepted', async () => {
    const values: unknown[] = []
    const price = field({ name: 'price', type: 'money', label: 'Price' })
    renderWithUI(<Controlled widget={NumberWidget} f={price} onValue={(v) => values.push(v)} />, {
      locale: 'de',
    })
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Price'), '12,5')
    expect(values.at(-1)).toBe(12.5)
    expect(screen.getByLabelText('Price')).toHaveValue('12,5')
    renderWithUI(
      <Controlled
        widget={NumberWidget}
        f={field({ name: 'qty', type: 'integer', label: 'Qty' })}
      />,
    )
    expect(screen.getByLabelText('Qty')).toHaveAttribute('inputmode', 'numeric')
  })

  test('parseTypedNumber', () => {
    expect(parseTypedNumber('')).toBeNull()
    expect(parseTypedNumber('  ')).toBeNull()
    expect(parseTypedNumber('1e3')).toBe(1000)
    expect(parseTypedNumber('.5')).toBe(0.5)
    expect(parseTypedNumber('1.2.3')).toBe('1.2.3')
    expect(parseTypedNumber('1e999')).toBe('1e999') // not finite → kept as text
    expect(parseTypedNumber('1,5', 'de')).toBe(1.5)
    expect(parseTypedNumber('1.5', 'not a locale!')).toBe(1.5)
  })

  test('text, email, textarea, select, checkbox, date and read-only widgets emit typed values', async () => {
    const values: unknown[] = []
    const push = (v: unknown) => values.push(v)
    renderWithUI(
      <>
        <Controlled
          widget={TextWidget}
          f={field({ name: 'email', type: 'email', label: 'Email' })}
          onValue={push}
        />
        <Controlled
          widget={TextareaWidget}
          f={field({ name: 'notes', type: 'text', label: 'Notes' })}
          onValue={push}
        />
        <Controlled
          widget={SelectWidget}
          f={field({ name: 'status', type: 'enum', label: 'Status', enumValues: ['a', 'b'] })}
          onValue={push}
        />
        <Controlled
          widget={CheckboxWidget}
          f={field({ name: 'paid', type: 'boolean', label: 'Paid' })}
          onValue={push}
        />
        <Controlled
          widget={DateWidget}
          f={field({ name: 'due', type: 'date', label: 'Due' })}
          onValue={push}
        />
        <Controlled
          widget={ReadOnlyWidget}
          f={field({ name: 'meta', type: 'json', label: 'Meta' })}
          initial={{ a: 1 }}
        />
      </>,
    )
    const user = userEvent.setup()
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    await user.type(screen.getByLabelText('Email'), 'a')
    await user.clear(screen.getByLabelText('Email'))
    await user.type(screen.getByLabelText('Notes'), 'n')
    await user.clear(screen.getByLabelText('Notes'))
    await user.selectOptions(screen.getByLabelText('Status'), 'b')
    await user.selectOptions(screen.getByLabelText('Status'), '')
    await user.click(screen.getByLabelText('Paid'))
    await user.type(screen.getByLabelText('Due'), '2026-01-02')
    await user.clear(screen.getByLabelText('Due'))
    expect(values).toEqual(['a', null, 'n', null, 'b', null, true, '2026-01-02', null])
    expect(screen.getByLabelText('Meta')).toHaveValue('{"a":1}')
    expect(screen.getByLabelText('Meta')).toHaveAttribute('readonly')
  })

  test('read-only select and checkbox are disabled; required is not announced when read-only', () => {
    renderWithUI(
      <>
        <Controlled
          widget={SelectWidget}
          f={field({ name: 's', type: 'enum', label: 'S', required: true })}
          readOnly
        />
        <Controlled
          widget={CheckboxWidget}
          f={field({ name: 'c', type: 'boolean', label: 'C' })}
          readOnly
        />
      </>,
    )
    expect(screen.getByLabelText('S')).toBeDisabled()
    expect(screen.getByLabelText('S')).not.toHaveAttribute('aria-required')
    expect(screen.getByLabelText('C')).toBeDisabled()
  })
})

const ShellWidget: Widget = (p) => (
  <input id={p.id} aria-describedby={p.describedBy} aria-invalid={p.invalid} />
)

describe('FieldShell', () => {
  test('label, required marker, help and errors wired through aria-describedby; errors shown once', () => {
    render(
      <FieldShell
        name="lines[0].amount"
        idScope="f1"
        field={field({
          name: 'amount',
          type: 'decimal',
          label: 'Amount',
          required: true,
          help: 'In EUR',
        })}
        widget={ShellWidget}
        value={null}
        errors={['Too small.', 'Too small.', '', 42, null]}
        readOnly={false}
        onChange={() => {}}
        onBlur={() => {}}
      />,
    )
    const input = screen.getByLabelText(/^Amount/)
    expect(input.id).toBe('sv-f1-field-lines-0-amount')
    expect(input).toHaveAccessibleDescription('In EUR Too small.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getAllByText('Too small.')).toHaveLength(1)
  })
})

describe('cells', () => {
  const resource = invoiceResource
  const show = (C: Cell, value: unknown, locale?: string) => {
    const f = field({ name: 'x', type: 'string', label: 'X' })
    const { container, unmount } = renderWithUI(
      <C field={f} value={value} record={{ id: 'r' }} resource={resource} />,
      locale ? { locale } : {},
    )
    const text = container.textContent
    unmount()
    return text
  }

  test('formatting and the empty marker', () => {
    expect(show(DefaultCell, 'a')).toBe('a')
    expect(show(DefaultCell, '')).toBe('—')
    expect(show(DefaultCell, { id: 'o1' })).toBe('o1')
    expect(show(DefaultCell, { x: 1 })).toBe('—')
    expect(show(BooleanCell, false)).toBe('No')
    expect(show(BooleanCell, null)).toBe('—')
    expect(show(NumberCell, 1234.5)).toBe('1,234.5')
    expect(show(NumberCell, 'x')).toBe('—')
    expect(show(DecimalCell, 3)).toBe('3.00')
    expect(show(DecimalCell, 3, 'de')).toBe('3,00')
    expect(show(DecimalCell, null)).toBe('—')
    expect(show(DateCell, '2026-12-01')).toBe('Dec 1, 2026')
    expect(show(DateCell, 'soon')).toBe('soon')
    expect(show(DateCell, null)).toBe('—')
    expect(show(ArrayCell, [1, 2])).toBe('2')
    expect(show(ArrayCell, null)).toBe('—')
    expect(show(NumberCell, 5, 'not a locale!')).toBe('5')
    expect(show(DateCell, '2026-12-01', 'not a locale!')).toBe('2026-12-01')
  })
})

describe('pure helpers of the components', () => {
  test('FilterBar: raw values per operator and chip text', () => {
    expect(rawFilterValues('in', ' a, ,b ', '')).toEqual(['a', 'b'])
    expect(rawFilterValues('between', ' 1 ', ' 2 ')).toEqual(['1', '2'])
    expect(rawFilterValues('isNotNull', 'x', '')).toEqual(['true'])
    expect(rawFilterValues('contains', '  a b ', '')).toEqual(['a b'])
    expect(describeFilter({ field: 'x', op: 'isNull' }, undefined, t)).toBe('x is empty')
    expect(
      describeFilter(
        { field: 'x', op: 'gte', value: 3 },
        field({ name: 'x', type: 'integer', label: 'X' }),
        t,
      ),
    ).toBe('X ≥ 3')
  })

  test('ResourceForm helpers', () => {
    expect(formFields(invoiceResource, 'create').map((f) => f.field.name)).not.toContain(
      'createdAt',
    )
    const edit = formFields(invoiceResource, 'edit')
    expect(edit.find((f) => f.field.name === 'number')?.readOnly).toBe(true)
    expect(edit.find((f) => f.field.name === 'createdAt')?.readOnly).toBe(true)
    expect(emptyValue(field({ name: 'a', type: 'array', label: 'A' }))).toEqual([])
    expect(emptyValue(field({ name: 'b', type: 'boolean', label: 'B' }))).toBe(false)
    const lines = invoiceResource.fields.filter((f) => f.name === 'lines' || f.name === 'notes')
    expect(orderedFieldNames(lines, { lines: [{}, {}] })).toEqual([
      'notes',
      'lines',
      'lines[0].description',
      'lines[0].amount',
      'lines[1].description',
      'lines[1].amount',
    ])
    expect(orderedFieldNames(lines, { lines: 'x' })).toEqual(['notes', 'lines'])
    expect(keepIdempotencyKey({ type: 't', title: 't', status: 0, code: 'NETWORK_ERROR' })).toBe(
      true,
    )
    expect(keepIdempotencyKey({ type: 't', title: 't', status: 502, code: 'INTERNAL_ERROR' })).toBe(
      true,
    )
    expect(keepIdempotencyKey({ type: 't', title: 't', status: 429, code: 'RATE_LIMITED' })).toBe(
      true,
    )
    expect(keepIdempotencyKey({ type: 't', title: 't', status: 409, code: 'CONFLICT' })).toBe(false)
  })

  test('relation helpers and list columns', () => {
    expect(relationId(7)).toBe('7')
    expect(relationId({ id: { id: 'deep' } })).toBe('deep')
    expect(relationId('')).toBeUndefined()
    expect(relationId(Number.NaN)).toBeUndefined()
    expect(recordTitle(undefined, { id: 'x' })).toBe('x')
    expect(recordTitle(invoiceResource, { id: 'x', number: 12 })).toBe('12')
    expect(
      listFields({ ...invoiceResource, ui: { listColumns: ['ghost', 'amount'] } }).map(
        (f) => f.name,
      ),
    ).toEqual(['amount'])
  })
})

describe('useListQuery', () => {
  test('reports rejected URL parameters and builds the query + search string', () => {
    const { result } = renderHook(() =>
      useListQuery(invoiceResource, 'filter[secret][eq]=1&search=acme'),
    )
    expect(result.current.rejected).toEqual([
      { key: 'filter[secret][eq]', reason: 'unknown_field' },
    ])
    expect(result.current.listQuery).toEqual({ search: 'acme', page: { kind: 'cursor', size: 25 } })
    expect(result.current.searchString).toBe('search=acme')
    expect(result.current.hasPrevious).toBe(false)
  })

  test('a URL page size wins over the default option', () => {
    const { result } = renderHook(() =>
      useListQuery(invoiceResource, 'page[size]=10', { pageSize: 50 }),
    )
    expect(result.current.state.pageSize).toBe(10)
  })
})

describe('relation collections have no value of their own on the record', () => {
  // What the framework's manifest emits for `relations: { invoices: hasMany(...) }`: a read-only
  // field with no value in any API record. It must never become an always-empty column or input.
  const owner = resource({
    name: 'Owner',
    path: 'owners',
    titleField: 'name',
    fields: [
      field({ name: 'id', type: 'id', label: 'ID', readOnly: true }),
      field({ name: 'name', type: 'string', label: 'Name' }),
      ...(['hasMany', 'hasOne', 'manyToMany'] as const).map((kind) =>
        field({
          name: `${kind}Rel`,
          type: kind,
          label: kind,
          readOnly: true,
          relation: { kind, target: 'Invoice', foreignKey: 'ownerId' },
        }),
      ),
    ],
  })

  test.each(['hasMany', 'hasOne', 'manyToMany'])(
    '%s is not a list column, form field or detail field',
    () => {
      expect(listFields(owner).map((f) => f.name)).toEqual(['name'])
      expect(formFields(owner, 'create').map((f) => f.field.name)).toEqual(['name'])
      expect(formFields(owner, 'edit').map((f) => f.field.name)).toEqual(['name'])
      expect(detailFields(owner).map((f) => f.name)).toEqual(['id', 'name'])
    },
  )

  test('an explicit ui.listColumns entry is still honoured (the app asked for it)', () => {
    expect(
      listFields({ ...owner, ui: { listColumns: ['name', 'hasManyRel'] } }).map((f) => f.name),
    ).toEqual(['name', 'hasManyRel'])
  })

  test('the edit form renders no empty read-only input for the relation', async () => {
    const api = new FakeApi(
      { ...manifest, resources: [...manifest.resources, owner] },
      {
        owners: [{ id: 'o1', name: 'Olga' }],
      },
    )
    renderWithUI(<ResourceForm resource={owner} recordId="o1" />, {
      api,
      manifest: { ...manifest, resources: [...manifest.resources, owner] },
    })
    expect(await screen.findByLabelText('Name')).toHaveValue('Olga')
    expect(screen.queryByLabelText('hasMany')).toBeNull()
    expect(screen.queryByLabelText('manyToMany')).toBeNull()
  })
})
