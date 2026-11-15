/**
 * The app shell's default look: a small stylesheet over CSS custom properties, so a theme (the
 * generated `web/theme/tokens.css`) can restyle everything by setting `--sv-*` variables. Injected
 * by `<StrutvaneApp>` unless `styles={false}`. Every selector is wrapped in `:where()`, so it has
 * zero specificity: any app rule (`button { … }`, `.page h1 { … }`) wins without `!important`.
 * Layout only uses flexbox and grid; the main area scrolls a wide table sideways itself (at every
 * width), so it never pushes the whole page, header and menu included, off screen; colours meet
 * WCAG AA contrast on the defaults, and focus is always visible.
 *
 * @module
 */
export const APP_STYLES: string = `
:where(:root) {
  --sv-bg: #f7f8fa; --sv-surface: #ffffff; --sv-text: #1d2433; --sv-muted: #5b6475;
  --sv-border: #d9dde5; --sv-accent: #1f5fbf; --sv-accent-text: #ffffff; --sv-danger: #b42318;
  --sv-radius: 6px; --sv-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
:where(:root) { --sv-bg: #12151b; --sv-surface: #1b2029; --sv-text: #e6e9ef; --sv-muted: #a3acbd;
    --sv-border: #313847; --sv-accent: #6ea8ff; --sv-accent-text: #0b1220; --sv-danger: #ff8a7a; }
}
:where(body) { margin: 0; background: var(--sv-bg); color: var(--sv-text); font: 15px/1.5 var(--sv-font); }
:where(a) { color: var(--sv-accent); }
:where(:focus-visible) { outline: 3px solid var(--sv-accent); outline-offset: 2px; }
:where(button), :where(input), :where(select), :where(textarea) { font: inherit; color: inherit; }
:where(button) { background: var(--sv-surface); border: 1px solid var(--sv-border); border-radius: var(--sv-radius);
  padding: 4px 12px; cursor: pointer; margin: 2px; }
:where(button[type="submit"]) { background: var(--sv-accent); color: var(--sv-accent-text); border-color: var(--sv-accent); }
:where(button:disabled) { opacity: .6; cursor: not-allowed; }
:where(.sv-danger) { color: var(--sv-danger); }
:where(input), :where(select), :where(textarea) { background: var(--sv-surface); border: 1px solid var(--sv-border);
  border-radius: var(--sv-radius); padding: 6px 8px; margin: 2px 0 10px; max-width: 100%; }
:where(.sv-skip) { position: absolute; left: -999px; }
:where(.sv-skip:focus) { left: 8px; top: 8px; background: var(--sv-surface); padding: 6px; z-index: 10; }
:where(.sv-app-header) { display: flex; align-items: center; gap: 16px; padding: 10px 20px;
  background: var(--sv-surface); border-bottom: 1px solid var(--sv-border); }
:where(.sv-brand) { font-weight: 700; font-size: 17px; text-decoration: none; color: var(--sv-text); margin-right: auto; }
:where(.sv-workspace) { display: flex; align-items: center; gap: 8px; }
:where(.sv-workspace select) { margin: 0; }
:where(.sv-app-body) { display: grid; grid-template-columns: 220px 1fr; min-height: calc(100vh - 56px); }
:where(.sv-app-nav) { background: var(--sv-surface); border-right: 1px solid var(--sv-border); padding: 12px; }
:where(.sv-app-nav ul) { list-style: none; margin: 0 0 12px; padding: 0; }
:where(.sv-app-nav a) { display: block; padding: 5px 8px; border-radius: var(--sv-radius); text-decoration: none; color: var(--sv-text); }
:where(.sv-app-nav a[aria-current="page"]) { background: var(--sv-bg); font-weight: 600; }
:where(.sv-nav-group) { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--sv-muted); margin: 8px 8px 4px; }
:where(.sv-app-main) { padding: 20px 28px; min-width: 0; overflow-x: auto; }
:where(.sv-app-main table) { width: 100%; border-collapse: collapse; background: var(--sv-surface);
  border: 1px solid var(--sv-border); border-radius: var(--sv-radius); }
:where(.sv-app-main th), :where(.sv-app-main td) { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--sv-border); }
:where(.sv-app-main caption) { text-align: left; color: var(--sv-muted); padding: 4px 0; }
:where(.sv-app-main form) { display: grid; max-width: 640px; }
:where(.sv-detail-header) { display: flex; align-items: center; gap: 12px; }
:where(.sv-detail-fields) { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px 24px;
  background: var(--sv-surface); border: 1px solid var(--sv-border); border-radius: var(--sv-radius); padding: 16px; }
:where(.sv-detail-fields dt) { color: var(--sv-muted); font-size: 13px; }
:where(.sv-detail-fields dd) { margin: 0; overflow-wrap: anywhere; }
:where(.sv-detail-related) { margin-top: 28px; }
:where(.sv-signin) { display: grid; place-items: center; min-height: 100vh; padding: 16px; }
:where(.sv-signin form) { display: grid; width: min(380px, 100%); background: var(--sv-surface); padding: 28px;
  border: 1px solid var(--sv-border); border-radius: 10px; }
:where(.sv-error) { color: var(--sv-danger); min-height: 1.5em; }
@media (max-width: 720px) {
:where(.sv-app-body) { grid-template-columns: 1fr; }
:where(.sv-app-nav) { border-right: 0; border-bottom: 1px solid var(--sv-border); }
:where(.sv-app-main) { padding: 16px; }
}
`
