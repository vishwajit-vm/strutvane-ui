<!--
  Managed by strutvane-tooling (canonical/.claude/ECOSYSTEM.md). Do not edit in other repos:
  change it in strutvane-tooling and run `npm run sync` there. Every Strutvane repo
  imports this file from its CLAUDE.md, so it is the shared memory of the whole ecosystem.
-->

# Strutvane: ecosystem memory (shared by every repo)

> You are in one repository of the **Strutvane** ecosystem. This file is identical in every repo. It tells you how the whole ecosystem fits together, so you can contribute here even if you cloned only this one repo. Repo-specific memory is in this repo's `CLAUDE.md`. Last updated 2026-11-15.

## 1. What Strutvane is

An MIT-licensed **TypeScript framework and package ecosystem for enterprise B2B apps**: Laravel's flow, built natively for TypeScript (v2 redesign, hub `docs/18-v2-blueprint.md`).

**The promise:**

```text
npm create strutvane@latest my-app      # asks questions, installs, migrates, seeds
npm run dev                             # API + UI on one port
node strut make:migration create_posts_table --seeder
node strut migrate                      # migrations → types, CRUD API, UI pages, sidebar entry
```

Every generated line is owned, overridable code.

**Brand:** npm scope `@strutvane`. The project CLI is **`node strut <command>`** (`strut.js` in the app root, our `php artisan`; `npx strutvane` also works). It replaces v1's `sv` script (`sv` is also a built-in PowerShell alias). Starter: `npm create strutvane`. Trademark clearance is pending: never claim the name is legally cleared.

## 2. Repository map (Laravel-style; GitHub org `vishwajit-vm`)

| Repo | Publishes | Role (Laravel equivalent) |
|---|---|---|
| [strutvane](https://github.com/vishwajit-vm/strutvane) | — | **Hub:** blueprint, decisions (ADRs), RFCs, roadmap, spikes. **Source of truth.** |
| [strutvane-framework](https://github.com/vishwajit-vm/strutvane-framework) | `@strutvane/framework` (bins `strutvane`, `strutvane-cli`) | `laravel/framework`. One package that **absorbs** contracts, core, cli and devkit as subpaths (`@strutvane/framework/contracts`, `/core`, `/devkit`, `/console`), plus routing, ORM, migrations, CRUD API, storage, authorization (policies → SQL), tenancy (RLS) and, per ADR-0022, logging |
| strutvane-skeleton *(new, not created yet)* | — | `laravel/laravel`: the app template the installer uses |
| [create-strutvane](https://github.com/vishwajit-vm/create-strutvane) | `create-strutvane` | `laravel/installer` |
| [strutvane-docs](https://github.com/vishwajit-vm/strutvane-docs) | — | `laravel/docs`: the public docs site, one build per version line |
| [strutvane-auth](https://github.com/vishwajit-vm/strutvane-auth) | `@strutvane/auth` | Fortify + Sanctum: sign-in features, tokens, 2FA, passkeys, teams |
| [strutvane-ui](https://github.com/vishwajit-vm/strutvane-ui) | `@strutvane/ui` | Filament/Nova: React admin, auto CRUD screens, sidebar. Behaviour only, no look of its own |
| strutvane-design-crisp, strutvane-design-vivid *(new, not created yet)* | `@strutvane/design-crisp` (default), `@strutvane/design-vivid` | The look of the UI: tokens, fonts, shell, skins (blueprint §5.1) |
| [strutvane-logs](https://github.com/vishwajit-vm/strutvane-logs) → **strutvane-log-viewer** *(rename pending)* | `@strutvane/logs` → `@strutvane/log-viewer` | The log viewer UI. Its logging pipeline moves into the framework (ADR-0022) |
| strutvane-files and later add-ons | `@strutvane/<name>` | Horizon, Telescope, Cashier, Scout…: one repo per add-on (catalogue: hub `docs/research/2026-11-14-package-checklist.md`) |
| [strutvane-tooling](https://github.com/vishwajit-vm/strutvane-tooling) | — | Canonical configs, CI/release workflows, config sync with a drift check (this file comes from here) |

**Being archived** (read-only, never deleted) once the framework consolidation is merged: `strutvane-contracts`, `strutvane-core`, `strutvane-cli`, `strutvane-devkit`. Their npm names get `npm deprecate` with a pointer to `@strutvane/framework/<part>` after the framework is published.

**Local layout:** the hub folder holds every other repo under `packages/<name>/` (`node scripts/setup-workspace.mjs` in the hub). To change several repos at once, link them through a **local-only, never-committed npm workspaces root** in the hub, like Laravel's composer path repositories (hub `docs/research/2026-11-14-monorepo-dryrun.md` §5.1). Hub paths such as `../../docs/...` only exist in that layout; otherwise use the online links below.

## 3. Where the truth lives (read before designing anything)

| Topic | Hub path | Online |
|---|---|---|
| Canonical decisions D1–D24 | `docs/00-executive-summary.md` | [link](https://github.com/vishwajit-vm/strutvane/blob/main/docs/00-executive-summary.md) |
| The v2 blueprint (Laravel's flow, repo layout, phases) | `docs/18-v2-blueprint.md` | [link](https://github.com/vishwajit-vm/strutvane/blob/main/docs/18-v2-blueprint.md) |
| Developer experience contract | `docs/05-developer-experience.md` | [link](https://github.com/vishwajit-vm/strutvane/blob/main/docs/05-developer-experience.md) |
| How packages connect (the only allowed connections) | `docs/17-integration-map.md` | [link](https://github.com/vishwajit-vm/strutvane/blob/main/docs/17-integration-map.md) |
| Architecture decision records | `docs/adr/` | [link](https://github.com/vishwajit-vm/strutvane/tree/main/docs/adr) |
| RFCs (public API / contract changes) | `docs/rfcs/` | [link](https://github.com/vishwajit-vm/strutvane/tree/main/docs/rfcs) |
| **Production readiness gates R1–R9 (binding)** | `docs/19-production-readiness.md` | [link](https://github.com/vishwajit-vm/strutvane/blob/main/docs/19-production-readiness.md) |
| Roadmap and current phase | `docs/14-roadmap.md`, `docs/18-v2-blueprint.md` §10 | [link](https://github.com/vishwajit-vm/strutvane/blob/main/docs/14-roadmap.md) |
| Security model | `docs/12-security-model.md` | [link](https://github.com/vishwajit-vm/strutvane/blob/main/docs/12-security-model.md) |

**Precedence:** the executive summary (D1–D24) and accepted ADRs win over everything, including this file and any repo's own docs. The v2 blueprint is being recorded as ADRs; until a v2 ADR supersedes an older decision (for example D17/ADR-0002 "one repo per package" or D24 "`@strutvane/logs`"), the two can disagree. If you find a conflict, report it. Don't silently pick one.

## 4. Architecture rules (non-negotiable)

1. **Dependency direction.**
   - Inside the framework: `contracts` imports nothing of ours; `core` and `devkit` import only `contracts`; `console` may use `contracts`, `core` and `devkit`; the framework's own modules use `contracts` and `core`. Parts import each other by relative path, never through the package name.
   - **Add-ons** (auth, ui, designs, log-viewer, files, …) depend only on the **published** `@strutvane/framework`, as a **peer + dev** dependency, so an app has exactly one copy (container tokens and `instanceof` rely on that). They import it through its subpaths. **Add-ons never import each other.** How design packages attach to `@strutvane/ui` is not settled yet *(unverified)*.
2. **The only allowed connections** between packages are the six in the integration map: contracts (types, from `@strutvane/framework/contracts`), container tokens, hooks, domain events, installer `enhances`, and HTTP + manifest. A new connection is added to the map in the same PR.
3. **Every package works alone and installs itself completely** (config, `.env` + `.env.example`, migrations, routes, screens) with `node strut install:<name>`, declared in its package.json `strutvane` block, never by hard-coded package names (blueprint §3.3). Install order never changes the result.
4. **Logging lives in the framework** (ADR-0022): Laravel-style channels from `.env` (`LOG_CHANNEL`, `LOG_STACK`, `LOG_LEVEL`, …), files in `storage/logs/`, `Log.channel()`, `Log.withContext()`. Redaction is always on. Package code logs only through the framework's logger, never `console.*` (CI fails on `console.` in `src/`; a file that must print, like a CLI entry point, is listed by exact path in package.json `strutvane.allowConsole`), and never logs secrets or request bodies by default. The UI is the separate `@strutvane/log-viewer`.
5. **One error model:** RFC 9457 `Problem` with a stable `code` and structured `issues`. Messages come from catalogs, never hard-coded (RFC-0003).
6. **Security by default:**
   - deny-by-default authorization
   - tenancy enforced by Postgres RLS under the five rules of ADR-0007
   - two-valued NULL-safe policy semantics (ADR-0008)
   - secrets never in code, logs or `.env.example`
   - supply chain: npm installs only from the registry, install scripts only from an allowlist (§6)

## 5. Engineering standards (apply to every line)

- **Think before code.** Read the spec, the ADRs and the integration map first. If a public API or contract changes, write or extend an RFC *before* implementing.
- **TypeScript strict, ESM only, Node 24+ (target Node 26 LTS).** No `any`, no non-null assertions, no decorators or reflection. Strictness comes from the synced `tsconfig.base.json`.
- **Small, single-purpose, reusable modules.** One concept per file, no duplicated logic, and shared behaviour extracted to the right framework layer (`contracts`, `core`, `devkit`).
- **Explain the *why*.** TSDoc on every public API (what, why, an example), plus comments wherever a decision isn't obvious. Error messages say how to fix the problem.
- **Handle failure deliberately:**
  - name the failure scenarios
  - fail closed
  - always clean up (connections, temp files)
  - make every retry idempotent
- **Tests are part of the change.** Every behaviour has unit tests. Data logic is tested against real engines (no mocks for SQL). Public types get type-level tests that prove misuse fails to compile. Coverage thresholds: 90/90/85/90.
- **Security is tested continuously (VAPT).**
  - Write a threat model before code, and attack-style tests for your package's surface (tenancy, injection, uploads, sessions, enumeration, rate limits).
  - Fuzz every parser.
  - Every security fix ships with a regression test for the whole class.
  - See the hub `docs/13-testing-strategy.md` §14.
- **Never edit synced files** (`tsconfig.base.json`, `biome.base.json`, `vitest.shared.ts`, `vitest.perf.config.ts`, `.npmrc`, `.gitignore`, `.github/workflows/*`, `.github/scripts/*`, `.github/dependabot.yml`, `.gitattributes`, `.editorconfig`, `.claude/ECOSYSTEM.md`, shared agents/skills). Change them in strutvane-tooling.

## 6. Workflow

- **npm only.** Never pnpm, yarn or corepack. Package scripts call tools directly (`biome`, `tsc`, `vitest`, `tsdown`), never `npm run x` inside another script.
  - Needs **npm ≥ 11.19**: each repo's package.json pins it with `devEngines.packageManager` (`onFail: error`), because an older npm silently ignores the `.npmrc` guards.
  - The synced `.npmrc` sets `strict-allow-scripts`, `min-release-age=1` (our own `@strutvane/*` exempt), `allow-git=none` and `engine-strict`. Approve a dependency's install script with `npm approve-scripts <pkg>`, which records a pinned entry in package.json `allowScripts`.
  - Commit `package-lock.json`. CI rejects lockfile entries that are not resolved from the npm registry.
- **Branches:** every repo uses `main`. Short-lived feature branches are fine, but they must be merged back into `main` once tests pass. Never leave work stranded on a side branch. `main` is protected against force-push and deletion. (Proposed ADR-0020 adds permanent `0.N.x` line branches; not in force until accepted.)
- **Before committing:** `npm ci`, then the repo's quality gate `npm run ci` (lint → typecheck → tests + coverage → build). It must pass. A TODO or FIXME must name an issue (`TODO(#12)` or an issues URL), or CI fails.
- **Production readiness (hub `docs/19`, binding):** a version reaches npm `latest` only when gates R1–R9 all pass with evidence. The synced CI enforces the machine-checkable parts (matrix with `--unhandled-rejections=strict`, tests 3× in a row, `npm audit --omit=dev --audit-level=high`, a TruffleHog secrets scan, tarball contents, publint, attw), and `release.yml` stages nothing unless all of CI is green. Each repo records status, evidence link and date per gate in its own `RELEASE-READINESS.md` (created once by sync, then owned by the repo). Nobody marks a gate passed on an agent's word alone.
- **Changesets:** any change to a published package adds one (`npx changeset`).
- **Commits:** conventional commits (`feat:`, `fix:`, `docs:`, `chore:` …). Sign off with `git commit -s` (DCO).
- **Cross-repo dependencies:** committed code depends only on **published** versions; `link:`, `file:` and `workspace:` specs are refused by CI. CI never sees a sibling checkout.
- **Releases:** one package per repo, versioned on `main` with Changesets. CI **stages** each new version through npm trusted publishing (OIDC, provenance, no tokens), and a maintainer approves it on npmjs.com with 2FA (ADR-0016, ADR-0018). A 409 "version exists" is a skip only when the tarball matches CI's build. The release workflow only runs once the repo variable `RELEASE_ENABLED=true` is set. Blueprint §8 / proposed ADR-0020 move pre-1.0 releases to plain `0.x` on `latest` once accepted.
- **Docker:** Strutvane's own repos **never commit Docker files** (ADR-0006). Generated apps keep the local `docker/compose.yaml` git-ignored by default, and **may commit** a secure production `Dockerfile` + `.dockerignore` and a `.devcontainer/`, only when the developer opts in (ADR-0021).

## 7. Current status (2026-11-15)

**v2 redesign: Laravel's flow, in TypeScript** (hub `docs/18-v2-blueprint.md`). v1's Phase 0 (foundations, spikes 01–09, Gate 0 on 2026-11-14) is complete; the v2 phases below replace v1's Phase 1.
- **Phase 0, consolidate: done on a branch.** contracts, core, devkit and cli are folded into `strutvane-framework` on branch `v2/consolidate`, with full history and npm; 1,288 tests pass + 14 skipped (the sum of the five old suites). **Not merged, not pushed.** It waits for the owner's review and for strutvane-tooling's npm CI (branch `v2/npm`). Still open: folding the logs pipeline into the framework (ADR-0022; the consolidation kept `@strutvane/logs` separate) and the ADR that supersedes ADR-0002/D17.
- **Next: Phase 1, the full flow (0.2.0):** framework core (MVC, routing, validation, error page), ORM, migration-first schema, `node strut migrate` → API + UI + sidebar, auth, minimal mail, ui + design-crisp + design-vivid, the one-command installer, the package catalogue, log-viewer, versioned docs; Northwind Ops rebuilt as the acceptance test. v2 design evidence lives in hub spikes 10–20.
- **Moving to npm repo by repo:** framework (on its branch) and tooling (on its branch) are converted; auth, ui, logs, files, create-strutvane and docs still use pnpm until their own migration PR.
- **npm:** publishing is paused until 2026-11-17 08:35 UTC, and nothing is published until Phase 1 passes its acceptance test. `@strutvane/{framework,auth,ui,logs,contracts,core,cli,devkit}`, `strutvane` and `create-strutvane` hold placeholder or `0.1.0-next.0` versions *(unverified per name)*.
- **Carried over:** domains, trademark clearance, social handles (owner).

## 8. Contributor quick start (human or AI)

1. Read this file, then this repo's `CLAUDE.md` and `README.md`.
2. Find the spec for what you're touching (§3) and the decisions behind it.
3. Run `npm ci` and then `npm run ci` to confirm a green baseline (npm ≥ 11.19).
4. Make the change with its tests and docs. Run the `strutvane-ecosystem-guardian` agent on your diff.
5. Run the gate again, add a changeset if needed (`npx changeset`), commit, and open a PR (or push to `main` if you're a maintainer).
