/**
 * UI-1 / AUTH-1 (demo acceptance run): one API setting gives the API, auth and manifest URLs, and
 * they follow the URL contract: the API at `/api/v1`, auth at `{api}/auth`, the manifest at the
 * API's ORIGIN (`/.well-known/strutvane.json`), never under the API base.
 */
import { describe, expect, it } from 'vitest'
import {
  createSessionClient,
  DEFAULT_API_URL,
  fetchManifest,
  resolveEndpoints,
} from '../../src/index.ts'

const PAGE = 'https://acme.test/customers/42?tab=notes#top'

describe('resolveEndpoints', () => {
  it('the contract: /api/v1 → auth under it, the manifest at the origin', () => {
    expect(resolveEndpoints({ apiUrl: '/api/v1', pageUrl: PAGE })).toEqual({
      api: 'https://acme.test/api/v1',
      auth: 'https://acme.test/api/v1/auth',
      manifest: 'https://acme.test/.well-known/strutvane.json',
    })
  })

  it('an app on /api (no version) signs in at /api/auth: auth always follows the API base', () => {
    expect(resolveEndpoints({ apiUrl: '/api', pageUrl: PAGE }).auth).toBe(
      'https://acme.test/api/auth',
    )
  })

  it('trailing slashes, a relative base on a deep link, and an empty setting', () => {
    expect(resolveEndpoints({ apiUrl: '/api/v1/', pageUrl: PAGE }).auth).toBe(
      'https://acme.test/api/v1/auth',
    )
    // Client-side routes: `api/v1` must not become /customers/api/v1.
    expect(resolveEndpoints({ apiUrl: 'api/v1', pageUrl: PAGE }).api).toBe(
      'https://acme.test/api/v1',
    )
    expect(resolveEndpoints({ apiUrl: '  ', pageUrl: PAGE }).api).toBe(
      `https://acme.test${DEFAULT_API_URL}`,
    )
    expect(resolveEndpoints({ apiUrl: '/api/v1?x=1#y', pageUrl: PAGE }).api).toBe(
      'https://acme.test/api/v1',
    )
  })

  it('an API on another origin: auth and the manifest go to THAT origin', () => {
    expect(resolveEndpoints({ apiUrl: 'https://api.acme.test/api/v1', pageUrl: PAGE })).toEqual({
      api: 'https://api.acme.test/api/v1',
      auth: 'https://api.acme.test/api/v1/auth',
      manifest: 'https://api.acme.test/.well-known/strutvane.json',
    })
  })

  it('authUrl and manifestUrl override one URL each, not the others', () => {
    const endpoints = resolveEndpoints({
      apiUrl: '/api/v1',
      authUrl: 'https://id.acme.test/auth/',
      manifestUrl: '/static/manifest.json',
      pageUrl: PAGE,
    })
    expect(endpoints).toEqual({
      api: 'https://acme.test/api/v1',
      auth: 'https://id.acme.test/auth',
      manifest: 'https://acme.test/static/manifest.json',
    })
    expect(resolveEndpoints({ apiUrl: '/api/v1', authUrl: '', pageUrl: PAGE }).auth).toBe(
      'https://acme.test/api/v1/auth',
    )
  })

  it('in the browser it reads the page URL; elsewhere it says what to pass', () => {
    const location = Object.getOwnPropertyDescriptor(globalThis, 'location')
    try {
      Object.defineProperty(globalThis, 'location', { value: undefined, configurable: true })
      expect(() => resolveEndpoints({ apiUrl: '/api/v1' })).toThrow(/pageUrl/)
      Object.defineProperty(globalThis, 'location', {
        value: new URL('https://acme.test/orders/7'),
        configurable: true,
      })
      expect(resolveEndpoints({ apiUrl: '/api/v1' }).auth).toBe('https://acme.test/api/v1/auth')
    } finally {
      if (location) Object.defineProperty(globalThis, 'location', location)
      else Reflect.deleteProperty(globalThis, 'location')
    }
  })
})

describe('clients use the resolved URLs', () => {
  const recorder = () => {
    const urls: string[] = []
    const fetch: typeof globalThis.fetch = async (input) => {
      urls.push(String(input))
      return new Response(JSON.stringify({ actor: { id: '1', type: 'user', roles: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return { urls, fetch }
  }

  it('the session client calls {authUrl}/sign-in when given, else {apiUrl}/auth/sign-in', async () => {
    const plain = recorder()
    await createSessionClient({ apiUrl: '/api/v1/', fetch: plain.fetch, xsrf: false }).signIn(
      'a@acme.test',
      'pw',
    )
    expect(plain.urls).toEqual(['/api/v1/auth/sign-in'])
    const moved = recorder()
    await createSessionClient({
      apiUrl: '/api/v1',
      authUrl: 'https://id.acme.test/auth/',
      fetch: moved.fetch,
      xsrf: false,
    }).me()
    expect(moved.urls).toEqual(['https://id.acme.test/auth/me'])
  })

  it('fetchManifest takes the full URL, or resolves the root path against baseUrl', async () => {
    const calls: string[] = []
    const fetch: typeof globalThis.fetch = async (input) => {
      calls.push(String(input))
      return new Response('{}', { status: 404 })
    }
    await expect(
      fetchManifest({ url: 'https://acme.test/.well-known/strutvane.json', fetch }),
    ).rejects.toThrow()
    await expect(fetchManifest({ baseUrl: 'https://acme.test/api/v1/', fetch })).rejects.toThrow()
    expect(calls).toEqual([
      'https://acme.test/.well-known/strutvane.json',
      'https://acme.test/.well-known/strutvane.json',
    ])
    await expect(fetchManifest({ fetch })).rejects.toThrow(/url or baseUrl/)
  })
})
