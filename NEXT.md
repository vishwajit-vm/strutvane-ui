# NEXT: ui v2 (`v2/behaviour`), paused 2026-11-16

## Done (committed)
- 5473ccf: tooling sync, npm move, `@strutvane/framework` required peer `^0.1.0-next.1`, engines `>=24.3`, imports from `@strutvane/framework/contracts`. The lockfile has NO framework entry (not on npm yet). Run `npm install` once 0.1.0-next.1 is published. Locally a dev link was copied into `node_modules/@strutvane/framework` (contracts compiled from framework `v2/fix-pass`).
- 0b27131: Design contract (`src/design`: defineDesign, tokens, slots, DesignProvider with nonce, THEME_SCRIPT and hash, stylesheet generator), plain design (`src/design/plain`, passes designConformance 14/14), conformance kit (`src/testing`), and behaviour on slots: numbered pages (25), maxPerPage, chips, column and density prefs, undo delete, type-to-confirm, unsaved guard, Back and breadcrumbs, palette, shortcuts, 401 sign-in-again dialog, XSRF, #118, #103, #50, #55, read retries.
- fba3ba6: v1 suites moved to v2. Full suite green: 357 tests, tsc and biome clean.

## In progress (this WIP commit)
- New tests: `test/core/v2-core.test.ts`, `test/core/http-v2.test.ts`, `test/design/contract.test.tsx` (80/81 pass).
  - Fix 1: `parseColor('oklch(0.5 0.1 200 / 1 / 2)')` should be refused (split on '/' > 2 parts).
  - Fix 2: tsc error at http-v2.test.ts:84 (`sleep.mock.calls` tuple typing; type the `vi.fn`).

## Next
1. Tests: the conformance kit catches each broken rule (slot, contrast, hue sweep, hard-coded colour, overrides, injected overrides, overflow css and DOM, axe), reference API endpoints, React conveniences (palette, shortcuts, Back/Alt+←, guard incl. browser Back, chips, columns/density, XSRF from the app, mobile nav, theme select), and type-level tests for defineDesign misuse (`test/design-types.test-d.ts`).
2. Coverage to 90/90/85/90 (it was 87.6/82.1/87.0/89.9 before the new tests).
3. Docs: README, `docs/design-contract.md`, migration note v1→v2, CLAUDE.md; a `major` changeset; then `npx changeset version` (pre mode `next`) and report the version (major on 0.1.0-next.0 gives 1.0.0-next.0: conflicts with blueprint §8's 0.N line, needs a decision).
4. Gate 3x, check-code-rules, check-package, publint --strict, attw.
5. Open decisions for the report: framework contract must add maxPerPage, routeKey, ui.order, ui.badge (RFC); framework codes still SCREAMING_CASE (#68); Crisp `--input` fails 3:1 on surface and its accent is hex (must follow `--brand-hue`).
