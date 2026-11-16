# Migrating from 0.1 (v1) to 0.2 (v2)

v2 splits the UI into **behaviour** (`@strutvane/ui`) and **look** (a design package). Most apps
render `<StrutvaneApp>` and need only steps 1 to 3.

## 1. Dependencies

- `@strutvane/ui` now needs **`@strutvane/framework`** (`^0.1.0-next.1`) as a peer: the shared
  contracts moved from `@strutvane/contracts` to `@strutvane/framework/contracts`. Remove
  `@strutvane/contracts`.
- Node `>=24.3`. The package is built and published with npm.

## 2. Pick a design

v1 shipped its own stylesheet (`APP_STYLES`, the `styles` prop). v2 has no look of its own:

```tsx
import { crisp } from '@strutvane/design-crisp'
<StrutvaneApp apiUrl="/api" design={crisp} brand={{ brandHue: 150 }} nonce={cspNonce} />
```

Without `design`, the neutral `plain` design (`@strutvane/ui/design/plain`) is used. Outside
`<StrutvaneApp>`, wrap your screens in `<DesignProvider design={…}>`. Your own `--sv-*` theme
variables from v1 become the four public tokens: `--brand-hue`, `--font-sans`, `--radius`,
`--density` (see `docs/design-contract.md`).

Removed: `APP_STYLES`, `StrutvaneApp` `styles`.

## 3. Behaviour changes you will see

- **Numbered pages**, 25 rows by default (10/25/50/100, capped by the resource's `maxPerPage`), with
  "Showing 26–50 of 312 posts". List URLs use `page[number]`; old `page[cursor]` links are dropped
  and open page 1.
- **Delete** has its own confirmation dialog: type the record's name for a permanent delete; Undo
  after a soft delete. The `confirmDelete` prop of `ResourceList` and `ResourceDetail` is replaced
  by `deletable`.
- **A 401 mid-session** opens "Sign in again" over the current screen (a form keeps its draft)
  instead of switching to the sign-in screen.
- **Writes send `X-XSRF-TOKEN`** from the `XSRF-TOKEN` cookie (decision #17). Bearer-token APIs can
  pass `xsrf: false` to `createHttpClient`, `createSessionClient` or `<StrutvaneApp>`.
- **Reads are retried** twice on no answer or a 5xx; writes never are (`readRetries: 0` turns it off).
- **Record URLs** use the resource's route key when the manifest names one (`/posts/hello-world`).
- Page headings are `<h1>` through the design's `PageHeader`; v1 rendered `<h2>`.

## 4. API changes (if you use the parts directly)

| v1 | v2 |
|---|---|
| `useListQuery(...).nextPage(cursor)`, `previousPage()`, `hasPrevious` | `setPage(n)`, `state.page`; also `clearFilters()` |
| `ListState.cursor`, `ListPageState` | `ListState.page` |
| `toListQuery` → `{ kind: 'cursor' }` | `{ kind: 'offset', size, number }` (`page[total]=true` is added on the wire) |
| `ResourceList` / `ResourceDetail` `confirmDelete` | `deletable` (built-in dialog) |
| `ResourceApi` | adds optional `restore(path, key)` |
| `ui.list.showing` for counts | also `ui.list.showingRange`, `…RangeCapped`, `…RangeOpen` |
| `ui.problem.code.VALIDATION_FAILED` … | `ui.problem.code.validation_failed` … (codes match in any case, so your overrides still apply) |

New: `@strutvane/ui/design` (the contract), `@strutvane/ui/design/plain`, `@strutvane/ui/testing`
(the conformance kit); in `@strutvane/ui/react`: `PageHeading`, `ModalDialog`, `CommandPalette`,
`ToastProvider`, `useDeleteRecord`, `useNavigationBlocker`, `SignInForm`, `SignInDialog`.
