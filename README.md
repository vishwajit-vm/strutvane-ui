<div align="center">

# Strutvane UI

**Metadata-driven frontend for Strutvane and any OpenAPI backend: data tables, forms, filters and error handling rendered from the resource manifest, with typed override registries and components you own.**

[![Status: pre-release](https://img.shields.io/badge/status-pre--release-orange)](https://github.com/vishwajit-vm/strutvane/blob/main/docs/14-roadmap.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Part of Strutvane](https://img.shields.io/badge/ecosystem-Strutvane-1f3a5f)](https://github.com/vishwajit-vm/strutvane)

</div>

> [!NOTE]
> **Status: renderer core implemented and tested (`0.1.0-next.0`), not yet released to npm.** This release covers the Phase 1 renderer core from [ADR-0014](https://github.com/vishwajit-vm/strutvane/blob/main/docs/adr/0014-ui-from-manifest-with-registries.md): lists, forms, filters, errors and overrides. Routing, layouts, auth screens, themes, the component registry and UI-only mode come later (see [the roadmap](https://github.com/vishwajit-vm/strutvane/blob/main/docs/14-roadmap.md)). The APIs may still change before `0.1.0`.

## What it is

Strutvane UI is part of **[Strutvane](https://github.com/vishwajit-vm/strutvane)**, a TypeScript framework and package ecosystem for building enterprise B2B applications. You declare models as fields and types, and get migrations, a secured CRUD API, auth/RBAC/tenancy and a complete UI. Every line stays owned, overridable TypeScript.

This package renders that UI. It reads the resource manifest (`GET /.well-known/strutvane.json`) and draws a list page and a create/edit form for every resource, with zero per-resource UI code. It talks to the backend only over HTTP, so it never imports `@strutvane/framework` or `@strutvane/auth`.

## Entry points

| Import | Contents | Needs React? |
|---|---|---|
| `@strutvane/ui/core` | Manifest client, list-query URL format, the filter builder, list state, client validation, issue routing, problem handling, message formatting, widget/cell registries, the HTTP client | No |
| `@strutvane/ui/react` | `<StrutvaneProvider>`, `<ResourceList>`, `<ResourceForm>`, `<FieldShell>`, `<FilterBar>`, default widgets and cells, hooks | Yes |
| `@strutvane/ui` | Same as `@strutvane/ui/core` | No |

React 19 and the TanStack packages (Query, Table, Form, Virtual) are **peer dependencies**, needed only for `@strutvane/ui/react`. The only runtime dependency is `@strutvane/contracts`, which is types plus a few constants.

## Quick start: the whole app

`<StrutvaneApp>` is the complete UI of a Strutvane app (what `web/app.tsx` renders): sign-in,
workspace picker and switcher, a menu of every resource the user may list, and list, create,
detail and edit pages for each, all permission-aware and built from the API's manifest.

```tsx
import { type RouteDefinition, StrutvaneApp } from '@strutvane/ui/react'

const routes: RouteDefinition[] = [{ path: '/reports', title: 'Reports', element: <Reports /> }]

export function App() {
  return <StrutvaneApp apiUrl={import.meta.env.VITE_API_URL} appName="Acme" routes={routes} />
}
```

| Prop | Default | |
|---|---|---|
| `apiUrl` | (required) | API base, e.g. `/api/v1`; the manifest is read from the same origin |
| `appName` | `Strutvane` | Header, document title and sign-in screen |
| `routes` | `[]` | Your screens (`{ path, element, title? }`, `:params` allowed); they win over resource routes, and those with a `title` appear in the menu |
| `home` | a welcome | What `/` shows |
| `overrides`, `locale` | | Widgets, cells and messages (L1/L2), as for `<StrutvaneProvider>` |
| `auth` | `true` | Use the `@strutvane/auth` session endpoints (`/auth/me`, `/sign-in`, `/tenants`, `/switch-tenant`); `false` for an API without them |
| `credentials` | `same-origin` | `include` when the UI is served from another origin than the API |
| `styles` | `true` | Inject `APP_STYLES` (themable through `--sv-*` CSS variables) |

Routes: `/:resource` (list), `/:resource/new`, `/:resource/:id` (detail, with related lists for
`hasMany` relations whose foreign key is filterable), `/:resource/:id/edit`. A 401 from any request
returns to the sign-in screen with a notice; a sign-out the server did not confirm (offline, 5xx)
keeps you signed in and says so, so a live session never hides behind the sign-in screen; unknown paths and resources the user cannot see show
the same "not found or no access" page. The pieces are exported too: `Router`, `Link`,
`useRouter`, `matchPath`, `ResourceDetail`, `SignIn`, and `createSessionClient` from
`@strutvane/ui/core`.

## Quick start: single screens

```tsx
import { createHttpClient, fetchManifest } from '@strutvane/ui/core'
import { ResourceForm, ResourceList, StrutvaneProvider } from '@strutvane/ui/react'
import { QueryClient } from '@tanstack/react-query'

const api = createHttpClient({ baseUrl: 'https://api.example.com/api/v1', credentials: 'include' })
const manifest = await fetchManifest({ baseUrl: 'https://api.example.com', credentials: 'include' })
const invoices = manifest.resources.find((r) => r.name === 'Invoice')!
const queryClient = new QueryClient()

export function App() {
  return (
    <StrutvaneProvider api={api} manifest={manifest} queryClient={queryClient}>
      <ResourceList
        resource={invoices}
        initialSearch={location.search}
        onSearchStringChange={(s) => history.replaceState(null, '', s ? `?${s}` : location.pathname)}
        onCreate={() => navigate('/invoices/new')}
        onEdit={(row) => navigate(`/invoices/${row.id}/edit`)}
        confirmDelete={(row) => confirm(`Delete ${row.number}?`)}
      />
    </StrutvaneProvider>
  )
}

// /invoices/new  →  <ResourceForm resource={invoices} onSaved={(r) => navigate(`/invoices/${r.id}`)} />
// /invoices/:id  →  <ResourceForm resource={invoices} recordId={id} onSaved={…} onCancel={…} />
```

## What you get

**Lists (`<ResourceList>`)**

- Columns from `ui.listColumns` (or up to six sensible fields). Cells per field type: numbers and dates through `Intl`, Yes/No, relation titles.
- Filtering, search, sorting and pagination all **run on the server**. The table never sorts or filters locally.
- **Sorting:** the first click is always ascending, on every column.
- **Filter chips:** you can only pick a field's allowed operators, and every value is validated before it is sent.
- **Search** is debounced. **Pagination** uses cursors, with Previous and Next.
- **Deep links:** list state round-trips through the URL in the ADR-0011 wire format (`filter[status][in]=draft&filter[status][in]=sent&sort=-dueDate&page[size]=50`). Parameters the resource does not allow are dropped and reported, never sent.
- **Virtualization** above 100 rows. A container that cannot be measured still shows the first rows.
- **New, Edit and Delete** buttons appear only when the manifest's capabilities allow them for this user. Delete asks first and sends an idempotency key.

**Forms (`<ResourceForm>`)**

- **Widgets per field type:**
  - text, email, URL and phone
  - textarea
  - number and decimal: what you typed is kept, so `1250.` is not swallowed, and the locale's decimal comma is accepted
  - enum select, checkbox and date
  - a read-only display
  - a **belongsTo picker** that searches on the server and pages 100 records at a time with "Load more", so every record is reachable
  - repeatable groups for `array` fields
- **Validation:**
  - Client validation comes from the manifest (`required`, `minimum`/`maximum`, `minLength`/`maxLength`, `pattern`, enums, real calendar dates). It uses the same message catalog as the server.
  - Server `422` issues land on the deepest rendered field (e.g. `lines[1].amount`), else its parent field, else the form banner. No message is ever dropped, and each is shown once.
  - Focus moves to the first invalid field, or to the banner.
- **Other errors** (`401`, `403`, `404`, `409`, `429`, `5xx`, offline, malformed responses) show a friendly banner from the catalog, never raw internals. A 5xx shows a support reference (`traceId`). Your typed values are always kept.
- **Idempotent retries:** one `Idempotency-Key` per user action. It is reused while the outcome is unknown (network error, 5xx, 429) and replaced after success or a definitive 4xx answer.
- **Edit mode:** `readOnly` and `writeOnce` fields are respected. Edit mode sends only the fields that changed.

**Accessibility (WCAG 2.2 AA is release-blocking)**

- **Built in once:** `<FieldShell>` wires label, help text, `aria-invalid` and `aria-describedby` for every widget, including your overrides.
- **Lists:** tables have captions, `scope="col"` and `aria-sort`. Pagination is labelled, and result counts are announced politely.
- **Tested:** axe-core runs in the test suite on lists, forms, filter errors and server-error states (colour contrast needs a real browser and is checked there).

## Overrides (L1 / L2)

Override any widget or cell through the provider, with no fork. Overrides are merged on top of the defaults:

```tsx
import type { Cell, Widget } from '@strutvane/ui/react'

const Money: Cell = ({ value, record }) => <>{formatMoney(value, record.currency)}</>
const MoneyInput: Widget = ({ id, value, onChange, onBlur, describedBy, invalid }) => (
  <input id={id} value={String(value ?? '')} aria-describedby={describedBy} aria-invalid={invalid}
         onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
)

<StrutvaneProvider
  api={api}
  manifest={manifest}
  overrides={{
    fieldCells: { 'Invoice.amount': Money },          // one column of one resource
    widgets: { money: MoneyInput },                   // every field of type money
    messages: { required: '{attribute} is mandatory.' }, // any catalog message or UI text
  }}
/>
```

Every cell and every widget renders inside its own `RenderBoundary`: an override (or a value of an unexpected shape) that throws shows "Cannot display this value" in that one cell, or a notice in that one field, instead of blanking the screen. Widgets resolve `Resource.field` → named widget (`field.widget`) → field type → `default`. Cells resolve `Resource.field` → field type → `default`. A widget renders only its control: put `id` on it and pass `describedBy` to `aria-describedby`, and it is fully accessible.

## Using the core without React

```ts
import { buildFilter, parseSearchString, routeIssues, toSearchString } from '@strutvane/ui/core'

const { state, rejected } = parseSearchString(location.search, invoices) // fails closed, reports why
const chip = buildFilter(amountField, 'between', ['10', '99.5'])          // { ok: true, filter } or { ok: false, reason }
const { fieldErrors, formErrors } = routeIssues(problem.issues ?? [], new Set(renderedFieldNames))
```

The same filter builder serves URL parsing, the filter bar and programmatic filters. The UI therefore can never send a filter that the descriptor does not allow.

## Development

```bash
corepack pnpm@12.18.0 install
corepack pnpm@12.18.0 run ci      # lint → typecheck → tests + coverage → build
```

Tests use Vitest. Core tests run in Node. React tests use jsdom, Testing Library, user-event and axe-core, and fast-check covers the parsers and the formatter. Coverage thresholds are 90/90/85/90.

## Works alone, better together

| Package | Role |
|---------|------|
| [`@strutvane/framework`](https://github.com/vishwajit-vm/strutvane-framework) | Backend & database core |
| [`@strutvane/auth`](https://github.com/vishwajit-vm/strutvane-auth) | Authentication, authorization, tenancy, audit |
| [`@strutvane/ui`](https://github.com/vishwajit-vm/strutvane-ui) | Metadata-driven frontend |
| [`@strutvane/core`](https://github.com/vishwajit-vm/strutvane-core) | Kernel: container, providers, config, context |
| [`@strutvane/contracts`](https://github.com/vishwajit-vm/strutvane-contracts) | Shared types and wire protocols |
| [`strutvane` / `@strutvane/cli`](https://github.com/vishwajit-vm/strutvane-cli) | Unified CLI |
| [`@strutvane/devkit`](https://github.com/vishwajit-vm/strutvane-devkit) | SDK for installers, generators and plugins |
| [`@strutvane/logs`](https://github.com/vishwajit-vm/strutvane-logs) | Zero-config logging + built-in log viewer (default) |
| [`create-strutvane`](https://github.com/vishwajit-vm/create-strutvane) | Project starter |

## Documentation

- **Package specification:** [08-package-ui.md](https://github.com/vishwajit-vm/strutvane/blob/main/docs/08-package-ui.md)
- **Decisions:** [ADR-0014](https://github.com/vishwajit-vm/strutvane/blob/main/docs/adr/0014-ui-from-manifest-with-registries.md) (renderer and registries), [ADR-0011](https://github.com/vishwajit-vm/strutvane/blob/main/docs/adr/0011-openapi-pipeline-and-typed-client.md) (list-query wire format), [RFC-0003](https://github.com/vishwajit-vm/strutvane/blob/main/docs/rfcs/0003-errors-and-messages.md) (errors and messages)
- **Ecosystem blueprint:** [strutvane/docs](https://github.com/vishwajit-vm/strutvane/tree/main/docs), starting with the [executive summary](https://github.com/vishwajit-vm/strutvane/blob/main/docs/00-executive-summary.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Public API changes need a changeset, docs and tests.

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 The Strutvane Authors
