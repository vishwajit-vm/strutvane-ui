# Building a design for Strutvane

`@strutvane/ui` decides **what the admin does**: data, routing, forms, tables, filters, the
command palette, shortcuts, every convenience, focus and ARIA. It has no look of its own. A
**design** decides **how it looks**: colours for light and dark, fonts, sizes, the shell, the
component skins, the chart palette and the illustrations.

First-party designs are `@strutvane/design-crisp` (the default) and `@strutvane/design-vivid`.
Community designs are named `strutvane-design-<name>`. Every design, first-party or not, is built
with `defineDesign()` and must pass `designConformance()` before the installer lists it.

The smallest complete example is the plain design in this repo:
[`src/design/plain/`](../src/design/plain/) (tokens, components, stylesheet, `index.ts`).

## 1. The package

```text
strutvane-design-acme/
  src/tokens.ts        every colour literal lives here, and only here
  src/components.tsx   the slots
  src/styles.ts        the stylesheet (a string; colours only through var(--sv-*))
  src/index.ts         export const acme = defineDesign({ … })
  test/conformance.test.ts
  DESIGN.md            your mood, palette and rules (the human-readable spec)
```

Peer dependencies: `@strutvane/ui` and `react`. Dev dependencies for the kit: `vitest`, `jsdom`
and `axe-core`.

## 2. `defineDesign()`

```ts
import { defineDesign } from '@strutvane/ui/design'

export const acme = defineDesign({
  name: 'acme',                      // lowercase id; also the CSS hook [data-sv-design="acme"]
  description: 'One sentence for the installer.',
  tokens: { light, dark },           // ThemeTokens for each theme (§3)
  scale,                             // ScaleTokens (§4)
  defaults: { brandHue: 264, radius: '6px', density: 1 },  // the public tokens' defaults (§5)
  fonts: { sans: "'Acme Sans', system-ui, sans-serif", mono: 'ui-monospace, monospace', faces },
  shell: { Shell, Sidebar, TopBar, AuthLayout, PageHeader },          // §6
  skins: { Button, Input, Textarea, Select, Checkbox, Field, Card, Badge, Alert,
           Table, Dialog, Popover, Toast, Chip, Skeleton, Icon },     // §6
  chartPalette: { light: [c1, c2, c3, c4], dark: [c1, c2, c3, c4] },  // ≥ 4 each; c1 leads
  illustrations: { Empty, NotFound, Forbidden, Error },               // decorative pictures
  stylesheet,                        // your CSS (§7)
})
```

TypeScript checks the whole shape: a missing slot, a token that isn't a colour, or a slot with
the wrong props fails to compile. At runtime `defineDesign` checks it again and throws a
`DesignError` listing every problem (a missing slot, an unreadable colour, a value containing
`;`, `{`, `}`, `<`, `\` or a comment, a `<style>` tag in the stylesheet), because a design can also
come from plain JavaScript.

## 3. Colour tokens

Every role below is required, in `tokens.light.color` and `tokens.dark.color`. Values are
`#hex` (3, 4, 6 or 8 digits), `rgb()`/`rgba()`, or `oklch()`. In `oklch()` the hue may be
`var(--brand-hue)` or `calc(var(--brand-hue) + N)`: that is how the accent follows the app's brand.
Other `var()` references and other colour functions are refused, because the kit must compute the
contrast exactly.

| Role | CSS property | Used for |
|---|---|---|
| `bg` | `--sv-bg` | the page canvas |
| `surface` | `--sv-surface` | cards, tables, inputs, dialogs |
| `surfaceSubtle` | `--sv-surface-subtle` | table header, hover |
| `surfaceMuted` | `--sv-surface-muted` | skeletons, pressed |
| `fg` | `--sv-fg` | text |
| `fgMuted` | `--sv-fg-muted` | labels, help, meta |
| `border` | `--sv-border` | hairlines (decorative) |
| `input` | `--sv-input` | control boundaries (must reach 3:1, WCAG 1.4.11) |
| `accent`, `accentHover`, `accentFg` | `--sv-accent`, … | primary buttons and their text |
| `accentSubtle`, `accentText` | | selected rows, the current page, links |
| `ring` | `--sv-ring` | the focus outline |
| `danger`, `dangerHover`, `dangerFg`, `dangerSubtle`, `dangerText` | | destructive buttons, errors |
| `success`, `successSubtle`, `successText` | | positive status |
| `warning`, `warningSubtle`, `warningText` | | warnings |
| `overlay` | `--sv-overlay` | the modal scrim (may be translucent) |
| `mark`, `markFg` | | search highlights |

Each theme also has `shadow: { sm, pop }` (`--sv-shadow-sm`, `--sv-shadow-pop`).

**Contrast pairs** (checked in both themes; at every `--brand-hue` from 0° to 345° in 15° steps when
your colours follow it): 4.5:1 for `fg` on `bg`, `surface`, `surfaceSubtle`, `surfaceMuted`,
`accentSubtle`; `fgMuted` on `bg`, `surface`, `surfaceSubtle`; `accentFg` on `accent` and
`accentHover`; `accentText` on `surface`, `bg`, `accentSubtle`; `dangerFg` on `danger` and
`dangerHover`; `dangerText`, `successText`, `warningText` on `surface` and on their subtle fills;
`markFg` on `mark`. 3:1 for `ring` on `surface` and `bg`, `input` on `surface`, `accent` on
`surface`, and chart series 1 on `surface`. The full list is `CONTRAST_PAIRS`.

## 4. Size tokens (`scale`)

| Token | CSS property | Must follow |
|---|---|---|
| `radiusSm`, `radiusMd`, `radiusLg` | `--sv-radius-sm`, … | `var(--radius)` |
| `controlHeight`, `rowHeight` | `--sv-control-height`, `--sv-row-height` | `var(--density)` |
| `space` | `--sv-space` | (your 4 px-style unit) |
| `sidebarWidth` | `--sv-sidebar-width` | |
| `fontSizeSm`, `fontSize`, `fontSizeLg` | `--sv-font-size-sm`, … | |

Values are `Npx`, `Nrem`, `calc(…)` or `var(…)`. The behaviour's compact-rows toggle multiplies
`--sv-control-height` and `--sv-row-height` by 0.8 on that list only; you don't do anything for it.

Fonts become `--sv-font-sans` (always `var(--font-sans)`, defaulting to `fonts.sans`) and
`--sv-font-mono`. Put `@font-face` rules in `fonts.faces`, or import `@fontsource` files from your
package entry.

## 5. The public override tokens (decision #31)

Apps brand ANY design with four CSS custom properties, in their own `resources/ui/theme.css`
(`:root { --brand-hue: 150 }`) or through `<DesignProvider overrides={{ brandHue: 150 }}>`:

| Token | Type | Your design maps it onto |
|---|---|---|
| `--brand-hue` | degrees, 0–360 | the accent family (`oklch(L C var(--brand-hue))`) |
| `--font-sans` | a font stack | done for you: `--sv-font-sans` |
| `--radius` | a length | your radii (`calc(var(--radius) * 0.5)`, …) |
| `--density` | 0.5–2 | your control and row heights (`calc(32px * var(--density))`) |

Your `defaults` set their values at zero specificity (`:where(:root)`), so the app always wins.
The kit checks that each one really changes your rendered tokens AND that your stylesheet uses
them (a token nothing reads changes nothing on screen).

## 6. The slots

Every slot is a function component. Its props are typed in `@strutvane/ui/design` (`ShellProps`,
`ButtonProps`, …). The behaviour hands over ready-made pieces; your job is to place them:

- **spread the prop bags** you get (`panelProps`, `overlayProps`, `regionProps`, `tableProps`, and
  the rest props of `Button`, `Input`, `Select`, `Textarea`, `Checkbox`, `Alert`, `Card`), so ids,
  roles, refs, `aria-*` and handlers arrive;
- **place the ids** you are given (`titleId` on the `<h1>`, `helpId` and `errorId` on the field
  messages, `<label htmlFor={htmlFor}>`);
- **never** fetch, keep app state, or read the manifest.

| Slot | Gets | Renders |
|---|---|---|
| `Shell` | `skipLink`, `sidebar`, `topBar`, `main`, `navOpen`, `onCloseNav` | the frame; skip link first; sidebar as a drawer on narrow screens while `navOpen` (scrim click → `onCloseNav`) |
| `Sidebar` | `label`, `brand`, `groups[{ label, links[{ entry, current, accessibleName }] }]`, `Link`, `Icon` | `<nav aria-label={label}>`; every link through `Link` (it sets `aria-current`); a badge's text inside `accessibleName` |
| `TopBar` | `menuButton`, `search`, `actions` | a header row; show `menuButton` only on narrow screens |
| `AuthLayout` | `appName`, `children` | the signed-out frame (a centred card) |
| `PageHeader` | `title`, `titleId`, `breadcrumbs`, `back`, `actions`, `meta` | `<h1 id={titleId}>`, breadcrumbs above, back and actions on the title row |
| `Button` | `variant` (`primary`, `secondary`, `ghost`, `danger`), `size` (`sm`, `md`), `icon`, rest | a `<button>`, `type="button"` by default |
| `Input`, `Textarea`, `Select`, `Checkbox` | native attributes | the native control |
| `Field` | `label`, `htmlFor`, `required`, `help`/`helpId`, `error`/`errorId`, `children` | label, control, help, error |
| `Card` | `heading`, rest | a surface |
| `Badge` | `tone`, `children` | a status label (the text says the status; colour is extra) |
| `Alert` | `tone`, rest (`role`, `tabIndex`, `ref`) | a message block |
| `Table` | `regionProps`, `tableProps`, `density`, `children` | a scroll box (`regionProps`) around `<table {...tableProps}>` |
| `Dialog` | `overlayProps`, `panelProps`, `title`/`titleId`, `description`/`descriptionId`, `children`, `footer`, `size` | scrim, panel, title, description, body, footer (primary last). Focus, Tab trapping and Escape are handled for you |
| `Popover` | `panelProps`, `children` | a floating panel (anchor: `[data-sv-part="menu-anchor"]`) |
| `Toast` | `tone`, `children`, `action`, `dismiss` | one toast (the live region is the behaviour's) |
| `Chip` | `children`, `remove` | an active filter with its remove button |
| `Skeleton` | `lines` | decorative loading lines |
| `Icon` | `name` (Tabler names), `size` | a decorative SVG with `aria-hidden`, or nothing |
| `Empty`, `NotFound`, `Forbidden`, `Error` | `className` | decorative pictures, token colours only |

## 7. The stylesheet

`stylesheet` is CSS text. `<DesignProvider>` injects it after the generated token rules, inside
one `<style nonce>`. Scope your rules to `[data-sv-design="<name>"]` or to your own class prefix.
Colours only through `var(--sv-…)`, `currentColor` or `transparent`.

Besides your slots' own classes, style these hooks the behaviour renders:

| Hook | What |
|---|---|
| `[data-sv-part="root"]` | the provider root (also carries `data-sv-design` and `data-sv-theme`) |
| `skip-link` | the skip link (hidden until focused) |
| `breadcrumbs`, `back` | page heading parts |
| `list`, `toolbar`, `filters`, `chips`, `chip-list`, `pagination`, `empty` | list page parts (`pagination [aria-current="page"]` is the current page) |
| `detail`, `details`, `related` | record page (`details` is a `<dl>`) |
| `form`, `form-actions`, `form-error`, `sign-in` | forms |
| `palette-list`, `palette-group`, `palette-hint`, `shortcuts` | the command palette (`[role="option"][aria-selected="true"]` is the highlight) and the shortcuts list |
| `menu-button`, `menu-anchor`, `toasts`, `home`, `loading` | the rest |
| `[data-sv-density="compact"]` | a compact table (sizes recompute themselves) |
| `mark`, `kbd`, `main` | highlights, key hints, the main area |

**The overflow rule:** the page must never scroll sideways, at 375 px or at 1440 px. Give the main
column `min-width: 0`, make the `Table` scroll box `overflow-x: auto` **and** positioned
(`position: relative`; visually hidden text inside an unpositioned scroll box widens the page),
and use no fixed width or min-width above 375 px outside `min()`/`clamp()`.

## 8. CSP

- With a strict CSP, pass the request's nonce: `<DesignProvider nonce={nonce}>` (decision #119).
- Or set `injectStyles={false}` and serve `designStylesheet(design, { overrides })` as a file.
- The optional pre-paint theme script `THEME_SCRIPT` (it sets `data-sv-theme` before React loads,
  so dark mode never flashes white) is static: allow it with `THEME_SCRIPT_HASH` in `script-src`.

## 9. Conformance

```ts
// test/conformance.test.ts
// @vitest-environment jsdom
import { designConformance } from '@strutvane/ui/testing'
import { acme } from '../src/index.ts'

designConformance(acme, { sources: ['src'], tokenFiles: ['src/tokens.ts'] })
```

It registers one test per rule:

1. every slot is present, every token well-formed;
2. every contrast pair meets WCAG AA in light and dark (at every brand hue, when it applies);
3. no hard-coded colours outside `tokenFiles` (the stylesheet, `fonts.faces` and every file under
   `sources`; a source path that doesn't exist fails, so a typo can't switch the check off);
4. each public override token changes the result, and the provider injects the overrides;
5. no fixed width wider than 375 px in the stylesheet;
6. axe finds 0 violations, and the DOM overflow rules hold, on every reference screen: sign-in, a
   list, an empty list, the delete confirmation, a form with errors, a record, a record with a
   related list, the command palette and the shortcuts help. The screens run the real
   `<StrutvaneApp>` on an in-memory reference API (`createReferenceApi()`).

Every check is also exported on its own (`checkContrast`, `checkOverrides`, …) and returns a list
of problems, so you can call one while you work.

**What jsdom can't check, check in a browser** before a release (Chrome or Edge, both themes):

1. Run a reference app with your design (`npm create strutvane@latest` and `node strut design:use
   <name>`, or a Vite page rendering `<StrutvaneApp>` with `createReferenceApi().fetch`).
2. Open DevTools, toggle the device toolbar, choose 375 × 812.
3. Visit `/`, `/posts`, `/posts?search=zzz`, `/posts/new` (press Create to show errors),
   `/posts/launch-notes-1`, `/authors/1`, and open the palette (Ctrl+K) and the menu drawer.
4. On each, run `document.documentElement.scrollWidth <= innerWidth` in the console: it must be
   `true`. Wide tables scroll inside their box.
5. Run Lighthouse (or the axe extension) for contrast on each screen, in light and dark.
