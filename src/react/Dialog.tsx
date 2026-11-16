/**
 * `<ModalDialog>`: the behaviour of every modal (confirmations, the command palette, shortcuts
 * help, sign-in again), drawn by the design's `Dialog` skin.
 *
 * Behaviour owned here, so every design gets it right:
 * - `role="dialog"` or `"alertdialog"`, `aria-modal`, labelled by its title and described by its
 *   description;
 * - focus moves in on open (to `initialFocus`, else the first focusable element) and returns to
 *   the element that had it on close;
 * - Tab and Shift+Tab stay inside (focus trap); Escape closes, unless `dismissible` is false;
 * - a click on the scrim closes it too (pointer users), when dismissible.
 *
 * @module
 */
import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from 'react'
import { useSkins } from './design-hooks.ts'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Props of {@link ModalDialog}. */
export interface ModalDialogProps {
  readonly title: ReactNode
  readonly description?: ReactNode
  /** `alertdialog` for confirmations that interrupt (delete, leave without saving). */
  readonly role?: 'dialog' | 'alertdialog'
  /** Called on Escape or a scrim click (when dismissible). */
  readonly onClose: () => void
  /** Whether Escape and the scrim close it. Default `true`. */
  readonly dismissible?: boolean
  /** The element to focus first (a safe choice such as Cancel). */
  readonly initialFocus?: RefObject<HTMLElement | null>
  readonly footer?: ReactNode
  readonly size?: 'sm' | 'md' | 'lg'
  readonly children?: ReactNode
}

/** A modal dialog with focus management, rendered through the design's `Dialog` skin. */
export function ModalDialog(props: ModalDialogProps): ReactElement {
  const { Dialog } = useSkins()
  const titleId = useId()
  const descriptionId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const dismissible = props.dismissible !== false
  const onClose = useRef(props.onClose)
  onClose.current = props.onClose
  const initialFocus = props.initialFocus

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const target =
      initialFocus?.current ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.current
    target?.focus()
    return () => {
      // Back to where the person was (if that element still exists).
      if (previous?.isConnected) previous.focus()
    }
  }, [initialFocus])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && dismissible) {
      event.preventDefault()
      event.stopPropagation()
      onClose.current()
      return
    }
    if (event.key !== 'Tab' || !panel.current) return
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    const first = items[0]
    const last = items.at(-1)
    if (!first || !last) {
      event.preventDefault()
      return
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <Dialog
      title={props.title}
      titleId={titleId}
      {...(props.description !== undefined
        ? { description: props.description, descriptionId }
        : {})}
      footer={props.footer}
      size={props.size ?? 'md'}
      overlayProps={{
        onMouseDown: (event) => {
          if (dismissible && event.target === event.currentTarget) onClose.current()
        },
      }}
      panelProps={{
        ref: panel,
        role: props.role ?? 'dialog',
        'aria-modal': true,
        'aria-labelledby': titleId,
        ...(props.description !== undefined ? { 'aria-describedby': descriptionId } : {}),
        tabIndex: -1,
        onKeyDown,
      }}
    >
      {props.children}
    </Dialog>
  )
}
