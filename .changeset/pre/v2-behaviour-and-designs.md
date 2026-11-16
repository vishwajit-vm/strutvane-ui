---
"@strutvane/ui": minor
---

**v2 (breaking, the 0.2 line): behaviour only, drawn by a design.** Read `docs/migrating-from-v1.md`.

- **The Design contract** (`@strutvane/ui/design`): `defineDesign()` with typed slots (shell, sixteen skins, four illustrations), light and dark colour tokens, sizes, fonts and a chart palette; the public override tokens `--brand-hue`, `--font-sans`, `--radius` and `--density`; `<DesignProvider>` with a `nonce` for the injected stylesheet, a remembered light/dark/system theme and a CSP-hashed pre-paint theme script.
- **The plain design** (`@strutvane/ui/design/plain`): the neutral fallback, passing its own conformance suite.
- **The conformance kit** (`@strutvane/ui/testing`): `designConformance()` checks every slot, WCAG AA contrast for every token pair in both themes and at every brand hue, no hard-coded colours, the override tokens, no overflow at 375 px, and axe on nine reference screens of the real app.
- **Conveniences:** Back with restored list state, breadcrumbs, the command palette, keyboard shortcuts (never while typing), filter chips with Clear all, column and density preferences, undo delete, type-to-confirm for permanent deletes, the unsaved-changes guard, sign in again on a 401 that keeps the draft, toasts.
- **Lists:** numbered pages, 25 rows by default (10/25/50/100), never above the resource's `maxPerPage`; `page[number]` in URLs.
- **Safety:** `X-XSRF-TOKEN` on every write; reads retried on no answer or a 5xx, writes never; 422 issues read `path`, then `field`; a clear `write_cancelled` message; problem codes matched in any case.
- **Manifest:** reads `maxPerPage`, `routeKey` (`/posts/hello-world` URLs), `ui.order` and `ui.badge` when present (RFC-0005, proposed).
- **Packaging:** `@strutvane/framework` is now a required peer (`@strutvane/framework/contracts` replaces `@strutvane/contracts`); Node `>=24.3`; built and published with npm.
- **Removed:** `APP_STYLES` and the `styles` prop; `confirmDelete` (use `deletable`); the cursor list API (`nextPage`, `previousPage`, `hasPrevious`, `ListPageState`).
