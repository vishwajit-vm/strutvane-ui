// Widget/cell resolution order (ADR-0014) and override merging, with plain values as components
// (the core registry is framework-free).
import { describe, expect, test } from 'vitest'
import { defaultMessages } from '../../src/core/messages.ts'
import {
  fieldKey,
  mergeRegistry,
  type Registry,
  RegistryError,
  resolveCell,
  resolveWidget,
} from '../../src/core/registry.ts'
import { field, invoiceResource } from '../fixtures/manifest.ts'

const base: Registry<string, string> = {
  widgets: { default: 'W:default', decimal: 'W:decimal', 'relation-picker': 'W:picker' },
  fieldWidgets: {},
  cells: { default: 'C:default', decimal: 'C:decimal' },
  fieldCells: {},
  messages: { custom: 'Base' },
}

const amount = field({ name: 'amount', type: 'decimal', label: 'Amount' })
const customer = field({
  name: 'customer',
  type: 'belongsTo',
  label: 'Customer',
  widget: 'relation-picker',
})
const notes = field({ name: 'notes', type: 'text', label: 'Notes' })

describe('resolveWidget: Resource.field → named → type → default', () => {
  test('each level', () => {
    const r = mergeRegistry(base, { fieldWidgets: { 'Invoice.amount': 'W:override' } })
    expect(resolveWidget(r, invoiceResource, amount)).toBe('W:override')
    expect(resolveWidget(base, invoiceResource, amount)).toBe('W:decimal')
    expect(resolveWidget(base, invoiceResource, customer)).toBe('W:picker')
    expect(resolveWidget(base, invoiceResource, notes)).toBe('W:default')
    expect(resolveWidget(base, invoiceResource, { ...notes, widget: 'unknown-widget' })).toBe(
      'W:default',
    )
  })

  test('prototype keys never resolve to Object.prototype members', () => {
    const proto = field({ name: 'x', type: 'constructor', label: 'X', widget: '__proto__' })
    expect(resolveWidget(base, invoiceResource, proto)).toBe('W:default')
    expect(resolveCell(base, invoiceResource, proto)).toBe('C:default')
  })

  test('a registry without default is a programming error with a clear message', () => {
    const broken: Registry<string, string> = { ...base, widgets: {}, cells: {} }
    expect(() => resolveWidget(broken, invoiceResource, notes)).toThrow(RegistryError)
    expect(() => resolveCell(broken, invoiceResource, notes)).toThrow(
      'The cell registry has no "default" entry.',
    )
  })
})

describe('resolveCell: Resource.field → type → default (no named widgets for cells)', () => {
  test('each level', () => {
    const r = mergeRegistry(base, { fieldCells: { 'Invoice.amount': 'C:override' } })
    expect(resolveCell(r, invoiceResource, amount)).toBe('C:override')
    expect(resolveCell(base, invoiceResource, amount)).toBe('C:decimal')
    expect(resolveCell(base, invoiceResource, customer)).toBe('C:default')
    expect(fieldKey(invoiceResource, amount)).toBe('Invoice.amount')
  })
})

describe('mergeRegistry', () => {
  test('overrides win, defaults stay, messages layer default ← base ← overrides', () => {
    const r = mergeRegistry(base, {
      widgets: { decimal: 'W:mine' },
      messages: { required: 'Needed.' },
    })
    expect(r.widgets).toEqual({ ...base.widgets, decimal: 'W:mine' })
    expect(r.messages['custom']).toBe('Base')
    expect(r.messages['required']).toBe('Needed.')
    expect(r.messages['too_small']).toBe(defaultMessages['too_small'])
    expect(mergeRegistry(base).cells).toEqual(base.cells)
  })
})
