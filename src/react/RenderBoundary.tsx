/**
 * `<RenderBoundary>`: contains a crash in ONE cell or widget, so it never takes down the page.
 *
 * Cells and widgets are the renderer's extension points: an app override, a future field type or
 * a value of an unexpected shape can throw while rendering. Without a boundary React unmounts the
 * whole tree, so one bad value in one row would blank the entire app. With it, only that cell or
 * field shows a fallback; the rest of the list or form keeps working.
 *
 * - The error is NOT swallowed silently: React reports caught render errors itself (the console in
 *   development, `reportError` / `onCaughtError` in production), and package code never logs
 *   through `console.*` (ecosystem rule 4).
 * - `resetKey`: when it changes (a new value for the cell), the boundary tries the children again,
 *   so a transient failure does not stick for the lifetime of the row.
 *
 * @module
 */
import { Component, type ReactNode } from 'react'

/** Props of {@link RenderBoundary}. */
export interface RenderBoundaryProps {
  /** Shown instead of the children after they threw while rendering. */
  readonly fallback: ReactNode
  /** Rendering is retried when this value changes (compared with `Object.is`). */
  readonly resetKey?: unknown
  readonly children?: ReactNode
}

interface RenderBoundaryState {
  readonly failed: boolean
  readonly failedKey: unknown
}

/** Error boundary around one cell or widget. */
export class RenderBoundary extends Component<RenderBoundaryProps, RenderBoundaryState> {
  override state: RenderBoundaryState = { failed: false, failedKey: undefined }

  static getDerivedStateFromError(): Partial<RenderBoundaryState> {
    return { failed: true }
  }

  static getDerivedStateFromProps(
    props: RenderBoundaryProps,
    state: RenderBoundaryState,
  ): Partial<RenderBoundaryState> | null {
    // Remember which key failed; a different key means new input, so render the children again.
    if (!state.failed) return { failedKey: props.resetKey }
    if (!Object.is(state.failedKey, props.resetKey))
      return { failed: false, failedKey: props.resetKey }
    return null
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
