/**
 * Loading and validating the resource manifest (`GET /.well-known/strutvane.json`, ADR-0014).
 *
 * The manifest drives every list and form, so it is validated defensively before use, whatever
 * server (or proxy) produced it:
 * - **Errors** (the manifest is refused): wrong `manifestVersion`, missing or mistyped required
 *   members, duplicate resource names, a `titleField` that is not a field, a field name that is not
 *   a plain identifier (it would end up in URLs and DOM ids).
 * - **Warnings** (the manifest is used, the item is dropped): an unknown filter operator. The UI
 *   then simply does not offer it; failing closed means never sending what the server may refuse.
 *
 * Unknown extra members are ignored, so a newer server can add metadata without breaking older UIs.
 *
 * @module
 */
import {
  type ActionDescriptor,
  type FieldDescriptor,
  type FilterOperator,
  type JsonSchema,
  MANIFEST_PATH,
  MANIFEST_VERSION,
  type Permission,
  type RelationDescriptor,
  type ResourceCapabilities,
  type ResourceDescriptor,
  type ResourceManifest,
} from '@strutvane/framework/contracts'
import { FIELD_NAME_PATTERN, isFilterOperator } from './filter-builder.ts'
import { ApiProblemError, networkProblem, problemFromResponse } from './problems.ts'
import { withUiExtensions } from './resource-extensions.ts'

/** Result of {@link parseManifest}. */
export type ManifestParseResult =
  | { readonly ok: true; readonly manifest: ResourceManifest; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] }

/** Thrown by {@link fetchManifest} when the manifest is not usable. */
export class ManifestError extends Error {
  readonly errors: readonly string[]
  constructor(errors: readonly string[]) {
    super(
      `Invalid Strutvane manifest: ${errors.slice(0, 5).join('; ')}${errors.length > 5 ? '; …' : ''}`,
    )
    this.name = 'ManifestError'
    this.errors = errors
  }
}

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Collects errors with a JSON-path-like location. */
class Checker {
  readonly errors: string[] = []
  readonly warnings: string[] = []

  str(o: Rec, key: string, at: string): string {
    const v = o[key]
    if (typeof v === 'string') return v
    this.errors.push(`${at}.${key} must be a string`)
    return ''
  }

  optStr(o: Rec, key: string, at: string): { [k: string]: string } {
    const v = o[key]
    if (v === undefined) return {}
    if (typeof v === 'string') return { [key]: v }
    this.errors.push(`${at}.${key} must be a string`)
    return {}
  }

  bool(o: Rec, key: string, at: string): boolean {
    const v = o[key]
    if (typeof v === 'boolean') return v
    this.errors.push(`${at}.${key} must be a boolean`)
    return false
  }

  arr(o: Rec, key: string, at: string): unknown[] {
    const v = o[key]
    if (Array.isArray(v)) return v
    this.errors.push(`${at}.${key} must be an array`)
    return []
  }

  strArr(v: unknown, at: string): string[] | undefined {
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[]
    this.errors.push(`${at} must be an array of strings`)
    return undefined
  }
}

const RELATION_KINDS: ReadonlySet<string> = new Set([
  'belongsTo',
  'hasOne',
  'hasMany',
  'manyToMany',
])
const CAPABILITIES = ['list', 'view', 'create', 'update', 'delete', 'restore', 'export'] as const

function parseField(c: Checker, raw: unknown, at: string): FieldDescriptor | undefined {
  if (!isRec(raw)) {
    c.errors.push(`${at} must be an object`)
    return undefined
  }
  const name = c.str(raw, 'name', at)
  if (name && !FIELD_NAME_PATTERN.test(name))
    c.errors.push(`${at}.name "${name}" is not a valid identifier`)
  const operators: FilterOperator[] = []
  for (const op of c.arr(raw, 'filterOperators', at)) {
    if (typeof op === 'string' && isFilterOperator(op)) operators.push(op)
    else c.warnings.push(`${at}.filterOperators: unknown operator ${JSON.stringify(op)} ignored`)
  }
  let relation: RelationDescriptor | undefined
  if (raw['relation'] !== undefined) {
    const r = raw['relation']
    if (
      isRec(r) &&
      typeof r['kind'] === 'string' &&
      RELATION_KINDS.has(r['kind']) &&
      typeof r['target'] === 'string'
    ) {
      relation = {
        kind: r['kind'] as RelationDescriptor['kind'],
        target: r['target'],
        ...(typeof r['foreignKey'] === 'string' ? { foreignKey: r['foreignKey'] } : {}),
      }
    } else c.errors.push(`${at}.relation is malformed`)
  }
  const enumValues =
    raw['enumValues'] === undefined ? undefined : c.strArr(raw['enumValues'], `${at}.enumValues`)
  const schema = raw['schema']
  if (schema !== undefined && !isRec(schema)) c.errors.push(`${at}.schema must be an object`)
  return {
    name,
    type: c.str(raw, 'type', at),
    label: c.str(raw, 'label', at),
    ...c.optStr(raw, 'help', at),
    required: c.bool(raw, 'required', at),
    nullable: c.bool(raw, 'nullable', at),
    unique: c.bool(raw, 'unique', at),
    readOnly: c.bool(raw, 'readOnly', at),
    writeOnce: c.bool(raw, 'writeOnce', at),
    filterOperators: operators,
    sortable: c.bool(raw, 'sortable', at),
    searchable: c.bool(raw, 'searchable', at),
    ...(enumValues ? { enumValues } : {}),
    ...(relation ? { relation } : {}),
    ...c.optStr(raw, 'widget', at),
    ...(isRec(schema) ? { schema: schema as JsonSchema } : {}),
    ...c.optStr(raw, 'since', at),
    ...c.optStr(raw, 'deprecated', at),
  }
}

function parseAction(c: Checker, raw: unknown, at: string): ActionDescriptor | undefined {
  if (!isRec(raw)) {
    c.errors.push(`${at} must be an object`)
    return undefined
  }
  const scope = raw['scope']
  if (scope !== 'record' && scope !== 'collection')
    c.errors.push(`${at}.scope must be "record" or "collection"`)
  const variant = raw['variant']
  const input = raw['input']
  const permission = c.str(raw, 'permission', at)
  if (permission && permission !== '*' && !/^[^.]+\.[^.]/.test(permission)) {
    c.errors.push(`${at}.permission "${permission}" must look like "resource.ability"`)
  }
  return {
    name: c.str(raw, 'name', at),
    label: c.str(raw, 'label', at),
    permission: permission as Permission,
    scope: scope === 'collection' ? 'collection' : 'record',
    confirm: c.bool(raw, 'confirm', at),
    ...(isRec(input) ? { input: input as JsonSchema } : {}),
    ...(variant === 'default' || variant === 'primary' || variant === 'danger' ? { variant } : {}),
  }
}

function parseResource(c: Checker, raw: unknown, at: string): ResourceDescriptor | undefined {
  if (!isRec(raw)) {
    c.errors.push(`${at} must be an object`)
    return undefined
  }
  const fields = c
    .arr(raw, 'fields', at)
    .map((f, i) => parseField(c, f, `${at}.fields[${i}]`))
    .filter((f): f is FieldDescriptor => f !== undefined)
  const names = new Set<string>()
  for (const f of fields) {
    if (names.has(f.name)) c.errors.push(`${at}: duplicate field "${f.name}"`)
    names.add(f.name)
  }
  const titleField = c.str(raw, 'titleField', at)
  if (titleField && titleField !== 'id' && !names.has(titleField)) {
    c.errors.push(`${at}.titleField "${titleField}" is not a field`)
  }
  const capsRaw = raw['capabilities']
  const caps: Record<string, boolean> = {}
  if (isRec(capsRaw))
    for (const k of CAPABILITIES) caps[k] = c.bool(capsRaw, k, `${at}.capabilities`)
  else c.errors.push(`${at}.capabilities must be an object`)
  const path = c.str(raw, 'path', at)
  // Resource paths end up in request URLs: plain segments only, no `.`/`..` (no escaping the API base).
  const unsafe =
    !/^\/?[A-Za-z0-9][A-Za-z0-9._~/-]*$/.test(path) ||
    path.split('/').some((segment) => segment === '.' || segment === '..')
  if (path && unsafe) c.errors.push(`${at}.path "${path}" is not a safe path`)
  // Stored without surrounding slashes: the UI builds links as `/${path}`, and a leading slash
  // there would make `//host/…`, a protocol-relative link to ANOTHER site.
  const cleanPath = path.replace(/^\/+|\/+$/g, '')
  const uiRaw = raw['ui']
  let ui: ResourceDescriptor['ui']
  if (isRec(uiRaw)) {
    const cols =
      uiRaw['listColumns'] === undefined
        ? undefined
        : c.strArr(uiRaw['listColumns'], `${at}.ui.listColumns`)
    ui = {
      ...(typeof uiRaw['icon'] === 'string' ? { icon: uiRaw['icon'] } : {}),
      ...(typeof uiRaw['group'] === 'string' ? { group: uiRaw['group'] } : {}),
      ...(cols ? { listColumns: cols } : {}),
    }
  }
  const descriptor: ResourceDescriptor = {
    name: c.str(raw, 'name', at),
    path: cleanPath,
    label: c.str(raw, 'label', at),
    pluralLabel: c.str(raw, 'pluralLabel', at),
    titleField,
    fields,
    actions: (raw['actions'] === undefined ? [] : c.arr(raw, 'actions', at))
      .map((a, i) => parseAction(c, a, `${at}.actions[${i}]`))
      .filter((a): a is ActionDescriptor => a !== undefined),
    capabilities: caps as unknown as ResourceCapabilities,
    softDeletes: c.bool(raw, 'softDeletes', at),
    tenantScoped: c.bool(raw, 'tenantScoped', at),
    audited: c.bool(raw, 'audited', at),
    ...(ui ? { ui } : {}),
  }
  return withUiExtensions(descriptor, raw)
}

/** Validate an untrusted value as a {@link ResourceManifest}. Never throws. */
export function parseManifest(value: unknown): ManifestParseResult {
  const c = new Checker()
  if (!isRec(value)) return { ok: false, errors: ['manifest must be a JSON object'] }
  if (value['manifestVersion'] !== MANIFEST_VERSION) {
    return {
      ok: false,
      errors: [
        `unsupported manifestVersion ${JSON.stringify(value['manifestVersion'])} (expected ${MANIFEST_VERSION})`,
      ],
    }
  }
  const app = value['app']
  const appName = isRec(app) ? c.str(app, 'name', '$.app') : ''
  const apiVersion = isRec(app) ? c.str(app, 'apiVersion', '$.app') : ''
  if (!isRec(app)) c.errors.push('$.app must be an object')
  const resources = c
    .arr(value, 'resources', '$')
    .map((r, i) => parseResource(c, r, `$.resources[${i}]`))
    .filter((r): r is ResourceDescriptor => r !== undefined)
  const seen = new Set<string>()
  for (const r of resources) {
    if (seen.has(r.name)) c.errors.push(`$.resources: duplicate resource "${r.name}"`)
    seen.add(r.name)
  }
  const generatedAt = c.str(value, 'generatedAt', '$')
  if (c.errors.length > 0) return { ok: false, errors: c.errors }
  return {
    ok: true,
    manifest: {
      manifestVersion: MANIFEST_VERSION,
      app: { name: appName, apiVersion },
      generatedAt,
      resources,
    },
    warnings: c.warnings,
  }
}

/** Options for {@link fetchManifest}. */
export interface FetchManifestOptions {
  /**
   * Origin or base URL of the API server; the manifest path (`/.well-known/strutvane.json`, at the
   * root) is resolved against it. Ignored when `url` is given.
   */
  readonly baseUrl?: string
  /** The manifest's full URL (see `resolveEndpoints`). One of `url` or `baseUrl` is required. */
  readonly url?: string
  readonly fetch?: typeof globalThis.fetch
  readonly signal?: AbortSignal
  readonly credentials?: RequestCredentials
  readonly headers?: Readonly<Record<string, string>>
}

/**
 * Fetch and validate the manifest. Throws {@link ApiProblemError} for HTTP and network failures and
 * {@link ManifestError} for a body that is not a valid manifest.
 */
export async function fetchManifest(options: FetchManifestOptions): Promise<ResourceManifest> {
  const doFetch = options.fetch ?? globalThis.fetch
  if (options.url === undefined && options.baseUrl === undefined)
    throw new TypeError('fetchManifest needs url or baseUrl (the API server).')
  const url =
    options.url !== undefined
      ? new URL(options.url, options.baseUrl)
      : new URL(MANIFEST_PATH, options.baseUrl)
  let response: Response
  try {
    response = await doFetch(url, {
      method: 'GET',
      headers: { accept: 'application/json', ...options.headers },
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.credentials ? { credentials: options.credentials } : {}),
    })
  } catch (cause) {
    if (options.signal?.aborted) throw cause
    throw new ApiProblemError(networkProblem(), { cause })
  }
  if (!response.ok) throw new ApiProblemError(await problemFromResponse(response))
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ManifestError(['response body is not valid JSON'])
  }
  const parsed = parseManifest(body)
  if (!parsed.ok) throw new ManifestError(parsed.errors)
  return parsed.manifest
}
