// @vitest-environment jsdom
import './helpers.tsx'
// The modal behaviour every design gets (focus in, Tab trapped, Escape, scrim, focus back), and the
// detail page's related list and failure notices.
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test } from 'vitest'
import { ModalDialog } from '../src/react/Dialog.tsx'
import { StrutvaneApp } from '../src/react/StrutvaneApp.tsx'
import { createReferenceApi } from '../src/testing/reference-api.ts'

function Harness(props: { readonly dismissible?: boolean; readonly empty?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <ModalDialog
          title="Title"
          description="Description"
          onClose={() => setOpen(false)}
          {...(props.dismissible === false ? { dismissible: false } : {})}
        >
          {props.empty ? (
            <p>No controls</p>
          ) : (
            <>
              <button type="button">First</button>
              <button type="button">Last</button>
            </>
          )}
        </ModalDialog>
      ) : null}
    </>
  )
}

describe('<ModalDialog>', () => {
  test('focus moves in, Tab wraps both ways, Escape closes and focus returns', async () => {
    render(<Harness />)
    const user = userEvent.setup()
    const opener = screen.getByRole('button', { name: 'Open' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Title' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('Description')
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  test('a scrim click closes it; a non-dismissible one ignores Escape and the scrim', async () => {
    const { container, unmount } = render(<Harness />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Open' }))
    const overlay = container.querySelector('[data-sv-part="overlay"]')
    if (!(overlay instanceof HTMLElement)) throw new Error('no overlay')
    await user.click(overlay)
    expect(screen.queryByRole('dialog')).toBeNull()
    unmount()

    const fixed = render(<Harness dismissible={false} />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.keyboard('{Escape}')
    const scrim = fixed.container.querySelector('[data-sv-part="overlay"]')
    if (!(scrim instanceof HTMLElement)) throw new Error('no overlay')
    await user.click(scrim)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  test('with nothing focusable, the panel takes focus and Tab stays inside', async () => {
    render(<Harness empty />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('dialog')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('dialog')).toHaveFocus()
  })
})

describe('detail page', () => {
  const start = (path: string, api = createReferenceApi()) => {
    window.history.replaceState(null, '', path)
    render(<StrutvaneApp apiUrl="/api" appName="Reference" fetch={api.fetch} />)
    return api
  }

  test('a hasMany relation is a related list filtered to this record; its rows open records', async () => {
    const api = start('/authors/1')
    await screen.findByRole('heading', { level: 1, name: 'Asha Rao' })
    const related = await screen.findByRole('region', { name: 'Posts' })
    await within(related).findByText('Showing 1–10 of 10 posts')
    expect(
      api.requests.some((r) => decodeURIComponent(r.search).includes('filter[authorId][eq]=1')),
    ).toBe(true)
    await userEvent
      .setup()
      .click(within(related).getByRole('button', { name: 'Open Launch notes 1' }))
    await screen.findByRole('heading', { level: 1, name: 'Launch notes 1' })
    expect(window.location.pathname).toBe('/posts/launch-notes-1')
  })

  test('a missing record, a refused one and a server failure each say so', async () => {
    start('/posts/no-such-post')
    expect(await screen.findByText(/This page does not exist/)).toBeInTheDocument()

    const api = createReferenceApi()
    const failing: typeof fetch = async (input, init) =>
      String(input).includes('/api/posts/launch-notes-2')
        ? Response.json(
            { type: 'about:blank', title: 'No', status: 403, code: 'forbidden' },
            { status: 403 },
          )
        : api.fetch(input, init)
    window.history.replaceState(null, '', '/posts/launch-notes-2')
    const second = render(<StrutvaneApp apiUrl="/api" fetch={failing} />)
    expect(await screen.findByText('You do not have permission to see this.')).toBeInTheDocument()
    second.unmount()

    const broken: typeof fetch = async (input, init) =>
      String(input).includes('/api/posts/launch-notes-3')
        ? new Response('<html>oops</html>', { status: 500 })
        : api.fetch(input, init)
    window.history.replaceState(null, '', '/posts/launch-notes-3')
    render(<StrutvaneApp apiUrl="/api" fetch={broken} />)
    await waitFor(
      () => expect(screen.getByText(/Something went wrong on our side/)).toBeInTheDocument(),
      { timeout: 5000 },
    )
  })
})
