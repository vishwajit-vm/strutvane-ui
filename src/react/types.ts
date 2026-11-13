/**
 * Types for the React renderer's extension points (L2 overrides, ADR-0014).
 *
 * @module
 */
import type { FieldDescriptor, ResourceDescriptor } from '@strutvane/contracts'
import type { ComponentType } from 'react'
import type { Registry, RegistryOverrides } from '../core/registry.ts'
import type { ApiRecord } from '../core/types.ts'

/**
 * Props every form widget receives. A widget renders ONLY the control: the label, help text and
 * error message are rendered once by {@link FieldShell}, which also computes `id` and `describedBy`.
 * A custom widget must put `id` on its focusable control and pass `describedBy` to
 * `aria-describedby`, and that is all it needs for full accessibility.
 */
export interface WidgetProps {
  readonly field: FieldDescriptor
  /** DOM id of the control; the shared label's `htmlFor` points here, focus moves here on error. */
  readonly id: string
  /** Form field name, e.g. `amount` or `lines[1].amount`. */
  readonly name: string
  readonly value: unknown
  readonly onChange: (value: unknown) => void
  readonly onBlur: () => void
  readonly readOnly: boolean
  readonly invalid: boolean
  /** Space-separated ids of the help text and error message (for `aria-describedby`). */
  readonly describedBy: string | undefined
}

/** Props every table cell receives. */
export interface CellProps {
  readonly field: FieldDescriptor
  readonly value: unknown
  readonly record: ApiRecord
  readonly resource: ResourceDescriptor
}

/** A form widget component. */
export type Widget = ComponentType<WidgetProps>

/** A table cell component. */
export type Cell = ComponentType<CellProps>

/** The React registry: widgets, cells and messages. */
export type UiRegistry = Registry<Widget, Cell>

/** Overrides accepted by `<StrutvaneProvider overrides={…}>`. */
export type UiOverrides = RegistryOverrides<Widget, Cell>
