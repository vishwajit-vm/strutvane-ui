/**
 * Routing validation issues to the fields that render them (RFC-0003 §4, row 1).
 *
 * An issue path such as `['lines', 1, 'amount']` becomes the form field name `lines[1].amount`
 * (TanStack Form's deep-key syntax). Each issue goes to the DEEPEST field the form actually renders,
 * then to its parents, and finally to the form banner, so no server message is ever dropped, even
 * when the server knows about a field the form does not show. Each message appears once per target.
 *
 * @module
 */
import type { ValidationIssue } from '@strutvane/contracts'

/** `['lines', 1, 'amount']` → `'lines[1].amount'`; `[]` → `''` (form level). */
export function issuePathToFieldName(path: readonly (string | number)[]): string {
  let name = ''
  for (const segment of path) {
    if (typeof segment === 'number') name += `[${segment}]`
    else name += name === '' ? segment : `.${segment}`
  }
  return name
}

/** Every prefix of a path as a field name, deepest first: `a[1].b`, `a[1]`, `a`. */
export function candidateFieldNames(path: readonly (string | number)[]): string[] {
  const names: string[] = []
  for (let len = path.length; len > 0; len--) names.push(issuePathToFieldName(path.slice(0, len)))
  return names
}

/** Issues split into per-field messages and form-level messages. */
export interface RoutedIssues {
  /** Messages per rendered field name, in issue order, without duplicates. */
  readonly fieldErrors: ReadonlyMap<string, readonly string[]>
  /** Messages for the whole form (empty path, or no rendered field matches), without duplicates. */
  readonly formErrors: readonly string[]
}

/** Attach issues to rendered fields. `renderedFields` holds the field names currently in the form. */
export function routeIssues(
  issues: readonly ValidationIssue[],
  renderedFields: ReadonlySet<string>,
): RoutedIssues {
  const fieldErrors = new Map<string, string[]>()
  const formErrors: string[] = []
  for (const issue of issues) {
    const target = candidateFieldNames(issue.path).find((n) => renderedFields.has(n))
    if (target === undefined) {
      if (!formErrors.includes(issue.message)) formErrors.push(issue.message)
      continue
    }
    const list = fieldErrors.get(target) ?? []
    if (!list.includes(issue.message)) list.push(issue.message)
    fieldErrors.set(target, list)
  }
  return { fieldErrors, formErrors }
}

/** The first field (in visual order) that has an error, or `undefined`. */
export function firstInvalidField(
  orderedFields: readonly string[],
  fieldErrors: ReadonlyMap<string, readonly string[]>,
): string | undefined {
  return orderedFields.find((name) => (fieldErrors.get(name)?.length ?? 0) > 0)
}

/**
 * A stable, valid DOM id for a field name (`lines[1].amount` → `sv-field-lines-1-amount`). An
 * optional scope keeps ids unique when two forms are on one page.
 */
export function fieldDomId(name: string, scope = ''): string {
  const slug = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const prefix = scope ? `sv-${slug(scope)}-field` : 'sv-field'
  return `${prefix}-${slug(name)}`
}

/** Remove duplicate strings, keeping first-seen order (each message is shown once). */
export function uniqueMessages(messages: Iterable<string>): string[] {
  return [...new Set(messages)]
}
