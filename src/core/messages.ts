/**
 * Message catalogs and a small, safe ICU-style formatter (RFC-0003 §2).
 *
 * The same catalog renders client-side validation messages and UI text, so a message reads the same
 * whether the browser or the server produced it. Supported syntax (a deliberate subset of ICU
 * MessageFormat, enough for validation and UI copy):
 *
 * - `{name}`: a parameter.
 * - `{count, plural, =0 {none} one {# item} other {# items}}`: plural selection by
 *   `Intl.PluralRules` for the locale, with exact `=N` matches first. `#` is the formatted number.
 * - `{status, select, draft {Draft} other {Unknown}}`: selection by string value.
 * - `'{'` escapes a literal brace (ICU quoting), `''` is a literal apostrophe.
 *
 * Safety: the formatter never evaluates code and never throws. A template that fails to parse is
 * rendered with simple `{name}` substitution, and unknown parameters stay visible (`{min}`) so a
 * missing value is noticed in development instead of silently disappearing.
 *
 * @module
 */
import type { IssueParam } from '@strutvane/contracts'

/** Messages keyed by stable code (`too_small`) or UI key (`ui.list.showing`). */
export type MessageCatalog = Readonly<Record<string, string>>

/** Parameters a message can use. */
export type MessageParams = Readonly<Record<string, IssueParam>>

/** The built-in English catalog: validation codes (shared with the server) and UI text. */
export const defaultMessages: MessageCatalog = Object.freeze({
  // Validation (same codes and words as the server's catalog)
  required: '{attribute} is required.',
  too_small: '{attribute} must be at least {min}.',
  too_big: '{attribute} must be at most {max}.',
  too_short: '{attribute} must be at least {min, plural, one {# character} other {# characters}}.',
  too_long: '{attribute} must be at most {max, plural, one {# character} other {# characters}}.',
  invalid_enum: '{attribute} must be one of: {values}.',
  invalid_date: '{attribute} must be a valid date.',
  invalid_number: '{attribute} must be a number.',
  invalid_integer: '{attribute} must be a whole number.',
  invalid_format: '{attribute} has an invalid format.',
  unique: 'This {attribute} is already taken.',
  date_before_field: '{attribute} must be on or after {other}.',
  unknown: '{attribute} is invalid.',
  // UI: lists
  'ui.list.search': 'Search {resource}',
  'ui.list.loading': 'Loading {resource}…',
  'ui.list.showing': 'Showing {count} {resource}',
  'ui.list.empty': 'No {resource} match these filters.',
  'ui.list.loadFailed': 'Could not load the list. Please retry.',
  'ui.list.new': 'New {resource}',
  'ui.list.edit': 'Edit {title}',
  'ui.list.delete': 'Delete {title}',
  'ui.list.view': 'Open {title}',
  'ui.list.viewShort': 'Open',
  'ui.list.editShort': 'Edit',
  'ui.list.deleteShort': 'Delete',
  'ui.list.confirmDelete': 'Delete {title}? This cannot be undone.',
  'ui.list.deleteFailed': 'Could not delete {title}.',
  'ui.list.actions': 'Actions',
  'ui.list.previous': 'Previous page',
  'ui.list.next': 'Next page',
  'ui.list.pagination': '{resource} pagination',
  // UI: filters
  'ui.filter.form': 'Filter {resource}',
  'ui.filter.field': 'Filter field',
  'ui.filter.operator': 'Operator',
  'ui.filter.value': 'Value',
  'ui.filter.from': 'From',
  'ui.filter.to': 'To',
  'ui.filter.add': 'Add filter',
  'ui.filter.active': 'Active filters',
  'ui.filter.remove': 'Remove filter: {filter}',
  'ui.filter.invalid': 'Enter a valid value for {attribute}.',
  'ui.filter.valuesHelp': 'Separate several values with commas.',
  'ui.filter.chip': '{attribute} {operator} {value}',
  'ui.filter.chipNull': '{attribute} {operator}',
  'ui.filter.chipBetween': '{attribute} {operator} {from} and {to}',
  // UI: filter operators
  'ui.op.eq': 'is',
  'ui.op.ne': 'is not',
  'ui.op.gt': '>',
  'ui.op.gte': '≥',
  'ui.op.lt': '<',
  'ui.op.lte': '≤',
  'ui.op.in': 'is any of',
  'ui.op.nin': 'is none of',
  'ui.op.isNull': 'is empty',
  'ui.op.isNotNull': 'is not empty',
  'ui.op.contains': 'contains',
  'ui.op.startsWith': 'starts with',
  'ui.op.endsWith': 'ends with',
  'ui.op.between': 'is between',
  // UI: forms
  'ui.form.create': 'New {resource}',
  'ui.form.edit': 'Edit {resource}',
  'ui.form.submitCreate': 'Create {resource}',
  'ui.form.submitEdit': 'Save changes',
  'ui.form.cancel': 'Cancel',
  'ui.form.loading': 'Loading {resource}…',
  'ui.form.loadFailed': 'Could not load this record.',
  'ui.form.unexpected': 'Something went wrong. Your changes are kept. Please try again.',
  'ui.form.add': 'Add {item}',
  'ui.form.remove': 'Remove {item} {index}',
  'ui.form.select': 'Select…',
  'ui.form.searchRelation': 'Search {resource}',
  'ui.form.loadMore': 'Load more',
  'ui.form.relationLoading': 'Loading…',
  // UI: app shell (StrutvaneApp)
  'ui.app.skip': 'Skip to content',
  'ui.app.nav': 'Main navigation',
  'ui.app.home': 'Home',
  'ui.app.welcome': 'Welcome to {app}',
  'ui.app.chooseSection': 'Choose a section to get started.',
  'ui.app.loading': 'Loading…',
  'ui.app.notFound': 'This page does not exist, or you do not have access to it.',
  'ui.app.forbidden': 'You do not have permission to see this.',
  'ui.app.signIn': 'Sign in',
  'ui.app.signInTitle': 'Sign in to {app}',
  'ui.app.email': 'Email',
  'ui.app.password': 'Password',
  'ui.app.signingIn': 'Signing in…',
  'ui.app.invalidCredentials': 'The email or password is wrong.',
  'ui.app.tooManyAttempts': 'Too many attempts. Try again in {seconds} seconds.',
  'ui.app.signOut': 'Sign out',
  'ui.app.signOutFailed': 'Could not sign out. You are still signed in; please try again.',
  'ui.app.workspace': 'Workspace',
  'ui.app.chooseWorkspace': 'Choose a workspace',
  'ui.app.noWorkspace':
    'Your account is not a member of any workspace yet. Ask an owner to add you.',
  'ui.app.sessionExpired': 'Your session has ended. Please sign in again.',
  'ui.app.manifestFailed': 'The app could not load its screens. Please reload.',
  'ui.app.related': '{relation}',
  // UI: problems (RFC-0003 §4)
  'ui.problem.server': 'Something went wrong on our side. Your changes are kept.',
  'ui.problem.reference': 'Reference: {traceId}.',
  'ui.problem.network':
    'You appear to be offline. Your changes are kept; try again when you are back online.',
  'ui.problem.unavailable':
    'The service is temporarily unavailable. Your changes are kept; please try again shortly.',
  // Shown for a problem without a server-provided `detail` (keyed by problem code).
  'ui.problem.code.VALIDATION_FAILED': 'Please correct the highlighted fields.',
  'ui.problem.code.UNAUTHENTICATED':
    'Your session has expired. Sign in again; your changes are kept.',
  'ui.problem.code.FORBIDDEN': 'You do not have permission to do this.',
  'ui.problem.code.NOT_FOUND': 'This record no longer exists.',
  'ui.problem.code.CONFLICT': 'This change conflicts with the current state of the record.',
  'ui.problem.code.STALE_RECORD': 'Someone else changed this record. Reload to see their changes.',
  'ui.problem.code.RATE_LIMITED': 'Too many requests. Please wait a moment and try again.',
  'ui.problem.code.PAYLOAD_TOO_LARGE': 'This request is too large to send.',
  // UI: cells
  'ui.cell.empty': '—',
  'ui.cell.yes': 'Yes',
  'ui.cell.no': 'No',
})

// ─── Parsing ─────────────────────────────────────────────────────────────────────────────────────

type Node =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'arg'; readonly name: string }
  | { readonly kind: 'pound' }
  | {
      readonly kind: 'plural' | 'select'
      readonly name: string
      readonly cases: ReadonlyMap<string, readonly Node[]>
    }

class ParseError extends Error {}

/** Recursive-descent parser for the supported subset. Throws ParseError on malformed input. */
class Parser {
  private pos = 0
  private readonly src: string
  constructor(src: string) {
    this.src = src
  }

  parse(): Node[] {
    const nodes = this.nodes(false, false)
    if (this.pos !== this.src.length) throw new ParseError('unexpected }')
    return nodes
  }

  /** Parse until end of input, or until a `}` when inside a plural/select case. */
  private nodes(inCase: boolean, inPlural: boolean): Node[] {
    const out: Node[] = []
    let text = ''
    const flush = () => {
      if (text) out.push({ kind: 'text', value: text })
      text = ''
    }
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos]
      if (ch === "'") {
        // ICU quoting: '' → ', '{…}' → literal text.
        if (this.src[this.pos + 1] === "'") {
          text += "'"
          this.pos += 2
          continue
        }
        const next = this.src[this.pos + 1]
        if (next === '{' || next === '}' || (inPlural && next === '#')) {
          const end = this.src.indexOf("'", this.pos + 1)
          if (end < 0) throw new ParseError('unterminated quote')
          text += this.src.slice(this.pos + 1, end)
          this.pos = end + 1
          continue
        }
        text += ch
        this.pos++
        continue
      }
      if (ch === '}') {
        if (!inCase) throw new ParseError('unexpected }')
        break
      }
      if (ch === '#' && inPlural) {
        flush()
        out.push({ kind: 'pound' })
        this.pos++
        continue
      }
      if (ch === '{') {
        flush()
        out.push(this.argument())
        continue
      }
      text += ch
      this.pos++
    }
    flush()
    return out
  }

  private argument(): Node {
    this.pos++ // {
    const name = this.identifier()
    this.space()
    if (this.src[this.pos] === '}') {
      this.pos++
      return { kind: 'arg', name }
    }
    if (this.src[this.pos] !== ',') throw new ParseError('expected , or }')
    this.pos++
    this.space()
    const type = this.identifier()
    if (type !== 'plural' && type !== 'select') throw new ParseError(`unsupported type ${type}`)
    this.space()
    if (this.src[this.pos] !== ',') throw new ParseError('expected ,')
    this.pos++
    const cases = new Map<string, readonly Node[]>()
    for (;;) {
      this.space()
      if (this.src[this.pos] === '}') {
        this.pos++
        break
      }
      const key = this.caseKey()
      this.space()
      if (this.src[this.pos] !== '{') throw new ParseError('expected { after case key')
      this.pos++
      cases.set(key, this.nodes(true, type === 'plural'))
      if (this.src[this.pos] !== '}') throw new ParseError('unterminated case')
      this.pos++
    }
    if (!cases.has('other')) throw new ParseError('plural/select needs an "other" case')
    return { kind: type, name, cases }
  }

  private identifier(): string {
    const m = /^[A-Za-z_][\w.-]*/.exec(this.src.slice(this.pos))
    if (!m) throw new ParseError('expected identifier')
    this.pos += m[0].length
    return m[0]
  }

  private caseKey(): string {
    const m = /^(=\d+|[A-Za-z_][\w-]*)/.exec(this.src.slice(this.pos))
    if (!m) throw new ParseError('expected case key')
    this.pos += m[0].length
    return m[0]
  }

  private space(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos] ?? '')) this.pos++
  }
}

// Parsed templates are cached: catalogs are small and the same messages render repeatedly.
const cache = new Map<string, readonly Node[] | null>()
const CACHE_LIMIT = 1000

function parseTemplate(template: string): readonly Node[] | null {
  const hit = cache.get(template)
  if (hit !== undefined) return hit
  let nodes: readonly Node[] | null
  try {
    nodes = new Parser(template).parse()
  } catch {
    nodes = null
  }
  if (cache.size >= CACHE_LIMIT) cache.clear()
  cache.set(template, nodes)
  return nodes
}

// ─── Rendering ───────────────────────────────────────────────────────────────────────────────────

function render(
  nodes: readonly Node[],
  params: MessageParams,
  locale: string,
  pound: number | undefined,
): string {
  let out = ''
  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
        out += node.value
        break
      case 'pound':
        out += pound === undefined ? '#' : formatNumber(pound, locale)
        break
      case 'arg':
        out += Object.hasOwn(params, node.name) ? String(params[node.name]) : `{${node.name}}`
        break
      case 'plural': {
        const raw = params[node.name]
        const n = typeof raw === 'number' ? raw : Number(raw)
        if (!Object.hasOwn(params, node.name) || !Number.isFinite(n)) {
          out += `{${node.name}}`
          break
        }
        const exact = node.cases.get(`=${n}`)
        const branch = exact ?? node.cases.get(pluralCategory(n, locale)) ?? node.cases.get('other')
        out += branch ? render(branch, params, locale, n) : ''
        break
      }
      case 'select': {
        const value = Object.hasOwn(params, node.name) ? String(params[node.name]) : undefined
        const branch =
          (value !== undefined ? node.cases.get(value) : undefined) ?? node.cases.get('other')
        out += branch ? render(branch, params, locale, pound) : ''
        break
      }
    }
  }
  return out
}

function pluralCategory(n: number, locale: string): string {
  try {
    return new Intl.PluralRules(locale).select(n)
  } catch {
    return new Intl.PluralRules('en').select(n)
  }
}

function formatNumber(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(n)
  } catch {
    return String(n)
  }
}

/** Fallback when a template does not parse: plain `{name}` substitution, never a throw. */
function naiveFormat(template: string, params: MessageParams): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.hasOwn(params, key) ? String(params[key]) : whole,
  )
}

/** Render a template string with parameters. Never throws. */
export function formatTemplate(
  template: string,
  params: MessageParams = {},
  locale = 'en',
): string {
  const nodes = parseTemplate(template)
  return nodes ? render(nodes, params, locale, undefined) : naiveFormat(template, params)
}

/**
 * Render a message from a catalog. Unknown codes fall back to the `unknown` message (or the code
 * itself for UI keys), so the UI never crashes on a code it does not know.
 */
export function formatMessage(
  catalog: MessageCatalog,
  code: string,
  params: MessageParams = {},
  locale = 'en',
): string {
  const template =
    catalog[code] ??
    (code.startsWith('ui.') ? code : (catalog['unknown'] ?? '{attribute} is invalid.'))
  return formatTemplate(template, params, locale)
}

/** Does a template parse with the supported syntax? Used by catalog checks (`sv lang:check`). */
export function isValidTemplate(template: string): boolean {
  return parseTemplate(template) !== null
}
