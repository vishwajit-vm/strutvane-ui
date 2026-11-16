// @vitest-environment jsdom
// One cell or widget that throws while rendering (an app override, a future field type, a value of
// an unexpected shape) must never blank the whole screen: React unmounts the entire tree when a
// render error has no boundary. Each cell and each field is contained on its own.
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { RenderBoundary } from '../src/react/RenderBoundary.tsx'
import { ResourceDetail } from '../src/react/ResourceDetail.tsx'
import { ResourceForm } from '../src/react/ResourceForm.tsx'
import { ResourceList } from '../src/react/ResourceList.tsx'
import type { Cell, Widget } from '../src/react/types.ts'
import { customerResource, invoiceResource } from './fixtures/manifest.ts'
import { axeViolations, renderWithUI, seededApi, showing } from './helpers.tsx'

const Broken: Widget = () => {
  throw new Error('widget crashed')
}

const Child = ({ v }: { readonly v: string }) => {
  if (v === 'bad') throw new Error('child crashed')
  return <span>{v}</span>
}

/** A cell that crashes for one value only. */
const CrashOn =
  (bad: unknown): Cell =>
  ({ value }) => {
    if (value === bad) throw new Error('cell crashed')
    return <>{String(value)}</>
  }

describe('render errors are contained per cell and per field', () => {
  test('list: only the crashing cell shows a fallback; every other row and cell still renders', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = renderWithUI(<ResourceList resource={invoiceResource} />, {
      overrides: { fieldCells: { 'Invoice.number': CrashOn('INV-1000') } },
    })
    expect(await screen.findByText(showing(25))).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Invoices' })
    expect(within(table).getByText('INV-1001')).toBeInTheDocument()
    expect(within(table).getAllByText('Cannot display this value')).toHaveLength(1)
    expect(await axeViolations(container)).toEqual([])
  })

  test('a field type the registry does not know, with a crashing default cell, keeps the page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderWithUI(<ResourceList resource={customerResource} />, {
      overrides: { cells: { default: CrashOn('Acme GmbH') } },
    })
    expect(await screen.findByText(showing(3, 'customers'))).toBeInTheDocument()
    expect(screen.getByText('Globex Inc')).toBeInTheDocument()
  })

  test('detail: the crashing field shows a fallback; the other fields and actions remain', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderWithUI(<ResourceDetail resource={customerResource} recordId="c1" onEdit={() => {}} />, {
      overrides: { fieldCells: { 'Customer.region': CrashOn('EU') } },
    })
    expect(await screen.findByRole('heading', { name: 'Acme GmbH' })).toBeInTheDocument()
    expect(screen.getByText('Cannot display this value')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  test('form: a crashing widget is replaced by a notice; the other fields still save', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const api = seededApi()
    renderWithUI(<ResourceForm resource={customerResource} />, {
      api,
      overrides: { fieldWidgets: { 'Customer.region': Broken } },
    })
    const user = userEvent.setup()
    expect(
      await screen.findByText(
        'This field cannot be displayed. The other fields can still be saved.',
      ),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Name/), 'Umbrella')
    await user.click(screen.getByRole('button', { name: 'Create customer' }))
    await vi.waitFor(() =>
      expect(api.rows('customers').some((r) => r['name'] === 'Umbrella')).toBe(true),
    )
  })

  test('a cell that failed renders again when its value changes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const view = render(
      <RenderBoundary fallback={<span>fallback</span>} resetKey="bad">
        <Child v="bad" />
      </RenderBoundary>,
    )
    expect(screen.getByText('fallback')).toBeInTheDocument()
    view.rerender(
      <RenderBoundary fallback={<span>fallback</span>} resetKey="bad">
        <Child v="bad" />
      </RenderBoundary>,
    )
    expect(screen.getByText('fallback')).toBeInTheDocument()
    view.rerender(
      <RenderBoundary fallback={<span>fallback</span>} resetKey="good">
        <Child v="good" />
      </RenderBoundary>,
    )
    expect(screen.getByText('good')).toBeInTheDocument()
  })
})
