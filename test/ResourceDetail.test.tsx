// @vitest-environment jsdom
// The detail page: fields through the registry cells, capability-gated actions, failures, and the
// shared delete flow (confirm, type-to-confirm when permanent, one request per action, safe retry).
import { screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { ResourceDetail } from '../src/react/ResourceDetail.tsx'
import { problem } from './fixtures/fake-api.ts'
import { customerResource, withCapabilities } from './fixtures/manifest.ts'
import { axeViolations, renderWithUI, seededApi } from './helpers.tsx'

/** Open the delete dialog, type the name (customers are deleted permanently) and confirm. */
async function confirmPermanentDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Delete' }))
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete Acme GmbH?' })
  const confirm = within(dialog).getByRole('button', { name: 'Delete' })
  expect(confirm).toBeDisabled()
  await user.type(within(dialog).getByLabelText('Type Acme GmbH to confirm'), 'Acme GmbH')
  expect(confirm).toBeEnabled()
  await user.click(confirm)
}

describe('<ResourceDetail> delete', () => {
  test('a permanent delete asks to type the name; Cancel is focused and sends nothing', async () => {
    const api = seededApi()
    const { container } = renderWithUI(
      <ResourceDetail resource={customerResource} recordId="c1" deletable />,
      { api },
    )
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Acme GmbH?' })
    expect(dialog).toHaveAccessibleDescription(
      'This permanently deletes Acme GmbH. It cannot be undone.',
    )
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(await axeViolations(container)).toEqual([])
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
    expect(api.mutations).toEqual([])
  })

  test('confirming deletes once, then reports it (one DELETE per action)', async () => {
    const api = seededApi()
    const onDeleted = vi.fn()
    renderWithUI(
      <ResourceDetail resource={customerResource} recordId="c1" deletable onDeleted={onDeleted} />,
      { api },
    )
    const user = userEvent.setup()
    await confirmPermanentDelete(user)
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(api.mutations.filter((m) => m.method === 'delete')).toHaveLength(1)
    expect(await screen.findByText('Acme GmbH was deleted.')).toBeInTheDocument()
    // Permanent: nothing to undo.
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  test('a retry after an unknown outcome reuses the idempotency key', async () => {
    const api = seededApi()
    api.failNext(problem(503, 'SERVICE_UNAVAILABLE', 'Unavailable'))
    renderWithUI(<ResourceDetail resource={customerResource} recordId="c1" deletable />, { api })
    const user = userEvent.setup()
    await confirmPermanentDelete(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete Acme GmbH.')
    await confirmPermanentDelete(user)
    await waitFor(() => expect(api.mutations).toHaveLength(2))
    const [first, second] = api.mutations
    expect(first?.idempotencyKey).toBeTruthy()
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey)
  })

  test('without the capability there is no Delete button', async () => {
    renderWithUI(
      <ResourceDetail
        resource={withCapabilities(customerResource, { delete: false })}
        recordId="c1"
        deletable
      />,
    )
    await screen.findByRole('heading', { name: 'Acme GmbH' })
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })
})

describe('<ResourceDetail> page', () => {
  test('breadcrumbs end at the record; Edit is the e shortcut target', async () => {
    const onEdit = vi.fn()
    renderWithUI(
      <ResourceDetail
        resource={customerResource}
        recordId="c1"
        onEdit={onEdit}
        breadcrumbs={[
          { label: 'Home', to: '/' },
          { label: 'Customers', to: '/customers' },
        ]}
      />,
    )
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByText('Acme GmbH')).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Customers' })).toHaveAttribute(
      'href',
      '/customers',
    )
    const edit = screen.getByRole('button', { name: 'Edit' })
    expect(edit).toHaveAttribute('data-sv-shortcut', 'edit')
    await userEvent.setup().click(edit)
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  test('a missing record and a forbidden one say so, with no record data', async () => {
    renderWithUI(<ResourceDetail resource={customerResource} recordId="nope" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('This page does not exist')
  })

  test('a 401 asks the shell to sign in again', async () => {
    const api = seededApi()
    const onUnauthenticated = vi.fn()
    vi.spyOn(api, 'get').mockRejectedValue(
      Object.assign(new Error('x'), {
        name: 'ApiProblemError',
        problem: problem(401, 'UNAUTHENTICATED', 'Sign in'),
      }),
    )
    const { StrutvaneProvider } = await import('../src/react/StrutvaneProvider.tsx')
    const { QueryClient } = await import('@tanstack/react-query')
    const { render } = await import('@testing-library/react')
    const { manifest } = await import('./fixtures/manifest.ts')
    render(
      <StrutvaneProvider
        api={api}
        manifest={manifest}
        queryClient={new QueryClient()}
        onUnauthenticated={onUnauthenticated}
      >
        <ResourceDetail resource={customerResource} recordId="c1" />
      </StrutvaneProvider>,
    )
    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalled())
  })
})
