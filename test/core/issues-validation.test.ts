// Issue routing (deepest rendered field → parent → banner) and client validation from the manifest.
import { describe, expect, test } from 'vitest'
import {
  candidateFieldNames,
  fieldDomId,
  firstInvalidField,
  issuePathToFieldName,
  routeIssues,
  uniqueMessages,
} from '../../src/core/issues.ts'
import { defaultMessages } from '../../src/core/messages.ts'
import {
  isEmptyValue,
  isIsoDate,
  itemFieldDescriptor,
  itemProperties,
  validateArrayItems,
  validateField,
} from '../../src/core/validation.ts'
import { field, invoiceResource } from '../fixtures/manifest.ts'

const f = (name: string) => {
  const found = invoiceResource.fields.find((x) => x.name === name)
  if (!found) throw new Error(`no field ${name}`)
  return found
}

describe('issue routing', () => {
  const rendered = new Set([
    'number',
    'amount',
    'lines',
    'lines[0].amount',
    'lines[1].amount',
    'address.city',
  ])

  test('paths become deep field names; every prefix is a candidate, deepest first', () => {
    expect(issuePathToFieldName(['lines', 1, 'amount'])).toBe('lines[1].amount')
    expect(issuePathToFieldName(['address', 'city'])).toBe('address.city')
    expect(issuePathToFieldName([0, 'x'])).toBe('[0].x')
    expect(issuePathToFieldName([])).toBe('')
    expect(candidateFieldNames(['lines', 1, 'amount'])).toEqual([
      'lines[1].amount',
      'lines[1]',
      'lines',
    ])
    expect(candidateFieldNames([])).toEqual([])
  })

  test('deepest rendered field wins; falls back to parents; unknown and [] become form errors', () => {
    const routed = routeIssues(
      [
        { path: ['lines', 1, 'amount'], code: 'too_small', message: 'm1' },
        { path: ['lines', 7, 'amount'], code: 'too_small', message: 'm2' },
        { path: ['number'], code: 'unique', message: 'm3' },
        { path: [], code: 'conflict', message: 'm4' },
        { path: ['nonexistent'], code: 'x', message: 'm5' },
        { path: ['address', 'city'], code: 'x', message: 'm6' },
        { path: ['address', 'zip'], code: 'x', message: 'm7' },
      ],
      rendered,
    )
    expect(Object.fromEntries(routed.fieldErrors)).toEqual({
      'lines[1].amount': ['m1'],
      lines: ['m2'],
      number: ['m3'],
      'address.city': ['m6'],
    })
    expect(routed.formErrors).toEqual(['m4', 'm5', 'm7'])
    expect(
      firstInvalidField(['number', 'amount', 'lines', 'lines[1].amount'], routed.fieldErrors),
    ).toBe('number')
    expect(firstInvalidField(['amount'], routed.fieldErrors)).toBeUndefined()
  })

  test('each message is kept once per target', () => {
    const routed = routeIssues(
      [
        { path: ['number'], code: 'a', message: 'same' },
        { path: ['number'], code: 'b', message: 'same' },
        { path: [], code: 'c', message: 'top' },
        { path: ['ghost'], code: 'c', message: 'top' },
      ],
      rendered,
    )
    expect(routed.fieldErrors.get('number')).toEqual(['same'])
    expect(routed.formErrors).toEqual(['top'])
    expect(uniqueMessages(['a', 'b', 'a'])).toEqual(['a', 'b'])
  })

  test('DOM ids are valid and scoped', () => {
    expect(fieldDomId('lines[1].amount')).toBe('sv-field-lines-1-amount')
    expect(fieldDomId('a', ':r1:')).toBe('sv-r1-field-a')
    expect(fieldDomId('lines[1]')).toBe('sv-field-lines-1')
  })
})

describe('validation (client) uses the shared catalog', () => {
  test('required, minimum, enum, pattern, maxLength, real calendar dates', () => {
    expect(validateField(f('amount'), null, defaultMessages)[0]?.message).toBe(
      'Amount is required.',
    )
    expect(validateField(f('amount'), -1, defaultMessages)[0]).toMatchObject({
      path: ['amount'],
      code: 'too_small',
      params: { min: 0 },
      message: 'Amount must be at least 0.',
    })
    expect(validateField(f('amount'), 'abc', defaultMessages)[0]?.code).toBe('invalid_number')
    expect(validateField(f('amount'), true, defaultMessages)[0]?.code).toBe('invalid_number')
    expect(validateField(f('amount'), '12.5', defaultMessages)).toEqual([])
    expect(validateField(f('status'), 'void', defaultMessages)[0]).toMatchObject({
      code: 'invalid_enum',
      message: 'Status must be one of: draft, sent, paid.',
    })
    expect(validateField(f('number'), 'X-1', defaultMessages)[0]?.code).toBe('invalid_format')
    expect(
      validateField(f('number'), `INV-${'1'.repeat(30)}`, defaultMessages).map((i) => i.code),
    ).toContain('too_long')
    expect(validateField(f('dueDate'), '2026-02-30', defaultMessages)[0]?.code).toBe('invalid_date')
    expect(validateField(f('dueDate'), 20261201, defaultMessages)[0]?.code).toBe('invalid_date')
    expect(validateField(f('notes'), null, defaultMessages)).toEqual([])
    expect(validateField(f('notes'), '   ', defaultMessages)).toEqual([])
  })

  test('integers, maximum, minLength, code-point lengths', () => {
    const qty = field({ name: 'qty', type: 'integer', label: 'Qty', schema: { maximum: 10 } })
    expect(validateField(qty, 2.5, defaultMessages)[0]?.code).toBe('invalid_integer')
    expect(validateField(qty, 11, defaultMessages)[0]?.message).toBe('Qty must be at most 10.')
    const name = field({
      name: 'name',
      type: 'string',
      label: 'Name',
      schema: { minLength: 2, maxLength: 2 },
    })
    expect(validateField(name, 'a', defaultMessages)[0]?.message).toBe(
      'Name must be at least 2 characters.',
    )
    expect(validateField(name, '😀😀', defaultMessages)).toEqual([]) // two characters, four UTF-16 units
  })

  test('schema keywords it cannot use are left to the server (never a crash)', () => {
    const bad = field({
      name: 'x',
      type: 'string',
      label: 'X',
      schema: { pattern: '([', minLength: 'two' },
    })
    expect(validateField(bad, 'anything', defaultMessages)).toEqual([])
    const custom = field({ name: 'y', type: 'geoPoint', label: 'Y' })
    expect(validateField(custom, { lat: 1 }, defaultMessages)).toEqual([])
  })

  test('the locale reaches plural rules', () => {
    const name = field({ name: 'n', type: 'string', label: 'N', schema: { minLength: 1000 } })
    expect(validateField(name, 'a', defaultMessages, 'en')[0]?.message).toBe(
      'N must be at least 1,000 characters.',
    )
  })

  test('array items get full paths like the server returns', () => {
    const issues = validateArrayItems(
      f('lines'),
      [{ description: 'ok', amount: 1 }, { description: '', amount: -5 }, null],
      defaultMessages,
    )
    expect(issues.map((i) => i.path)).toEqual([
      ['lines', 1, 'description'],
      ['lines', 1, 'amount'],
      ['lines', 2, 'description'],
    ])
    expect(validateArrayItems(f('lines'), 'not an array', defaultMessages)).toEqual([])
  })

  test('item descriptors come from the JSON Schema', () => {
    const props = itemProperties(f('lines'))
    expect(Object.keys(props)).toEqual(['description', 'amount'])
    expect(itemFieldDescriptor(f('lines'), 'amount', props['amount'] ?? {})).toMatchObject({
      name: 'amount',
      type: 'decimal',
      label: 'Line amount',
      required: false,
    })
    expect(
      itemFieldDescriptor(f('lines'), 'description', props['description'] ?? {}),
    ).toMatchObject({
      type: 'string',
      required: true,
    })
    expect(itemFieldDescriptor(f('lines'), 'n', { type: 'integer' })).toMatchObject({
      type: 'integer',
      label: 'n',
    })
    expect(itemProperties(field({ name: 'a', type: 'array', label: 'A' }))).toEqual({})
    expect(
      itemProperties(field({ name: 'a', type: 'array', label: 'A', schema: { items: 3 } })),
    ).toEqual({})
    expect(
      itemProperties(field({ name: 'a', type: 'array', label: 'A', schema: { items: {} } })),
    ).toEqual({})
    expect(
      itemProperties(
        field({
          name: 'a',
          type: 'array',
          label: 'A',
          schema: { items: { properties: { x: 1 } } },
        }),
      ),
    ).toEqual({})
  })

  test('helpers', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2024-02-29')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2026-1-1')).toBe(false)
    expect(isEmptyValue([])).toBe(true)
    expect(isEmptyValue(0)).toBe(false)
    expect(isEmptyValue(false)).toBe(false)
  })
})
