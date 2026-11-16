# RFC-0005: UI fields in the resource manifest

- **Status:** Proposed (drafted 2026-11-16 in `strutvane-ui`, to move to the hub `docs/rfcs/`)
- **Affects:** `@strutvane/framework/contracts` (`ResourceDescriptor`), the framework's manifest builder, `@strutvane/ui`
- **Related:** blueprint §5 (pagination, sidebar), CONSISTENCY #50 (sidebar entry shape), #54 (page size 25), #55 (`{post:slug}` URLs), ui audit item 6 (picker page size)

## Problem

`@strutvane/ui` v2 needs four facts about each resource that the v0 manifest contract
(`ResourceDescriptor`) does not carry:

1. **The largest page size the resource accepts.** Today the UI can only assume the protocol
   maximum (100). A resource that allows less answers a relation picker or a "100 rows" choice with
   a 422 (ui audit item 6).
2. **The field records are addressed by in URLs.** Route model binding by slug
   (`/api/posts/{post:slug}`, #55) means the UI must build `/posts/hello-world`, not `/posts/7`, and
   send the same key to the API.
3. **The sidebar position** (`order`, #50).
4. **A sidebar badge** (a short count or label, #50).

## Proposal

Add four optional members to `ResourceDescriptor`:

```ts
export interface ResourceDescriptor {
  // … existing members …
  /** Largest `page[size]` this resource accepts (1–100). Absent: the protocol maximum. */
  readonly maxPerPage?: number
  /** Field used to address records in URLs (route model binding), e.g. "slug". Absent: the id. */
  readonly routeKey?: string
  readonly ui?: {
    readonly icon?: string
    readonly group?: string
    readonly listColumns?: readonly string[]
    /** Sidebar position inside its group; lower first. */
    readonly order?: number
    /** Short sidebar badge (≤ 20 characters, or a number). */
    readonly badge?: string | number
  }
}
```

Rules the framework guarantees when it sends them:

- `maxPerPage` is an integer from 1 to 100, and the list endpoint refuses a larger `page[size]`
  with the usual 422.
- `routeKey` names a field of the same resource that is `unique` and of type `slug`, `string`,
  `uuid` or `ulid`; every record endpoint (`GET`, `PATCH`, `DELETE`, `POST …/restore`) binds by it.
  Slugs are stable after create (blueprint §5 "Slugs"), so a link never breaks after an edit.
- `ui.order` is a finite number; `ui.badge` is computed per viewer and never reveals rows the
  viewer can't list.

`MANIFEST_VERSION` stays `1`: all four members are optional and additive.

## Compatibility (how the UI behaves today)

`@strutvane/ui` 0.2 already reads these members **defensively** from the raw manifest
(`withUiExtensions` in `src/core/resource-extensions.ts`):

- absent → today's behaviour (page sizes up to 100, ids in URLs, sidebar A to Z, no badge);
- malformed (out of range, wrong type, a route key that is not a unique text field) → ignored, as
  if absent. A bad value can never widen what the UI asks for.

So the framework can ship this in any order relative to the UI.

## Alternatives considered

- **Read `maxPerPage` from the OpenAPI document.** The UI doesn't load OpenAPI at runtime, and the
  manifest is already the one document the UI trusts per viewer.
- **Always use ids in URLs.** Rejected by #55 (Laravel's `{post:slug}` binding, readable links).

## Open questions

- Should `badge` support a tone (`warning`, `danger`)? Not needed for 0.2.
