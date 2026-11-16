/**
 * The reference app's data: a small manifest (posts and authors) and an in-memory API served as a
 * `fetch` function, so `<StrutvaneApp>` runs for real (sign-in, manifest, lists, records, forms)
 * without a server. The conformance kit renders its reference screens on it; package tests can use
 * it too.
 *
 * It follows the framework's wire format (ADR-0011 list queries, RFC 9457 problems, numbered pages
 * with totals) closely enough for every screen, and nothing more: it is a fixture, not a server.
 *
 * @module
 */
import type {
  FieldDescriptor,
  ResourceCapabilities,
  ResourceDescriptor,
  ResourceManifest,
} from '@strutvane/framework/contracts'

const ALL: ResourceCapabilities = {
  list: true,
  view: true,
  create: true,
  update: true,
  delete: true,
  restore: true,
  export: false,
}

function field(
  f: Partial<FieldDescriptor> & Pick<FieldDescriptor, 'name' | 'type' | 'label'>,
): FieldDescriptor {
  return {
    required: false,
    nullable: true,
    unique: false,
    readOnly: false,
    writeOnce: false,
    filterOperators: [],
    sortable: false,
    searchable: false,
    ...f,
  }
}

const authors: ResourceDescriptor = {
  name: 'Author',
  path: 'authors',
  label: 'Author',
  pluralLabel: 'Authors',
  titleField: 'name',
  actions: [],
  capabilities: { ...ALL, restore: false },
  softDeletes: false,
  tenantScoped: false,
  audited: false,
  ui: { icon: 'users', group: 'People' },
  fields: [
    field({ name: 'id', type: 'id', label: 'ID', readOnly: true, nullable: false }),
    field({
      name: 'name',
      type: 'string',
      label: 'Name',
      required: true,
      nullable: false,
      searchable: true,
      sortable: true,
    }),
    field({ name: 'email', type: 'email', label: 'Email', unique: true }),
    field({
      name: 'posts',
      type: 'hasMany',
      label: 'Posts',
      relation: { kind: 'hasMany', target: 'Post', foreignKey: 'authorId' },
    }),
  ],
}

const posts: ResourceDescriptor = {
  name: 'Post',
  path: 'posts',
  label: 'Post',
  pluralLabel: 'Posts',
  titleField: 'title',
  actions: [],
  capabilities: ALL,
  softDeletes: true,
  tenantScoped: false,
  audited: false,
  ui: { icon: 'file-text', group: 'Content' },
  fields: [
    field({ name: 'id', type: 'id', label: 'ID', readOnly: true, nullable: false }),
    field({
      name: 'title',
      type: 'string',
      label: 'Title',
      required: true,
      nullable: false,
      searchable: true,
      sortable: true,
      filterOperators: ['contains'],
      help: 'Shown in lists and links.',
    }),
    field({ name: 'slug', type: 'slug', label: 'Slug', unique: true, readOnly: true }),
    field({
      name: 'status',
      type: 'enum',
      label: 'Status',
      enumValues: ['draft', 'published'],
      filterOperators: ['eq', 'in'],
      sortable: true,
    }),
    field({ name: 'price', type: 'decimal', label: 'Price', schema: { type: 'string' } }),
    field({ name: 'featured', type: 'boolean', label: 'Featured', filterOperators: ['eq'] }),
    field({
      name: 'authorId',
      type: 'belongsTo',
      label: 'Author',
      relation: { kind: 'belongsTo', target: 'Author', foreignKey: 'authorId' },
      filterOperators: ['eq'],
    }),
  ],
}

/** The reference manifest (posts with soft deletes and slugs; authors with a related list). */
export const referenceManifest: ResourceManifest = {
  manifestVersion: 1,
  app: { name: 'Reference', apiVersion: 'v1' },
  generatedAt: '2026-11-16T00:00:00.000Z',
  resources: [
    {
      ...posts,
      maxPerPage: 50,
      routeKey: 'slug',
      ui: { ...posts.ui, order: 1 },
    } as ResourceDescriptor,
    authors,
  ],
}

type Row = Record<string, unknown> & { id: string }

function seed(): Map<string, Row[]> {
  const people: Row[] = [
    { id: '1', name: 'Asha Rao', email: 'asha@example.com' },
    { id: '2', name: 'Ben Okafor', email: 'ben@example.com' },
    { id: '3', name: 'Chen Li', email: 'chen@example.com' },
  ]
  const items: Row[] = Array.from({ length: 30 }, (_, i) => ({
    id: String(i + 1),
    title: `Launch notes ${i + 1}`,
    slug: `launch-notes-${i + 1}`,
    status: i % 3 === 0 ? 'draft' : 'published',
    price: `${10 + i}.50`,
    featured: i % 4 === 0,
    authorId: String((i % 3) + 1),
  }))
  return new Map([
    ['authors', people],
    ['posts', items],
  ])
}

/** A request the reference API received (for assertions). */
export interface ReferenceRequest {
  readonly method: string
  readonly path: string
  readonly search: string
  readonly headers: Readonly<Record<string, string>>
  readonly body: unknown
}

/** Options for {@link createReferenceApi}. */
export interface ReferenceApiOptions {
  /** Start signed in (default `true`). */
  readonly signedIn?: boolean
  /** API base path (default `/api`). */
  readonly basePath?: string
}

/** What {@link createReferenceApi} returns. */
export interface ReferenceApi {
  /** A `fetch` to pass to `<StrutvaneApp fetch>`. */
  readonly fetch: typeof globalThis.fetch
  readonly manifest: ResourceManifest
  /** Every request, in order. */
  readonly requests: ReferenceRequest[]
}

const json = (status: number, body: unknown): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      'content-type': status >= 400 ? 'application/problem+json' : 'application/json',
    },
  })

const problem = (status: number, code: string, title: string, extra: object = {}): Response =>
  json(status, { type: 'about:blank', title, status, code, ...extra })

/**
 * Create a fresh reference API (its own data; nothing is shared between calls).
 *
 * @example
 * const api = createReferenceApi()
 * render(<StrutvaneApp apiUrl="/api" fetch={api.fetch} />)
 */
export function createReferenceApi(options: ReferenceApiOptions = {}): ReferenceApi {
  const base = options.basePath ?? '/api'
  const data = seed()
  const deleted = new Set<string>()
  let signedIn = options.signedIn !== false
  const requests: ReferenceRequest[] = []
  const actor = { id: 'u1', type: 'user', roles: ['admin'] }

  const handle = (method: string, url: URL, body: unknown): Response => {
    const path = url.pathname
    if (path === '/.well-known/strutvane.json') {
      return signedIn ? json(200, referenceManifest) : problem(401, 'unauthenticated', 'Sign in')
    }
    if (path === `${base}/auth/me`)
      return signedIn ? json(200, { actor }) : problem(401, 'unauthenticated', 'Sign in')
    if (path === `${base}/auth/sign-in` && method === 'POST') {
      const b = (body ?? {}) as { email?: unknown; password?: unknown }
      if (b.password !== 'correct horse battery staple')
        return problem(401, 'invalid_credentials', 'Wrong email or password')
      signedIn = true
      return json(200, { actor })
    }
    if (path === `${base}/auth/sign-out` && method === 'POST') {
      signedIn = false
      return json(204, undefined)
    }
    if (path === `${base}/auth/tenants`) return json(200, { data: [] })
    if (!signedIn) return problem(401, 'unauthenticated', 'Sign in')
    const segments = path.slice(base.length).split('/').filter(Boolean)
    const [name, key, action] = segments
    const resource = referenceManifest.resources.find((r) => r.path === name)
    const rows = name === undefined ? undefined : data.get(name)
    if (!resource || !rows) return problem(404, 'not_found', 'Not found')
    const live = rows.filter((r) => !deleted.has(`${name}/${r.id}`))
    const find = (k: string) => live.find((r) => r.id === k || r['slug'] === k)
    if (key === undefined) {
      if (method === 'POST') {
        const values = (body ?? {}) as Record<string, unknown>
        if (typeof values['title'] !== 'string' && resource.path === 'posts')
          return problem(422, 'validation_failed', 'Invalid', {
            issues: [{ path: ['title'], code: 'required', message: 'Title is required.' }],
          })
        const row: Row = { ...values, id: String(rows.length + 1) }
        rows.push(row)
        return json(201, row)
      }
      return list(resource, live, url.searchParams)
    }
    if (action === 'restore' && method === 'POST') {
      const row = rows.find((r) => r.id === key || r['slug'] === key)
      if (!row) return problem(404, 'not_found', 'Not found')
      deleted.delete(`${name}/${row.id}`)
      return json(200, row)
    }
    const row = find(decodeURIComponent(key))
    if (!row) return problem(404, 'not_found', 'Not found')
    if (method === 'DELETE') {
      deleted.add(`${name}/${row.id}`)
      return json(204, undefined)
    }
    if (method === 'PATCH') {
      Object.assign(row, body)
      return json(200, row)
    }
    return json(200, row)
  }

  const doFetch: typeof globalThis.fetch = async (input, init) => {
    // Relative URLs (`/api/posts`) are what the app sends; `new Request()` would refuse them.
    const raw = input instanceof Request ? input.url : String(input)
    const url = new URL(raw, 'http://localhost')
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const text = init?.body === undefined || init.body === null ? '' : String(init.body)
    const body: unknown = text === '' ? undefined : JSON.parse(text)
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((value, header) => {
      headers[header] = value
    })
    requests.push({ method, path: url.pathname, search: url.search, headers, body })
    return handle(method, url, body)
  }

  return { fetch: doFetch, manifest: referenceManifest, requests }
}

/** Search, filter (eq/in/contains), sort and paginate rows like the framework does. */
function list(resource: ResourceDescriptor, rows: Row[], params: URLSearchParams): Response {
  let out = [...rows]
  const search = params.get('search')?.toLowerCase()
  if (search) {
    const fields = resource.fields.filter((f) => f.searchable).map((f) => f.name)
    out = out.filter((r) =>
      fields.some((f) =>
        String(r[f] ?? '')
          .toLowerCase()
          .includes(search),
      ),
    )
  }
  for (const [key, value] of params) {
    const m = /^filter\[(\w+)\]\[(\w+)\]$/.exec(key)
    if (!m) continue
    const [, name = '', op] = m
    if (op === 'eq') out = out.filter((r) => String(r[name]) === value)
    else if (op === 'in') {
      const values = params.getAll(key)
      out = out.filter((r) => values.includes(String(r[name])))
    } else if (op === 'contains')
      out = out.filter((r) =>
        String(r[name] ?? '')
          .toLowerCase()
          .includes(value.toLowerCase()),
      )
  }
  const sort = params.get('sort')
  if (sort) {
    const desc = sort.startsWith('-')
    const name = desc ? sort.slice(1) : sort
    out.sort((a, b) => String(a[name]).localeCompare(String(b[name])) * (desc ? -1 : 1))
  }
  const size = Number(params.get('page[size]') ?? 25)
  const max = (resource as ResourceDescriptor & { maxPerPage?: number }).maxPerPage ?? 100
  if (size > max)
    return problem(422, 'validation_failed', 'Invalid', {
      issues: [{ path: ['page', 'size'], code: 'too_big', message: `At most ${max}.` }],
    })
  const number = Number(params.get('page[number]') ?? 1)
  const pageRows = out.slice((number - 1) * size, number * size)
  return json(200, {
    data: pageRows,
    meta: {
      page: {
        size,
        number,
        hasMore: number * size < out.length,
        ...(params.get('page[total]') === 'true' ? { total: out.length } : {}),
      },
    },
  })
}
