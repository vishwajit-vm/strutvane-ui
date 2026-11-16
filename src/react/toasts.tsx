/**
 * Toasts: short notices after an action ("Post deleted. Undo"), drawn by the design's `Toast`
 * skin inside one polite live region.
 *
 * - The region exists before any toast appears (`role="status"`), so screen readers announce new
 *   ones reliably.
 * - A toast closes after `duration` (10 s by default), but never while the pointer is over it or
 *   focus is inside it: the person may be reaching for Undo.
 * - The action is a real button. Running it closes the toast; a failing action is reported by the
 *   caller (it gets the promise).
 *
 * @module
 */
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useSkins } from './design-hooks.ts'

/** One toast to show. */
export interface ToastInput {
  readonly message: string
  readonly tone?: 'info' | 'success' | 'danger'
  /** An action button, such as Undo. */
  readonly action?: { readonly label: string; readonly run: () => void }
  /** Milliseconds before it closes on its own. Default 10,000. */
  readonly duration?: number
}

/** What {@link useToasts} returns. */
export interface ToastApi {
  /** Show a toast; returns its id. */
  show(toast: ToastInput): number
  dismiss(id: number): void
}

const ToastContext = createContext<ToastApi | null>(null)

/** The toast API, or `null` outside a {@link ToastProvider} (callers then skip the toast). */
export function useToasts(): ToastApi | null {
  return useContext(ToastContext)
}

interface Entry extends ToastInput {
  readonly id: number
}

/** Provides {@link useToasts} and renders the live region. */
export function ToastProvider(props: {
  readonly dismissLabel: string
  readonly children?: ReactNode
}): ReactElement {
  const [toasts, setToasts] = useState<readonly Entry[]>([])
  const nextId = useRef(1)
  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])
  const show = useCallback((toast: ToastInput) => {
    const id = nextId.current++
    setToasts((list) => [...list.slice(-4), { ...toast, id }])
    return id
  }, [])
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])
  return (
    <ToastContext.Provider value={api}>
      {props.children}
      <div data-sv-part="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            dismissLabel={props.dismissLabel}
            onDismiss={() => dismiss(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem(props: {
  readonly toast: Entry
  readonly dismissLabel: string
  readonly onDismiss: () => void
}): ReactElement {
  const { Toast, Button } = useSkins()
  const { toast, onDismiss } = props
  const [paused, setPaused] = useState(false)
  // The parent passes a new function each render; the timer must not restart because of that.
  const latestDismiss = useRef(onDismiss)
  latestDismiss.current = onDismiss
  useEffect(() => {
    if (paused) return
    const timer = setTimeout(() => latestDismiss.current(), toast.duration ?? 10_000)
    return () => clearTimeout(timer)
  }, [paused, toast.duration])
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover and focus only pause the timer.
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Toast
        tone={toast.tone ?? 'info'}
        action={
          toast.action ? (
            <Button
              size="sm"
              onClick={() => {
                toast.action?.run()
                onDismiss()
              }}
            >
              {toast.action.label}
            </Button>
          ) : null
        }
        dismiss={
          <Button size="sm" variant="ghost" aria-label={props.dismissLabel} onClick={onDismiss}>
            ×
          </Button>
        }
      >
        {toast.message}
      </Toast>
    </div>
  )
}
