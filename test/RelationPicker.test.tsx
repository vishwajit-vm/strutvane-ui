// @vitest-environment jsdom
// The belongsTo picker beyond the first 100 records (ADR-0014 follow-up): paginated, searchable,
// and the selected record always visible. Plus the relation cell with embedded records.
import type { FieldDescriptor } from '@strutvane/framework/contracts'
import { screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { RelationCell } from '../src/react/cells.tsx'
import { RelationPickerWidget } from '../src/react/widgets.tsx'
import { debounceClock } from './debounce-clock.ts'
import { FakeApi, type Row } from './fixtures/fake-api.ts'
import {
  customerResource,
  field,
  invoiceResource,
  manifest,
  resource,
} from './fixtures/manifest.ts'
import { makeInvoices, renderWithUI } from './helpers.tsx'

// Search-as-you-type runs on a manual clock (see debounce-clock.ts): no test depends on machine speed.
vi.mock('../src/react/relations.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/react/relations.ts')>()),
  useDebouncedValue: (await import('./debounce-clock.ts')).useManualDebouncedValue,
}))
beforeEach(() => debounceClock.reset())

const MANY = 250
/** The relation picker's search debounce (widgets.tsx). */
const PICKER_SEARCH_DEBOUNCE_MS = 250
const manyCustomers: Row[] = Array.from({ length: MANY }, (_, i) => ({
  id: `c${String(i + 1).padStart(3, '0')}`,
  name: `Customer ${String(i + 1).padStart(3, '0')}`,
  region: 'EU',
}))

const customerField = invoiceResource.fields.find((f) => f.name === 'customer') as FieldDescriptor

function Picker({
  value = null,
  onChange = () => {},
}: {
  value?: unknown
  onChange?: (v: unknown) => void
}) {
  return (
    <>
      <label htmlFor="picker">Customer</label>
      <RelationPickerWidget
        field={customerField}
        id="picker"
        name="customer"
        value={value}
        onChange={onChange}
        onBlur={() => {}}
        readOnly={false}
        invalid={false}
        describedBy={undefined}
      />
    </>
  )
}

const optionCount = () =>
  within(screen.getByLabelText('Customer')).getAllByRole('option').length - 1 // minus "Select…"

describe('relation picker with more than 100 records', () => {
  test('loads 100 per page; "Load more" fetches the next cursor page until all are reachable', async () => {
    const api = new FakeApi(manifest, { invoices: [], customers: manyCustomers })
    renderWithUI(<Picker />, { api })
    await waitFor(() => expect(optionCount()).toBe(100))
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(optionCount()).toBe(200))
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(optionCount()).toBe(MANY))
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Customer 250' })).toBeInTheDocument()
    const pages = api.requests.filter((r) => r.path === 'customers').map((r) => r.query)
    expect(pages).toHaveLength(3)
    expect(pages[0]).toEqual({
      sort: [{ field: 'name', direction: 'asc' }],
      page: { kind: 'offset', size: 100, number: 1 },
    })
    expect(pages[1]?.page).toEqual({ kind: 'offset', size: 100, number: 2 })
  })

  test('search goes to the server (debounced) and narrows the options', async () => {
    const api = new FakeApi(manifest, { invoices: [], customers: manyCustomers })
    renderWithUI(<Picker />, { api })
    await waitFor(() => expect(optionCount()).toBe(100))
    const user = userEvent.setup()
    const before = api.requests.length
    await user.type(screen.getByRole('searchbox', { name: 'Search Customers' }), 'Customer 24')
    debounceClock.advance(PICKER_SEARCH_DEBOUNCE_MS - 1)
    expect(api.requests.length).toBe(before) // no request per keystroke
    debounceClock.advance(1)
    await waitFor(() => expect(optionCount()).toBe(10)) // 240..249
    expect(api.requests.slice(before).map((r) => r.query.search)).toEqual(['Customer 24'])
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  test('a selected record beyond the first page is still shown by its title', async () => {
    const api = new FakeApi(manifest, { invoices: [], customers: manyCustomers })
    renderWithUI(<Picker value="c240" />, { api })
    await waitFor(() =>
      expect(screen.getByLabelText('Customer')).toHaveDisplayValue('Customer 240'),
    )
  })

  test('choosing an option reports its id; the empty choice reports null', async () => {
    const api = new FakeApi(manifest, { invoices: [], customers: manyCustomers.slice(0, 3) })
    const changes: unknown[] = []
    renderWithUI(<Picker onChange={(v) => changes.push(v)} />, { api })
    await waitFor(() => expect(optionCount()).toBe(3))
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Customer'), 'c002')
    await user.selectOptions(screen.getByLabelText('Customer'), '')
    expect(changes).toEqual(['c002', null])
  })

  test('a target without searchable fields has no search box and is not sorted by an unsortable title', async () => {
    const plain = resource({
      name: 'Tag',
      path: 'tags',
      titleField: 'label',
      fields: [
        field({ name: 'id', type: 'id', label: 'ID' }),
        field({ name: 'label', type: 'string', label: 'Label' }),
      ],
    })
    const tagField = field({
      name: 'tag',
      type: 'belongsTo',
      label: 'Tag',
      relation: { kind: 'belongsTo', target: 'Tag' },
    })
    const m = { ...manifest, resources: [...manifest.resources, plain] }
    const api = new FakeApi(m, { tags: [{ id: 't1', label: 'Urgent' }] })
    renderWithUI(
      <>
        <label htmlFor="tag">Tag</label>
        <RelationPickerWidget
          field={tagField}
          id="tag"
          name="tag"
          value={null}
          onChange={() => {}}
          onBlur={() => {}}
          readOnly={false}
          invalid={false}
          describedBy={undefined}
        />
      </>,
      { api, manifest: m },
    )
    await screen.findByRole('option', { name: 'Urgent' })
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(api.requests[0]?.query).toEqual({ page: { kind: 'offset', size: 100, number: 1 } })
  })
})

describe('relation cell', () => {
  test('an embedded related record shows its title without any request', async () => {
    const api = new FakeApi(manifest, { invoices: makeInvoices(1), customers: [] })
    renderWithUI(
      <RelationCell
        field={customerField}
        value={{ id: 'c9', name: 'Embedded Ltd' }}
        record={{ id: 'inv-1' }}
        resource={invoiceResource}
      />,
      { api },
    )
    expect(screen.getByText('Embedded Ltd')).toBeInTheDocument()
    expect(api.gets).toEqual([])
  })

  test('an id that no longer exists falls back to the raw id; empty shows the empty marker', async () => {
    const api = new FakeApi(manifest, { invoices: [], customers: [] })
    renderWithUI(
      <>
        <span>
          <RelationCell
            field={customerField}
            value="gone"
            record={{ id: 'a' }}
            resource={invoiceResource}
          />
        </span>
        <span>
          <RelationCell
            field={customerField}
            value={null}
            record={{ id: 'b' }}
            resource={invoiceResource}
          />
        </span>
      </>,
      { api },
    )
    expect(screen.getByText('gone')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    await waitFor(() => expect(api.gets).toEqual([{ path: 'customers', id: 'gone' }]))
  })

  test('a target that allows `id in` loads labels with one list request', async () => {
    const withIn = {
      ...customerResource,
      fields: customerResource.fields.map((f) =>
        f.name === 'id' ? { ...f, filterOperators: ['in' as const] } : f,
      ),
    }
    const m = { ...manifest, resources: [invoiceResource, withIn] }
    const api = new FakeApi(m, { invoices: [], customers: manyCustomers.slice(0, 3) })
    renderWithUI(
      <>
        <span>
          <RelationCell
            field={customerField}
            value="c001"
            record={{ id: 'a' }}
            resource={invoiceResource}
          />
        </span>
        <span>
          <RelationCell
            field={customerField}
            value="c003"
            record={{ id: 'b' }}
            resource={invoiceResource}
          />
        </span>
      </>,
      { api, manifest: m },
    )
    await screen.findByText('Customer 001')
    await screen.findByText('Customer 003')
    expect(api.gets).toEqual([])
    expect(api.requests).toHaveLength(1)
    expect(api.requests[0]?.query.filter).toEqual({
      op: 'in',
      field: 'id',
      values: ['c001', 'c003'],
    })
  })
})
