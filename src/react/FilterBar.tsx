/**
 * `<FilterBar>`: add filter chips and remove them.
 *
 * Pick a filterable field, one of ITS allowed operators, and a value. The value goes through
 * `buildFilter` (the same function that parses URLs), so the UI can never send a filter the server
 * would reject. Active filters render as a labelled list of removable chips.
 *
 * @module
 */
import type {
  FieldDescriptor,
  FilterOperator,
  ResourceDescriptor,
} from '@strutvane/framework/contracts'
import { type FormEvent, type ReactElement, useId, useState } from 'react'
import { buildFilter, type SimpleFilter } from '../core/filter-builder.ts'
import type { MessageParams } from '../core/messages.ts'
import { useStrutvane } from './context.ts'

type Translate = (key: string, params?: MessageParams) => string

/** Human-readable chip text, e.g. "Status is any of draft, sent". */
export function describeFilter(
  f: SimpleFilter,
  field: FieldDescriptor | undefined,
  t: Translate,
): string {
  const attribute = field?.label ?? f.field
  const operator = t(`ui.op.${f.op}`)
  switch (f.op) {
    case 'isNull':
    case 'isNotNull':
      return t('ui.filter.chipNull', { attribute, operator })
    case 'in':
    case 'nin':
      return t('ui.filter.chip', { attribute, operator, value: f.values.join(', ') })
    case 'between':
      return t('ui.filter.chipBetween', { attribute, operator, from: f.from, to: f.to })
    default:
      return t('ui.filter.chip', { attribute, operator, value: String(f.value) })
  }
}

/** Split the value box into raw values for an operator (`in` takes a comma-separated list). */
export function rawFilterValues(op: FilterOperator, value: string, valueTo: string): string[] {
  if (op === 'isNull' || op === 'isNotNull') return ['true']
  if (op === 'between') return [value.trim(), valueTo.trim()]
  if (op === 'in' || op === 'nin') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v !== '')
  }
  // Text operators keep inner spaces; trimming the ends avoids accidental whitespace matches.
  return [value.trim()]
}

/** Props of {@link FilterBar}. */
export interface FilterBarProps {
  readonly resource: ResourceDescriptor
  readonly filters: readonly SimpleFilter[]
  readonly onAdd: (filter: SimpleFilter) => void
  readonly onRemove: (index: number) => void
}

/** Filter chips for one resource. Renders nothing when no field is filterable. */
export function FilterBar({
  resource,
  filters,
  onAdd,
  onRemove,
}: FilterBarProps): ReactElement | null {
  const { t } = useStrutvane()
  const filterable = resource.fields.filter((f) => f.filterOperators.length > 0)
  const ids = useId()
  const [fieldName, setFieldName] = useState(filterable[0]?.name ?? '')
  const field = filterable.find((f) => f.name === fieldName)
  const [op, setOp] = useState<FilterOperator | ''>(field?.filterOperators[0] ?? '')
  const [value, setValue] = useState('')
  const [valueTo, setValueTo] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (filterable.length === 0) return null

  const needsValue = op !== 'isNull' && op !== 'isNotNull' && op !== ''
  const isList = op === 'in' || op === 'nin'
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!field || op === '') return
    const built = buildFilter(field, op, rawFilterValues(op, value, valueTo))
    if (!built.ok) {
      setError(t('ui.filter.invalid', { attribute: field.label }))
      return
    }
    setError(null)
    setValue('')
    setValueTo('')
    onAdd(built.filter)
  }

  const describedBy = [isList ? `${ids}-help` : undefined, error ? `${ids}-error` : undefined]
    .filter((x) => x !== undefined)
    .join(' ')

  return (
    <div>
      <form
        aria-label={t('ui.filter.form', { resource: resource.pluralLabel })}
        onSubmit={submit}
        noValidate
      >
        <label htmlFor={`${ids}-field`}>{t('ui.filter.field')}</label>
        <select
          id={`${ids}-field`}
          value={fieldName}
          onChange={(e) => {
            const next = filterable.find((f) => f.name === e.target.value)
            setFieldName(e.target.value)
            setOp(next?.filterOperators[0] ?? '')
            setError(null)
          }}
        >
          {filterable.map((f) => (
            <option key={f.name} value={f.name}>
              {f.label}
            </option>
          ))}
        </select>
        <label htmlFor={`${ids}-op`}>{t('ui.filter.operator')}</label>
        <select
          id={`${ids}-op`}
          value={op}
          onChange={(e) => {
            const next = field?.filterOperators.find((o) => o === e.target.value)
            if (next) setOp(next)
          }}
        >
          {(field?.filterOperators ?? []).map((o) => (
            <option key={o} value={o}>
              {t(`ui.op.${o}`)}
            </option>
          ))}
        </select>
        {needsValue && (
          <>
            <label htmlFor={`${ids}-value`}>
              {op === 'between' ? t('ui.filter.from') : t('ui.filter.value')}
            </label>
            <input
              id={`${ids}-value`}
              value={value}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy || undefined}
              onChange={(e) => setValue(e.target.value)}
            />
            {isList && <p id={`${ids}-help`}>{t('ui.filter.valuesHelp')}</p>}
          </>
        )}
        {op === 'between' && (
          <>
            <label htmlFor={`${ids}-to`}>{t('ui.filter.to')}</label>
            <input
              id={`${ids}-to`}
              value={valueTo}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${ids}-error` : undefined}
              onChange={(e) => setValueTo(e.target.value)}
            />
          </>
        )}
        <button type="submit">{t('ui.filter.add')}</button>
        {error && (
          <p id={`${ids}-error`} role="alert">
            {error}
          </p>
        )}
      </form>
      {filters.length > 0 && (
        <ul aria-label={t('ui.filter.active')}>
          {filters.map((f, i) => {
            const text = describeFilter(
              f,
              resource.fields.find((x) => x.name === f.field),
              t,
            )
            return (
              <li key={`${f.field}-${f.op}`}>
                {text}{' '}
                <button
                  type="button"
                  aria-label={t('ui.filter.remove', { filter: text })}
                  onClick={() => onRemove(i)}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
