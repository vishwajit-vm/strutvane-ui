/**
 * Per-viewer list preferences: hidden columns and row density, remembered in `localStorage` per
 * resource.
 *
 * Failure scenarios: storage can be missing (server rendering), blocked (privacy settings or a
 * sandboxed iframe: even reading the property throws), full (writing throws) or hold anything
 * (another app on the same origin, an older version). Every read is validated and every failure
 * falls back to the defaults, so a preference can never break a list. Preferences are not
 * security: the server decides which columns exist at all.
 *
 * @module
 */

/** Row density. `default` is the design's own row height; `compact` is tighter. */
export type Density = 'default' | 'compact'

/** One resource's remembered list preferences. */
export interface ViewPrefs {
  /** Field names the viewer hid. */
  readonly hidden: readonly string[]
  readonly density: Density
}

/** The defaults: nothing hidden, default density. */
export const DEFAULT_VIEW_PREFS: ViewPrefs = Object.freeze({ hidden: [], density: 'default' })

/** A minimal storage (the DOM `Storage` fits). */
export interface PrefsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const KEY_PREFIX = 'strutvane:list:'

/** `localStorage`, or `undefined` when it is missing or blocked. */
export function browserStorage(): PrefsStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/**
 * Parse stored text into preferences; anything unexpected becomes the defaults.
 *
 * @example
 * parseViewPrefs('{"hidden":["notes"],"density":"compact"}').density // 'compact'
 */
export function parseViewPrefs(text: string | null): ViewPrefs {
  if (text === null) return DEFAULT_VIEW_PREFS
  try {
    const value: unknown = JSON.parse(text)
    if (typeof value !== 'object' || value === null) return DEFAULT_VIEW_PREFS
    const v = value as { hidden?: unknown; density?: unknown }
    const hidden = Array.isArray(v.hidden)
      ? v.hidden.filter((h): h is string => typeof h === 'string').slice(0, 200)
      : []
    return { hidden, density: v.density === 'compact' ? 'compact' : 'default' }
  } catch {
    return DEFAULT_VIEW_PREFS
  }
}

/** Read a resource's preferences. Never throws. */
export function loadViewPrefs(
  resourcePath: string,
  storage: PrefsStorage | undefined = browserStorage(),
): ViewPrefs {
  try {
    return parseViewPrefs(storage?.getItem(KEY_PREFIX + resourcePath) ?? null)
  } catch {
    return DEFAULT_VIEW_PREFS
  }
}

/** Save a resource's preferences. Never throws; returns whether they were stored. */
export function saveViewPrefs(
  resourcePath: string,
  prefs: ViewPrefs,
  storage: PrefsStorage | undefined = browserStorage(),
): boolean {
  try {
    if (!storage) return false
    storage.setItem(KEY_PREFIX + resourcePath, JSON.stringify(prefs))
    return true
  } catch {
    return false
  }
}
