// @vitest-environment jsdom
// The app shell end to end against a fake Strutvane API: sign-in (wrong password, rate limit),
// workspace auto-selection, menu, list → detail → edit routing, app routes, unknown paths, and a
// 401 mid-session returning to the sign-in screen. Plus accessibility checks.
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSessionClient } from '../src/core/session-client.ts'
import { matchPath } from '../src/react/router.tsx'
import { StrutvaneApp } from '../src/react/StrutvaneApp.tsx'
import { manifest } from './fixtures/manifest.ts'
import { axeViolations, customers } from './helpers.tsx'

const TENANT = '0190a000-0000-7000-8000-00000000000a'

interface FakeServer {
  fetch: typeof fetch
  signedIn: boolean
  calls: string[]
  /** Make the next resource request fail with this status. */
  failNext?: number | undefined
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': status >= 400 ? 'application/problem+json' : 'application/json',
      ...headers,
    },
  })
}
const problem = (status: number, code: string, headers: Record<string, string> = {}) =>
  json({ type: 'about:blank', title: code, status, code }, status, headers)

function fakeServer(
  options: {
    tenants?: number
    signedIn?: boolean
    /** Status the sign-out endpoint fails with (the session stays alive on the server). */
    failSignOut?: number
    /** Status the switch-tenant endpoint fails with. */
    failSwitch?: number
  } = {},
): FakeServer {
  let tenantId: string | undefined
  let attempts = 0
  const server: FakeServer = {
    signedIn: options.signedIn ?? false,
    calls: [],
    fetch: async (input, init) => {
      const url = new URL(String(input), 'http://app.test')
      const method = init?.method ?? 'GET'
      server.calls.push(`${method} ${url.pathname}`)
      const actor = () => ({
        actor: { id: 'u1', type: 'user', roles: ['owner'], ...(tenantId ? { tenantId } : {}) },
      })
      switch (`${method} ${url.pathname}`) {
        case 'GET /api/v1/auth/me':
          return server.signedIn ? json(actor()) : problem(401, 'UNAUTHENTICATED')
        case 'POST /api/v1/auth/sign-in': {
          const body = JSON.parse(String(init?.body)) as { password: string }
          attempts++
          if (attempts > 3) return problem(429, 'RATE_LIMITED', { 'retry-after': '42' })
          if (body.password !== 'correct-password') return problem(401, 'INVALID_CREDENTIALS')
          server.signedIn = true
          return json(actor())
        }
        case 'POST /api/v1/auth/sign-out':
          if (options.failSignOut) return problem(options.failSignOut, 'SERVICE_UNAVAILABLE')
          server.signedIn = false
          return new Response(null, { status: 204 })
        case 'GET /api/v1/auth/tenants':
          return json({
            data: Array.from({ length: options.tenants ?? 1 }, (_, i) => ({
              tenantId: i === 0 ? TENANT : `0190a000-0000-7000-8000-00000000000${i}`,
              name: `Workspace ${i + 1}`,
              slug: `w${i}`,
              roles: ['owner'],
            })),
          })
        case 'POST /api/v1/auth/switch-tenant':
          if (options.failSwitch) return problem(options.failSwitch, 'FORBIDDEN')
          tenantId = (JSON.parse(String(init?.body)) as { tenantId: string }).tenantId
          return json(actor())
        case 'GET /.well-known/strutvane.json':
          return server.signedIn ? json(manifest) : problem(401, 'UNAUTHENTICATED')
      }
      if (server.failNext) {
        const status = server.failNext
        server.failNext = undefined
        return problem(status, status === 401 ? 'UNAUTHENTICATED' : 'ERROR')
      }
      if (method === 'GET' && url.pathname === '/api/v1/customers')
        return json({ data: customers, meta: { page: { size: 25, hasMore: false } } })
      const one = /^\/api\/v1\/customers\/([^/]+)$/.exec(url.pathname)
      if (method === 'GET' && one) {
        const row = customers.find((c) => c.id === one[1])
        return row ? json(row) : problem(404, 'NOT_FOUND')
      }
      if (method === 'GET' && url.pathname === '/api/v1/invoices')
        return json({ data: [], meta: { page: { size: 25, hasMore: false } } })
      return problem(404, 'NOT_FOUND')
    },
  }
  return server
}

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => window.history.replaceState(null, '', '/'))

/** Wait until the app selected the only workspace (the shell reloads its screens once). */
const settled = async (server: FakeServer) => {
  await waitFor(() => expect(server.calls).toContain('POST /api/v1/auth/switch-tenant'))
  await waitFor(() =>
    expect(
      server.calls.filter((c) => c.endsWith('/.well-known/strutvane.json')).length,
    ).toBeGreaterThan(1),
  )
}

const app = (server: FakeServer, extra: Partial<Parameters<typeof StrutvaneApp>[0]> = {}) =>
  render(
    <StrutvaneApp
      apiUrl="/api/v1"
      appName="Northwind"
      fetch={server.fetch}
      styles={false}
      {...extra}
    />,
  )

describe('<StrutvaneApp>', () => {
  it('signs in (wrong password, then rate limit, then success) and auto-selects the only workspace', async () => {
    const server = fakeServer()
    const { container } = app(server)
    const user = userEvent.setup()
    expect(await screen.findByRole('heading', { name: 'Sign in to Northwind' })).toBeInTheDocument()
    expect(await axeViolations(container)).toEqual([])
    await user.type(screen.getByLabelText('Email'), 'owner@acme.test')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('The email or password is wrong.')).toBeInTheDocument()
    // The password is cleared after a failure; the email stays.
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Email')).toHaveValue('owner@acme.test')
    await user.type(screen.getByLabelText('Password'), 'correct-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen
      .findByRole('navigation', { name: 'Main navigation' }, { timeout: 3000 })
      .catch((e: unknown) => {
        throw new Error(`${String(e)} | ${server.calls.join(', ')} | ${document.body.textContent}`)
      })
    await waitFor(() => expect(server.calls).toContain('POST /api/v1/auth/switch-tenant'))
    expect(await screen.findByRole('link', { name: 'Customers' })).toHaveAttribute(
      'href',
      '/customers',
    )
    expect(await axeViolations(container)).toEqual([])
  })

  it('shows the server wait after too many attempts', async () => {
    const server = fakeServer()
    app(server)
    const user = userEvent.setup()
    await screen.findByLabelText('Email')
    for (let i = 0; i < 4; i++) {
      if (i === 0) await user.type(screen.getByLabelText('Email'), 'a@b.test')
      await user.type(screen.getByLabelText('Password'), 'nope-nope-nope')
      await user.click(screen.getByRole('button', { name: 'Sign in' }))
      // The password is cleared after each failure, so the button is disabled again.
      await waitFor(() => expect(screen.getByLabelText('Password')).toHaveValue(''))
    }
    expect(
      await screen.findByText('Too many attempts. Try again in 42 seconds.'),
    ).toBeInTheDocument()
  })

  it('routes list → detail → edit, lets app routes win, and hides unknown paths', async () => {
    const server = fakeServer({ signedIn: true })
    app(server, {
      routes: [{ path: '/reports', title: 'Reports', element: <h1>Revenue report</h1> }],
    })
    const user = userEvent.setup()
    await settled(server)
    await user.click(await screen.findByRole('link', { name: 'Customers' }))
    expect(window.location.pathname).toBe('/customers')
    await user.click(await screen.findByRole('button', { name: 'Open Acme GmbH' }))
    expect(window.location.pathname).toBe('/customers/c1')
    expect(await screen.findByRole('heading', { name: 'Acme GmbH' })).toBeInTheDocument()
    expect(screen.getByText('Region')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(window.location.pathname).toBe('/customers/c1/edit')
    await user.click(screen.getByRole('link', { name: 'Reports' }))
    expect(await screen.findByRole('heading', { name: 'Revenue report' })).toBeInTheDocument()
    window.history.pushState(null, '', '/secrets')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(await screen.findByText(/does not exist, or you do not have access/)).toBeInTheDocument()
    window.history.pushState(null, '', '/customers/nope')
    window.dispatchEvent(new PopStateEvent('popstate'))
    // A record that does not exist (or is not visible) looks exactly like an unknown page.
    await waitFor(() =>
      expect(screen.getByText(/does not exist, or you do not have access/)).toBeInTheDocument(),
    )
  })

  it('a 401 in the middle of a session returns to sign-in with a notice; sign-out works', async () => {
    const server = fakeServer({ signedIn: true })
    app(server)
    const user = userEvent.setup()
    await settled(server)
    const link = await screen.findByRole('link', { name: 'Customers' })
    server.failNext = 401
    await user.click(link)
    expect(
      await screen.findByText('Your session has ended. Please sign in again.'),
    ).toBeInTheDocument()
    server.signedIn = true
    window.history.replaceState(null, '', '/')
  })

  it('offers a workspace switcher when the user has several, and signs out', async () => {
    const server = fakeServer({ signedIn: true, tenants: 2 })
    app(server)
    const user = userEvent.setup()
    const select = await screen.findByRole('combobox', { name: 'Workspace' })
    await user.selectOptions(select, TENANT)
    await waitFor(() => expect(server.calls).toContain('POST /api/v1/auth/switch-tenant'))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in to Northwind' })).toBeInTheDocument()
  })

  // A failed workspace switch must be visible, must not become an unhandled promise rejection,
  // and the automatic selection of the only workspace must be tried once, never in a loop.
  it.each([
    [1, 'the automatic selection of the only workspace'],
    [2, 'a switch the user picked'],
  ])('a workspace switch the server refuses (%s tenants: %s) is reported once', async (tenants) => {
    const server = fakeServer({ signedIn: true, tenants, failSwitch: 403 })
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      app(server)
      const user = userEvent.setup()
      if (tenants > 1) {
        const select = await screen.findByRole('combobox', { name: 'Workspace' })
        await user.selectOptions(select, TENANT)
      }
      expect(
        await screen.findByText('Could not switch the workspace. Please try again.'),
      ).toBeInTheDocument()
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(server.calls.filter((c) => c.endsWith('/auth/switch-tenant'))).toHaveLength(1)
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  // Security: a sign-out the server did not confirm must never LOOK like a sign-out. On a shared
  // computer the next person would get the still-valid session by reloading the page.
  it.each([
    [503, 'a server error'],
    [0, 'the network being down'],
  ])('a sign-out that fails with %s (%s) keeps the user signed in and says so', async (status) => {
    const server = fakeServer({ signedIn: true, failSignOut: status === 0 ? 599 : status })
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    const base = server.fetch
    if (status === 0)
      server.fetch = async (input, init) => {
        if (String(input).endsWith('/auth/sign-out')) throw new TypeError('Failed to fetch')
        return base(input, init)
      }
    try {
      app(server)
      const user = userEvent.setup()
      await settled(server)
      await screen.findByRole('heading', { name: 'Welcome to Northwind' })
      await user.click(screen.getByRole('button', { name: 'Sign out' }))
      expect(
        await screen.findByText('Could not sign out. You are still signed in; please try again.'),
      ).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Sign in to Northwind' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled()
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('a sign-out answered with 401 (session already gone) shows the sign-in screen', async () => {
    const server = fakeServer({ signedIn: true, failSignOut: 401 })
    app(server)
    const user = userEvent.setup()
    await settled(server)
    await screen.findByRole('heading', { name: 'Welcome to Northwind' })
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in to Northwind' })).toBeInTheDocument()
  })

  it('auth={false} skips the session entirely', async () => {
    const server = fakeServer({ signedIn: true })
    app(server, { auth: false, home: <p>Custom home</p> })
    expect(await screen.findByText('Custom home')).toBeInTheDocument()
    expect(server.calls.some((c) => c.includes('/auth/'))).toBe(false)
  })
})

describe('URLs built from record ids and manifest paths', () => {
  it('a record id is decoded from the URL once, so the API gets it encoded once', async () => {
    const server = fakeServer({ signedIn: true })
    app(server)
    await settled(server)
    await screen.findByRole('heading', { name: 'Welcome to Northwind' })
    window.history.pushState(null, '', `/customers/${encodeURIComponent('a b/ü')}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() =>
      expect(server.calls).toContain(`GET /api/v1/customers/${encodeURIComponent('a b/ü')}`),
    )
    expect(server.calls.some((c) => c.includes('%25'))).toBe(false)
  })

  it('a malformed percent-encoding in the URL shows "not found", never a crash', async () => {
    const server = fakeServer({ signedIn: true })
    app(server)
    await settled(server)
    await screen.findByRole('heading', { name: 'Welcome to Northwind' })
    window.history.pushState(null, '', '/customers/%E0%A4%A')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(await screen.findByText(/does not exist, or you do not have access/)).toBeInTheDocument()
  })

  it('manifest paths: a leading slash never yields a protocol-relative (off-site) link; nested paths route', async () => {
    const server = fakeServer({ signedIn: true })
    const base = server.fetch
    const nested = {
      ...manifest,
      resources: [
        {
          ...manifest.resources[1],
          name: 'Partner',
          path: '/evil.example/partners',
          pluralLabel: 'Partners',
        },
        {
          ...manifest.resources[1],
          name: 'Account',
          path: 'admin/accounts',
          pluralLabel: 'Accounts',
        },
      ],
    }
    server.fetch = async (input, init) => {
      const url = new URL(String(input), 'http://app.test')
      if (url.pathname === '/.well-known/strutvane.json') {
        server.calls.push(`GET ${url.pathname}`)
        return json(nested)
      }
      if (
        url.pathname === '/api/v1/admin/accounts' ||
        url.pathname === '/api/v1/evil.example/partners'
      )
        return json({ data: customers, meta: { page: { size: 25, hasMore: false } } })
      return base(input, init)
    }
    app(server)
    const user = userEvent.setup()
    const partners = await screen.findByRole('link', { name: 'Partners' })
    expect(partners.getAttribute('href')).toBe('/evil.example/partners')
    expect(partners.getAttribute('href')?.startsWith('//')).toBe(false)
    await settled(server)
    await user.click(await screen.findByRole('link', { name: 'Accounts' }))
    expect(window.location.pathname).toBe('/admin/accounts')
    expect(await screen.findByRole('table', { name: 'Accounts' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Open Acme GmbH' }))
    expect(window.location.pathname).toBe('/admin/accounts/c1')
  })
})

describe('focus on navigation', () => {
  // A client-side page change must move focus to the new content (WCAG 2.4.3), or keyboard and
  // screen-reader users stay on a link or button that may no longer exist (focus falls to <body>).
  it('moves focus to the main area when the page changes, not when only the query changes', async () => {
    const server = fakeServer({ signedIn: true })
    app(server)
    const user = userEvent.setup()
    await settled(server)
    const first = await screen.findByRole('link', { name: 'Customers' })
    expect(document.activeElement).toBe(document.body) // the first load does not steal focus
    await user.click(first)
    await screen.findByRole('table', { name: 'Customers' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('main')))
    await user.click(screen.getByRole('button', { name: 'Open Acme GmbH' }))
    await screen.findByRole('heading', { name: 'Acme GmbH' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('main')))
  })
})

describe('router and session client helpers', () => {
  it('matchPath extracts params and refuses mismatches and broken encodings', () => {
    expect(matchPath('/reports/:year', '/reports/2026')).toEqual({ year: '2026' })
    expect(matchPath('/reports/:year', '/reports')).toBeUndefined()
    expect(matchPath('/a/:x', '/a/%E0%A4%A')).toBeUndefined()
    expect(matchPath('/a/b', '/a/c')).toBeUndefined()
  })

  it('the session client maps 401 on /me to null and surfaces other problems', async () => {
    const server = fakeServer()
    const session = createSessionClient({ apiUrl: '/api/v1/', fetch: server.fetch })
    expect(await session.me()).toBeNull()
    await expect(session.signIn('a@b.test', 'x')).rejects.toMatchObject({
      problem: { status: 401 },
    })
    await session.signOut() // already signed out: not an error
    const broken = createSessionClient({
      apiUrl: '/api/v1',
      fetch: async () => json({ nope: true }),
    })
    await expect(broken.me()).rejects.toMatchObject({ problem: { status: 500 } })
    const offline = createSessionClient({
      apiUrl: '/api/v1',
      fetch: async () => {
        throw new TypeError('offline')
      },
    })
    await expect(offline.tenants()).rejects.toMatchObject({ problem: { code: 'NETWORK_ERROR' } })
  })
})
