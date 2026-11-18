# Release readiness

<!--
  Created once by strutvane-tooling (canonical/RELEASE-READINESS.md). This repo owns this file:
  sync never overwrites it. Gates and rules: hub docs/19-production-readiness.md
  (https://github.com/vishwajit-vm/strutvane/blob/main/docs/19-production-readiness.md).

  A version reaches npm `latest` only when every gate below is "pass" with evidence. One row per
  gate: the status (pass / fail / not checked), a link to the evidence (CI run, report or test
  file; never "trust me"), and the date it was checked (YYYY-MM-DD). The coordinator re-runs the
  checks before a gate is accepted; the project lead approves the staged release.
-->

Package: `@strutvane/ui` · Version: `0.2.0-next.0` (branch `v2/behaviour`) · Last reviewed: 2026-11-18

| Gate | What must be true (summary; docs/19 is the source) | Checked by | Status | Evidence | Date |
|---|---|---|---|---|---|
| R1 Code | Strict TS, ESM, lint clean, no `console.` in `src/`, no TODO/FIXME without an issue, TSDoc on every export | CI `verify` (`npm run ci`, `check-code-rules.mjs`) | pass (local) | `npm run ci` (Biome, `tsc`) and `check-code-rules.mjs` green against framework 0.2.0-next.0 (local tarball of framework `main` 6dfc239); TSDoc on exports; no `any`, no non-null assertions; `test/error-codes.test.ts` fails on any uppercase error-code literal in `src/` (#123). CI `verify` not run yet (branch not pushed) | 2026-11-18 |
| R2 Tests | Green on Node 24 and 26 × Linux, Windows, macOS; coverage ≥ 90/90/85/90; type-level tests; 3 green runs in a row; no unhandled rejections or open handles | CI `verify` matrix and `repeat` job | partial | 3 green gate runs in a row on Windows / Node 24.21 against framework 0.2.0-next.0 (local tarball): 496 tests, coverage 97.06/92.9/96.42/98.4 (statements/branches/functions/lines). Two earlier attempts failed only with Vitest worker-start timeouts while the machine was at 100% CPU from other jobs; the same suite then passed 3× unchanged. The Linux/macOS × Node 26 matrix runs in CI, which needs `npm ci`, blocked (see R5) | 2026-11-18 |
| R3 Security | Threat model; attack-style tests; parsers fuzzed; review with 0 open critical/high; `npm audit --omit=dev` 0 high/critical; secrets scan clean | `security-reviewer` report; CI `security` job | not checked | Done: CSRF header on writes (#17), no colour/CSS injection through tokens or overrides (tested), open-redirect guards on links (tested), `npm audit --omit=dev`: 0. Missing: a written threat model and a `security-reviewer` pass | 2026-11-16 |
| R4 Resilience | Failure scenarios named and tested; fails closed; idempotent retries; soak test with no growth | Resilience suites; `npm run test:soak` | partial | Tested: offline, 5xx and 4xx on every read and write, retries on reads only, idempotent write retries, aborts, blocked/full storage, malformed manifests and problems, 401 mid-session. No soak test (a browser library: no server process) | 2026-11-16 |
| R5 Packaging | publint and attw clean; tarball has no tests, fixtures, secrets or local map paths; exports resolve; `engines.node` ≥ 24.3; one framework copy; LICENSE, README, CHANGELOG; a changeset | CI `package-check` job | partial | `check-package.mjs` (41 files), `publint --strict` (0.3.25) and `attw --profile esm-only` (0.18.5) clean on the packed tarball; `npm audit --omit=dev`: 0; peer `@strutvane/framework` `^0.2.0-next.0` (#128); `engines.node` `>=24.3`; changesets. Blocked: `package-lock.json` has no `@strutvane/framework` entry until `0.2.0-next.0` is on npm, so `npm ci` fails (ETARGET); then run `npm install` and commit the lockfile | 2026-11-18 |
| R6 Integration | Installs alone and with every package, in any order, identically; re-install is a no-op; complete `.env.example`; boot fails closed; only the six connections; Northwind Ops green | Hub nightly ecosystem job; installer e2e | not checked | Needs the published framework 0.1.0-next.1 and the installer e2e | 2026-11-16 |
| R7 Docs | Every public feature documented with tested examples; upgrade guide; packages data, what's-new, versioning table and deprecations updated in the same change | Docs site tests | partial | README, `docs/design-contract.md`, `docs/migrating-from-v1.md`, RFC-0005 draft. The docs-site pages and packages data are not updated yet | 2026-11-16 |
| R8 Release | Version per ADR-0020; staged by CI with provenance, approved with 2FA (ADR-0018); right dist-tag; release notes; rollback plan; `versions.json` updated | Release workflow; owner approval | not checked | Version `0.2.0-next.0` (minor changeset, CONSISTENCY #128); release through the workflow after merge | 2026-11-16 |
| R9 Operations | Logs only through the framework Logger with redaction (ADR-0022); health and readiness checks; no debug tool reachable in production | Tests; `security:check` | n/a | A browser library: no logging, health checks or debug tools of its own | 2026-11-16 |
