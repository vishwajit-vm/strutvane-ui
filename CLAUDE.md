# CLAUDE.md: Strutvane UI (`@strutvane/ui`)

Project memory for Claude Code in this repository. Keep this file short, accurate and current.

## Ecosystem memory (shared by every Strutvane repo)

The file below is synced from strutvane-tooling and is identical in every repo. It covers how the whole ecosystem fits together: repo map, decisions, connection rules, standards, workflow and current status. Read it before changing anything.

@.claude/ECOSYSTEM.md

## What this repo is

Metadata-driven frontend for Strutvane and any OpenAPI backend: auto-generated routes, data tables, forms, filters and detail pages, auth screens, layouts and themes, with components you own.

It is one repo of the **Strutvane** polyrepo ecosystem (one GitHub repo per package; see ADR-0002). The hub with the full blueprint is https://github.com/vishwajit-vm/strutvane. Locally it is the umbrella folder two levels up: `../../docs/`.

## Status

- **Renderer core and app shell implemented and tested: `0.1.0-next.0` (changesets pre mode `next`), not released.** It covers ADR-0014's Phase 1 scope (lists, forms, filters, errors, overrides) plus the app shell (`StrutvaneApp.tsx`, `router.tsx`, `ResourceDetail.tsx`, `SignIn.tsx`, `core/session-client.ts`). Full layouts, more auth screens (reset, MFA), themes, the shadcn registry, `@strutvane/ui/vite|installer|testing` and UI-only mode come later.
- The source of truth for decisions is `../../docs/00-executive-summary.md`. If anything here conflicts with it, that file wins.
- The package spec is `../../docs/08-package-ui.md`. The key decisions are ADR-0014 (renderer and registries), ADR-0011 (list-query wire format) and RFC-0003 §4 (form failure behaviour).
- **TEMPORARY:** `pnpm-workspace.yaml` overrides `@strutvane/contracts` to `link:../contracts` until contracts `0.1.0-next.0` is on npm (ADR-0016). Remove the override once it is published.

## Commands

```bash
corepack pnpm@12.18.0 install
corepack pnpm@12.18.0 run ci        # biome → tsc → vitest --coverage → tsdown (must pass before commit)
node_modules/.bin/vitest run test/ResourceForm.test.tsx   # one file while iterating
npx --yes publint@0.3.15 --pack npm # package.json / exports check
node ../tooling/scripts/sync.mjs --repo ui   # re-sync shared configs from tooling
```

## Structure

- `src/core/`: framework-free and never imports React, so a future Vue renderer can reuse it.
  - `manifest-client.ts`: fetch and validate the manifest defensively.
  - `filter-builder.ts`: the ONE filter builder (URL + filter bar).
  - `list-state.ts`: reducer with a cursor stack.
  - `list-query-url.ts`: ADR-0011 URL format, plus the `POST /query` decision.
  - `validation.ts`: client rules from the manifest.
  - `issues.ts`: deepest field → parent → banner.
  - `problems.ts`: sanitize untrusted problem bodies; banner text from the catalog.
  - `messages.ts`: catalog plus a safe ICU subset formatter.
  - `registry.ts`: generic widget/cell resolution.
  - `record-batcher.ts`: batched relation labels.
  - `http-client.ts`: `fetch` wrapper with idempotency keys.
  - `ids.ts`, `types.ts` (`ResourceApi`).
- `src/react/`:
  - `StrutvaneProvider.tsx`; `context.ts` (hooks, no default-registry import, so no import cycles).
  - `ResourceList.tsx`, `ResourceForm.tsx`, `FieldShell.tsx`, `FilterBar.tsx`.
  - `widgets.tsx`, `cells.tsx`, `relations.ts`, `useListQuery.ts`, `defaults.ts`, `types.ts`.
- `test/core/*.test.ts` run in Node. `test/*.test.tsx` declare `// @vitest-environment jsdom` and import `test/helpers.tsx` (providers, seed data, axe).
  - `test/fixtures/`: manifest plus an in-memory `FakeApi` that validates like the server.
  - `test/types.test-d.ts`: type-level tests.

## Invariants (tests guard these)

- **Server-side list operations:** TanStack Table uses `manualSorting` and `sortDescFirst: false`, so the first click is always ascending.
- **One filter builder:** every filter goes through `buildFilter`. Unknown fields, operators and parameters are dropped and reported, never sent.
- **Number widget:** keeps the draft text, so the decimal point is never swallowed.
- **Messages:** each message is shown once. Server errors are cleared on edit and before a resubmit.
- **Focus:** requested through state plus an effect (never before render). It goes to the first invalid field, else the banner.
- **Virtualization:** a fail-safe window, so the table is never empty when data exists.
- **Problems:** no response shape can crash the UI. 5xx details are never shown.
- **Idempotency keys:** kept while the outcome is unknown, rotated after success or a 4xx.
- **Capabilities:** gate every New, Edit and Delete action, and the forms. The API still enforces.

## Boundaries (non-negotiable)

- Allowed dependencies: `@strutvane/contracts` (and `@strutvane/core` for the server-side bits). It must never import `@strutvane/framework` or `@strutvane/auth`; it talks to them over HTTP using the resource manifest and OpenAPI.
- Cooperation with other Strutvane packages happens **only through `@strutvane/contracts`**, resolved at runtime via the core container.
- Public API changes need a changeset, docs and tests. Contract changes need an RFC.

## Conventions

- TypeScript strict, ESM only, Node 24+ (Node 26 LTS is the target). No decorators or reflection.
- Validation uses Standard Schema with Zod 4 as the default. Errors are RFC 9457 problem+json.
- Tooling: pnpm, tsdown (build), Biome (lint/format), Vitest (tests), Playwright (UI e2e), Testcontainers (DB).
- Code generation and AST work pin the TypeScript 6 compiler API (`@typescript/typescript6`), because TypeScript 7 has no compiler API.
- Releases: Changesets, npm trusted publishing (OIDC) with provenance. Core packages share a major release train.
- **Docker is local-only and never committed** (ADR-0006). Never commit `.env`; keep `.env.example` complete and documented.
- Windows, macOS and Linux are all first-class. Use no bash-only scripts.

## Definition of done (for any change)

Code, tests, docs and a changeset ship together. Security implications are noted. The CLI help or reference is updated if commands changed.

## Where things are

- `.claude/skills/`: task playbooks for this package (invoke by name)
- `.claude/agents/`: specialised reviewer subagents
- `.claude/commands/`: slash commands (`/spec`, `/pre-pr`)
