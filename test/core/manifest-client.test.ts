// Defensive manifest validation and fetching.
import fc from 'fast-check'
import { describe, expect, test, vi } from 'vitest'
import { fetchManifest, ManifestError, parseManifest } from '../../src/core/manifest-client.ts'
import { ApiProblemError } from '../../src/core/problems.ts'
import { manifest } from '../fixtures/manifest.ts'

const clone = (): Record<string, unknown> =>
  JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>
type Json = Record<string, unknown>
const firstResource = (m: Json) => (m['resources'] as Json[])[0] as Json
const firstField = (m: Json, i = 1) => (firstResource(m)['fields'] as Json[])[i] as Json

describe('parseManifest', () => {
  test('a valid manifest round-trips unchanged', () => {
    const result = parseManifest(clone())
    expect(result).toEqual({ ok: true, manifest, warnings: [] })
  })

  test('unknown extra members are ignored (forward compatible)', () => {
    const m = clone()
    m['future'] = { x: 1 }
    firstResource(m)['futureFlag'] = true
    firstField(m)['futureHint'] = 'x'
    const result = parseManifest(m)
    expect(result.ok).toBe(true)
  })

  test('unknown filter operators are dropped with a warning', () => {
    const m = clone()
    firstField(m)['filterOperators'] = ['eq', 'like', 7]
    const result = parseManifest(m)
    if (!result.ok) throw new Error('expected ok')
    expect(result.manifest.resources[0]?.fields[1]?.filterOperators).toEqual(['eq'])
    expect(result.warnings).toHaveLength(2)
  })

  test.each<[string, (m: Json) => void, string]>([
    ['not an object', () => {}, 'manifest must be a JSON object'],
    [
      'wrong version',
      (m) => {
        m['manifestVersion'] = 2
      },
      'unsupported manifestVersion 2',
    ],
    [
      'app missing',
      (m) => {
        delete m['app']
      },
      '$.app must be an object',
    ],
    [
      'app name mistyped',
      (m) => {
        ;(m['app'] as Json)['name'] = 1
      },
      '$.app.name must be a string',
    ],
    [
      'resources not an array',
      (m) => {
        m['resources'] = {}
      },
      '$.resources must be an array',
    ],
    [
      'resource not an object',
      (m) => {
        m['resources'] = [1]
      },
      '$.resources[0] must be an object',
    ],
    [
      'duplicate resource',
      (m) => {
        m['resources'] = [firstResource(m), firstResource(m)]
      },
      'duplicate resource "Invoice"',
    ],
    [
      'bad field name',
      (m) => {
        firstField(m)['name'] = 'a b'
      },
      'is not a valid identifier',
    ],
    [
      'duplicate field',
      (m) => {
        ;(firstResource(m)['fields'] as Json[]).push(firstField(m))
      },
      'duplicate field "number"',
    ],
    [
      'field not object',
      (m) => {
        ;(firstResource(m)['fields'] as Json[]).push(null as unknown as Json)
      },
      'must be an object',
    ],
    [
      'boolean mistyped',
      (m) => {
        firstField(m)['required'] = 'yes'
      },
      '.required must be a boolean',
    ],
    [
      'help mistyped',
      (m) => {
        firstField(m)['help'] = 3
      },
      '.help must be a string',
    ],
    [
      'enumValues mistyped',
      (m) => {
        firstField(m)['enumValues'] = [1]
      },
      '.enumValues must be an array of strings',
    ],
    [
      'relation malformed',
      (m) => {
        firstField(m, 2)['relation'] = { kind: 'owns', target: 'X' }
      },
      '.relation is malformed',
    ],
    [
      'schema mistyped',
      (m) => {
        firstField(m)['schema'] = 'x'
      },
      '.schema must be an object',
    ],
    [
      'titleField unknown',
      (m) => {
        firstResource(m)['titleField'] = 'nope'
      },
      'titleField "nope" is not a field',
    ],
    [
      'capabilities missing',
      (m) => {
        delete firstResource(m)['capabilities']
      },
      '.capabilities must be an object',
    ],
    [
      'capability mistyped',
      (m) => {
        ;(firstResource(m)['capabilities'] as Json)['delete'] = 1
      },
      '.capabilities.delete must be a boolean',
    ],
    [
      'unsafe path',
      (m) => {
        firstResource(m)['path'] = '../admin'
      },
      'is not a safe path',
    ],
    [
      'dot segment inside path',
      (m) => {
        firstResource(m)['path'] = 'a/../admin'
      },
      'is not a safe path',
    ],
    [
      'listColumns mistyped',
      (m) => {
        firstResource(m)['ui'] = { listColumns: 'a' }
      },
      '.ui.listColumns must be an array of strings',
    ],
    [
      'action malformed',
      (m) => {
        firstResource(m)['actions'] = [
          { name: 'send', label: 'Send', permission: 'nodot', scope: 'x', confirm: true },
        ]
      },
      'must look like "resource.ability"',
    ],
    [
      'action not object',
      (m) => {
        firstResource(m)['actions'] = ['x']
      },
      '.actions[0] must be an object',
    ],
    [
      'generatedAt missing',
      (m) => {
        delete m['generatedAt']
      },
      '$.generatedAt must be a string',
    ],
  ])('%s → refused', (_name, mutate, message) => {
    const m = _name === 'not an object' ? null : clone()
    if (m) mutate(m)
    const result = parseManifest(m)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toContain(message)
  })

  test('valid actions and ui hints are kept', () => {
    const m = clone()
    firstResource(m)['actions'] = [
      {
        name: 'send',
        label: 'Send',
        permission: 'invoice.send',
        scope: 'collection',
        confirm: true,
        variant: 'danger',
        input: {},
      },
      {
        name: 'all',
        label: 'All',
        permission: '*',
        scope: 'record',
        confirm: false,
        variant: 'loud',
      },
    ]
    firstResource(m)['ui'] = { icon: 'receipt', group: 'Billing' }
    const result = parseManifest(m)
    if (!result.ok) throw new Error(result.errors.join())
    expect(result.manifest.resources[0]?.actions).toEqual([
      {
        name: 'send',
        label: 'Send',
        permission: 'invoice.send',
        scope: 'collection',
        confirm: true,
        variant: 'danger',
        input: {},
      },
      { name: 'all', label: 'All', permission: '*', scope: 'record', confirm: false },
    ])
    expect(result.manifest.resources[0]?.ui).toEqual({ icon: 'receipt', group: 'Billing' })
  })

  test('property: never throws on arbitrary JSON', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const v =
          typeof value === 'object' && value !== null && !Array.isArray(value)
            ? { ...value, manifestVersion: 1 }
            : value
        expect(typeof parseManifest(v).ok).toBe('boolean')
      }),
      { numRuns: 500 },
    )
  })
})

describe('fetchManifest', () => {
  test('fetches /.well-known/strutvane.json from the base URL', async () => {
    const fetch = vi.fn(async () => Response.json(manifest))
    const result = await fetchManifest({
      baseUrl: 'https://api.example.com/api/v1',
      fetch,
      headers: { 'x-a': '1' },
      credentials: 'include',
    })
    expect(result).toEqual(manifest)
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit]
    expect(String(url)).toBe('https://api.example.com/.well-known/strutvane.json')
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'include',
      headers: { accept: 'application/json', 'x-a': '1' },
    })
  })

  test('HTTP errors become ApiProblemError; bad bodies become ManifestError', async () => {
    await expect(
      fetchManifest({ baseUrl: 'https://x', fetch: async () => new Response('', { status: 404 }) }),
    ).rejects.toBeInstanceOf(ApiProblemError)
    await expect(
      fetchManifest({ baseUrl: 'https://x', fetch: async () => new Response('<html>') }),
    ).rejects.toThrow(ManifestError)
    const err = await fetchManifest({
      baseUrl: 'https://x',
      fetch: async () => Response.json({ manifestVersion: 1 }),
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ManifestError)
    expect((err as ManifestError).errors.length).toBeGreaterThan(0)
  })

  test('network failure is a NETWORK_ERROR problem; an abort is re-thrown as-is', async () => {
    const offline = await fetchManifest({
      baseUrl: 'https://x',
      fetch: async () => {
        throw new TypeError('Failed to fetch')
      },
    }).catch((e: unknown) => e)
    expect(offline).toBeInstanceOf(ApiProblemError)
    expect((offline as ApiProblemError).problem.code).toBe('NETWORK_ERROR')
    const controller = new AbortController()
    controller.abort()
    const abort = new DOMException('aborted', 'AbortError')
    await expect(
      fetchManifest({
        baseUrl: 'https://x',
        signal: controller.signal,
        fetch: async () => {
          throw abort
        },
      }),
    ).rejects.toBe(abort)
  })

  test('ManifestError messages are bounded', () => {
    const e = new ManifestError(['1', '2', '3', '4', '5', '6', '7'])
    expect(e.message).toBe('Invalid Strutvane manifest: 1; 2; 3; 4; 5; …')
  })
})
