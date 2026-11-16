/**
 * axe-core on a rendered container, as a list of readable violations (`[]` = pass).
 *
 * `color-contrast` is off because jsdom has no layout or computed colours; contrast is checked
 * exactly from the tokens instead (`checkContrast`). Everything else axe knows runs.
 *
 * @module
 */

/** One violation line per rule: `rule-id: help (N elements: selector, …)`. */
export async function axeViolations(container: Element): Promise<string[]> {
  let axe: typeof import('axe-core')
  try {
    axe = (await import('axe-core')).default
  } catch {
    return ['axe-core is not installed: add it to devDependencies to run the accessibility check']
  }
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
    resultTypes: ['violations'],
  })
  return result.violations.map(
    (v) =>
      `${v.id}: ${v.help} (${v.nodes.length} element${v.nodes.length === 1 ? '' : 's'}: ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(', ')})`,
  )
}
