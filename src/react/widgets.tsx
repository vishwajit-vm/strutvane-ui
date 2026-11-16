/**
 * Default form widgets, one per field type (docs/08 §3.1).
 *
 * Each widget renders ONLY its control; {@link FieldShell} renders the label, help and error once
 * for every widget (including overrides). Controls are native elements drawn by the design's skins
 * (`Input`, `Select`, `Textarea`, `Checkbox`), so they stay accessible by default and look like the
 * design in use. Apps replace any widget through the registry.
 *
 * @module
 */
import { type ChangeEvent, useId, useState } from 'react'
import { INTEGER_TYPES, InvalidJsonText } from '../core/validation.ts'
import { useStrutvane } from './context.ts'
import { useSkins } from './design-hooks.ts'
import { relationId, useDebouncedValue, useRelationLabel, useRelationOptions } from './relations.ts'
import type { Widget, WidgetProps } from './types.ts'

/** Attributes every control shares. */
function common(p: WidgetProps) {
  return {
    id: p.id,
    name: p.name,
    onBlur: p.onBlur,
    'aria-invalid': p.invalid || undefined,
    'aria-describedby': p.describedBy,
    'aria-required': (p.field.required && !p.readOnly) || undefined,
  } as const
}

const asString = (v: unknown): string =>
  v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)

const INPUT_TYPES: Readonly<Record<string, string>> = {
  email: 'email',
  url: 'url',
  phone: 'tel',
  color: 'color',
}

/** Single-line text (string, slug, email, url, phone…). Empty input becomes `null`. */
export const TextWidget: Widget = (p) => {
  const { Input } = useSkins()
  return (
    <Input
      {...common(p)}
      type={INPUT_TYPES[p.field.type] ?? 'text'}
      value={asString(p.value)}
      readOnly={p.readOnly}
      onChange={(e: ChangeEvent<HTMLInputElement>) =>
        p.onChange(e.target.value === '' ? null : e.target.value)
      }
    />
  )
}

/** Multi-line text. */
export const TextareaWidget: Widget = (p) => {
  const { Textarea } = useSkins()
  return (
    <Textarea
      {...common(p)}
      value={asString(p.value)}
      readOnly={p.readOnly}
      rows={3}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
        p.onChange(e.target.value === '' ? null : e.target.value)
      }
    />
  )
}

/** The locale's decimal separator (`.` in `en`, `,` in `de`). */
function decimalSeparator(locale: string): string {
  try {
    return (
      new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === 'decimal')
        ?.value ?? '.'
    )
  } catch {
    return '.'
  }
}

/** A number as a person types it, with `.` as separator. A trailing `.` (`1250.`) still counts. */
const TYPED_NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i

/**
 * Parse what a person typed into the form value: a finite number, `null` for empty input, or the
 * raw text when it is not (yet) a number, so validation can say "must be a number" instead of
 * silently dropping input. The locale's decimal separator is accepted.
 */
export function parseTypedNumber(raw: string, locale = 'en'): number | string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const sep = decimalSeparator(locale)
  const normalized = sep === '.' ? trimmed : trimmed.replace(sep, '.')
  if (!TYPED_NUMBER.test(normalized)) return raw
  const n = Number(normalized)
  return Number.isFinite(n) ? n : raw
}

/**
 * What a person typed, as the exact decimal text an API expects (`"1250.50"`): the locale's
 * separator becomes `.`, a leading `+` and a trailing `.` are dropped, digits are kept as typed
 * (no float rounding). Exponents (`1e5`) are expanded through Number, the only lossy case.
 */
export function numericText(raw: string, locale = 'en'): string {
  const sep = decimalSeparator(locale)
  let text = (sep === '.' ? raw.trim() : raw.trim().replace(sep, '.')).replace(/^\+/, '')
  if (/e/i.test(text)) return String(Number(text))
  if (text.startsWith('.')) text = `0${text}`
  if (text.startsWith('-.')) text = `-0${text.slice(1)}`
  return text.endsWith('.') ? text.slice(0, -1) : text
}

/**
 * Numbers (integer, decimal, money, percent…). The input shows the person's DRAFT text, not the
 * parsed value: re-rendering the parsed value on every keystroke would turn `1250.` into `1250` and
 * swallow the decimal point (spike 08 defect). The draft only resyncs when the form value changes
 * from outside (reset, record loaded) to something the draft does not already represent.
 */
export const NumberWidget: Widget = (p) => {
  const { locale } = useStrutvane()
  const { Input } = useSkins()
  // Decimals and big integers travel as strings (the field's schema says `type: "string"`) so no
  // precision is lost: send those as canonical text, everything else as a number.
  const asText = p.field.schema?.['type'] === 'string'
  const toValue = (raw: string): number | string | null => {
    const parsed = parseTypedNumber(raw, locale)
    return asText && typeof parsed === 'number' ? numericText(raw, locale) : parsed
  }
  const [draft, setDraft] = useState(() => asString(p.value))
  const [seen, setSeen] = useState<unknown>(p.value)
  if (!Object.is(seen, p.value)) {
    // Derived-state pattern: adjust during render instead of in an effect (no flash, no loop).
    setSeen(p.value)
    if (!Object.is(toValue(draft), p.value)) setDraft(asString(p.value))
  }
  return (
    <Input
      {...common(p)}
      type="text"
      inputMode={INTEGER_TYPES.has(p.field.type) ? 'numeric' : 'decimal'}
      autoComplete="off"
      value={draft}
      readOnly={p.readOnly}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value
        const value = toValue(raw)
        setDraft(raw)
        setSeen(value)
        p.onChange(value)
      }}
    />
  )
}

/** The JSON text a value is edited as (`null` and `undefined` are an empty box). */
const jsonText = (v: unknown): string =>
  v === null || v === undefined || v instanceof InvalidJsonText ? '' : JSON.stringify(v, null, 2)

/**
 * JSON fields (`type: "json"`): a textarea holding JSON text, parsed into the form value. The value
 * sent is the parsed JSON (an object, array, number…), never the text itself: sending the text
 * would silently store a JSON *string* in place of the object, which the server accepts. Text that
 * does not parse becomes an {@link InvalidJsonText}, which validation refuses ("must be valid
 * JSON"), so nothing is sent until it is fixed. Like the number widget, the draft text is kept
 * while typing and only resyncs when the value changes from outside.
 */
export const JsonWidget: Widget = (p) => {
  const { Textarea } = useSkins()
  const [draft, setDraft] = useState(() =>
    p.value instanceof InvalidJsonText ? p.value.text : jsonText(p.value),
  )
  const [seen, setSeen] = useState<unknown>(p.value)
  const toValue = (raw: string): unknown => {
    if (raw.trim() === '') return null
    try {
      return JSON.parse(raw) as unknown
    } catch {
      return new InvalidJsonText(raw)
    }
  }
  if (!Object.is(seen, p.value)) {
    setSeen(p.value)
    if (!(p.value instanceof InvalidJsonText) && !sameJson(toValue(draft), p.value))
      setDraft(jsonText(p.value))
  }
  return (
    <Textarea
      {...common(p)}
      value={draft}
      readOnly={p.readOnly}
      rows={6}
      spellCheck={false}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
        const raw = e.target.value
        const value = toValue(raw)
        setDraft(raw)
        setSeen(value)
        p.onChange(value)
      }}
    />
  )
}

const sameJson = (a: unknown, b: unknown): boolean =>
  !(a instanceof InvalidJsonText) && JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Enum: a native select with an empty choice. */
export const SelectWidget: Widget = (p) => {
  const { t } = useStrutvane()
  const { Select } = useSkins()
  return (
    <Select
      {...common(p)}
      value={asString(p.value)}
      disabled={p.readOnly}
      onChange={(e: ChangeEvent<HTMLSelectElement>) =>
        p.onChange(e.target.value === '' ? null : e.target.value)
      }
    >
      <option value="">{t('ui.form.select')}</option>
      {(p.field.enumValues ?? []).map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </Select>
  )
}

/** Boolean: a checkbox. */
export const CheckboxWidget: Widget = (p) => {
  const { Checkbox } = useSkins()
  return (
    <Checkbox
      {...common(p)}
      checked={p.value === true}
      disabled={p.readOnly}
      onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(e.target.checked)}
    />
  )
}

/** Date (`YYYY-MM-DD`): the native date input. */
export const DateWidget: Widget = (p) => {
  const { Input } = useSkins()
  return (
    <Input
      {...common(p)}
      type="date"
      value={asString(p.value)}
      readOnly={p.readOnly}
      onChange={(e: ChangeEvent<HTMLInputElement>) =>
        p.onChange(e.target.value === '' ? null : e.target.value)
      }
    />
  )
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** An ISO instant as the `datetime-local` text for the viewer's time zone; `''` if not an instant. */
export function toLocalInput(value: unknown): string {
  if (typeof value !== 'string' || value === '') return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const date = `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const seconds = d.getSeconds() !== 0 || d.getMilliseconds() !== 0 ? `:${pad(d.getSeconds())}` : ''
  return `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}${seconds}`
}

/** `datetime-local` text (the viewer's wall clock) as an ISO instant in UTC; `null` when empty. */
export function fromLocalInput(raw: string): string | null {
  if (raw === '') return null
  const d = new Date(raw) // no offset in the text: the browser reads it in the local time zone
  return Number.isNaN(d.getTime()) ? raw : d.toISOString()
}

/**
 * Datetimes: the native `datetime-local` input, shown in the viewer's time zone and sent as an
 * ISO-8601 instant in UTC (`2026-11-14T08:30:00.000Z`), the format the API requires. Without the
 * conversion the input would show (and send back) the server's UTC wall clock as if it were local.
 */
export const DateTimeWidget: Widget = (p) => {
  const { Input } = useSkins()
  return (
    <Input
      {...common(p)}
      type="datetime-local"
      step={1}
      value={toLocalInput(p.value)}
      readOnly={p.readOnly}
      onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(fromLocalInput(e.target.value))}
    />
  )
}

/** Read-only display of any value (computed fields, or any field an app wants shown, not edited). */
export const ReadOnlyWidget: Widget = (p) => {
  const { Input } = useSkins()
  return <Input {...common(p)} type="text" value={asString(p.value)} readOnly onChange={() => {}} />
}

/**
 * belongsTo: a searchable, paginated picker.
 *
 * A native select (accessible, keyboard-friendly) holds the loaded options; a search box above it
 * filters on the server (debounced), and "Load more" fetches the next page of 100, so every record
 * of a large target is reachable. The currently selected record is always present as an option,
 * even when it is not in the loaded pages (its title is fetched by id).
 */
export const RelationPickerWidget: Widget = (p) => {
  const { t } = useStrutvane()
  const { Input, Select, Button } = useSkins()
  const searchId = useId()
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 250)
  const relation = useRelationOptions(p.field, debounced)
  const selectedId = relationId(p.value)
  const selectedLabel = useRelationLabel(p.field, p.value)
  const options =
    selectedId !== undefined && !relation.options.some((o) => o.value === selectedId)
      ? [{ value: selectedId, label: selectedLabel ?? selectedId }, ...relation.options]
      : relation.options
  const targetLabel = relation.target?.pluralLabel ?? p.field.label
  return (
    <div>
      {relation.searchable && !p.readOnly && (
        <Input
          id={searchId}
          type="search"
          aria-label={t('ui.form.searchRelation', { resource: targetLabel })}
          aria-controls={p.id}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <Select
        {...common(p)}
        value={selectedId ?? ''}
        disabled={p.readOnly}
        aria-busy={relation.isLoading || undefined}
        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
          p.onChange(e.target.value === '' ? null : e.target.value)
        }
      >
        <option value="">
          {relation.isLoading ? t('ui.form.relationLoading') : t('ui.form.select')}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {relation.hasMore && !p.readOnly && (
        <Button size="sm" onClick={relation.loadMore} disabled={relation.isLoadingMore}>
          {relation.isLoadingMore ? t('ui.form.relationLoading') : t('ui.form.loadMore')}
        </Button>
      )}
    </div>
  )
}

/** Default widget map, keyed by field type or widget name. `default` is the required fallback. */
export const defaultWidgets: Readonly<Record<string, Widget>> = Object.freeze({
  default: TextWidget,
  string: TextWidget,
  slug: TextWidget,
  email: TextWidget,
  url: TextWidget,
  phone: TextWidget,
  color: TextWidget,
  text: TextareaWidget,
  textarea: TextareaWidget,
  markdown: TextareaWidget,
  richText: TextareaWidget,
  integer: NumberWidget,
  bigInteger: NumberWidget,
  decimal: NumberWidget,
  float: NumberWidget,
  money: NumberWidget,
  percent: NumberWidget,
  number: NumberWidget,
  enum: SelectWidget,
  boolean: CheckboxWidget,
  date: DateWidget,
  datetime: DateTimeWidget,
  timestamp: DateTimeWidget,
  json: JsonWidget,
  computed: ReadOnlyWidget,
  readonly: ReadOnlyWidget,
  belongsTo: RelationPickerWidget,
  'relation-picker': RelationPickerWidget,
})
