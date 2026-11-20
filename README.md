<div align="center">

# Strutvane UI

**The behaviour of the Strutvane admin: auto CRUD screens, the sidebar, the command palette, shortcuts and every UX convenience, rendered from the resource manifest through a design you choose.**

[![Status: pre-release](https://img.shields.io/badge/status-pre--release-orange)](https://github.com/vishwajit-vm/strutvane/blob/main/docs/14-roadmap.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Part of Strutvane](https://img.shields.io/badge/ecosystem-Strutvane-1f3a5f)](https://github.com/vishwajit-vm/strutvane)

</div>

> [!NOTE]
> **Status: 0.2 (v2) in pre-release (`next`).** v2 splits the UI into behaviour (this package) and look (a design package: Crisp, Vivid, or your own). Upgrading from 0.1? Read [docs/migrating-from-v1.md](docs/migrating-from-v1.md).

## What it is

Strutvane UI is part of **[Strutvane](https://github.com/vishwajit-vm/strutvane)**, a TypeScript framework and package ecosystem for enterprise B2B applications: declare models, run one command, get migrations, a secured CRUD API, auth, RBAC, tenancy and a complete UI.

This package is that UI's **behaviour**. It reads the resource manifest (`GET /.well-known/strutvane.json`) and draws a list, detail, create and edit page for every resource, plus the sidebar, with zero per-resource code. It has **no look of its own**: every pixel comes from a **design** (`defineDesign()`), so switching from Crisp to Vivid changes every screen without touching one. It talks to the backend only over HTTP.

## Entry points

| Import | Contents | Needs React? |
|---|---|---|
| `@strutvane/ui/react` | `<StrutvaneApp>` (the whole admin), `<StrutvaneProvider>`, `<ResourceList>`, `<ResourceForm>`, `<ResourceDetail>`, `<CommandPalette>`, `<ModalDialog>`, widgets, cells, hooks | Yes |
| `@strutvane/ui/design` | The Design contract: `defineDesign()`, `<DesignProvider>`, tokens, slot prop types, `designStylesheet()` | Yes (the provider) |
| `@strutvane/ui/design/plain` | `plain`: the neutral fallback design | Yes |
| `@strutvane/ui/testing` | `designConformance()` (vitest) and the reference app | Yes, plus vitest and axe-core |
| `@strutvane/ui/core`, `@strutvane/ui` | Manifest client, list-query URL format, filter builder, validation, problems, messages, HTTP and session clients (with the CSRF header), the sidebar model, the shortcut rule, list preferences | No |

Peer dependencies: **`@strutvane/framework`** (required: the shared contracts live in `@strutvane/framework/contracts`), React 19 and the TanStack packages for `./react`, vitest and axe-core for `./testing`. Node `>=24.3`.

## Quick start

```tsx
import { StrutvaneApp, type RouteDefinition } from '@strutvane/ui/react'
import { crisp } from '@strutvane/design-crisp'

const routes: RouteDefinition[] = [{ path: '/reports', title: 'Reports', element: <Reports /> }]

export function App() {
  return (
    <StrutvaneApp
      apiUrl="/api/v1"
      appName="Acme"
      design={crisp}                 // default: the plain design
      brand={{ brandHue: 150 }}      // the public override tokens
      nonce={window.__cspNonce}      // with a strict CSP (decision #119)
      routes={routes}
    />
  )
}
```

| Prop | Default | |
|---|---|---|
| `apiUrl` | (required) | API base, e.g. `/api/v1` (`VITE_API_URL`). Auth is called at `{apiUrl}/auth/*` and the manifest at the API's origin, `/.well-known/strutvane.json` (never under the API base). A relative `api/v1` is read from the site root |
| `authUrl`, `manifestUrl` | `{apiUrl}/auth`, `{origin}/.well-known/strutvane.json` | Move one of them when the app serves it elsewhere; the others stay derived from `apiUrl` |
| `tenancy` | `true` | `false` for an app without teams: no `{auth}/tenants` request |
| `appName` | `Strutvane` | Sidebar, document title and sign-in screen |
| `design`, `brand`, `nonce` | plain, none, none | The design, the public override tokens (`brandHue`, `fontSans`, `radius`, `density`), the CSP nonce of the injected stylesheet. Ignored inside your own `<DesignProvider>` |
| `routes` | `[]` | Your screens (`{ path, element, title?, icon?, group?, order? }`); they win over resource routes; those with a `title` join the sidebar |
| `sidebar`, `can` | none | Pages added by packages (`{ name, label, path, icon, group, order, badge?, permission }`), shown when `can(permission)` is true |
| `home` | a welcome | What `/` shows |
| `overrides`, `locale` | | Widgets, cells and messages (L1/L2) |
| `auth` | `true` | Use the `@strutvane/auth` session endpoints; `false` for an API without them |
| `credentials`, `headers`, `xsrf`, `fetch` | | Transport: cookie policy, extra headers, CSRF settings (`false` for bearer APIs), a custom fetch |

Routes: `/:resource`, `/:resource/new`, `/:resource/:key`, `/:resource/:key/edit`, where `:key` is the record's route key (a slug, decision #55) or its id.

## Designs

```tsx
import { DesignProvider } from '@strutvane/ui/design'
import { plain } from '@strutvane/ui/design/plain'

<DesignProvider design={plain} theme="system" overrides={{ brandHue: 200, radius: '10px' }} nonce={nonce}>
  {/* any Strutvane screens */}
</DesignProvider>
```

A design provides tokens for light and dark, sizes, fonts, the shell (`Shell`, `Sidebar`, `TopBar`, `AuthLayout`, `PageHeader`), sixteen component skins, a chart palette and four illustrations. Apps brand any design with four public tokens: `--brand-hue`, `--font-sans`, `--radius` and `--density`. To build one, read **[docs/design-contract.md](docs/design-contract.md)**; every design must pass:

```ts
// @vitest-environment jsdom
import { designConformance } from '@strutvane/ui/testing'
designConformance(myDesign, { sources: ['src'], tokenFiles: ['src/tokens.ts'] })
```

It checks every slot, WCAG AA contrast for every token pair in both themes (at every brand hue), no hard-coded colours, that each public token changes the result, no horizontal overflow at 375 px, and axe with 0 violations on nine reference screens.

## What you get

**Navigation**
- A sidebar from the manifest: one entry per resource the viewer may list, grouped, ordered (`order`, then A to Z, ungrouped first), with badges; a drawer on phones.
- **Breadcrumbs** and **Back** on every page: Back returns to the list with its page, filters and sort (they live in the URL); on a direct link it goes to the parent page instead of leaving the app.
- **Command palette** (Ctrl/Cmd+K or `/`): screens, records (searched on the server, only what the viewer may see) and actions (New post, switch theme, shortcuts).
- **Shortcuts:** `?` help, `g d` home, `n` new, `e` edit, Alt+← back. Single keys never fire while typing or under a dialog.

**Lists**
- Server-side filtering, search, sort and **numbered pages** (25 by default; 10/25/50/100, never above the resource's `maxPerPage`), "Showing 26–50 of 312 posts".
- **Filter chips** for the search and every filter, each removable, plus Clear all.
- A **Columns** menu and **compact rows**, remembered per viewer.
- **Delete** with a confirmation: type the name for a permanent delete; **Undo** after a soft delete.
- New, Edit and Delete appear only when the manifest allows them (the API still enforces every rule).

**Forms**
- Widgets per field type (decimals keep what you typed; datetimes in your time zone; JSON as JSON; a searchable, paginated relation picker).
- Client validation from the manifest; server 422 issues land on the right field (`path`, then `field`, decision #118); every code is lowercase `snake_case`, as framework 0.2 sends them (#123).
- The **unsaved-changes guard**: leaving a changed form (a link, Back, Escape, the browser's Back) asks first; reload and close use the browser's prompt.
- One submission at a time; idempotency keys reused while the outcome is unknown.
- A **401 keeps the draft** and opens "Sign in again" over the form.

**Safety**
- Writes send `X-XSRF-TOKEN` from the `XSRF-TOKEN` cookie (decision #17). Reads are retried twice on no answer or a 5xx; writes never are.
- Problems are never shown raw: friendly catalogue messages, a trace reference for 5xx, a clear message for `write_cancelled` (#103). Codes are lowercase `snake_case` (#68, #123); catalogue keys use the lowercase code.
- A crashing cell or widget is contained to itself (error boundaries).
- Sign-out shows the sign-in screen only after the server confirmed it.

**Accessibility (WCAG 2.2 AA is release-blocking):** real tables with captions and `aria-sort`, labelled landmarks, focus management on page changes and in dialogs, polite announcements, and axe in the test suite on every screen.

## Overrides (L1 / L2)

```tsx
<StrutvaneProvider
  api={api}
  manifest={manifest}
  overrides={{
    fieldCells: { 'Invoice.amount': Money },              // one column of one resource
    widgets: { money: MoneyInput },                       // every field of type money
    messages: { required: '{attribute} is mandatory.' },  // any catalogue message or UI text
  }}
/>
```

Widgets resolve `Resource.field` → `field.widget` → field type → `default`; cells resolve `Resource.field` → field type → `default`. A widget renders only its control: put `id` on it and pass `describedBy` to `aria-describedby`.

## Manifest fields the UI reads (RFC-0005, proposed)

Optional on each resource: `maxPerPage` (1–100), `routeKey` (a unique slug/uuid field used in URLs), `ui.order` and `ui.badge` (sidebar). Absent or malformed values are ignored, so the UI works with any framework version. See [docs/rfcs/0005-manifest-ui-fields.md](docs/rfcs/0005-manifest-ui-fields.md).

## Development

```bash
npm install
npm run ci      # lint → typecheck → tests + coverage → build
```

Tests use Vitest: core tests in Node, React tests in jsdom with Testing Library, user-event and axe-core; fast-check covers the parsers. Coverage thresholds are 90/90/85/90.

## Works alone, better together

| Package | Role |
|---------|------|
| [`@strutvane/framework`](https://github.com/vishwajit-vm/strutvane-framework) | Backend, database, contracts and CLI |
| [`@strutvane/auth`](https://github.com/vishwajit-vm/strutvane-auth) | Sign-in, tokens, 2FA, teams |
| [`@strutvane/ui`](https://github.com/vishwajit-vm/strutvane-ui) | The admin's behaviour (this package) |
| `@strutvane/design-crisp`, `@strutvane/design-vivid` | The admin's look |
| [`create-strutvane`](https://github.com/vishwajit-vm/create-strutvane) | Project starter |

## Documentation

- [docs/design-contract.md](docs/design-contract.md): building a design
- [docs/migrating-from-v1.md](docs/migrating-from-v1.md): 0.1 → 0.2
- Blueprint: [18 v2 §5.1 designs](https://github.com/vishwajit-vm/strutvane/blob/main/docs/18-v2-blueprint.md), [19 production readiness](https://github.com/vishwajit-vm/strutvane/blob/main/docs/19-production-readiness.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Public API changes need a changeset, docs and tests.

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 The Strutvane Authors
