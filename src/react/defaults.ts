/**
 * The built-in registry: default widgets, cells and English messages, with no per-field overrides.
 *
 * @module
 */
import { defaultMessages } from '../core/messages.ts'
import { defaultCells } from './cells.tsx'
import type { UiRegistry } from './types.ts'
import { defaultWidgets } from './widgets.tsx'

/** The registry `<StrutvaneProvider>` uses unless you pass `base`. */
export const defaultRegistry: UiRegistry = Object.freeze({
  widgets: defaultWidgets,
  fieldWidgets: {},
  cells: defaultCells,
  fieldCells: {},
  messages: defaultMessages,
})
