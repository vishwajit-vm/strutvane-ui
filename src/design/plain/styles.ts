/**
 * The plain design's CSS: layout and legibility only, every colour from a `--sv-*` token.
 *
 * The overflow rule (spike 14 finding 13) is built in: the content column has `min-width: 0`, and
 * every wide thing (tables) scrolls inside its own positioned box, so nothing ever widens the
 * page, at 375 px or at 1440 px.
 *
 * @module
 */
const R = '[data-sv-design="plain"]'

/** The stylesheet text, scoped to the plain design's root. */
export const PLAIN_STYLESHEET: string = `
${R}{background:var(--sv-bg);color:var(--sv-fg);font-family:var(--sv-font-sans);font-size:var(--sv-font-size);line-height:1.5;min-height:100vh}
${R} *,${R} *::before,${R} *::after{box-sizing:border-box}
${R} a{color:var(--sv-accent-text)}
${R} :focus-visible{outline:2px solid var(--sv-ring);outline-offset:2px}
${R} h1{font-size:var(--sv-font-size-lg);margin:0;overflow-wrap:anywhere}
${R} h2{font-size:var(--sv-font-size);margin:0 0 calc(var(--sv-space) * 2)}
${R} mark{background:var(--sv-mark);color:var(--sv-mark-fg)}
${R} code,${R} .svp-mono{font-family:var(--sv-font-mono)}
${R} [data-sv-part="skip-link"]{position:absolute;left:-9999px;top:0}
${R} [data-sv-part="skip-link"]:focus{left:8px;top:8px;z-index:50;background:var(--sv-surface);padding:8px;border-radius:var(--sv-radius-md)}
${R} [data-sv-part="visually-hidden"]{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.svp-shell{display:grid;grid-template-columns:var(--sv-sidebar-width) minmax(0,1fr);min-height:100vh}
.svp-shell-nav{background:var(--sv-surface);border-right:1px solid var(--sv-border);min-width:0}
.svp-shell-body{min-width:0;display:flex;flex-direction:column}
${R} main{min-width:0;padding:calc(var(--sv-space) * 6);flex:1}
.svp-scrim{position:fixed;inset:0;background:var(--sv-overlay);z-index:20}
.svp-sidebar{padding:calc(var(--sv-space) * 3)}
.svp-sidebar ul{list-style:none;margin:0 0 calc(var(--sv-space) * 3);padding:0}
.svp-sidebar a{display:flex;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:var(--sv-radius-md);color:var(--sv-fg);text-decoration:none}
.svp-sidebar a[aria-current="page"]{background:var(--sv-accent-subtle);font-weight:600}
.svp-brand{font-weight:700;margin-bottom:calc(var(--sv-space) * 4)}
.svp-nav-heading{font-size:var(--sv-font-size-sm);color:var(--sv-fg-muted);text-transform:uppercase;letter-spacing:.04em;margin:8px 8px 4px}
.svp-nav-badge{color:var(--sv-fg-muted);font-size:var(--sv-font-size-sm)}
.svp-topbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px calc(var(--sv-space) * 6);background:var(--sv-surface);border-bottom:1px solid var(--sv-border)}
.svp-topbar-search{flex:1;min-width:0}
.svp-topbar-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.svp-topbar [data-sv-part="menu-button"]{display:none}
.svp-auth{display:grid;place-items:center;align-content:center;gap:12px;min-height:100vh;padding:16px}
.svp-auth-app{font-weight:700;margin:0}
.svp-auth-card{width:min(400px,100%);background:var(--sv-surface);border:1px solid var(--sv-border);border-radius:var(--sv-radius-lg);padding:24px}
.svp-page-header{display:grid;gap:8px;margin-bottom:calc(var(--sv-space) * 4)}
.svp-page-header-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.svp-page-header-row h1{flex:1 1 12rem}
.svp-page-meta{color:var(--sv-fg-muted)}
.svp-page-actions{display:flex;flex-wrap:wrap;gap:8px}
${R} [data-sv-part="breadcrumbs"] ol{display:flex;flex-wrap:wrap;gap:4px;list-style:none;margin:0;padding:0;font-size:var(--sv-font-size-sm);color:var(--sv-fg-muted)}
${R} [data-sv-part="breadcrumbs"] li+li::before{content:"/";margin-right:4px}
.svp-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:var(--sv-control-height);padding:0 12px;border-radius:var(--sv-radius-md);border:1px solid var(--sv-input);background:var(--sv-surface);color:var(--sv-fg);font:inherit;cursor:pointer;max-width:100%}
.svp-button.svp-sm{min-height:calc(var(--sv-control-height) * 0.8);padding:0 8px;font-size:var(--sv-font-size-sm)}
.svp-button-primary{background:var(--sv-accent);border-color:var(--sv-accent);color:var(--sv-accent-fg)}
.svp-button-primary:hover{background:var(--sv-accent-hover)}
.svp-button-danger{background:var(--sv-danger);border-color:var(--sv-danger);color:var(--sv-danger-fg)}
.svp-button-danger:hover{background:var(--sv-danger-hover)}
.svp-button-ghost{border-color:transparent;background:transparent}
.svp-button:disabled{opacity:.6;cursor:not-allowed}
.svp-input{min-height:var(--sv-control-height);width:100%;max-width:100%;padding:6px 8px;border:1px solid var(--sv-input);border-radius:var(--sv-radius-md);background:var(--sv-surface);color:var(--sv-fg);font:inherit}
.svp-input[aria-invalid="true"]{border-color:var(--sv-danger)}
.svp-field{display:grid;gap:4px;margin-bottom:calc(var(--sv-space) * 4);min-width:0}
.svp-help{margin:0;color:var(--sv-fg-muted);font-size:var(--sv-font-size-sm)}
.svp-error{margin:0;color:var(--sv-danger-text);font-size:var(--sv-font-size-sm)}
.svp-card{background:var(--sv-surface);border:1px solid var(--sv-border);border-radius:var(--sv-radius-lg);padding:calc(var(--sv-space) * 4);min-width:0}
.svp-badge{display:inline-block;padding:0 6px;border-radius:var(--sv-radius-sm);background:var(--sv-surface-subtle);color:var(--sv-fg);font-size:var(--sv-font-size-sm)}
.svp-badge.svp-tone-danger{background:var(--sv-danger-subtle);color:var(--sv-danger-text)}
.svp-badge.svp-tone-success{background:var(--sv-success-subtle);color:var(--sv-success-text)}
.svp-badge.svp-tone-warning{background:var(--sv-warning-subtle);color:var(--sv-warning-text)}
.svp-badge.svp-tone-accent{background:var(--sv-accent-subtle);color:var(--sv-accent-text)}
.svp-alert{padding:8px 12px;border-radius:var(--sv-radius-md);border:1px solid var(--sv-border);background:var(--sv-surface);margin:8px 0}
.svp-alert.svp-tone-danger{background:var(--sv-danger-subtle);color:var(--sv-danger-text)}
.svp-alert.svp-tone-success{background:var(--sv-success-subtle);color:var(--sv-success-text)}
.svp-alert.svp-tone-warning{background:var(--sv-warning-subtle);color:var(--sv-warning-text)}
.svp-table-scroll{position:relative;overflow-x:auto;max-width:100%;border:1px solid var(--sv-border);border-radius:var(--sv-radius-lg);background:var(--sv-surface)}
.svp-table{width:100%;border-collapse:collapse}
.svp-table caption{text-align:left;padding:8px;color:var(--sv-fg-muted)}
.svp-table th,.svp-table td{text-align:left;padding:0 10px;height:var(--sv-row-height);border-bottom:1px solid var(--sv-border);white-space:nowrap}
.svp-table thead th{position:sticky;top:0;background:var(--sv-surface-subtle)}
.svp-table th button{background:none;border:0;font:inherit;font-weight:600;color:inherit;cursor:pointer;padding:0}
.svp-overlay{position:fixed;inset:0;background:var(--sv-overlay);display:grid;place-items:start center;padding:10vh 16px 16px;z-index:40;overflow-y:auto}
.svp-dialog{width:min(560px,100%);background:var(--sv-surface);color:var(--sv-fg);border-radius:var(--sv-radius-lg);padding:20px;box-shadow:var(--sv-shadow-pop)}
.svp-dialog-lg{width:min(680px,100%)}
.svp-dialog-sm{width:min(420px,100%)}
.svp-dialog-footer{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:16px}
.svp-popover{position:absolute;z-index:30;min-width:200px;max-width:calc(100vw - 32px);background:var(--sv-surface);border:1px solid var(--sv-border);border-radius:var(--sv-radius-md);box-shadow:var(--sv-shadow-pop);padding:6px}
${R} [data-sv-part="toasts"]{position:fixed;right:16px;bottom:16px;left:16px;display:grid;justify-items:end;gap:8px;z-index:60;pointer-events:none}
.svp-toast{pointer-events:auto;display:flex;flex-wrap:wrap;align-items:center;gap:8px;max-width:100%;background:var(--sv-surface);border:1px solid var(--sv-border);border-radius:var(--sv-radius-md);padding:8px 12px;box-shadow:var(--sv-shadow-pop)}
.svp-chip{display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:2px 4px 2px 8px;border:1px solid var(--sv-border);border-radius:var(--sv-radius-md);background:var(--sv-surface-subtle)}
.svp-chip>span{overflow-wrap:anywhere}
.svp-skeleton{display:grid;gap:8px}
.svp-skeleton span{display:block;height:12px;border-radius:var(--sv-radius-sm);background:var(--sv-surface-muted)}
${R} [data-sv-part="menu-anchor"]{position:relative}
${R} [data-sv-part="toolbar"]{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-bottom:12px}
${R} [data-sv-part="toolbar"]>*{min-width:0}
${R} [data-sv-part="chips"]{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
${R} [data-sv-part="pagination"]{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:12px}
${R} [data-sv-part="pagination"] [aria-current="page"]{background:var(--sv-accent);color:var(--sv-accent-fg);border-color:var(--sv-accent)}
${R} [data-sv-part="details"]{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr));gap:8px 24px;margin:0}
${R} [data-sv-part="details"] dt{color:var(--sv-fg-muted);font-size:var(--sv-font-size-sm)}
${R} [data-sv-part="details"] dd{margin:0;overflow-wrap:anywhere}
${R} [data-sv-part="palette-list"]{list-style:none;margin:8px 0 0;padding:0;max-height:50vh;overflow-y:auto}
${R} [data-sv-part="palette-list"] [role="option"]{padding:6px 8px;border-radius:var(--sv-radius-sm);cursor:pointer;overflow-wrap:anywhere}
${R} [data-sv-part="palette-list"] [aria-selected="true"]{background:var(--sv-accent-subtle)}
${R} [data-sv-part="palette-group"]{font-size:var(--sv-font-size-sm);color:var(--sv-fg-muted);padding:6px 8px 2px}
${R} [data-sv-part="menu"] [role="menuitemcheckbox"],${R} [data-sv-part="menu"] [role="menuitem"]{display:flex;gap:8px;width:100%;padding:6px 8px;background:none;border:0;font:inherit;color:inherit;text-align:left;cursor:pointer}
${R} [data-sv-part="empty"]{display:grid;justify-items:start;gap:8px;padding:24px 8px;color:var(--sv-fg-muted)}
${R} kbd{font-family:var(--sv-font-mono);font-size:var(--sv-font-size-sm);border:1px solid var(--sv-border);border-radius:var(--sv-radius-sm);padding:0 4px}
@media (max-width:48rem){
.svp-shell{grid-template-columns:minmax(0,1fr)}
.svp-shell-nav{display:none}
.svp-shell[data-nav-open] .svp-shell-nav{display:block;position:fixed;inset:0 auto 0 0;width:min(var(--sv-sidebar-width),85vw);z-index:30;overflow-y:auto}
.svp-topbar [data-sv-part="menu-button"]{display:inline-flex}
${R} main{padding:16px}
}
@media (prefers-reduced-motion:reduce){${R} *{transition:none;animation:none}}
`
