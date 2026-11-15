/**
 * `<FieldShell>`: label + widget + help + error, wired for accessibility ONCE (ADR-0014).
 *
 * Every field, every array-item field and every override goes through it, so a custom widget gets
 * correct labelling, `aria-invalid`, `aria-describedby` (help + error) and focus targeting for free.
 * Each message is shown once: TanStack Form keeps one error slot per trigger (blur, submit, server)
 * and the same message can sit in several (spike 08 defect).
 *
 * @module
 */
import type { FieldDescriptor } from '@strutvane/contracts'
import { type ReactElement, useContext } from 'react'
import { fieldDomId, uniqueMessages } from '../core/issues.ts'
import { defaultMessages, formatMessage } from '../core/messages.ts'
import { StrutvaneContext } from './context.ts'
import { RenderBoundary } from './RenderBoundary.tsx'
import type { Widget } from './types.ts'

/** Props of {@link FieldShell}. */
export interface FieldShellProps {
  /** Form field name (`amount`, `lines[1].amount`); also the source of the DOM id. */
  readonly name: string
  readonly field: FieldDescriptor
  readonly widget: Widget
  readonly value: unknown
  /** Error messages from any source; non-strings and empties are ignored, duplicates shown once. */
  readonly errors: readonly unknown[]
  readonly readOnly: boolean
  readonly onChange: (value: unknown) => void
  readonly onBlur: () => void
  /** Scope for DOM ids when several forms share a page. */
  readonly idScope?: string
}

/** Collect displayable error strings, each once, in order. */
export function errorMessages(errors: readonly unknown[]): string[] {
  return uniqueMessages(errors.filter((e): e is string => typeof e === 'string' && e !== ''))
}

/** Label, control, help text and error message for one field. */
export function FieldShell({
  name,
  field,
  widget: WidgetComponent,
  value,
  errors,
  readOnly,
  onChange,
  onBlur,
  idScope = '',
}: FieldShellProps): ReactElement {
  const id = fieldDomId(name, idScope)
  // Works inside or outside a provider: custom forms may render FieldShell on their own.
  const ctx = useContext(StrutvaneContext)
  const widgetError = ctx
    ? ctx.t('ui.form.widgetError')
    : formatMessage(defaultMessages, 'ui.form.widgetError')
  const messages = errorMessages(errors)
  const helpId = field.help ? `${id}-help` : undefined
  const errorId = messages.length > 0 ? `${id}-error` : undefined
  const describedBy = [helpId, errorId].filter((x) => x !== undefined).join(' ') || undefined
  return (
    <div data-sv-field={name}>
      <label htmlFor={id}>
        {field.label}
        {field.required && !readOnly && <span aria-hidden="true"> *</span>}
      </label>
      {/* A crashing widget (an override, an unknown field type) must not take the form down: the
          field shows a notice and every other field can still be edited and saved. */}
      <RenderBoundary fallback={<p id={id}>{widgetError}</p>}>
        <WidgetComponent
          field={field}
          id={id}
          name={name}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          readOnly={readOnly}
          invalid={messages.length > 0}
          describedBy={describedBy}
        />
      </RenderBoundary>
      {field.help && <p id={helpId}>{field.help}</p>}
      {errorId && <p id={errorId}>{messages.join(' ')}</p>}
    </div>
  )
}
