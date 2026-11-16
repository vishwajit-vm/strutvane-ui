/**
 * `<ResourceForm>`: the create / edit form for one resource, built from its descriptor with
 * TanStack Form (which owns values and validators, ADR-0014).
 *
 * Flow (RFC-0003 §4):
 * 1. **Client validation** from the manifest runs on blur and on submit with the shared message
 *    catalog. If anything is invalid nothing is sent and focus moves to the first invalid field.
 * 2. **Server 422 issues** are routed to the deepest rendered field (`routeIssues`), including array
 *    items such as `lines[1].amount`, then to the parent field, then to the form banner, so no
 *    message is ever dropped. Focus moves to the first invalid field, else to the banner.
 * 3. **Any other problem** (401, 403, 404, 409, 429, 5xx, offline, malformed response) shows a
 *    banner (`role="alert"`, focused) built from the catalog, never raw internals, and every typed
 *    value is kept.
 * 4. **Editing** a field clears its server error immediately (the message is now stale).
 * 5. **One submission at a time**: a submit while the previous one is in flight is ignored.
 * 6. **Retries are idempotent**: one `Idempotency-Key` per user action, reused while the outcome is
 *    unknown (network error, 5xx, 429), replaced after success or a definitive 4xx answer.
 *
 * Read-only rules: `readOnly` fields are hidden on create and shown read-only on edit; `writeOnce`
 * fields are editable on create and read-only on edit. Read-only values are never submitted, and
 * edit mode sends only the fields that changed (a partial `PATCH`).
 *
 * @module
 */
import type {
  FieldDescriptor,
  Problem,
  ResourceDescriptor,
  ValidationIssue,
} from '@strutvane/framework/contracts'
import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type ComponentType,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createIdempotencyKey } from '../core/ids.ts'
import { fieldDomId, firstInvalidField, routeIssues, uniqueMessages } from '../core/issues.ts'
import {
  isApiProblemError,
  NETWORK_ERROR_CODE,
  problemBannerText,
  problemIssues,
} from '../core/problems.ts'
import { resolveWidget } from '../core/registry.ts'
import type { ApiRecord } from '../core/types.ts'
import {
  COLLECTION_RELATION_TYPES,
  itemFieldDescriptor,
  itemProperties,
  validateField,
} from '../core/validation.ts'
import { useStrutvane } from './context.ts'
import { errorMessages, FieldShell } from './FieldShell.tsx'

type Values = Record<string, unknown>
type Mode = 'create' | 'edit'

// ─── The slice of TanStack Form this component uses ──────────────────────────────────────────────
// Field names are dynamic (they come from the manifest), so TanStack's static deep-key types cannot
// check them (ADR-0014 "costs"). Instead of `any`, the form is viewed through this structural type,
// cast once where it is created.

interface FieldMetaLike {
  readonly errors: readonly unknown[]
  readonly errorMap: Readonly<Record<string, unknown>>
}
interface FieldApiLike {
  readonly state: { readonly value: unknown; readonly meta: FieldMetaLike }
  handleChange(value: unknown): void
  handleBlur(): void
  setMeta(updater: (prev: FieldMetaLike) => FieldMetaLike): void
  pushValue(value: unknown): void
  removeValue(index: number): void
}
type FieldValidator = (props: { readonly value: unknown }) => string | undefined
interface FormFieldProps {
  readonly name: string
  readonly mode?: 'array'
  readonly validators?: { readonly onBlur?: FieldValidator; readonly onSubmit?: FieldValidator }
  readonly children: (field: FieldApiLike) => ReactNode
}
interface FormLike {
  readonly Field: ComponentType<FormFieldProps>
  readonly Subscribe: ComponentType<{
    readonly selector: (state: { readonly isSubmitting: boolean }) => boolean
    readonly children: (value: boolean) => ReactNode
  }>
  readonly state: { readonly values: Values }
  getFieldMeta(name: string): FieldMetaLike | undefined
  setFieldMeta(name: string, updater: (prev: FieldMetaLike) => FieldMetaLike): void
  handleSubmit(): Promise<void>
}

const withServerError =
  (message: string | undefined) =>
  (prev: FieldMetaLike): FieldMetaLike => ({
    ...prev,
    errorMap: { ...prev.errorMap, onServer: message },
  })

// ─── Pure helpers (exported for tests and custom forms) ─────────────────────────────────────────

/** A rendered field and whether it is editable in this mode. */
export interface FormField {
  readonly field: FieldDescriptor
  readonly readOnly: boolean
}

/** Fields the form renders, and whether each is editable, for a given mode. */
export function formFields(resource: ResourceDescriptor, mode: Mode): FormField[] {
  return resource.fields
    .filter(
      (f) =>
        f.type !== 'id' &&
        f.type !== 'password' &&
        !COLLECTION_RELATION_TYPES.has(f.type) &&
        !(mode === 'create' && f.readOnly),
    )
    .map((f) => ({ field: f, readOnly: f.readOnly || (mode === 'edit' && f.writeOnce) }))
}

/** The value of an untouched field. */
export function emptyValue(field: FieldDescriptor): unknown {
  if (field.type === 'array') return []
  if (field.type === 'boolean') return false
  return null
}

/** Field names in visual order, expanding array items (`lines`, `lines[0].description`, …). */
export function orderedFieldNames(fields: readonly FieldDescriptor[], values: Values): string[] {
  const names: string[] = []
  for (const f of fields) {
    names.push(f.name)
    if (f.type === 'array') {
      const items = Array.isArray(values[f.name]) ? (values[f.name] as unknown[]) : []
      const props = Object.keys(itemProperties(f))
      items.forEach((_, i) => {
        for (const p of props) names.push(`${f.name}[${i}].${p}`)
      })
    }
  }
  return names
}

/** Same value? (Structural, for plain JSON values: decides which fields an edit changed.) */
function sameValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * May the same idempotency key be reused for a retry? Only while the outcome is unknown: no answer
 * (network), a server error, or rate limiting. A definitive 4xx answer means the next submit is a
 * NEW request (with new values), so it gets a new key.
 */
export function keepIdempotencyKey(problem: Problem): boolean {
  return problem.code === NETWORK_ERROR_CODE || problem.status >= 500 || problem.status === 429
}

// ─── Component ───────────────────────────────────────────────────────────────────────────────────

/** Props of {@link ResourceForm}. */
export interface ResourceFormProps {
  readonly resource: ResourceDescriptor
  /** Present = edit mode. */
  readonly recordId?: string
  readonly onSaved?: (record: ApiRecord) => void
  readonly onCancel?: () => void
}

/** Create / edit form for one resource. Renders nothing the actor is not allowed to do. */
export function ResourceForm(props: ResourceFormProps): ReactElement | null {
  const { api, registry, t, locale } = useStrutvane()
  const { resource, recordId } = props
  const allowed =
    recordId === undefined ? resource.capabilities.create : resource.capabilities.update
  const record = useQuery({
    queryKey: ['strutvane', 'record', resource.path, recordId],
    enabled: recordId !== undefined && allowed,
    queryFn: ({ signal }) => api.get(resource.path, recordId ?? '', signal),
  })
  if (!allowed) return null
  if (recordId !== undefined) {
    if (record.isLoading)
      return <p role="status">{t('ui.form.loading', { resource: resource.label.toLowerCase() })}</p>
    if (record.error || !record.data) {
      const text = isApiProblemError(record.error)
        ? problemBannerText(record.error.problem, registry.messages, locale)
        : t('ui.form.loadFailed')
      return <p role="alert">{text}</p>
    }
  }
  return <ResourceFormInner {...props} initial={record.data} />
}

type FocusTarget = { readonly kind: 'field'; readonly name: string } | { readonly kind: 'banner' }

function ResourceFormInner({
  resource,
  recordId,
  onSaved,
  onCancel,
  initial,
}: ResourceFormProps & { readonly initial: ApiRecord | undefined }): ReactElement {
  const { api, registry, t, locale } = useStrutvane()
  const queryClient = useQueryClient()
  const ids = useId()
  const mode: Mode = recordId === undefined ? 'create' : 'edit'
  const fields = useMemo(() => formFields(resource, mode), [resource, mode])
  const descriptors = useMemo(() => fields.map((f) => f.field), [fields])
  const [banner, setBanner] = useState<readonly string[]>([])
  const bannerRef = useRef<HTMLDivElement>(null)
  const idempotencyKey = useRef<string | undefined>(undefined)
  const serverErrorFields = useRef(new Set<string>())
  // One submission at a time. The disabled button is not enough: Enter in a field, a double click
  // before React re-renders, or a script can submit again while the first request is in flight,
  // and the API does not deduplicate Idempotency-Key, so each extra submit would be another record.
  const submitting = useRef(false)

  // Focus must move AFTER React rendered the error state (the banner may not exist yet, and screen
  // readers should hear the message), so it is requested through state and applied in an effect.
  const [focusRequest, setFocusRequest] = useState<{
    readonly target: FocusTarget
    readonly n: number
  } | null>(null)
  const requestFocus = (target: FocusTarget) =>
    setFocusRequest((prev) => ({ target, n: (prev?.n ?? 0) + 1 }))
  useEffect(() => {
    if (!focusRequest) return
    const { target } = focusRequest
    if (target.kind === 'banner') bannerRef.current?.focus()
    else document.getElementById(fieldDomId(target.name, ids))?.focus()
  }, [focusRequest, ids])

  const defaultValues = useMemo<Values>(() => {
    const v: Values = {}
    for (const { field } of fields) v[field.name] = initial?.[field.name] ?? emptyValue(field)
    return v
  }, [fields, initial])

  const validator =
    (field: FieldDescriptor): FieldValidator =>
    ({ value }) =>
      validateField(field, value, registry.messages, locale)[0]?.message

  const showBanner = (messages: readonly string[]) => {
    setBanner(uniqueMessages(messages))
    requestFocus({ kind: 'banner' })
  }

  /** Route 422 issues onto rendered fields, then focus the first invalid field (or the banner). */
  const applyServerIssues = (issues: readonly ValidationIssue[], values: Values) => {
    const names = orderedFieldNames(descriptors, values)
    const routed = routeIssues(issues, new Set(names))
    for (const [name, messages] of routed.fieldErrors) {
      form.setFieldMeta(name, withServerError(messages.join(' ')))
      serverErrorFields.current.add(name)
    }
    setBanner(routed.formErrors)
    const first = firstInvalidField(names, routed.fieldErrors)
    if (first) requestFocus({ kind: 'field', name: first })
    else if (routed.formErrors.length > 0) requestFocus({ kind: 'banner' })
  }

  const submit = async (value: Values) => {
    setBanner([])
    const payload: Values = {}
    for (const { field, readOnly } of fields) {
      if (readOnly) continue
      if (mode === 'edit' && sameValue(value[field.name], defaultValues[field.name])) continue
      payload[field.name] = value[field.name]
    }
    idempotencyKey.current ??= createIdempotencyKey()
    const options = { idempotencyKey: idempotencyKey.current }
    try {
      const saved =
        mode === 'create'
          ? await api.create(resource.path, payload, options)
          : await api.update(resource.path, recordId ?? '', payload, options)
      idempotencyKey.current = undefined
      queryClient.setQueryData(['strutvane', 'record', resource.path, saved.id], saved)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['strutvane', 'list', resource.path] }),
        queryClient.invalidateQueries({ queryKey: ['strutvane', 'relation-label', resource.path] }),
        queryClient.invalidateQueries({
          queryKey: ['strutvane', 'relation-options', resource.path],
        }),
      ])
      onSaved?.(saved)
    } catch (error) {
      if (!isApiProblemError(error)) {
        // Not a problem we understand: the outcome is unknown, so keep the key for the retry.
        showBanner([t('ui.form.unexpected')])
        return
      }
      const problem = error.problem
      if (!keepIdempotencyKey(problem)) idempotencyKey.current = undefined
      const issues = problemIssues(problem)
      if (problem.status === 422 && issues.length > 0) applyServerIssues(issues, value)
      else showBanner([problemBannerText(problem, registry.messages, locale)])
    }
  }

  const form = useForm({
    defaultValues,
    onSubmitInvalid: () => {
      const names = orderedFieldNames(descriptors, form.state.values)
      const errors = new Map(
        names.map((n) => [n, errorMessages(form.getFieldMeta(n)?.errors ?? [])]),
      )
      const first = firstInvalidField(names, errors)
      if (first) requestFocus({ kind: 'field', name: first })
    },
    onSubmit: ({ value }) => submit(value),
  }) as unknown as FormLike

  /** Server errors are stale once the user submits again; clear them so validation can pass. */
  const clearServerErrors = () => {
    for (const name of serverErrorFields.current)
      form.setFieldMeta(name, withServerError(undefined))
    serverErrorFields.current.clear()
  }

  const renderField = (field: FieldDescriptor, name: string, readOnly: boolean) => (
    <form.Field
      key={name}
      name={name}
      validators={{ onBlur: validator(field), onSubmit: validator(field) }}
    >
      {(f) => (
        <FieldShell
          name={name}
          idScope={ids}
          field={field}
          widget={resolveWidget(registry, resource, field)}
          value={f.state.value}
          errors={f.state.meta.errors}
          readOnly={readOnly}
          onBlur={f.handleBlur}
          onChange={(v) => {
            f.handleChange(v)
            if (f.state.meta.errorMap['onServer'] !== undefined) {
              f.setMeta(withServerError(undefined))
              serverErrorFields.current.delete(name)
            }
          }}
        />
      )}
    </form.Field>
  )

  const resourceText = resource.label.toLowerCase()
  return (
    <form
      aria-labelledby={`${ids}-title`}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (submitting.current) return
        submitting.current = true
        clearServerErrors()
        void form.handleSubmit().finally(() => {
          submitting.current = false
        })
      }}
    >
      <h2 id={`${ids}-title`}>
        {mode === 'create'
          ? t('ui.form.create', { resource: resourceText })
          : t('ui.form.edit', { resource: resourceText })}
      </h2>

      {banner.length > 0 && (
        <div ref={bannerRef} role="alert" tabIndex={-1}>
          {banner.map((m) => (
            <p key={m}>{m}</p>
          ))}
        </div>
      )}

      {fields.map(({ field, readOnly }) =>
        field.type === 'array' && Object.keys(itemProperties(field)).length > 0 ? (
          <ArrayFieldEditor
            key={field.name}
            form={form}
            field={field}
            readOnly={readOnly}
            idScope={ids}
            validator={validator(field)}
            renderField={renderField}
          />
        ) : (
          renderField(field, field.name, readOnly)
        ),
      )}

      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(isSubmitting) => (
          <div>
            <button type="submit" disabled={isSubmitting}>
              {mode === 'create'
                ? t('ui.form.submitCreate', { resource: resourceText })
                : t('ui.form.submitEdit')}
            </button>
            {onCancel && (
              <button type="button" onClick={onCancel}>
                {t('ui.form.cancel')}
              </button>
            )}
          </div>
        )}
      </form.Subscribe>
    </form>
  )
}

interface ArrayFieldEditorProps {
  readonly form: FormLike
  readonly field: FieldDescriptor
  readonly readOnly: boolean
  readonly idScope: string
  readonly validator: FieldValidator
  readonly renderField: (field: FieldDescriptor, name: string, readOnly: boolean) => ReactElement
}

/**
 * Repeatable group for `array` fields whose JSON Schema describes object items. Each item property
 * is a normal field named `field[i].prop`, so client validation, server issue routing and focus work
 * exactly like top-level fields. The group itself is focusable, so an issue on an item the form no
 * longer shows (e.g. `lines[9]`) lands on, and focuses, the whole group.
 */
function ArrayFieldEditor({
  form,
  field,
  readOnly,
  idScope,
  validator,
  renderField,
}: ArrayFieldEditorProps): ReactElement {
  const { t } = useStrutvane()
  const props = Object.entries(itemProperties(field))
  const blank = Object.fromEntries(props.map(([p]) => [p, null]))
  const groupId = fieldDomId(field.name, idScope)
  const item = field.label.toLowerCase()
  return (
    <form.Field name={field.name} mode="array" validators={{ onSubmit: validator }}>
      {(arrayField) => {
        const messages = errorMessages(arrayField.state.meta.errors)
        const items = Array.isArray(arrayField.state.value) ? arrayField.state.value : []
        return (
          <fieldset
            id={groupId}
            tabIndex={-1}
            aria-describedby={messages.length > 0 ? `${groupId}-error` : undefined}
            aria-invalid={messages.length > 0 || undefined}
          >
            <legend>{field.label}</legend>
            {messages.length > 0 && <p id={`${groupId}-error`}>{messages.join(' ')}</p>}
            {items.map((_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: array items have no stable id; the index IS the field name.
              <fieldset key={index}>
                <legend>
                  {field.label} {index + 1}
                </legend>
                {props.map(([prop, schema]) =>
                  renderField(
                    itemFieldDescriptor(field, prop, schema),
                    `${field.name}[${index}].${prop}`,
                    readOnly,
                  ),
                )}
                {!readOnly && (
                  <button type="button" onClick={() => arrayField.removeValue(index)}>
                    {t('ui.form.remove', { item, index: index + 1 })}
                  </button>
                )}
              </fieldset>
            ))}
            {!readOnly && (
              <button type="button" onClick={() => arrayField.pushValue({ ...blank })}>
                {t('ui.form.add', { item })}
              </button>
            )}
          </fieldset>
        )
      }}
    </form.Field>
  )
}
