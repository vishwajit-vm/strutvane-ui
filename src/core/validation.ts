/**
 * Client-side validation derived from the manifest.
 *
 * A {@link FieldDescriptor} (required, enum values, and its JSON Schema keywords `minimum`,
 * `maximum`, `minLength`, `maxLength`, `pattern`) is turned into {@link ValidationIssue}s with stable
 * codes, rendered through the same message catalog the server uses.
 *
 * Client validation is a convenience (fast feedback); the server always re-validates. That is why
 * this module only supports the schema keywords the manifest emits, and why anything it cannot
 * interpret (an invalid `pattern`, an unknown type) is left to the server instead of guessed.
 *
 * @module
 */
import type { FieldDescriptor, IssueParam, JsonSchema, ValidationIssue } from '@strutvane/contracts'
import { formatMessage, type MessageCatalog } from './messages.ts'

/** Field types whose values are numbers. */
export const NUMERIC_TYPES: ReadonlySet<string> = new Set([
  'integer',
  'bigInteger',
  'decimal',
  'float',
  'money',
  'percent',
])

/** Numeric field types that only accept whole numbers. */
export const INTEGER_TYPES: ReadonlySet<string> = new Set(['integer', 'bigInteger'])

/**
 * Relation fields that have NO value of their own on the record (`hasMany`, `hasOne`,
 * `manyToMany`: the rows live on the other side). The API never returns a value for them, so they
 * are never list columns or form inputs; the detail page renders them as related lists instead.
 */
export const COLLECTION_RELATION_TYPES: ReadonlySet<string> = new Set([
  'hasMany',
  'hasOne',
  'manyToMany',
])

/** Field types whose values are dates or times (ordering is meaningful). */
export const TEMPORAL_TYPES: ReadonlySet<string> = new Set([
  'date',
  'datetime',
  'timestamp',
  'time',
])

/**
 * What a JSON field holds while its text does not parse (`{max: 5`). It is a distinct value, not
 * the raw string, because a string IS valid JSON: sending the text would silently store a string
 * where an object was meant. Validation refuses it (`invalid_json`), so it is never sent.
 */
export class InvalidJsonText {
  readonly text: string
  constructor(text: string) {
    this.text = text
  }
}

/** Is this value "empty" for the purpose of `required`? */
export function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  )
}

/** `YYYY-MM-DD` that is also a real calendar date (rejects `2026-02-30`). */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

function numberKeyword(schema: JsonSchema | undefined, key: string): number | undefined {
  const v = schema?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** Compile a schema `pattern`, or `undefined` if it is not a valid regular expression. */
function compilePattern(pattern: unknown): RegExp | undefined {
  if (typeof pattern !== 'string') return undefined
  try {
    return new RegExp(pattern, 'u')
  } catch {
    return undefined // the server validates; never crash the form on a bad pattern
  }
}

/**
 * Validate one scalar field value. Returns zero or more issues with `path: [field.name]`.
 * Array items are validated by {@link validateArrayItems}.
 */
export function validateField(
  field: FieldDescriptor,
  value: unknown,
  catalog: MessageCatalog,
  locale = 'en',
): ValidationIssue[] {
  const issue = (code: string, params: Record<string, IssueParam> = {}): ValidationIssue => ({
    path: [field.name],
    code,
    params,
    message: formatMessage(catalog, code, { attribute: field.label, ...params }, locale),
  })

  if (isEmptyValue(value)) return field.required ? [issue('required')] : []
  if (value instanceof InvalidJsonText) return [issue('invalid_json')]

  const issues: ValidationIssue[] = []
  const schema = field.schema

  if (field.type === 'enum' && field.enumValues && !field.enumValues.includes(String(value))) {
    issues.push(issue('invalid_enum', { values: field.enumValues.join(', ') }))
  }

  if (NUMERIC_TYPES.has(field.type)) {
    const n = typeof value === 'number' ? value : Number(value)
    if (typeof value === 'boolean' || !Number.isFinite(n)) return [issue('invalid_number')]
    if (INTEGER_TYPES.has(field.type) && !Number.isInteger(n)) return [issue('invalid_integer')]
    const min = numberKeyword(schema, 'minimum')
    const max = numberKeyword(schema, 'maximum')
    if (min !== undefined && n < min) issues.push(issue('too_small', { min }))
    if (max !== undefined && n > max) issues.push(issue('too_big', { max }))
  }

  if (field.type === 'date' && (typeof value !== 'string' || !isIsoDate(value))) {
    issues.push(issue('invalid_date'))
  }

  if (typeof value === 'string' && STRING_TYPES.has(field.type)) {
    const minLength = numberKeyword(schema, 'minLength')
    const maxLength = numberKeyword(schema, 'maxLength')
    // Count code points, like JSON Schema does (an emoji is one character, not two).
    const length = [...value].length
    if (minLength !== undefined && length < minLength)
      issues.push(issue('too_short', { min: minLength }))
    if (maxLength !== undefined && length > maxLength)
      issues.push(issue('too_long', { max: maxLength }))
    const pattern = compilePattern(schema?.['pattern'])
    if (pattern && !pattern.test(value)) issues.push(issue('invalid_format'))
  }
  return issues
}

const STRING_TYPES: ReadonlySet<string> = new Set([
  'string',
  'text',
  'email',
  'url',
  'phone',
  'slug',
  'markdown',
  'richText',
  'color',
])

/** The `items.properties` of an array field's JSON Schema (empty when absent or malformed). */
export function itemProperties(field: FieldDescriptor): Readonly<Record<string, JsonSchema>> {
  const items = field.schema?.['items']
  if (typeof items !== 'object' || items === null) return {}
  const props = (items as Record<string, unknown>)['properties']
  if (typeof props !== 'object' || props === null) return {}
  const out: Record<string, JsonSchema> = {}
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'object' && value !== null) out[key] = value as JsonSchema
  }
  return out
}

/** A synthetic {@link FieldDescriptor} for one property of an array item (validation + widgets). */
export function itemFieldDescriptor(
  parent: FieldDescriptor,
  prop: string,
  schema: JsonSchema,
): FieldDescriptor {
  const items = parent.schema?.['items'] as Record<string, unknown> | undefined
  const requiredList = Array.isArray(items?.['required']) ? (items['required'] as unknown[]) : []
  const required = requiredList.includes(prop)
  const jsonType = schema['type']
  const type = jsonType === 'number' ? 'decimal' : jsonType === 'integer' ? 'integer' : 'string'
  const title = schema['title']
  return {
    name: prop,
    type,
    label: typeof title === 'string' ? title : prop,
    required,
    nullable: !required,
    unique: false,
    readOnly: parent.readOnly,
    writeOnce: false,
    filterOperators: [],
    sortable: false,
    searchable: false,
    schema,
  }
}

/**
 * Validate the items of an `array` field whose JSON Schema describes object items. Issues get full
 * paths such as `['lines', 1, 'amount']`, exactly the shape the server returns, so client and server
 * errors flow through the same routing code.
 */
export function validateArrayItems(
  field: FieldDescriptor,
  value: unknown,
  catalog: MessageCatalog,
  locale = 'en',
): ValidationIssue[] {
  if (!Array.isArray(value)) return []
  const properties = itemProperties(field)
  const issues: ValidationIssue[] = []
  value.forEach((item: unknown, index) => {
    const row = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>
    for (const [prop, sub] of Object.entries(properties)) {
      const subField = itemFieldDescriptor(field, prop, sub)
      for (const i of validateField(subField, row[prop], catalog, locale)) {
        issues.push({ ...i, path: [field.name, index, prop] })
      }
    }
  })
  return issues
}
