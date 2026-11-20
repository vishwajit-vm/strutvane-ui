# NEXT: ui `fix/demo` (from `main` f802ccb), 2026-11-20

The demo acceptance run's ui items (hub-side report: `strutvane-demo/ACCEPTANCE.md`). Not pushed:
the coordinator pushes.

## Done
- **UI-1 / AUTH-1: one API setting, three URLs** (`src/core/endpoints.ts`, `resolveEndpoints()`):
  the API at `apiUrl` (`/api/v1`), auth at `{apiUrl}/auth/*`, the manifest at the API's ORIGIN
  (`/.well-known/strutvane.json`, never under the API base). Props `authUrl` / `manifestUrl` move
  one of them. A relative `apiUrl` (`api/v1`) is read from the site root, so a deep link never
  prefixes the API with the page path. `createSessionClient({ authUrl })`, `fetchManifest({ url })`.
  Tests: `test/core/endpoints.test.ts` and two `<StrutvaneApp>` cases.
- **UI-2:** `tenancy={false}` never calls `{auth}/tenants` (default `true` keeps today's behaviour;
  the skeleton passes `false` when teams are off). Reading it from the manifest instead would be a
  contract change (an RFC first).
- Docs: README props table, examples on `/api/v1`. Changeset `api-auth-manifest-urls.md` (minor).

## Not done / next
- The test kit (`createReferenceApi` default `basePath: '/api'`, `screens.tsx`) still uses `/api`.
  It is consistent with itself and the designs' conformance runs use it: move both to `/api/v1`
  together with design-crisp and design-vivid in one change.
- UI-3 (built CSS 0 kB under the CSP) belongs to the skeleton's `main.tsx` and the design packages.
- The cross-package e2e test (ACCEPTANCE item 6) is not in this repo yet.

## How to verify
`npm ci`, then `npm run ci` (3x).

# NEXT: ui v2 (`v2/behaviour`), 2026-11-18

## Done (this commit): the framework 0.2 error model
- Peer and dev dependency `@strutvane/framework` `^0.2.0-next.0` / `0.2.0-next.0` (CONSISTENCY #128).
  The one-kernel patch (`release/0.2/patches/ui/0001-…`) was already applied in 5473ccf.
- Every code the UI produces or compares is lowercase `snake_case` (#123): synthetic problems by
  status (401 `unauthenticated`, 403 `forbidden`, 404 `not_found`, 409 `conflict`, 413, 419
  `csrf_token_mismatch`, 422 `validation_failed`, 429 `rate_limited`, 503 `service_unavailable`,
  else `internal_error`), `NETWORK_ERROR_CODE` = `'network_error'`, new `INTERNAL_ERROR_CODE`.
  Catalogue keys are lowercase; `catalogKey` still retries the lowercased code only because the
  framework accepts an app's own uppercase code until 0.3 (drop the retry in 0.3).
- Every issue carries `field` (#69): parsed issues are placed by `path` first, then `field` (#118,
  and the framework's own TSDoc: `path` is the source of truth), and `field` is rebuilt from the
  winning path. Client validation and the reference API send `field` too. New `pathToField()`.
- `test/error-codes.test.ts`: TypeScript-parser scan of `src/` string literals fails on any uppercase
  code (pattern + the framework's `LEGACY_ERROR_CODES`) or uppercase `ui.problem.code.*` key;
  every synthetic code is checked against framework 0.2 `PROBLEM_CODES`.
- Docs: README, `docs/migrating-from-v1.md`, CLAUDE.md; changeset `lowercase-error-codes.md`
  (minor). Hub RFC-0003 amended in the hub repo.

## Done: deterministic search debounces (after a load-induced flake)
- The coordinator's re-run of a9e8751 failed `ResourceList › search goes to the server (debounced)`
  under heavy load: the 300 ms debounce plus rendering outlasted `waitFor`'s 1 s budget. Typing
  slower than the debounce could also split one word into two requests (the old test only checked
  `<= 2`).
- Whole class fixed: every screen test that types into a debounced search (list search, command
  palette, relation picker, the filter-chip test) now runs `useDebouncedValue` on a manual clock
  (`test/debounce-clock.ts`, wired with `vi.mock`). Time moves only on `debounceClock.advance()`.
  The list and picker tests now prove: no request at debounce − 1 ms, then **exactly one** request
  carrying the whole word, and nothing pending afterwards.
- The real hook is proven on fake timers in `test/debounce.test.tsx` (fires once, `delay` ms after
  the last change; unmount cancels), next to a check that the manual clock behaves the same.
- Not changed: tests that sleep briefly and then assert that nothing *more* happened (ResourceList
  callbacks/URL, ResourceForm single submit, StrutvaneApp switch/sign-out). Load can only make them
  pass more easily, never fail, so they are not this flake.

## How it was verified
- Debounce fix: gate 2 of 3 green before a STOP (usage limit); run 3 not done. Re-run `npm run ci` 3× before merging.
- Against framework `main` 6dfc239 (0.2.0-next.0, not on npm): built and `npm pack`ed in a
  scratchpad worktree, then `npm ci` is impossible (see below), so the dependencies came from the
  committed lockfile plus `npm install --no-save --ignore-scripts <tarball>`. `package.json` and
  `package-lock.json` were not changed by it.
- `npm run ci` 3× in a row green (Windows, Node 24.21): 496 tests, coverage
  97.06/92.9/96.42/98.4; `check-code-rules.mjs`, `check-package.mjs` (41 files), publint --strict,
  attw esm-only, `npm audit --omit=dev` 0 (see `RELEASE-READINESS.md` R1, R2, R5). Two earlier
  attempts failed only on Vitest worker-start timeouts while the machine sat at 100% CPU from other
  jobs; nothing changed before the green 3×.

## Next
1. **After `@strutvane/framework` 0.2.0-next.0 is on npm:** `npm install` to add the framework to
   `package-lock.json` (it has no framework entry today, so `npm ci` fails with ETARGET), commit
   the lockfile, then `npm ci && npm run ci`.
2. `changeset version` with the core train (pre mode `next`; this changeset is `minor`), when the
   coordinator versions the train.
3. R3: written threat model and a `security-reviewer` pass. R6: installer e2e.
