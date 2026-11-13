// @vitest-environment jsdom
// ResourceList driven like a user would: assert what is shown AND which ListQuery reached the API.
// Ported from spike 08 (acceptance tests), plus delete gating, error states and the URL rules.
import { screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import type { ResourceApi } from '../src/core/types.ts'
import { ResourceList, type ResourceListProps } from '../src/react/ResourceList.tsx'
import type { Cell } from '../src/react/types.ts'
import { type FakeApi, problem } from './fixtures/fake-api.ts'
import { invoiceResource, withCapabilities } from './fixtures/manifest.ts'
import { axeViolations, renderWithUI, seededApi } from './helpers.tsx'

const lastQuery = (api: FakeApi) => api.requests.filter((r) => r.path === 'invoices').at(-1)?.query

async function renderList(props: Partial<ResourceListProps> = {}, api = seededApi()) {
  const utils = renderWithUI(
    <ResourceList resource={invoiceResource} onCreate={() => {}} onEdit={() => {}} {...props} />,
    { api },
  )
  await screen.findByText('Showing 25 invoices')
  return { ...utils, api, user: userEvent.setup() }
}

const headerTexts = (table: HTMLElement) =>
  within(table)
    .getAllByRole('columnheader')
    .map((h) => h.textContent?.replace(/[▲▼]/g, '').trim())

describe('ResourceList renders from the manifest', () => {
  test('caption, columns in ui.listColumns order, first page of rows, relation labels resolved', async () => {
    await renderList()
    const table = screen.getByRole('table', { name: 'Invoices' })
    expect(headerTexts(table)).toEqual([
      'Number',
      'Customer',
      'Amount',
      'Status',
      'Due date',
      'Paid',
      'Actions',
    ])
    expect(within(table).getAllByRole('row')).toHaveLength(26) // header + 25 (default page size)
    await waitFor(() => expect(within(table).getAllByText('Acme GmbH').length).toBeGreaterThan(0))
    expect(within(table).getAllByText('Yes').length).toBeGreaterThan(0) // boolean cell
    expect(within(table).getAllByText('37.00').length).toBe(1) // decimal cell, 2 fraction digits
  })

  test('relation labels are batched: one lookup per distinct id, not one per row', async () => {
    const { api } = await renderList()
    await waitFor(() => expect(screen.getAllByText('Globex Inc').length).toBeGreaterThan(0))
    const customerGets = api.gets.filter((g) => g.path === 'customers').map((g) => g.id)
    expect([...customerGets].sort()).toEqual(['c1', 'c2', 'c3'])
  })

  test('only sortable columns are sort buttons, with aria-sort', async () => {
    await renderList()
    expect(screen.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute(
      'aria-sort',
      'none',
    )
    expect(screen.getByRole('columnheader', { name: /Customer/ })).not.toHaveAttribute('aria-sort')
    expect(
      within(screen.getByRole('columnheader', { name: /Customer/ })).queryByRole('button'),
    ).toBeNull()
  })

  test('without ui.listColumns, up to 6 simple fields are shown (no ids, arrays or long text)', async () => {
    const { listColumns: _omit, ...ui } = invoiceResource.ui ?? {}
    renderWithUI(<ResourceList resource={{ ...invoiceResource, ui }} />)
    await screen.findByText('Showing 25 invoices')
    expect(headerTexts(screen.getByRole('table'))).toEqual([
      'Number',
      'Customer',
      'Amount',
      'Status',
      'Issue date',
      'Due date',
    ])
  })
})

describe('ResourceList → ListQuery', () => {
  test('clicking a header sorts server-side: asc first (even for numbers), then desc', async () => {
    const { api, user } = await renderList()
    await user.click(screen.getByRole('button', { name: /Amount/ }))
    await waitFor(() =>
      expect(lastQuery(api)?.sort).toEqual([{ field: 'amount', direction: 'asc' }]),
    )
    expect(screen.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    await user.click(screen.getByRole('button', { name: /Amount/ }))
    await waitFor(() =>
      expect(lastQuery(api)?.sort).toEqual([{ field: 'amount', direction: 'desc' }]),
    )
    expect(screen.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
  })

  test('a filter chip becomes a QueryFilter; removing it removes the filter', async () => {
    const { api, user } = await renderList()
    await user.selectOptions(screen.getByLabelText('Filter field'), 'status')
    await user.selectOptions(screen.getByLabelText('Operator'), 'in')
    await user.type(screen.getByLabelText('Value'), 'draft, sent')
    await user.click(screen.getByRole('button', { name: 'Add filter' }))
    await waitFor(() =>
      expect(lastQuery(api)?.filter).toEqual({
        op: 'in',
        field: 'status',
        values: ['draft', 'sent'],
      }),
    )
    expect(screen.getByRole('list', { name: 'Active filters' })).toHaveTextContent(
      'Status is any of draft, sent',
    )
    expect(await screen.findByText('Showing 20 invoices')).toBeInTheDocument() // 30 seeded, 10 paid

    await user.click(
      screen.getByRole('button', { name: 'Remove filter: Status is any of draft, sent' }),
    )
    await waitFor(() => expect(lastQuery(api)?.filter).toBeUndefined())
  })

  test('between filter on a decimal field', async () => {
    const { api, user } = await renderList()
    await user.selectOptions(screen.getByLabelText('Filter field'), 'amount')
    await user.selectOptions(screen.getByLabelText('Operator'), 'between')
    await user.type(screen.getByLabelText('From'), '10')
    await user.type(screen.getByLabelText('To'), '99.5')
    await user.click(screen.getByRole('button', { name: 'Add filter' }))
    await waitFor(() =>
      expect(lastQuery(api)?.filter).toEqual({
        op: 'between',
        field: 'amount',
        from: 10,
        to: 99.5,
      }),
    )
    expect(screen.getByRole('list', { name: 'Active filters' })).toHaveTextContent(
      'Amount is between 10 and 99.5',
    )
  })

  test('an invalid filter value is refused in the UI and never sent', async () => {
    const { api, user } = await renderList()
    const before = api.requests.length
    await user.selectOptions(screen.getByLabelText('Filter field'), 'amount')
    await user.type(screen.getByLabelText('Value'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Add filter' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid value for Amount.')
    expect(screen.getByLabelText('Value')).toHaveAttribute('aria-invalid', 'true')
    expect(api.requests.length).toBe(before)
  })

  test('search goes to the server (debounced: one request for the whole word)', async () => {
    const { api, user } = await renderList()
    const before = api.requests.length
    await user.type(screen.getByLabelText('Search Invoices'), 'INV-1029')
    await waitFor(() => expect(lastQuery(api)?.search).toBe('INV-1029'))
    await screen.findByText('Showing 1 invoices')
    expect(api.requests.length - before).toBeLessThanOrEqual(2)
  })

  test('cursor pagination: Next sends the cursor, Previous returns to page 1', async () => {
    const { api, user } = await renderList()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() =>
      expect(lastQuery(api)?.page).toMatchObject({
        kind: 'cursor',
        size: 25,
        cursor: expect.any(String),
      }),
    )
    await screen.findByText('Showing 5 invoices')
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    await waitFor(() => expect(lastQuery(api)?.page).toEqual({ kind: 'cursor', size: 25 }))
  })

  test('list state is reported as a URL search string for the router', async () => {
    const onSearchStringChange = vi.fn()
    const { user } = await renderList({ onSearchStringChange })
    await user.click(screen.getByRole('button', { name: /Due date/ }))
    await waitFor(() => expect(onSearchStringChange).toHaveBeenLastCalledWith('sort=dueDate'))
  })

  test('initial URL state is applied on first load (deep links work)', async () => {
    const api = seededApi()
    renderWithUI(
      <ResourceList
        resource={invoiceResource}
        initialSearch="filter%5Bstatus%5D%5Beq%5D=paid&sort=-amount"
      />,
      { api },
    )
    await screen.findByText('Showing 10 invoices')
    expect(lastQuery(api)).toMatchObject({
      filter: { op: 'eq', field: 'status', value: 'paid' },
      sort: [{ field: 'amount', direction: 'desc' }],
    })
  })

  test('a deep link with disallowed parameters drops them (fail closed) and loads the rest', async () => {
    const api = seededApi()
    renderWithUI(
      <ResourceList
        resource={invoiceResource}
        initialSearch="filter[notes][contains]=x&filter[status][gt]=a&sort=-notes&page[size]=10&evil=1"
      />,
      { api },
    )
    await screen.findByText('Showing 10 invoices')
    const q = lastQuery(api)
    expect(q?.filter).toBeUndefined()
    expect(q?.sort).toBeUndefined()
    expect(q?.page).toEqual({ kind: 'cursor', size: 10 })
  })

  test('the pageSize prop sets the first request size (clamped to 100)', async () => {
    const api = seededApi(150)
    renderWithUI(<ResourceList resource={invoiceResource} pageSize={500} />, { api })
    await screen.findByText('Showing 100 invoices')
    expect(api.requests.filter((r) => r.path === 'invoices').map((r) => r.query.page)).toEqual([
      { kind: 'cursor', size: 100 },
    ])
  })
})

const MoneyCell: Cell = ({ value }) => <span data-testid="money">€{String(value)}</span>

const DateText: Cell = ({ value }) => <span data-testid="date">{String(value)}</span>

describe('capabilities and overrides', () => {
  test('no create/update/delete capability → no New, Edit or Delete buttons', async () => {
    await renderList({
      resource: withCapabilities(invoiceResource, { create: false, update: false, delete: false }),
      confirmDelete: () => true,
    })
    expect(screen.queryByRole('button', { name: /New invoice/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull()
  })

  test('with capabilities → New, and Edit + Delete per row labelled by the record title', async () => {
    await renderList({ confirmDelete: () => true })
    expect(screen.getByRole('button', { name: 'New invoice' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit INV-1000' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete INV-1000' })).toBeInTheDocument()
  })

  test('delete asks first; cancel sends nothing, confirm deletes with an idempotency key and refreshes', async () => {
    const confirmDelete = vi
      .fn<() => boolean>()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    const onDeleted = vi.fn()
    const { api, user } = await renderList({ confirmDelete, onDeleted })
    await user.click(screen.getByRole('button', { name: 'Delete INV-1000' }))
    expect(api.mutations).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Delete INV-1000' }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(api.mutations).toEqual([
      { method: 'delete', path: 'invoices', id: 'inv-0001', idempotencyKey: expect.any(String) },
    ])
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Delete INV-1000' })).toBeNull(),
    )
  })

  test('a failed delete shows a banner and the retry reuses the same idempotency key', async () => {
    const { api, user } = await renderList({ confirmDelete: () => true })
    api.failNext({ ...problem(503, 'SERVICE_UNAVAILABLE', 'Unavailable'), traceId: 't-1' })
    await user.click(screen.getByRole('button', { name: 'Delete INV-1000' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete INV-1000. The service is temporarily unavailable.',
    )
    await user.click(screen.getByRole('button', { name: 'Delete INV-1000' }))
    await waitFor(() => expect(api.mutations).toHaveLength(2))
    expect(api.mutations[1]?.idempotencyKey).toBe(api.mutations[0]?.idempotencyKey)
  })

  test('a per-column cell override replaces only that column, without forking the renderer', async () => {
    renderWithUI(<ResourceList resource={invoiceResource} />, {
      overrides: { fieldCells: { 'Invoice.amount': MoneyCell } },
    })
    await screen.findByText('Showing 25 invoices')
    expect(screen.getAllByTestId('money')).toHaveLength(25)
    expect(screen.getAllByTestId('money')[1]).toHaveTextContent('€37')
  })

  test('a per-type cell override and catalog override apply everywhere', async () => {
    renderWithUI(<ResourceList resource={invoiceResource} />, {
      overrides: {
        cells: { date: DateText },
        messages: { 'ui.list.showing': '{count} {resource} found' },
      },
    })
    await screen.findByText('25 invoices found')
    expect(screen.getAllByTestId('date')[0]).toHaveTextContent('2026-12-01')
  })
})

describe('error states', () => {
  test('a failing list shows a friendly banner (never internals) and no empty-state text', async () => {
    const api: ResourceApi = {
      ...seededApi(),
      list: async () => {
        throw new Error('TypeError at db.ts:42')
      },
      get: async () => {
        throw new Error('unused')
      },
      create: async () => {
        throw new Error('unused')
      },
      update: async () => {
        throw new Error('unused')
      },
      delete: async () => {},
    }
    renderWithUI(<ResourceList resource={invoiceResource} />, { api })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the list. Please retry.',
    )
    expect(screen.queryByText(/db\.ts/)).toBeNull()
    expect(screen.queryByText(/No invoices match/)).toBeNull()
  })

  test('a problem from the server is rendered from the catalog', async () => {
    const api = seededApi()
    vi.spyOn(api, 'list').mockRejectedValue(
      new (await import('../src/core/problems.ts')).ApiProblemError(
        problem(403, 'FORBIDDEN', 'Forbidden'),
      ),
    )
    renderWithUI(<ResourceList resource={invoiceResource} />, { api })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to do this.',
    )
  })

  test('an empty result says so', async () => {
    renderWithUI(<ResourceList resource={invoiceResource} />, { api: seededApi(0) })
    expect(await screen.findByText('No invoices match these filters.')).toBeInTheDocument()
  })
})

describe('accessibility', () => {
  test('axe: no violations on the loaded list (color-contrast needs a real browser)', async () => {
    const { container } = await renderList({ confirmDelete: () => true })
    await waitFor(() => expect(screen.getAllByText('Acme GmbH').length).toBeGreaterThan(0))
    expect(await axeViolations(container)).toEqual([])
  })

  test('axe: no violations with an active filter chip and a filter error', async () => {
    const { container, user } = await renderList()
    await user.selectOptions(screen.getByLabelText('Filter field'), 'status')
    await user.type(screen.getByLabelText('Value'), 'draft')
    await user.click(screen.getByRole('button', { name: 'Add filter' }))
    await screen.findByRole('list', { name: 'Active filters' })
    await user.selectOptions(screen.getByLabelText('Filter field'), 'amount')
    await user.type(screen.getByLabelText('Value'), 'x')
    await user.click(screen.getByRole('button', { name: 'Add filter' }))
    await screen.findByRole('alert')
    expect(await axeViolations(container)).toEqual([])
  })
})
