/**
 * Global keyboard shortcuts and their help dialog.
 *
 * | Keys | Does |
 * |---|---|
 * | Ctrl/Cmd+K, `/` | open search and commands |
 * | `?` | show the shortcuts |
 * | `g` then `d` | go to the home page |
 * | `n` | New record (on a list) |
 * | `e` | Edit (on a record page) |
 * | Alt+← | Back |
 *
 * Single keys follow `shortcutBlocked` (core): never while typing, under a modal dialog, during
 * IME composition, or with Ctrl/Alt/Meta held. Pages expose their actions with
 * `data-sv-shortcut="new" | "edit"` and the Back control with `data-sv-part="back"`, so a shortcut
 * presses exactly the visible button (and does nothing where that button doesn't exist).
 *
 * @module
 */
import { type ReactElement, useEffect, useRef } from 'react'
import {
  createSequenceMatcher,
  documentHasModal,
  isPaletteChord,
  isTypingTarget,
  shortcutBlocked,
} from '../core/shortcuts.ts'
import { useStrutvane } from './context.ts'
import { ModalDialog } from './Dialog.tsx'
import { useSkins } from './design-hooks.ts'

/** What the global shortcuts do. */
export interface ShortcutHandlers {
  readonly openPalette: () => void
  readonly openHelp: () => void
  readonly goHome: () => void
}

/** Click the visible element matching `selector`, if any. */
function press(selector: string): boolean {
  const target = document.querySelector<HTMLElement>(selector)
  if (!target || (target as HTMLButtonElement).disabled) return false
  target.click()
  return true
}

/** Listen for the global shortcuts while mounted. */
export function useGlobalShortcuts(handlers: ShortcutHandlers): void {
  const latest = useRef(handlers)
  latest.current = handlers
  useEffect(() => {
    const matcher = createSequenceMatcher({ home: ['g', 'd'] })
    const onKeyDown = (event: KeyboardEvent) => {
      if (isPaletteChord(event)) {
        if (documentHasModal()) return
        event.preventDefault()
        latest.current.openPalette()
        return
      }
      if (event.altKey && event.key === 'ArrowLeft' && !isTypingTarget(event.target)) {
        if (!documentHasModal() && press('[data-sv-part="back"]')) event.preventDefault()
        return
      }
      if (shortcutBlocked(event)) return
      const done = matcher.push(event.key, event.timeStamp)
      if (done === 'home') {
        event.preventDefault()
        latest.current.goHome()
        return
      }
      if (event.key === '/') {
        event.preventDefault()
        latest.current.openPalette()
      } else if (event.key === '?') {
        event.preventDefault()
        latest.current.openHelp()
      } else if (event.key === 'n') {
        if (press('[data-sv-shortcut="new"]')) event.preventDefault()
      } else if (event.key === 'e') {
        if (press('[data-sv-shortcut="edit"]')) event.preventDefault()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}

/** The shortcuts help dialog (`?`). */
export function ShortcutsHelp(props: { readonly onClose: () => void }): ReactElement {
  const { t } = useStrutvane()
  const { Button } = useSkins()
  const rows: readonly (readonly [keys: readonly string[], text: string])[] = [
    [['Ctrl', 'K'], t('ui.shortcuts.palette')],
    [['/'], t('ui.shortcuts.palette')],
    [['?'], t('ui.shortcuts.help')],
    [['g', 'd'], t('ui.shortcuts.home')],
    [['n'], t('ui.shortcuts.new')],
    [['e'], t('ui.shortcuts.edit')],
    [['Alt', '←'], t('ui.shortcuts.back')],
    [['Esc'], t('ui.shortcuts.close')],
  ]
  return (
    <ModalDialog
      title={t('ui.shortcuts.title')}
      onClose={props.onClose}
      footer={<Button onClick={props.onClose}>{t('ui.shortcuts.close')}</Button>}
    >
      <dl data-sv-part="shortcuts">
        {rows.map(([keys, text]) => (
          <div key={`${keys.join('+')}-${text}`}>
            <dt>
              {keys.map((k, i) => (
                <span key={k}>
                  {i > 0 ? ' ' : null}
                  <kbd>{k}</kbd>
                </span>
              ))}
            </dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
    </ModalDialog>
  )
}
