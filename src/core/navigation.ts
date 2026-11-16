/**
 * The sidebar: one entry per resource the viewer may list, plus pages that packages add (a log
 * viewer, a report), all in one shape and one order (decision #50, blueprint §5 "Sidebar").
 *
 * Ordering rules, in this order:
 * 1. Ungrouped entries come first, then groups. (`Array.prototype.sort` would silently put an
 *    `undefined` group last without calling the comparator, spike 14 finding 5, so the ungrouped
 *    section is placed by hand.)
 * 2. Groups are ordered by their lowest entry `order`, then by name.
 * 3. Inside a group: `order` ascending (entries without one after), then label A to Z.
 *
 * Visibility is decided here too: a resource needs `capabilities.list` (the server's `viewAny`
 * answer for this viewer), and a package page needs `can(permission)` to say yes. Hiding is not
 * security, the API still refuses, but a link the viewer can't use must not appear.
 *
 * @module
 */
import type { ResourceManifest } from '@strutvane/framework/contracts'
import { extrasOf } from './resource-extensions.ts'

/** One sidebar entry (decision #50: `order`, not `sort`). */
export interface SidebarEntry {
  /** Stable id, such as the resource name (`Post`) or a package page id (`log-viewer`). */
  readonly name: string
  /** Shown text: the plural label for a resource. */
  readonly label: string
  /** In-app path, starting with `/`. */
  readonly path: string
  /** Icon name (Tabler names, decision #57); the design draws it, or nothing. */
  readonly icon: string
  /** Group heading, or `undefined` for the top section. */
  readonly group: string | undefined
  /** Position inside its group; lower first. */
  readonly order: number | undefined
  /** A short badge, such as a row count. */
  readonly badge?: string | number
  /** The permission that shows the entry (`posts.viewAny`, `logs.view`). */
  readonly permission: string
}

/** A group of entries, as the sidebar renders it. */
export interface SidebarGroup {
  /** `undefined` for the top, ungrouped section. */
  readonly label: string | undefined
  readonly entries: readonly SidebarEntry[]
}

/** Options for {@link sidebarEntries}. */
export interface SidebarOptions {
  /** Pages added by packages or the app; shown only when `can(entry.permission)` is true. */
  readonly extra?: readonly SidebarEntry[]
  /** Whether the viewer holds a permission. Default: no extra page is shown (deny by default). */
  readonly can?: (permission: string) => boolean
}

/** The icon of a resource that names none. */
export const DEFAULT_RESOURCE_ICON = 'table'

/**
 * Every sidebar entry the viewer may see: one per listable resource, plus allowed extra pages.
 * An extra page with an off-site path (`//evil.example`, `https://…`) is dropped.
 *
 * @example
 * sidebarEntries(manifest, { extra: [logViewer], can: (p) => permissions.has(p) })
 */
export function sidebarEntries(
  manifest: ResourceManifest,
  options: SidebarOptions = {},
): SidebarEntry[] {
  const can = options.can ?? (() => false)
  const fromResources = manifest.resources
    .filter((r) => r.capabilities.list)
    .map((r): SidebarEntry => {
      const extras = extrasOf(r)
      return {
        name: r.name,
        label: r.pluralLabel,
        path: `/${r.path}`,
        icon: r.ui?.icon ?? DEFAULT_RESOURCE_ICON,
        group: r.ui?.group,
        order: extras.navOrder,
        ...(extras.navBadge !== undefined ? { badge: extras.navBadge } : {}),
        permission: `${r.path}.viewAny`,
      }
    })
  const fromPackages = (options.extra ?? []).filter(
    (e) => e.path.startsWith('/') && !e.path.startsWith('//') && can(e.permission),
  )
  return [...fromResources, ...fromPackages]
}

const byOrderThenLabel = (a: SidebarEntry, b: SidebarEntry): number => {
  const ao = a.order ?? Number.POSITIVE_INFINITY
  const bo = b.order ?? Number.POSITIVE_INFINITY
  if (ao !== bo) return ao < bo ? -1 : 1
  return a.label.localeCompare(b.label)
}

/**
 * Group and order entries for display (rules in the module comment).
 *
 * @example
 * groupSidebar(entries)[0]?.label // undefined: the ungrouped section comes first
 */
export function groupSidebar(entries: readonly SidebarEntry[]): SidebarGroup[] {
  const ungrouped = entries.filter((e) => e.group === undefined).sort(byOrderThenLabel)
  const groups = new Map<string, SidebarEntry[]>()
  for (const entry of entries) {
    if (entry.group === undefined) continue
    groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry])
  }
  const lowest = (list: readonly SidebarEntry[]) =>
    Math.min(...list.map((e) => e.order ?? Number.POSITIVE_INFINITY))
  const named = [...groups]
    .map(([label, list]) => ({ label, entries: list.sort(byOrderThenLabel) }))
    .sort((a, b) => {
      const la = lowest(a.entries)
      const lb = lowest(b.entries)
      if (la !== lb) return la < lb ? -1 : 1
      return a.label.localeCompare(b.label)
    })
  return [...(ungrouped.length > 0 ? [{ label: undefined, entries: ungrouped }] : []), ...named]
}

/**
 * Whether `pathname` is the entry's page or inside it (`/posts/12/edit` is inside `/posts`).
 *
 * @example
 * isCurrentPath('/posts', '/posts/12') // true
 */
export function isCurrentPath(entryPath: string, pathname: string): boolean {
  return pathname === entryPath || pathname.startsWith(`${entryPath}/`)
}
