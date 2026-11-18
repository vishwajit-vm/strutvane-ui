// @vitest-environment jsdom
// ResourceForm: widgets from field types, client validation, server issue routing (incl. array
// paths), focus management, non-validation problems, idempotent retries, read-only rules,
// capability gating, overrides and accessibility. Ported from spike 08 and extended.
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { NETWORK_ERROR_CODE } from '../src/core/problems.ts'
import { ResourceForm, type ResourceFormProps } from '../src/react/ResourceForm.tsx'
import type { Widget } from '../src/react/types.ts'
import { FakeApi, problem } from './fixtures/fake-api.ts'
import {
  customerResource,
  invoiceResource,
  manifest,
  withCapabilities,
} from './fixtures/manifest.ts'
import { axeViolations, customers, makeInvoices, renderWithUI, seededApi } from './helpers.tsx'

const freshApi = () => new FakeApi(manifest, { invoices: makeInvoices(3), customers })

async function renderCreate(api = freshApi(), extra: Partial<ResourceFormProps> = {}) {
  const onSaved = vi.fn()
  const utils = renderWithUI(
    <ResourceForm resource={invoiceResource} onSaved={onSaved} {...extra} />,
    { api },
  )
  await waitFor(() => expect(screen.getByRole('option', { name: 'Acme GmbH' })).toBeInTheDocument())
  return { ...utils, api, onSaved, user: userEvent.setup() }
}

type User = ReturnType<typeof userEvent.setup>

/** Fill every required field with valid values. */
async function fillValid(user: User, number = 'INV-9001') {
  await user.type(screen.getByLabelText(/^Number/), number)
  await user.selectOptions(screen.getByLabelText(/^Customer/), 'c2')
  await user.type(screen.getByLabelText(/^Amount/), '1250.5')
  await user.selectOptions(screen.getByLabelText(/^Status/), 'sent')
  await user.type(screen.getByLabelText(/^Issue date/), '2026-11-01')
  await user.type(screen.getByLabelText(/^Due date/), '2026-12-01')
}

const submit = (user: User, name = 'Create invoice') =>
  user.click(screen.getByRole('button', { name }))

describe('widgets are chosen from field types', () => {
  test('create mode renders the right control per field and hides read-only fields', async () => {
    await renderCreate()
    expect(screen.getByLabelText(/^Number/)).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText(/^Amount/)).toHaveAttribute('inputmode', 'decimal')
    expect(screen.getByLabelText(/^Status/).tagName).toBe('SELECT')
    expect(
      within(screen.getByLabelText(/^Status/))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Select…', 'draft', 'sent', 'paid'])
    expect(screen.getByLabelText(/^Paid/)).toHaveAttribute('type', 'checkbox')
    expect(screen.getByLabelText(/^Due date/)).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText(/^Notes/).tagName).toBe('TEXTAREA')
    expect(
      within(screen.getByLabelText(/^Customer/))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Select…', 'Acme GmbH', 'Globex Inc', 'Initech'])
    expect(screen.getByRole('searchbox', { name: 'Search Customers' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Created/)).toBeNull() // readOnly: hidden on create
    expect(screen.queryByLabelText(/^ID/)).toBeNull()
    expect(screen.getByLabelText(/^Number/)).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText(/^Number/)).toHaveAccessibleDescription('Format INV-1234')
  })

  test('regression: typing a decimal point is never swallowed', async () => {
    const { user } = await renderCreate()
    const amount = screen.getByLabelText(/^Amount/)
    await user.type(amount, '1250.')
    expect(amount).toHaveValue('1250.')
    await user.type(amount, '05')
    expect(amount).toHaveValue('1250.05')
  })
})

describe('client validation (before any request)', () => {
  test('submitting empty shows every required error, focuses the first invalid field, sends nothing', async () => {
    const { api, user } = await renderCreate()
    await submit(user)
    await waitFor(() => expect(screen.getByLabelText(/^Number/)).toHaveFocus())
    expect(screen.getByLabelText(/^Number/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/^Number/)).toHaveAccessibleDescription(
      'Format INV-1234 Number is required.',
    )
    expect(screen.getByText('Amount is required.')).toBeInTheDocument()
    expect(screen.getByText('Due date is required.')).toBeInTheDocument()
    expect(api.mutations).toEqual([])
  })

  test('regression: a message that sits in several error slots is shown once', async () => {
    const { user } = await renderCreate()
    await user.click(screen.getByLabelText(/^Amount/))
    await user.tab() // onBlur → "Amount is required."
    await submit(user) // onSubmit → the same message again
    await waitFor(() => expect(screen.getAllByText('Amount is required.')).toHaveLength(1))
  })

  test('validates on blur with the shared catalog (same words the server uses)', async () => {
    const { user } = await renderCreate()
    await user.type(screen.getByLabelText(/^Amount/), '-5')
    await user.tab()
    expect(await screen.findByText('Amount must be at least 0.')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^Number/), 'nope')
    await user.tab()
    expect(await screen.findByText('Number has an invalid format.')).toBeInTheDocument()
  })

  test('array item fields are validated too (required description)', async () => {
    const { user } = await renderCreate()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Add line items' }))
    await submit(user)
    await waitFor(() => expect(screen.getByLabelText(/^Description/)).toHaveFocus())
    expect(screen.getByLabelText(/^Description/)).toHaveAccessibleDescription(
      'Description is required.',
    )
  })
})

describe('server errors (422) land on the right fields', () => {
  test('real server rules: duplicate number + cross-field date rule; focus moves to the first', async () => {
    const { user } = await renderCreate()
    await fillValid(user, 'INV-1000') // INV-1000 already exists in the seed
    await user.clear(screen.getByLabelText(/^Due date/))
    await user.type(screen.getByLabelText(/^Due date/), '2026-10-01') // before issue date
    await submit(user)
    await waitFor(() => expect(screen.getByLabelText(/^Number/)).toHaveFocus())
    expect(screen.getByLabelText(/^Number/)).toHaveAccessibleDescription(
      expect.stringContaining('This number is already taken.'),
    )
    expect(screen.getByLabelText(/^Due date/)).toHaveAccessibleDescription(
      'Due date must be on or after Issue date.',
    )
  })

  test('array paths (lines[1].amount), parent fallback, form-level and unknown-field issues', async () => {
    const api = freshApi()
    const { user } = await renderCreate(api)
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Add line items' }))
    await user.click(screen.getByRole('button', { name: 'Add line items' }))
    const descriptions = screen.getAllByLabelText(/^Description/)
    await user.type(descriptions[0] as HTMLElement, 'Consulting')
    await user.type(descriptions[1] as HTMLElement, 'Travel')
    api.failNext({
      ...problem(422, 'validation_failed', 'Validation failed'),
      issues: [
        {
          path: ['lines', 1, 'amount'],
          field: 'lines.1.amount',
          code: 'too_small',
          message: 'Line amount must be at least 0.',
        },
        {
          path: ['lines', 9, 'amount'],
          field: 'lines.9.amount',
          code: 'too_small',
          message: 'Line 10 is invalid.',
        },
        {
          path: [],
          field: '',
          code: 'budget_exceeded',
          message: 'This invoice exceeds the customer budget.',
        },
        {
          path: [],
          field: '',
          code: 'budget_exceeded',
          message: 'This invoice exceeds the customer budget.',
        },
        {
          path: ['internalOnly'],
          field: 'internalOnly',
          code: 'x',
          message: 'Something about a field you cannot see.',
        },
      ],
    })
    await submit(user)
    // First invalid in visual order is the 'Line items' group itself (it holds the 'Line 10' issue).
    await waitFor(() => expect(screen.getByRole('group', { name: 'Line items' })).toHaveFocus())
    const lineAmount = (await screen.findAllByLabelText(/^Line amount/))[1] as HTMLElement
    expect(lineAmount).toHaveAttribute('aria-invalid', 'true')
    expect(lineAmount).toHaveAccessibleDescription('Line amount must be at least 0.')
    expect(screen.getByText('Line 10 is invalid.')).toBeInTheDocument() // routed to the parent `lines`
    const banner = screen.getByRole('alert')
    expect(banner).toHaveTextContent('This invoice exceeds the customer budget.')
    expect(banner).toHaveTextContent('Something about a field you cannot see.') // never dropped
    expect(within(banner).getAllByText('This invoice exceeds the customer budget.')).toHaveLength(1) // once
  })

  test('only form-level issues: the banner gets focus', async () => {
    const api = freshApi()
    const { user } = await renderCreate(api)
    await fillValid(user)
    api.failNext({
      ...problem(422, 'validation_failed', 'Validation failed'),
      issues: [{ path: [], field: '', code: 'budget_exceeded', message: 'Over budget.' }],
    })
    await submit(user)
    const banner = await screen.findByRole('alert')
    await waitFor(() => expect(banner).toHaveFocus())
  })

  test('editing a field clears its (now stale) server error; resubmitting is possible', async () => {
    const { user, onSaved } = await renderCreate()
    await fillValid(user, 'INV-1000')
    await submit(user)
    await screen.findByText('This number is already taken.')
    await user.type(screen.getByLabelText(/^Number/), '9')
    await waitFor(() => expect(screen.queryByText('This number is already taken.')).toBeNull())
    await submit(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  })

  test('resubmitting without edits re-sends (stale server errors do not block the form)', async () => {
    const api = freshApi()
    const { user } = await renderCreate(api)
    await fillValid(user)
    api.failNext({
      ...problem(422, 'validation_failed', 'Validation failed'),
      issues: [{ path: ['number'], field: 'number', code: 'x', message: 'Try again.' }],
    })
    await submit(user)
    await screen.findByText('Try again.')
    await submit(user)
    await waitFor(() => expect(api.mutations).toHaveLength(2))
  })
})

describe('non-validation problems', () => {
  test('409 conflict: banner with the problem detail, values kept, banner focused', async () => {
    const api = freshApi()
    const { user } = await renderCreate(api)
    await fillValid(user)
    api.failNext(
      problem(
        409,
        'STALE_RECORD',
        'Conflict',
        'Someone else changed this invoice. Reload to see their changes.',
      ),
    )
    await submit(user)
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent('Someone else changed this invoice.')
    await waitFor(() => expect(banner).toHaveFocus())
    expect(screen.getByLabelText(/^Number/)).toHaveValue('INV-9001')
  })

  test('500: friendly message with support reference, never internals', async () => {
    const api = freshApi()
    const { user } = await renderCreate(api)
    await fillValid(user)
    api.failNext({
      ...problem(500, 'internal_error', 'Internal error', 'TypeError at db.ts:42'),
      traceId: 'trace-9',
    })
    await submit(user)
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent(
      'Something went wrong on our side. Your changes are kept. Reference: trace-9.',
    )
    expect(banner).not.toHaveTextContent('db.ts')
  })

  test('401 keeps the draft and says so', async () => {
    const api = freshApi()
    const { user } = await renderCreate(api)
    await fillValid(user)
    api.failNext({
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      code: 'unauthenticated',
    })
    await submit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session has ended. Sign in again, then save',
    )
    expect(screen.getByLabelText(/^Amount/)).toHaveValue('1250.5')
  })

  test('an unknown thrown value never crashes the form', async () => {
    const api = freshApi()
    const { user } = await renderCreate(api)
    await fillValid(user)
    api.failNext(new TypeError('boom'))
    await submit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Your changes are kept.',
    )
  })

  test('network failure → offline message; the retry reuses the idempotency key', async () => {
    const api = freshApi()
    const { user, onSaved } = await renderCreate(api)
    await fillValid(user)
    api.failNext({
      type: 'about:blank',
      title: 'Network error',
      status: 0,
      code: NETWORK_ERROR_CODE,
    })
    await submit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('You appear to be offline.')
    await submit(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    const [first, second] = api.mutations
    expect(first?.idempotencyKey).toEqual(expect.any(String))
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey)
  })

  test('a definitive 4xx answer rotates the key; success rotates it too', async () => {
    const api = freshApi()
    const { user } = await renderCreate(api)
    await fillValid(user)
    api.failNext(problem(409, 'conflict', 'Conflict', 'Nope.'))
    await submit(user)
    await screen.findByRole('alert')
    await submit(user)
    await waitFor(() => expect(api.mutations).toHaveLength(2))
    expect(api.mutations[1]?.idempotencyKey).not.toBe(api.mutations[0]?.idempotencyKey)
  })

  test('success: onSaved receives the created record', async () => {
    const { user, onSaved } = await renderCreate()
    await fillValid(user)
    await submit(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved.mock.calls[0]?.[0]).toMatchObject({
      number: 'INV-9001',
      amount: 1250.5,
      customer: 'c2',
      status: 'sent',
    })
  })
})

describe('edit mode and read-only rules', () => {
  test('writeOnce becomes read-only, readOnly is shown read-only, only changed fields are sent', async () => {
    const api = freshApi()
    const update = vi.spyOn(api, 'update')
    renderWithUI(<ResourceForm resource={invoiceResource} recordId="inv-0001" />, { api })
    const user = userEvent.setup()
    const number = await screen.findByLabelText(/^Number/)
    expect(number).toHaveValue('INV-1000')
    expect(number).toHaveAttribute('readonly')
    expect(number).not.toHaveAttribute('aria-required')
    expect(screen.getByLabelText(/^Created/)).toHaveAttribute('readonly')
    // The selected relation shows its title even before the option pages load.
    await waitFor(() => expect(screen.getByLabelText(/^Customer/)).toHaveDisplayValue('Acme GmbH'))
    await user.clear(screen.getByLabelText(/^Amount/))
    await user.type(screen.getByLabelText(/^Amount/), '42')
    await submit(user, 'Save changes')
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0]?.[2]).toEqual({ amount: 42 })
  })

  test('a deleted record shows a friendly 404 message', async () => {
    renderWithUI(<ResourceForm resource={invoiceResource} recordId="missing" />, {
      api: freshApi(),
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('This record no longer exists.')
  })
})

describe('capability gating', () => {
  test('no create capability → no create form', async () => {
    const { container } = renderWithUI(
      <ResourceForm resource={withCapabilities(invoiceResource, { create: false })} />,
      { api: freshApi() },
    )
    expect(container.querySelector('form')).toBeNull()
  })

  test('no update capability → no edit form, and the record is not even fetched', async () => {
    const api = freshApi()
    const { container } = renderWithUI(
      <ResourceForm
        resource={withCapabilities(invoiceResource, { update: false })}
        recordId="inv-0001"
      />,
      { api },
    )
    expect(container.querySelector('form')).toBeNull()
    expect(api.gets).toEqual([])
  })
})

const Stepper: Widget = (p) => (
  <input
    id={p.id}
    data-testid="stepper"
    aria-describedby={p.describedBy}
    value={String(p.value ?? '')}
    onChange={(e) => p.onChange(Number(e.target.value))}
    onBlur={p.onBlur}
  />
)

const Big: Widget = (p) => (
  <textarea id={p.id} data-testid="big" readOnly value={String(p.value ?? '')} />
)

describe('overrides', () => {
  test('a per-field widget override is used for that field only, and its value flows into submit', async () => {
    const api = freshApi()
    const onSaved = vi.fn()
    renderWithUI(<ResourceForm resource={invoiceResource} onSaved={onSaved} />, {
      api,
      overrides: { fieldWidgets: { 'Invoice.amount': Stepper } },
    })
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Acme GmbH' })).toBeInTheDocument(),
    )
    expect(screen.getByTestId('stepper')).toBe(screen.getByLabelText(/^Amount/))
    expect(screen.getByLabelText(/^Number/)).toHaveAttribute('type', 'text') // others untouched
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/^Number/), 'INV-7')
    await user.selectOptions(screen.getByLabelText(/^Customer/), 'c1')
    await user.type(screen.getByTestId('stepper'), '7')
    await user.selectOptions(screen.getByLabelText(/^Status/), 'draft')
    await user.type(screen.getByLabelText(/^Issue date/), '2026-11-01')
    await user.type(screen.getByLabelText(/^Due date/), '2026-11-02')
    await submit(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ amount: 7 })
  })

  test('a widget registered by type applies to every field of that type; messages can be overridden', async () => {
    renderWithUI(<ResourceForm resource={invoiceResource} />, {
      api: freshApi(),
      overrides: {
        widgets: { date: Big },
        messages: { 'ui.form.submitCreate': 'Save new {resource}' },
      },
    })
    expect(await screen.findAllByTestId('big')).toHaveLength(2) // issueDate + dueDate
    expect(screen.getByRole('button', { name: 'Save new invoice' })).toBeInTheDocument()
  })
})

describe('accessibility', () => {
  test('axe: no violations on the empty form or with errors displayed', async () => {
    const { container, user } = await renderCreate()
    expect(await axeViolations(container)).toEqual([])
    await submit(user)
    await screen.findByText('Amount is required.')
    expect(await axeViolations(container)).toEqual([])
  })

  test('axe: no violations with server errors on array items and a banner', async () => {
    const api = freshApi()
    const { container, user } = await renderCreate(api)
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Add line items' }))
    await user.type(screen.getByLabelText(/^Description/), 'X')
    api.failNext({
      ...problem(422, 'validation_failed', 'Validation failed'),
      issues: [
        {
          path: ['lines', 0, 'amount'],
          field: 'lines.0.amount',
          code: 'too_small',
          message: 'Too small.',
        },
        { path: [], field: '', code: 'X', message: 'Form-level.' },
      ],
    })
    await submit(user)
    await screen.findByText('Too small.')
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('double submit', () => {
  // A double click, a double Enter or a slow network must never send the same form twice: the
  // framework does not deduplicate Idempotency-Key, so a second POST is a second record.
  test.each(['create', 'edit'] as const)(
    '%s: a second submit while the first is in flight sends nothing',
    async (mode) => {
      const api = seededApi()
      renderWithUI(
        <ResourceForm
          resource={customerResource}
          {...(mode === 'edit' ? { recordId: 'c1' } : {})}
        />,
        { api },
      )
      const name = await screen.findByLabelText(/Name/)
      await waitFor(() => expect(name).toHaveValue(mode === 'edit' ? 'Acme GmbH' : ''))
      fireEvent.change(name, { target: { value: 'Umbrella' } })
      const form = name.closest('form') as HTMLFormElement
      fireEvent.submit(form)
      fireEvent.submit(form)
      fireEvent.submit(form)
      await waitFor(() => expect(api.mutations).toHaveLength(1))
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(api.mutations).toHaveLength(1)
    },
  )

  test('after the first submit settles, the form can be submitted again (e.g. after an error)', async () => {
    const api = seededApi()
    api.failNext(problem(503, 'service_unavailable', 'Unavailable'))
    renderWithUI(<ResourceForm resource={customerResource} />, { api })
    const name = await screen.findByLabelText(/Name/)
    fireEvent.change(name, { target: { value: 'Umbrella' } })
    const form = name.closest('form') as HTMLFormElement
    fireEvent.submit(form)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    fireEvent.submit(form)
    await waitFor(() => expect(api.mutations).toHaveLength(2))
    expect(api.rows('customers').filter((r) => r['name'] === 'Umbrella')).toHaveLength(1)
  })
})
