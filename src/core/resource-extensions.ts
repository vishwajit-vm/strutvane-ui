/**
 * Manifest fields the v2 UI reads beyond the v0 contract (`ResourceDescriptor`).
 *
 * The framework's manifest contract does not carry these yet, so they are read defensively from the
 * raw manifest and attached to the parsed descriptor. A server that doesn't send them gets today's
 * behaviour; a malformed value is ignored (never trusted, never a crash). Each one exists for a
 * decision the UI must honour:
 *
 * - `maxPerPage`: the resource's own page-size limit, so pickers and page-size menus never ask for
 *   more rows than the server allows (a 422 otherwise; ui audit item 6).
 * - `routeKey`: the field used in record URLs (`/posts/hello-world`, route model binding
 *   `{post:slug}`, decision #55). Without it, URLs use the id.
 * - `ui.order`, `ui.badge`, `ui.permission`: the rest of the sidebar entry shape (decision #50).
 *
 * @module
 */
import type { ResourceDescriptor } from '@strutvane/framework/contracts'
import type { ApiRecord } from './types.ts'

/** The v2 extras a descriptor may carry. All optional. */
export interface UiResourceExtensions {
  /** Largest page size the server accepts for this resource (1–100). */
  readonly maxPerPage?: number
  /** Field whose value identifies a record in URLs instead of its id (a slug or uuid field). */
  readonly routeKey?: string
  /** Sidebar position: lower first; entries without one sort after, A to Z. */
  readonly navOrder?: number
  /** Short sidebar badge, such as a count. */
  readonly navBadge?: string | number
}

/** A descriptor as the UI sees it: the contract plus the v2 extras. */
export type UiResourceDescriptor = ResourceDescriptor & UiResourceExtensions

const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Field types that make a usable route key: unique text identifiers. */
const ROUTE_KEY_TYPES: ReadonlySet<string> = new Set(['slug', 'string', 'uuid', 'ulid'])

/**
 * Attach the valid extras found in `raw` to a parsed descriptor. Invalid values are dropped.
 *
 * @example
 * withUiExtensions(posts, { maxPerPage: 50, routeKey: 'slug' }).maxPerPage // 50
 */
export function withUiExtensions(
  descriptor: ResourceDescriptor,
  raw: Readonly<Record<string, unknown>>,
): UiResourceDescriptor {
  const extras: { -readonly [K in keyof UiResourceExtensions]: UiResourceExtensions[K] } = {}
  const max = raw['maxPerPage']
  if (typeof max === 'number' && Number.isInteger(max) && max >= 1 && max <= 100)
    extras.maxPerPage = max
  const key = raw['routeKey']
  const keyField =
    typeof key === 'string' ? descriptor.fields.find((f) => f.name === key) : undefined
  if (keyField?.unique && ROUTE_KEY_TYPES.has(keyField.type)) extras.routeKey = keyField.name
  const ui = raw['ui']
  if (isRec(ui)) {
    const order = ui['order']
    if (typeof order === 'number' && Number.isFinite(order)) extras.navOrder = order
    const badge = ui['badge']
    if (
      (typeof badge === 'string' && badge.length <= 20) ||
      (typeof badge === 'number' && Number.isFinite(badge))
    )
      extras.navBadge = badge
  }
  return { ...descriptor, ...extras }
}

/** The v2 extras of a descriptor (an empty object for a plain contract descriptor). */
export function extrasOf(resource: ResourceDescriptor): UiResourceExtensions {
  return resource as UiResourceDescriptor
}

/** The resource's page-size limit, if it declared one. */
export function maxPerPage(resource: ResourceDescriptor): number | undefined {
  return extrasOf(resource).maxPerPage
}

/**
 * The URL segment that identifies `record`: its route key value (a slug) when the resource
 * declares one and the record has a non-empty text value for it, otherwise its id. The same value
 * goes to the API (`/api/posts/{post:slug}`), so links and requests agree.
 *
 * @example
 * recordKey(posts, { id: '7', slug: 'hello-world' }) // 'hello-world'
 */
export function recordKey(resource: ResourceDescriptor, record: ApiRecord): string {
  const field = extrasOf(resource).routeKey
  const value = field === undefined ? undefined : record[field]
  return typeof value === 'string' && value !== '' ? value : record.id
}
