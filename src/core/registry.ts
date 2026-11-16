/**
 * The renderer's extension point (customisation levels L1/L2, ADR-0014).
 *
 * Two registries decide how a field is drawn:
 * - **widgets** (form inputs): `Resource.field` → `field.widget` name → field type → `default`;
 * - **cells** (table cells): `Resource.field` → field type → `default`.
 *
 * The registry is generic over the component type, so this module stays framework-free: the React
 * renderer instantiates it with `ComponentType<WidgetProps>`, a future Vue renderer with its own
 * component type. Apps override entries through the provider; overrides are merged ON TOP of the
 * defaults, so an override never has to re-declare everything.
 *
 * @module
 */
import type { FieldDescriptor, ResourceDescriptor } from '@strutvane/framework/contracts'
import { defaultMessages, type MessageCatalog } from './messages.ts'

/** A component lookup table. */
export type ComponentMap<T> = Readonly<Record<string, T>>

/** Widgets and cells for one renderer, plus the message catalog. */
export interface Registry<W, C> {
  /** By widget name or field type (`decimal`, `relation-picker`, …). Must contain `default`. */
  readonly widgets: ComponentMap<W>
  /** Per field, keyed `Resource.field` (e.g. `Invoice.amount`). Highest priority. */
  readonly fieldWidgets: ComponentMap<W>
  /** By field type. Must contain `default`. */
  readonly cells: ComponentMap<C>
  /** Per column, keyed `Resource.field`. Highest priority. */
  readonly fieldCells: ComponentMap<C>
  /** Messages merged over {@link defaultMessages}. */
  readonly messages: MessageCatalog
}

/** Partial overrides for any part of a registry. */
export interface RegistryOverrides<W, C> {
  readonly widgets?: ComponentMap<W>
  readonly fieldWidgets?: ComponentMap<W>
  readonly cells?: ComponentMap<C>
  readonly fieldCells?: ComponentMap<C>
  readonly messages?: MessageCatalog
}

/** Thrown when a registry lacks a required `default` entry (a programming error, not user input). */
export class RegistryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RegistryError'
  }
}

/** The registry key for one field of one resource: `Invoice.amount`. */
export function fieldKey(
  resource: Pick<ResourceDescriptor, 'name'>,
  field: Pick<FieldDescriptor, 'name'>,
): string {
  return `${resource.name}.${field.name}`
}

/** Own-property lookup, so keys such as `constructor` or `__proto__` never hit the prototype. */
function own<T>(map: ComponentMap<T>, key: string | undefined): T | undefined {
  return key !== undefined && Object.hasOwn(map, key) ? map[key] : undefined
}

/** Pick the form widget for a field. */
export function resolveWidget<W, C>(
  registry: Registry<W, C>,
  resource: Pick<ResourceDescriptor, 'name'>,
  field: FieldDescriptor,
): W {
  const widget =
    own(registry.fieldWidgets, fieldKey(resource, field)) ??
    own(registry.widgets, field.widget) ??
    own(registry.widgets, field.type) ??
    own(registry.widgets, 'default')
  if (widget === undefined) throw new RegistryError('The widget registry has no "default" entry.')
  return widget
}

/** Pick the table cell for a field. */
export function resolveCell<W, C>(
  registry: Registry<W, C>,
  resource: Pick<ResourceDescriptor, 'name'>,
  field: FieldDescriptor,
): C {
  const cell =
    own(registry.fieldCells, fieldKey(resource, field)) ??
    own(registry.cells, field.type) ??
    own(registry.cells, 'default')
  if (cell === undefined) throw new RegistryError('The cell registry has no "default" entry.')
  return cell
}

/** Merge overrides on top of a base registry (shallow per map; overrides win). */
export function mergeRegistry<W, C>(
  base: Registry<W, C>,
  overrides: RegistryOverrides<W, C> = {},
): Registry<W, C> {
  return {
    widgets: { ...base.widgets, ...overrides.widgets },
    fieldWidgets: { ...base.fieldWidgets, ...overrides.fieldWidgets },
    cells: { ...base.cells, ...overrides.cells },
    fieldCells: { ...base.fieldCells, ...overrides.fieldCells },
    messages: { ...defaultMessages, ...base.messages, ...overrides.messages },
  }
}
