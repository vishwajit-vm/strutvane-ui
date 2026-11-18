# CLAUDE.md: Strutvane UI (`@strutvane/ui`)

Project memory for Claude Code in this repository. Keep this file short, accurate and current.

## Ecosystem memory (shared by every Strutvane repo)

The file below is synced from strutvane-tooling and is identical in every repo. It covers how the whole ecosystem fits together: repo map, decisions, connection rules, standards, workflow and current status. Read it before changing anything.

@.claude/ECOSYSTEM.md

## What this repo is

The **behaviour** of the Strutvane admin: auto CRUD screens from the resource manifest, the sidebar,
the command palette, shortcuts and every UX convenience. It has **no look of its own**: everything
renders through a design (`defineDesign()`, blueprint §5.1). It also defines the Design contract and
the conformance kit that Crisp, Vivid and community designs implement.

## Status

- **v2 on branch `v2/behaviour` (0.2 line, `next`), not released.** v1 (`0.1.0-next.0`) is on npm.
- Gates: hub `docs/19-production-readiness.md` (R1–R9); evidence in `RELEASE-READINESS.md`.
- `@strutvane/framework` `^0.2.0-next.0` is a required peer (contracts at
  `@strutvane/framework/contracts`). Until `0.2.0-next.0` is on npm, `package-lock.json` has no
  framework entry and `npm ci` fails: test against a local `npm pack` of the framework with
  `npm install --no-save --ignore-scripts <tarball>` (never commit it), and run `npm install` to
  refresh the lockfile after it ships.
- Error model = framework 0.2 (hub RFC-0003): codes are lowercase `snake_case` (#123,
  `test/error-codes.test.ts` fails on an uppercase code literal in `src/`); every issue carries
  `field`, placed by `path` first (#118).
- Manifest fields `maxPerPage`, `routeKey`, `ui.order`, `ui.badge`: read when present, ignored
  otherwise (`docs/rfcs/0005-manifest-ui-fields.md`, proposed).

## Commands

```bash
npm install
npm run ci                                   # biome → tsc → vitest --coverage → tsdown
npx vitest run test/conveniences.test.tsx    # one file while iterating
node .github/scripts/check-code-rules.mjs && node .github/scripts/check-package.mjs
node ../tooling/scripts/sync.mjs --repo ui   # re-sync shared configs from tooling
```

## Structure

- `src/core/`: framework-free (no React). Manifest client (+ `resource-extensions.ts` for the v2
  fields), list-query URL format, the ONE filter builder, list state (numbered pages), validation,
  issue routing, problems, messages, registry, record batcher, HTTP and session clients (`xsrf.ts`),
  the sidebar model (`navigation.ts`), the shortcut rule (`shortcuts.ts`), list preferences.
- `src/design/`: the contract: `tokens.ts`, `slots.ts`, `define-design.ts`, `stylesheet.ts`,
  `color.ts`, `DesignProvider.tsx`; `plain/` is the fallback design (colour literals only in
  `plain/tokens.ts`).
- `src/react/`: behaviour components, rendering only through `useSkins()` / `useShellSlots()`.
- `src/testing/`: `designConformance()`, the pure checks, the reference API and screens.
- `docs/`: `design-contract.md` (for design authors), `migrating-from-v1.md`, `rfcs/`.

## Invariants (tests guard these)

- **No look here:** no colour literal outside `src/design/plain/tokens.ts` (the conformance kit
  scans `src/design/plain`); behaviour markup carries `data-sv-part` hooks, never classes with style.
- **Server-side list operations:** `manualSorting`, `sortDescFirst: false` (first click ascending).
- **One filter builder:** unknown fields, operators and parameters are dropped and reported.
- **Page sizes** never exceed the resource's `maxPerPage` (lists, pickers, the batcher, the palette).
- **Writes** carry `X-XSRF-TOKEN` and an idempotency key; only reads are retried.
- **Shortcuts** obey `shortcutBlocked`: never while typing or under a modal.
- **Dialogs** trap focus and return it; Cancel / Keep editing get focus in confirmations.
- **A 401** opens "sign in again" over the page; a different person clears every cached record.
- **Landmark names are unique** on every screen (axe `landmark-unique`).
- **Number widget** keeps the draft text; datetimes in the viewer's time zone; one form submission
  at a time; render errors contained per cell/widget; sign-out only after the server confirms.

## Boundaries (non-negotiable)

- Dependencies: `@strutvane/framework` (contracts only, at runtime) as a peer. It talks to the
  framework and `@strutvane/auth` over HTTP (manifest, REST, session endpoints), never imports them.
- Designs depend on this package; this package never imports a design except `plain`.
- Public API changes need a changeset, docs and tests. Contract changes need an RFC.

## Conventions

- TypeScript strict, ESM only, Node 24+ (Node 26 LTS is the target). No decorators or reflection.
- Validation uses Standard Schema with Zod 4 as the default. Errors are RFC 9457 problem+json.
- Tooling: npm, tsdown (build), Biome (lint/format), Vitest (tests), Playwright (UI e2e), Testcontainers (DB).
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
