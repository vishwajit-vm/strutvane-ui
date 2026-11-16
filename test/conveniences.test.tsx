// @vitest-environment jsdom
// The P0 conveniences end to end, through <StrutvaneApp> on the reference API: Back with restored
// list state, breadcrumbs, the command palette, shortcuts (and the shortcutBlocked rule), filter
// chips, column and density preferences, undo delete, the unsaved-changes guard (links, Escape,
// browser Back), sign in again on a 401 that keeps the draft, the CSRF header, the mobile drawer,
// the theme switch and package pages in the sidebar.
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { StrutvaneApp } from '../src/react/StrutvaneApp.tsx'
import { createReferenceApi } from '../src/testing/reference-api.ts'
import { axeViolations } from './helpers.tsx'

const PASSWORD = 'correct horse battery staple'
const PALETTE = 'Search screens, records and commands'

function start(path: string, extra: Partial<Parameters<typeof StrutvaneApp>[0]> = {}) {
  window.history.replaceState(null, '', path)
  const api = createReferenceApi()
  const utils = render(
    <StrutvaneApp apiUrl="/api" appName="Reference" fetch={api.fetch} {...extra} />,
  )
  return { api, user: userEvent.setup(), ...utils }
}

const nav = () => screen.getByRole('navigation', { name: 'Main navigation' })
const heading = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name })
const onList = () => screen.findByRole('region', { name: 'Posts table' })

beforeEach(() => {
  localStorage.clear()
  // biome-ignore lint/suspicious/noDocumentCookie: the test plays the framework, which sets this cookie.
  document.cookie = 'XSRF-TOKEN=; max-age=0'
})
afterEach(() => window.history.replaceState(null, '', '/'))

describe('Back and breadcrumbs', () => {
  test('Back returns to the list with its page restored (from its URL)', async () => {
    const { user } = start('/posts?page[number]=2')
    await screen.findByText('Showing 26–30 of 30 posts')
    await user.click(screen.getByRole('button', { name: 'Open Launch notes 26' }))
    await heading('Launch notes 26')
    expect(window.location.pathname).toBe('/posts/launch-notes-26')
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Posts' })).toHaveAttribute('href', '/posts')
    expect(within(crumbs).getByText('Launch notes 26')).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('button', { name: 'Back to Posts' }))
    await screen.findByText('Showing 26–30 of 30 posts')
    expect(decodeURIComponent(window.location.search)).toBe('?page[number]=2')
  })

  test('on a direct link, Back (and Alt+←) goes to the parent page instead of leaving the app', async () => {
    const { user } = start('/posts/launch-notes-3')
    await heading('Launch notes 3')
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    await onList()
    expect(window.location.pathname).toBe('/posts')
  })
})

describe('command palette', () => {
  test('Ctrl+K opens it; a record search opens the record; Escape closes and returns focus', async () => {
    const { user, container } = start('/posts')
    await onList()
    const search = screen.getByRole('button', { name: /Search and commands/ })
    search.focus()
    await user.keyboard('{Control>}k{/Control}')
    const box = await screen.findByRole('combobox', {
      name: 'Search screens, records and commands',
    })
    expect(box).toHaveFocus()
    expect(await axeViolations(container)).toEqual([])
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('combobox', { name: PALETTE })).toBeNull())
    expect(search).toHaveFocus()

    await user.keyboard('/')
    await user.type(await screen.findByRole('combobox', { name: PALETTE }), 'notes 30')
    const option = await screen.findByRole('option', { name: /^Launch notes 30/ })
    expect(option).toHaveTextContent('Launch notes 30 · Post')
    await user.click(option)
    await heading('Launch notes 30')
  })

  test('arrow keys move the highlight; Enter runs screens and actions; no match says so', async () => {
    const { user } = start('/posts')
    await onList()
    await user.keyboard('{Control>}k{/Control}')
    const box = await screen.findByRole('combobox', { name: PALETTE })
    await user.type(box, 'new post')
    const action = await screen.findByRole('option', { name: 'New post' })
    expect(action).toHaveAttribute('aria-selected', 'true')
    expect(box).toHaveAttribute('aria-activedescendant', action.id)
    await user.keyboard('{Enter}')
    await heading('New post')

    await user.keyboard('{Control>}k{/Control}')
    await user.type(await screen.findByRole('combobox', { name: PALETTE }), 'zzzz-nothing')
    expect(await screen.findByText('Nothing matches “zzzz-nothing”.')).toBeInTheDocument()
    await user.clear(screen.getByRole('combobox', { name: PALETTE }))
    await user.type(screen.getByRole('combobox', { name: PALETTE }), 'dark')
    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}')
    await waitFor(() =>
      expect(document.querySelector('[data-sv-design]')?.getAttribute('data-sv-theme')).toBe(
        'dark',
      ),
    )
  })
})

describe('keyboard shortcuts', () => {
  test('? shows the list; n opens New on a list; never while typing; g d goes home', async () => {
    const { user } = start('/posts')
    await onList()
    await user.keyboard('?')
    const help = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
    await user.click(within(help).getByRole('button', { name: 'Close' }))

    await user.type(screen.getByLabelText('Search Posts'), 'n')
    expect(window.location.pathname).toBe('/posts')
    await user.click(document.body)
    await user.keyboard('n')
    await heading('New post')
    await user.click(document.body)
    await user.keyboard('gd')
    await heading('Welcome to Reference')
  })

  test('e edits the record on a record page', async () => {
    const { user } = start('/posts/launch-notes-4')
    await heading('Launch notes 4')
    await user.keyboard('e')
    await heading('Edit post')
    expect(window.location.pathname).toBe('/posts/launch-notes-4/edit')
  })
})

describe('list conveniences', () => {
  test('search and filters are chips; each removes itself; Clear all removes all', async () => {
    const { user } = start('/posts?filter[status][eq]=draft')
    await screen.findByText('Showing 1–10 of 10 posts')
    await user.type(screen.getByLabelText('Search Posts'), 'notes 1')
    const chips = await screen.findByRole('list', { name: 'Active filters' })
    await within(chips).findByText('Search: notes 1')
    await user.click(screen.getByRole('button', { name: 'Remove search: notes 1' }))
    await waitFor(() => expect(within(chips).queryByText('Search: notes 1')).toBeNull())
    expect(screen.getByLabelText('Search Posts')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    await screen.findByText('Showing 1–25 of 30 posts')
    expect(window.location.search).toBe('')
  })

  test('hidden columns and compact rows are remembered; the title column always stays', async () => {
    const { user, unmount } = start('/posts')
    await onList()
    await user.click(screen.getByRole('button', { name: 'Columns' }))
    const menu = screen.getByRole('group', { name: 'Columns' })
    expect(within(menu).getByLabelText('Title')).toBeDisabled()
    await user.click(within(menu).getByLabelText('Status'))
    expect(screen.queryByRole('columnheader', { name: /Status/ })).toBeNull()
    await user.keyboard('{Escape}')
    const compact = screen.getByRole('button', { name: 'Compact rows' })
    await user.click(compact)
    expect(compact).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('table')).toHaveAttribute('data-sv-density', 'compact')
    unmount()
    start('/posts')
    await onList()
    expect(screen.queryByRole('columnheader', { name: /Status/ })).toBeNull()
    expect(screen.getByRole('table')).toHaveAttribute('data-sv-density', 'compact')
  })

  test('a soft delete sends the CSRF header, and Undo restores the record', async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: the test plays the framework, which sets this cookie.
    document.cookie = 'XSRF-TOKEN=csrf-123'
    const { api, user } = start('/posts')
    await onList()
    await user.click(screen.getByRole('button', { name: 'Delete Launch notes 1' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Launch notes 1?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await screen.findByText('Launch notes 1 was deleted.')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await screen.findByText('Launch notes 1 was restored.')
    const writes = api.requests.filter((r) => r.method !== 'GET')
    expect(writes.map((r) => [r.method, r.path, r.headers['x-xsrf-token']])).toEqual([
      ['DELETE', '/api/posts/launch-notes-1', 'csrf-123'],
      ['POST', '/api/posts/launch-notes-1/restore', 'csrf-123'],
    ])
    expect(
      api.requests.filter((r) => r.method === 'GET').every((r) => !r.headers['x-xsrf-token']),
    ).toBe(true)
  })
})

describe('the unsaved-changes guard', () => {
  async function dirtyForm() {
    const ctx = start('/posts/new')
    await heading('New post')
    await ctx.user.type(screen.getByLabelText(/^Title/), 'Draft title')
    return ctx
  }

  test('a link asks first: Keep editing (focused) stays, Discard leaves', async () => {
    const { user, container } = await dirtyForm()
    await user.click(within(nav()).getByRole('link', { name: 'Authors' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Leave without saving?' })
    const keep = within(dialog).getByRole('button', { name: 'Keep editing' })
    expect(keep).toHaveFocus()
    expect(await axeViolations(container)).toEqual([])
    await user.click(keep)
    expect(window.location.pathname).toBe('/posts/new')
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Draft title')
    await user.click(within(nav()).getByRole('link', { name: 'Authors' }))
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await heading('Authors')
  })

  test('Escape asks first', async () => {
    const { user } = await dirtyForm()
    await user.keyboard('{Escape}')
    await screen.findByRole('alertdialog', { name: 'Leave without saving?' })
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(window.location.pathname).toBe('/posts/new')
  })

  test('the browser Back button is held, undone, and replayed on Discard', async () => {
    const { user } = start('/posts')
    await onList()
    await user.click(screen.getAllByRole('button', { name: 'New post' })[0] as HTMLElement)
    await heading('New post')
    await user.type(screen.getByLabelText(/^Title/), 'Draft')
    act(() => window.history.back())
    await screen.findByRole('alertdialog', { name: 'Leave without saving?' })
    await waitFor(() => expect(window.location.pathname).toBe('/posts/new'))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    await onList()
    await waitFor(() => expect(window.location.pathname).toBe('/posts'))
  })

  test('reloading or closing the tab is held by the browser prompt; never after saving', async () => {
    const { user } = await dirtyForm()
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Create post' }))
    await heading('Draft title')
    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })

  test('a 401 on save keeps the draft and opens "sign in again"; saving afterwards works', async () => {
    const { api, user } = await dirtyForm()
    await api.fetch('/api/auth/sign-out', { method: 'POST' })
    await user.click(screen.getByRole('button', { name: 'Create post' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sign in again' })
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Draft title')
    await user.type(within(dialog).getByLabelText('Email'), 'ada@example.com')
    await user.type(within(dialog).getByLabelText('Password'), PASSWORD)
    await user.click(within(dialog).getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Draft title')
    await user.click(screen.getByRole('button', { name: 'Create post' }))
    await heading('Draft title')
  })
})

describe('shell', () => {
  test('the menu button opens and closes the drawer; the scrim closes it', async () => {
    const { user, container } = start('/posts')
    await onList()
    // On a desktop-width stylesheet the button is hidden (display: none), so find it by its hook.
    const button = container.querySelector<HTMLButtonElement>('[data-sv-part="menu-button"]')
    if (!button) throw new Error('no menu button')
    expect(button).toHaveAttribute('aria-label', 'Open menu')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)
    expect(button).toHaveAttribute('aria-label', 'Close menu')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(container.querySelector('[data-nav-open]')).not.toBeNull()
    const scrim = container.querySelector('[data-sv-part="scrim"]')
    if (!(scrim instanceof HTMLElement)) throw new Error('no scrim')
    await user.click(scrim)
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(container.querySelector('[data-nav-open]')).toBeNull()
  })

  test('the theme switch changes the theme and remembers it', async () => {
    const { user } = start('/posts')
    await onList()
    await user.selectOptions(screen.getByLabelText('Theme'), 'dark')
    expect(document.querySelector('[data-sv-design]')?.getAttribute('data-sv-theme')).toBe('dark')
    expect(localStorage.getItem('strutvane:theme')).toBe('dark')
  })

  test('the sidebar: groups, the current page, badges in the name, allowed package pages only', async () => {
    const logs = {
      name: 'logs',
      label: 'Logs',
      path: '/logs',
      icon: 'list',
      group: 'System',
      order: 1,
      badge: 3,
      permission: 'logs.view',
    }
    start('/posts', {
      sidebar: [
        logs,
        { ...logs, name: 'secret', label: 'Secret', path: '/secret', permission: 'secret.view' },
      ],
      can: (p) => p === 'logs.view',
      routes: [{ path: '/logs', element: <p>Log viewer</p> }],
    })
    await onList()
    const menu = nav()
    expect(within(menu).getByRole('link', { name: 'Posts' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(menu).getByRole('link', { name: 'Logs, 3' })).toHaveAttribute('href', '/logs')
    expect(within(menu).queryByRole('link', { name: /Secret/ })).toBeNull()
    expect(within(menu).getByText('System')).toBeInTheDocument()
  })

  test('sign out goes to the sign-in screen only once the server confirmed it', async () => {
    const { user, api } = start('/posts')
    await onList()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('heading', { name: 'Sign in to Reference' })
    expect(api.requests.some((r) => r.path === '/api/auth/sign-out')).toBe(true)
  })
})
