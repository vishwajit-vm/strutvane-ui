/**
 * Turning API failures into typed {@link Problem}s (RFC 9457, RFC-0003 §4).
 *
 * A response body is untrusted: it may be a well-formed problem, a problem with malformed `issues`,
 * an HTML error page from a proxy, an empty body, or not JSON at all. {@link problemFromResponse}
 * never throws and always yields a usable Problem:
 *
 * - a valid problem body is kept, with malformed `issues` entries dropped (never crash on them);
 * - anything else becomes a synthetic problem whose `code` is derived from the HTTP status
 *   (401 → `unauthenticated`, 404 → `not_found`, … and `internal_error` for everything unknown);
 * - a transport failure (offline, DNS, CORS) becomes status `0` with code `network_error`.
 *
 * Every code is lowercase `snake_case`, as the framework sends them from 0.2 on (CONSISTENCY #68,
 * #123; RFC-0003). Every issue carries both `path` and the dotted `field` (#69).
 *
 * Only `detail` / `title` from the server are ever shown to users, and 5xx details never are: the
 * banner text comes from the message catalog (RFC-0003: "never raw internals").
 *
 * @module
 */
import type { IssueParam, Problem, ValidationIssue } from '@strutvane/framework/contracts'
import { formatMessage, type MessageCatalog } from './messages.ts'

/** Code used for transport failures (no HTTP response at all). UI-only; never sent by servers. */
export const NETWORK_ERROR_CODE = 'network_error'

/**
 * Code for a failure whose cause the UI cannot name: a 5xx or unknown status without a problem
 * body, or a 2xx whose body has the wrong shape (RFC-0003 §4 rows 13 and 16). The framework's own
 * code for the same situation.
 */
export const INTERNAL_ERROR_CODE = 'internal_error'

/** Thrown by the HTTP client when a request fails. Always carries a well-formed Problem. */
export class ApiProblemError extends Error {
  readonly problem: Problem
  constructor(problem: Problem, options?: ErrorOptions) {
    super(problem.detail ?? problem.title, options)
    this.name = 'ApiProblemError'
    this.problem = problem
  }
}

/** Is this error an {@link ApiProblemError}? (Works across bundle copies by checking the shape.) */
export function isApiProblemError(error: unknown): error is ApiProblemError {
  return (
    error instanceof ApiProblemError ||
    (error instanceof Error &&
      error.name === 'ApiProblemError' &&
      isProblem((error as { problem?: unknown }).problem))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIssueParam(value: unknown): value is IssueParam {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
}

/**
 * The dotted `field` member of an issue (`"items.0.title"`, decision #69) as a path: numeric
 * segments become array indexes. Used only when an issue has no usable `path` (decision #118).
 * `undefined` when the text has an empty segment (`"a..b"`), so a malformed field is dropped.
 *
 * @example
 * fieldToPath('items.0.title') // ['items', 0, 'title']
 */
export function fieldToPath(field: string): (string | number)[] | undefined {
  if (field === '') return []
  const out: (string | number)[] = []
  for (const part of field.split('.')) {
    if (part === '') return undefined
    out.push(/^(?:0|[1-9]\d{0,8})$/.test(part) ? Number(part) : part)
  }
  return out
}

/**
 * The dotted `field` member for a path, exactly as the framework builds it (decision #69):
 * `['lines', 2, 'amount']` → `'lines.2.amount'`, `[]` → `''` (the whole form).
 *
 * @example
 * pathToField(['items', 0, 'title']) // 'items.0.title'
 */
export function pathToField(path: readonly (string | number)[]): string {
  return path.join('.')
}

/** A clean copy of an issue path, or `undefined` when any segment is malformed. */
function cleanSegments(path: readonly unknown[]): (string | number)[] | undefined {
  const cleanPath: (string | number)[] = []
  for (const segment of path) {
    if (typeof segment === 'string') cleanPath.push(segment)
    else if (typeof segment === 'number' && Number.isInteger(segment) && segment >= 0)
      cleanPath.push(segment)
    else return undefined
  }
  return cleanPath
}

/**
 * A validated issue, or `undefined` if the entry is malformed.
 *
 * The location comes from `path` first and falls back to the dotted `field` (decision #118):
 * `path` is the framework's source of truth, because `field` is ambiguous for a key that contains
 * a dot or looks like a number (`{ "a.b": … }`, `{ "1": … }`). The `field` member of the result is
 * always present (required since framework 0.2, #69) and always agrees with `path`: it is rebuilt
 * from the clean path, so a server whose two members disagree cannot place a message on one field
 * and report it under another.
 *
 * Why keep the fallback both ways: a 0.2 server always sends both members, but the UI also talks to
 * other backends through the same parser (an app's own endpoints, `@strutvane/auth`, proxies), and
 * an issue that names its field in only one of the two ways is still placed, never dropped.
 */
function sanitizeIssue(value: unknown): ValidationIssue | undefined {
  if (!isRecord(value)) return undefined
  const { path, field, code, message, params } = value
  if (typeof code !== 'string' || typeof message !== 'string') return undefined
  const cleanPath = Array.isArray(path)
    ? cleanSegments(path)
    : typeof field === 'string'
      ? fieldToPath(field)
      : undefined
  if (cleanPath === undefined) return undefined
  const cleanParams: Record<string, IssueParam> = {}
  if (isRecord(params)) {
    for (const [k, v] of Object.entries(params)) if (isIssueParam(v)) cleanParams[k] = v
  }
  return { path: cleanPath, field: pathToField(cleanPath), code, message, params: cleanParams }
}

/** Structural check for an RFC 9457 problem body with a Strutvane `code`. */
export function isProblem(value: unknown): value is Problem {
  return (
    isRecord(value) &&
    typeof value['type'] === 'string' &&
    typeof value['title'] === 'string' &&
    typeof value['status'] === 'number' &&
    Number.isInteger(value['status']) &&
    typeof value['code'] === 'string'
  )
}

/**
 * A safe copy of a problem body: required members checked, optional members kept only when they
 * have the right type, `issues` filtered to well-formed entries. `undefined` if it is not a problem.
 */
export function sanitizeProblem(value: unknown): Problem | undefined {
  if (!isProblem(value)) return undefined
  const v = value as Record<string, unknown>
  const issues = Array.isArray(v['issues'])
    ? v['issues'].map(sanitizeIssue).filter((i): i is ValidationIssue => i !== undefined)
    : undefined
  const str = (key: string) => (typeof v[key] === 'string' ? { [key]: v[key] as string } : {})
  return {
    type: value.type,
    title: value.title,
    status: value.status,
    code: value.code,
    ...str('detail'),
    ...str('instance'),
    ...str('traceId'),
    ...(issues ? { issues } : {}),
  }
}

/**
 * The code a bodiless response gets, by status: the framework's code for the same status, so the
 * catalogue and every check treat it exactly like a real problem (#30 for 419, #123 for the case).
 */
const STATUS_CODES: ReadonlyMap<number, string> = new Map([
  [400, 'validation_failed'],
  [401, 'unauthenticated'],
  [403, 'forbidden'],
  [404, 'not_found'],
  [409, 'conflict'],
  [413, 'payload_too_large'],
  [419, 'csrf_token_mismatch'],
  [422, 'validation_failed'],
  [429, 'rate_limited'],
  [503, 'service_unavailable'],
])

/** A synthetic problem for a response that did not carry a valid problem body. */
export function syntheticProblem(status: number, title?: string): Problem {
  const code = STATUS_CODES.get(status) ?? INTERNAL_ERROR_CODE
  return {
    type: 'about:blank',
    title: title && title.length <= 200 ? title : 'Request failed',
    status: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500,
    code,
  }
}

/** The problem for a transport failure (no response). */
export function networkProblem(): Problem {
  return { type: 'about:blank', title: 'Network error', status: 0, code: NETWORK_ERROR_CODE }
}

/**
 * Read a failed response into a Problem. Never throws: an unreadable or unexpected body falls back to
 * {@link syntheticProblem}. A 422 without issues keeps its code but gets an empty `issues` list.
 */
export async function problemFromResponse(response: Response): Promise<Problem> {
  let body: unknown
  try {
    const text = await response.text()
    body = text ? (JSON.parse(text) as unknown) : undefined
  } catch {
    body = undefined
  }
  const problem = sanitizeProblem(body)
  if (problem) return problem
  // A 4xx/5xx without a problem body: map the status; keep a short statusText as the title.
  return syntheticProblem(response.status, response.statusText || undefined)
}

/** Validation issues from a problem (empty for non-validation problems). */
export function problemIssues(problem: Problem): readonly ValidationIssue[] {
  return Array.isArray(problem.issues) ? problem.issues : []
}

/**
 * User-facing banner text for a problem (RFC-0003 §4 rows 3–16):
 * - offline → the catalog's offline message; 503 → "temporarily unavailable";
 * - other 5xx and malformed responses → the catalog's server message plus the trace reference,
 *   never the server's raw `detail` (row 13: "full details in logs only");
 * - 4xx → the server's `detail` (rendered from ITS catalog), else the catalog message for the
 *   code (`ui.problem.code.<code>`), else the title.
 */
export function problemBannerText(
  problem: Problem,
  catalog: MessageCatalog,
  locale = 'en',
): string {
  const msg = (key: string, params: Record<string, string> = {}) =>
    formatMessage(catalog, key, params, locale)
  const withReference = (text: string) =>
    problem.traceId ? `${text} ${msg('ui.problem.reference', { traceId: problem.traceId })}` : text
  if (problem.code === NETWORK_ERROR_CODE) return msg('ui.problem.network')
  if (problem.status === 503 || problem.code === 'service_unavailable') {
    return withReference(msg('ui.problem.unavailable'))
  }
  if (problem.status >= 500 || problem.status < 400) return withReference(msg('ui.problem.server'))
  const key = catalogKey(catalog, problem.code)
  // A few codes always use the catalogue: the server's detail is generic, while the catalogue says
  // what happened and what to do (decision #103 for `write_cancelled`, #30 for a refused CSRF check).
  if (key !== undefined && CATALOGUE_FIRST.has(problem.code)) return msg(key)
  if (problem.detail) return problem.detail
  return key !== undefined ? msg(key) : problem.title
}

/** Codes whose catalogue message wins over the server's `detail`. */
const CATALOGUE_FIRST: ReadonlySet<string> = new Set(['write_cancelled', 'csrf_token_mismatch'])

/**
 * The catalogue key for a problem code (`ui.problem.code.<code>`), or `undefined`.
 *
 * Every Strutvane code is lowercase `snake_case` (decisions #68, #123), and so is every key in the
 * default catalogue. The code is tried as sent, then lowercased, for one reason: during the 0.2 line
 * the framework still accepts an **app's own** uppercase code (`INVOICE_ALREADY_PAID`, with a
 * deprecation warning; framework `legacy-codes.ts`) and sends it unchanged, so an app that already
 * moved its catalogue entry to `ui.problem.code.invoice_already_paid` still gets its message. The
 * lowercase retry can go when the framework stops accepting uppercase codes (0.3).
 *
 * @example
 * catalogKey(defaultMessages, 'write_cancelled') // 'ui.problem.code.write_cancelled'
 */
export function catalogKey(catalog: MessageCatalog, code: string): string | undefined {
  for (const candidate of [code, code.toLowerCase()]) {
    const key = `ui.problem.code.${candidate}`
    if (Object.hasOwn(catalog, key)) return key
  }
  return undefined
}
