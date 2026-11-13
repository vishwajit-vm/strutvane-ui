<div align="center">

# Strutvane UI

**Metadata-driven frontend for Strutvane and any OpenAPI backend: auto-generated routes, data tables, forms, filters and detail pages, auth screens, layouts and themes, with components you own.**

[![Status: planning](https://img.shields.io/badge/status-planning-blueviolet)](https://github.com/vishwajit-vm/strutvane/blob/main/docs/14-roadmap.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Part of Strutvane](https://img.shields.io/badge/ecosystem-Strutvane-1f3a5f)](https://github.com/vishwajit-vm/strutvane)

</div>

> [!NOTE]
> **Strutvane UI is in the design phase.** The specification is written and implementation has not started. Nothing is published to npm yet, and the package name `@strutvane/ui` is reserved for this project. Follow [the roadmap](https://github.com/vishwajit-vm/strutvane/blob/main/docs/14-roadmap.md) for progress.

## What it is

Strutvane UI is part of **[Strutvane](https://github.com/vishwajit-vm/strutvane)**, a TypeScript framework and package ecosystem for building enterprise B2B applications. You declare models as fields and types, and get migrations, a secured CRUD API, auth/RBAC/tenancy and a complete UI. Every line stays owned, overridable TypeScript.

## Planned capabilities

- **Automatic pages** per resource: data table (search, filters, sort, pagination, bulk actions, export, saved views), forms, detail pages, relation and activity tabs
- **Auth screens**: login, register, reset, MFA, profile, users/roles/permissions admin, tenant switcher
- **Permission-aware**: hides what the API forbids (the API still enforces)
- **Owned components**: a shadcn-compatible registry copied into your app; theme tokens, dark mode, swappable design systems
- **Levels of control**: configure, override one column, widget or page, or eject full source
- **UI-only mode** against any OpenAPI 3.x API
- Built on React 19, Vite, TanStack Router/Query/Table/Form and Tailwind CSS 4

## A taste of the API (design preview)

```ts
// web/pages/invoices/columns.tsx  (L2: override one column only; everything else stays automatic)
export const amount = ({ row }) => <Money value={row.amount} currency={row.currency} />

// pnpm sv add ui           → web/ shell, layouts, theme, pages for every model
// pnpm sv eject ui Invoice --page form → full source of the form, yours to edit
```

## Installation (once released)

```bash
pnpm sv add ui   # or: npm create strutvane@latest my-ui -- --preset ui
```

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
- **Ecosystem blueprint:** [strutvane/docs](https://github.com/vishwajit-vm/strutvane/tree/main/docs), starting with the [executive summary](https://github.com/vishwajit-vm/strutvane/blob/main/docs/00-executive-summary.md) and the [developer experience](https://github.com/vishwajit-vm/strutvane/blob/main/docs/05-developer-experience.md)

## Contributing

Ideas and design feedback are welcome while the project is in the design phase. Open an issue or discussion, and see [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 The Strutvane Authors
