// @vitest-environment jsdom
// ResourceList driven like a user would: assert what is shown AND which ListQuery reached the API.
// Ported from spike 08 (acceptance tests), plus delete gating, error states and the URL rules.
import { act, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import type { ResourceApi } from '../src/core/types.ts'
import { ResourceList, type ResourceListProps } from '../src/react/ResourceList.tsx'
import type { Cell } from '../src/react/types.ts'
import { type FakeApi, problem } from './fixtures/fake-api.ts'
import { invoiceResource, withCapabilities } from './fixtures/manifest.ts'
import { axeViolations, renderWithUI, seededApi, showing } from './helpers.tsx'

const lastQuery = (api: FakeApi) => api.requests.filter((r) => r.path === 'invoices').at(-1)?.query

async function renderList(props: Partial<ResourceListProps> = {}, api = seededApi()) {
  const utils = renderWithUI(
    <ResourceList resource={invoiceResource} onCreate={() => {}} onEdit={() => {}} {...props} />,
    { api },
  )
  await screen.findByText(showing(25))
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
    await screen.findByText(showing(25))
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
    expect(await screen.findByText(showing(20))).toBeInTheDocument() // 30 seeded, 10 paid

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
        from: '10',
        to: '99.5',
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
    await screen.findByText(showing(1))
    expect(api.requests.length - before).toBeLessThanOrEqual(2)
  })

  test('numbered pages: "Showing 1–25 of 30", page buttons, Next and Previous', async () => {
    const { api, user } = await renderList()
    expect(screen.getByText('Showing 1–25 of 30 invoices')).toBeInTheDocument()
    const pages = screen.getByRole('navigation', { name: 'Invoices pagination' })
    expect(within(pages).getByRole('button', { name: 'Page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() =>
      expect(lastQuery(api)?.page).toEqual({ kind: 'offset', size: 25, number: 2 }),
    )
    await screen.findByText('Showing 26–30 of 30 invoices')
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    await user.click(within(pages).getByRole('button', { name: 'Page 1' }))
    await waitFor(() =>
      expect(lastQuery(api)?.page).toEqual({ kind: 'offset', size: 25, number: 1 }),
    )
  })

  test('rows per page: 10/25/50/100, back to page 1, never above maxPerPage', async () => {
    const { api, user } = await renderList({}, seededApi(60))
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await screen.findByText('Showing 26–50 of 60 invoices')
    const select = screen.getByLabelText('Rows per page')
    expect([...(select as HTMLSelectElement).options].map((o) => o.value)).toEqual([
      '10',
      '25',
      '50',
      '100',
    ])
    await user.selectOptions(select, '50')
    await waitFor(() =>
      expect(lastQuery(api)?.page).toEqual({ kind: 'offset', size: 50, number: 1 }),
    )
  })

  test("a resource's maxPerPage caps the page size and the choices", async () => {
    const api = seededApi(60)
    renderWithUI(
      <ResourceList
        resource={{ ...invoiceResource, maxPerPage: 20 } as typeof invoiceResource}
        pageSize={100}
      />,
      { api },
    )
    await screen.findByText('Showing 1–20 of 60 invoices')
    expect(lastQuery(api)?.page).toEqual({ kind: 'offset', size: 20, number: 1 })
    const select = screen.getByLabelText('Rows per page') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['10', '20'])
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
    await screen.findByText(showing(10))
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
    await screen.findByText(showing(10))
    const q = lastQuery(api)
    expect(q?.filter).toBeUndefined()
    expect(q?.sort).toBeUndefined()
    expect(q?.page).toEqual({ kind: 'offset', size: 10, number: 1 })
  })

  test('the pageSize prop sets the first request size (clamped to 100)', async () => {
    const api = seededApi(150)
    renderWithUI(<ResourceList resource={invoiceResource} pageSize={500} />, { api })
    await screen.findByText(showing(100))
    expect(api.requests.filter((r) => r.path === 'invoices').map((r) => r.query.page)).toEqual([
      { kind: 'offset', size: 100, number: 1 },
    ])
  })
})

const MoneyCell: Cell = ({ value }) => <span data-testid="money">€{String(value)}</span>

const DateText: Cell = ({ value }) => <span data-testid="date">{String(value)}</span>

describe('capabilities and overrides', () => {
  test('no create/update/delete capability → no New, Edit or Delete buttons', async () => {
    await renderList({
      resource: withCapabilities(invoiceResource, { create: false, update: false, delete: false }),
      deletable: true,
    })
    expect(screen.queryByRole('button', { name: /New invoice/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull()
  })

  test('with capabilities → New, and Edit + Delete per row labelled by the record title', async () => {
    await renderList({ deletable: true })
    expect(screen.getByRole('button', { name: 'New invoice' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit INV-1000' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete INV-1000' })).toBeInTheDocument()
  })

  test('delete asks first; Cancel sends nothing; a permanent delete needs the name typed', async () => {
    const onDeleted = vi.fn()
    const { api, user } = await renderList({ deletable: true, onDeleted })
    await user.click(screen.getByRole('button', { name: 'Delete INV-1000' }))
    let dialog = await screen.findByRole('alertdialog', { name: 'Delete INV-1000?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(api.mutations).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Delete INV-1000' }))
    dialog = await screen.findByRole('alertdialog', { name: 'Delete INV-1000?' })
    const confirm = within(dialog).getByRole('button', { name: 'Delete' })
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByLabelText('Type INV-1000 to confirm'), 'INV-100')
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByLabelText('Type INV-1000 to confirm'), '0')
    await user.click(confirm)
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(api.mutations).toEqual([
      { method: 'delete', path: 'invoices', id: 'inv-0001', idempotencyKey: expect.any(String) },
    ])
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Delete INV-1000' })).toBeNull(),
    )
  })

  test('a soft delete offers Undo, which restores the record', async () => {
    const soft = {
      ...invoiceResource,
      softDeletes: true,
      capabilities: { ...invoiceResource.capabilities, restore: true },
    }
    const api = seededApi()
    renderWithUI(<ResourceList resource={soft} deletable />, { api })
    await screen.findByText(showing(25))
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Delete INV-1000' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete INV-1000?' })
    expect(dialog).toHaveAccessibleDescription(
      'INV-1000 moves to deleted records. You can undo this right after.',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await screen.findByText('INV-1000 was deleted.')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await screen.findByText('INV-1000 was restored.')
    expect(api.mutations.map((m) => m.method)).toEqual(['delete', 'restore'])
    await screen.findByRole('button', { name: 'Delete INV-1000' })
  })

  test('a failed delete shows a banner and the retry reuses the same idempotency key', async () => {
    const { api, user } = await renderList({ deletable: true })
    api.failNext({ ...problem(503, 'SERVICE_UNAVAILABLE', 'Unavailable'), traceId: 't-1' })
    const remove = async () => {
      await user.click(screen.getByRole('button', { name: 'Delete INV-1000' }))
      const dialog = await screen.findByRole('alertdialog')
      await user.type(within(dialog).getByRole('textbox'), 'INV-1000')
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    }
    await remove()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete INV-1000. The service is temporarily unavailable.',
    )
    await remove()
    await waitFor(() => expect(api.mutations).toHaveLength(2))
    expect(api.mutations[1]?.idempotencyKey).toBe(api.mutations[0]?.idempotencyKey)
  })

  test('a per-column cell override replaces only that column, without forking the renderer', async () => {
    renderWithUI(<ResourceList resource={invoiceResource} />, {
      overrides: { fieldCells: { 'Invoice.amount': MoneyCell } },
    })
    await screen.findByText(showing(25))
    expect(screen.getAllByTestId('money')).toHaveLength(25)
    expect(screen.getAllByTestId('money')[1]).toHaveTextContent('€37')
  })

  test('a per-type cell override and catalog override apply everywhere', async () => {
    renderWithUI(<ResourceList resource={invoiceResource} />, {
      overrides: {
        cells: { date: DateText },
        messages: { 'ui.list.showingRange': '{to} of {total} {resource} found' },
      },
    })
    await screen.findByText('25 of 30 invoices found')
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
    expect(await screen.findByText('No invoices yet.')).toBeInTheDocument()
  })
})

describe('accessibility', () => {
  test('axe: no violations on the loaded list (color-contrast needs a real browser)', async () => {
    const { container } = await renderList({ deletable: true })
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

/** A parent that re-renders on every report, passing a new inline callback each time. */
function CallbackParent({ calls }: { readonly calls: string[] }) {
  const [, setTick] = useState(0)
  return (
    <ResourceList
      resource={invoiceResource}
      onSearchStringChange={(s) => {
        calls.push(s)
        setTick((t) => t + 1)
      }}
    />
  )
}

describe('ResourceList callbacks', () => {
  test('an inline onSearchStringChange that re-renders the parent fires once per real change', async () => {
    const calls: string[] = []
    renderWithUI(<CallbackParent calls={calls} />)
    await screen.findByRole('table')
    await new Promise((r) => setTimeout(r, 50))
    expect(calls.length).toBe(1)
  })
})

/** A router stand-in: holds the URL search string and lets the test change it from outside. */
const url = { set: (_search: string) => {} }
function UrlHarness(props: { readonly initial: string; readonly onReport: (s: string) => void }) {
  const [search, setSearch] = useState(props.initial)
  url.set = setSearch
  return (
    <ResourceList
      resource={invoiceResource}
      initialSearch={search}
      onSearchStringChange={props.onReport}
      pageSize={50}
    />
  )
}

describe('the list follows URL changes made outside it (menu link, back/forward)', () => {
  // The router passes the CURRENT URL; the list used to read it only at mount, so clicking the menu
  // entry of the list you are on (or Back) changed the URL while the list kept its old filters.
  test('a new URL replaces the list state; the URL the list itself reported changes nothing', async () => {
    const api = seededApi()
    const reported: string[] = []
    renderWithUI(
      <UrlHarness
        initial="filter[status][eq]=paid&search=INV"
        onReport={(s) => reported.push(s)}
      />,
      { api },
    )
    await screen.findByText(showing(10))
    expect(screen.getByRole('searchbox')).toHaveValue('INV')
    // What the list reported comes back from the router: no reset, no extra request.
    const requests = api.requests.length
    act(() => url.set(reported.at(-1) ?? ''))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(api.requests.length).toBe(requests)
    // A different URL from outside (the menu link `/invoices`): the list resets to it.
    act(() => url.set(''))
    await screen.findByText(showing(30))
    expect(lastQuery(api)?.filter).toBeUndefined()
    expect(lastQuery(api)?.search).toBeUndefined()
    expect(lastQuery(api)?.page).toEqual({ kind: 'offset', size: 50, number: 1 }) // the pageSize prop still applies
    expect(screen.queryByRole('list', { name: 'Active filters' })).toBeNull()
    expect(screen.getByRole('searchbox')).toHaveValue('')
    // And Back to the filtered URL restores it.
    act(() => url.set('filter[status][eq]=paid'))
    await screen.findByText(showing(10))
    expect(lastQuery(api)?.filter).toEqual({ op: 'eq', field: 'status', value: 'paid' })
  })
})

describe('hostile or stale list URLs', () => {
  test('a page opened by link (page[number] in the URL) loads that page and can go back', async () => {
    const api = seededApi()
    renderWithUI(<ResourceList resource={invoiceResource} initialSearch="page[number]=2" />, {
      api,
    })
    await screen.findByText('Showing 26–30 of 30 invoices')
    const previous = screen.getByRole('button', { name: 'Previous page' })
    expect(previous).toBeEnabled()
    await userEvent.setup().click(previous)
    await screen.findByText(showing(25))
    expect(lastQuery(api)?.page).toEqual({ kind: 'offset', size: 25, number: 1 })
  })

  test('an old cursor link is dropped (fail closed) and the first page loads', async () => {
    const api = seededApi()
    renderWithUI(<ResourceList resource={invoiceResource} initialSearch="page[cursor]=abc" />, {
      api,
    })
    await screen.findByText(showing(25))
    expect(lastQuery(api)?.page).toEqual({ kind: 'offset', size: 25, number: 1 })
  })

  test('the search box cannot hold more than the server accepts', async () => {
    await renderList()
    expect(screen.getByRole('searchbox')).toHaveAttribute('maxLength', '200')
  })
})
