/**
 * Keyboard shortcuts: the one rule that decides when a single-key shortcut may fire, and a small
 * matcher for two-key sequences (`g d`).
 *
 * The rule ({@link shortcutBlocked}): a shortcut never fires while the person is typing (an input,
 * textarea, select or editable element has focus), while a modal dialog is open (its own keys
 * win), during IME composition, when another handler already used the key, or when Ctrl, Alt or
 * Meta is held (those combinations belong to the browser and the operating system). Without it,
 * typing "n" in a search box would open a new form.
 *
 * @module
 */

/** The parts of a keyboard event the rule reads (a DOM `KeyboardEvent` fits). */
export interface ShortcutEventLike {
  readonly key: string
  readonly target: unknown
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly metaKey: boolean
  readonly defaultPrevented: boolean
  readonly isComposing?: boolean
}

/** Input types that don't take text, so a single key there is still a shortcut. */
const NON_TEXT_INPUTS: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'radio',
  'submit',
  'reset',
  'range',
  'color',
  'file',
  'image',
])

/**
 * Whether an event target takes typed text.
 *
 * @example
 * isTypingTarget(document.createElement('textarea')) // true
 */
export function isTypingTarget(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false
  const t = target as { tagName?: unknown; isContentEditable?: unknown; type?: unknown }
  if (t.isContentEditable === true) return true
  const tag = typeof t.tagName === 'string' ? t.tagName.toUpperCase() : ''
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has(String(t.type ?? 'text').toLowerCase())
  return false
}

/** Whether a modal dialog is showing in the document. */
export function documentHasModal(): boolean {
  return typeof document !== 'undefined' && document.querySelector('[aria-modal="true"]') !== null
}

/**
 * Whether a single-key shortcut must NOT fire for this event. `modalOpen` says whether a modal
 * dialog is showing (default: looks for `[aria-modal="true"]` in the document).
 *
 * @example
 * shortcutBlocked(eventFromTheSearchBox) // true: the person is typing
 */
export function shortcutBlocked(
  event: ShortcutEventLike,
  modalOpen: boolean = documentHasModal(),
): boolean {
  if (event.defaultPrevented || event.isComposing === true) return true
  if (event.ctrlKey || event.altKey || event.metaKey) return true
  if (isTypingTarget(event.target)) return true
  return modalOpen
}

/**
 * Whether the event is the command palette's chord (Ctrl+K or Cmd+K). It works while typing too,
 * because it can't be typed by accident.
 *
 * @example
 * isPaletteChord({ key: 'k', ctrlKey: true, metaKey: false, altKey: false }) // true
 */
export function isPaletteChord(
  event: Pick<ShortcutEventLike, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k'
}

/** A matcher for key sequences such as `['g', 'd']`. */
export interface SequenceMatcher {
  /** Feed one key at time `now` (ms); returns the id of the sequence this key completed, if any. */
  push(key: string, now: number): string | undefined
  /** Forget a half-typed sequence. */
  reset(): void
}

/**
 * Create a {@link SequenceMatcher}. A pause longer than `timeoutMs` between keys starts over.
 *
 * @example
 * const m = createSequenceMatcher({ home: ['g', 'd'] })
 * m.push('g', 0)
 * m.push('d', 100) // 'home'
 */
export function createSequenceMatcher(
  sequences: Readonly<Record<string, readonly string[]>>,
  timeoutMs = 1000,
): SequenceMatcher {
  const all = Object.entries(sequences)
  let typed: string[] = []
  let last = Number.NEGATIVE_INFINITY
  const isPrefix = (keys: readonly string[]) =>
    all.some(([, seq]) => keys.length <= seq.length && keys.every((k, i) => seq[i] === k))
  return {
    push(key, now) {
      if (now - last > timeoutMs) typed = []
      last = now
      typed = [...typed, key]
      const done = all.find(
        ([, seq]) => seq.length === typed.length && seq.every((k, i) => k === typed[i]),
      )
      if (done) {
        typed = []
        return done[0]
      }
      // Keep only the longest suffix that can still grow into a sequence.
      while (typed.length > 0 && !isPrefix(typed)) typed = typed.slice(1)
      return undefined
    },
    reset() {
      typed = []
    },
  }
}
