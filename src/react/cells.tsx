/**
 * Default table cells, keyed by field type (`default` is the required fallback). Cells are pure
 * presentational components; per-column overrides are registered as `Resource.field`. Numbers and
 * dates are formatted with `Intl` for the provider's locale.
 *
 * @module
 */
import { isIsoDate } from '../core/validation.ts'
import { useStrutvane } from './context.ts'
import { relationId, useRelationLabel } from './relations.ts'
import type { Cell } from './types.ts'

const isEmpty = (v: unknown) => v === null || v === undefined || v === ''

/** Plain text. Objects are never dumped raw: they show their `id` or the empty marker. */
export const DefaultCell: Cell = ({ value }) => {
  const { t } = useStrutvane()
  if (isEmpty(value)) return <>{t('ui.cell.empty')}</>
  if (typeof value === 'object') return <>{relationId(value) ?? t('ui.cell.empty')}</>
  return <>{String(value)}</>
}

/** Yes / No from the catalog. */
export const BooleanCell: Cell = ({ value }) => {
  const { t } = useStrutvane()
  return (
    <>
      {value === true ? t('ui.cell.yes') : value === false ? t('ui.cell.no') : t('ui.cell.empty')}
    </>
  )
}

function formatNumber(value: number, locale: string, options: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(locale, options).format(value)
  } catch {
    return String(value)
  }
}

/** Integers and floats, locale-formatted. */
export const NumberCell: Cell = ({ value }) => {
  const { t, locale } = useStrutvane()
  return <>{typeof value === 'number' ? formatNumber(value, locale, {}) : t('ui.cell.empty')}</>
}

/** Decimals and money: always two fraction digits. */
export const DecimalCell: Cell = ({ value }) => {
  const { t, locale } = useStrutvane()
  return (
    <>
      {typeof value === 'number'
        ? formatNumber(value, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : t('ui.cell.empty')}
    </>
  )
}

/** Dates (`YYYY-MM-DD`), shown in the locale's short format. Unparseable values are shown as-is. */
export const DateCell: Cell = ({ value }) => {
  const { t, locale } = useStrutvane()
  if (typeof value !== 'string' || value === '') return <>{t('ui.cell.empty')}</>
  if (!isIsoDate(value)) return <>{value}</>
  let text = value
  try {
    // A calendar date has no time zone: format it in UTC so it never shifts by a day.
    text = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
      new Date(`${value}T00:00:00Z`),
    )
  } catch {
    // keep the ISO text
  }
  return <time dateTime={value}>{text}</time>
}

/** belongsTo: the related record's title (batched lookup), falling back to the raw id. */
export const RelationCell: Cell = ({ field, value }) => {
  const { t } = useStrutvane()
  const label = useRelationLabel(field, value)
  const id = relationId(value)
  if (id === undefined) return <>{t('ui.cell.empty')}</>
  return <>{label ?? id}</>
}

/** Arrays: the number of items. */
export const ArrayCell: Cell = ({ value }) => {
  const { t, locale } = useStrutvane()
  return <>{Array.isArray(value) ? formatNumber(value.length, locale, {}) : t('ui.cell.empty')}</>
}

/** Default cell map. */
export const defaultCells: Readonly<Record<string, Cell>> = Object.freeze({
  default: DefaultCell,
  boolean: BooleanCell,
  integer: NumberCell,
  bigInteger: NumberCell,
  float: NumberCell,
  decimal: DecimalCell,
  money: DecimalCell,
  date: DateCell,
  belongsTo: RelationCell,
  array: ArrayCell,
})
