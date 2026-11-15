// @vitest-environment jsdom
// The detail page: fields through the registry cells, capability-gated actions, failures, and the
// delete flow (one request per user action, safe to retry).
import { screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { ResourceDetail } from '../src/react/ResourceDetail.tsx'
import { problem } from './fixtures/fake-api.ts'
import { customerResource, withCapabilities } from './fixtures/manifest.ts'
import { axeViolations, renderWithUI, seededApi } from './helpers.tsx'

describe('<ResourceDetail> delete', () => {
  test('a second click while the delete is in flight sends nothing (one DELETE per action)', async () => {
    const api = seededApi()
    let confirm: (ok: boolean) => void = () => {}
    const confirmDelete = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          confirm = resolve
        }),
    )
    const onDeleted = vi.fn()
    const { container } = renderWithUI(
      <ResourceDetail
        resource={customerResource}
        recordId="c1"
        confirmDelete={confirmDelete}
        onDeleted={onDeleted}
      />,
      { api },
    )
    const user = userEvent.setup()
    const button = await screen.findByRole('button', { name: 'Delete' })
    expect(await axeViolations(container)).toEqual([])
    await user.click(button)
    await user.click(button) // the confirmation dialog is still open
    confirm(true)
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(confirmDelete).toHaveBeenCalledTimes(1)
    expect(api.mutations.filter((m) => m.method === 'delete')).toHaveLength(1)
  })

  test('a retry after an unknown outcome reuses the idempotency key', async () => {
    const api = seededApi()
    api.failNext(problem(503, 'SERVICE_UNAVAILABLE', 'Unavailable'))
    renderWithUI(
      <ResourceDetail resource={customerResource} recordId="c1" confirmDelete={() => true} />,
      { api },
    )
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
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
        confirmDelete={() => true}
      />,
    )
    await screen.findByRole('heading', { name: 'Acme GmbH' })
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })
})
