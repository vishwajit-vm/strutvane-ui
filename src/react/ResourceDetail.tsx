/**
 * `<ResourceDetail>`: the detail page of one record, built from its descriptor.
 *
 * - Every readable field of the manifest is shown as a description list, rendered with the same
 *   registry cells as the list (so overrides apply here too). Fields the actor may not read are not
 *   in the manifest, so they never appear.
 * - `hasMany` relations whose foreign key is filterable on the child get a related list
 *   (`filter[<fk>][eq]=<id>`) under the record, permission-aware like every list.
 * - Edit and Delete appear only when the manifest allows them; the API still enforces every rule.
 * - Failures: a 404 (missing, or not visible to this actor) and a 403 render a clear message, any
 *   other problem the standard banner. 5xx details are never shown.
 *
 * @module
 */
import type { FieldDescriptor, ResourceDescriptor } from '@strutvane/framework/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactElement, useId, useRef, useState } from 'react'
import { createIdempotencyKey } from '../core/ids.ts'
import { isApiProblemError, problemBannerText } from '../core/problems.ts'
import { resolveCell } from '../core/registry.ts'
import type { ApiRecord } from '../core/types.ts'
import { COLLECTION_RELATION_TYPES } from '../core/validation.ts'
import { CellFallback } from './cells.tsx'
import { useStrutvane } from './context.ts'
import { RenderBoundary } from './RenderBoundary.tsx'
import { ResourceList } from './ResourceList.tsx'
import { recordTitle } from './relations.ts'

/** Props of {@link ResourceDetail}. */
export interface ResourceDetailProps {
  readonly resource: ResourceDescriptor
  readonly recordId: string
  /** Shows an Edit button (when the actor may update). */
  readonly onEdit?: (record: ApiRecord) => void
  /** Shows a Delete button (when the actor may delete); return `true` to delete. */
  readonly confirmDelete?: (record: ApiRecord) => boolean | Promise<boolean>
  readonly onDeleted?: (record: ApiRecord) => void
  /** Open a related record (from a related list). */
  readonly onOpenRelated?: (resource: ResourceDescriptor, record: ApiRecord) => void
}

/** Fields shown in the description list (relations are rendered as related lists instead). */
export function detailFields(resource: ResourceDescriptor): FieldDescriptor[] {
  return resource.fields.filter(
    (f) => !COLLECTION_RELATION_TYPES.has(f.type) && f.type !== 'password',
  )
}

/** The detail page for one record. */
export function ResourceDetail(props: ResourceDetailProps): ReactElement {
  const { resource, recordId } = props
  const { api, registry, t, manifest, locale } = useStrutvane()
  const queryClient = useQueryClient()
  const headingId = useId()
  const [deleteError, setDeleteError] = useState<string | undefined>()
  // One delete per user action: a second click while the confirmation or the request is pending is
  // ignored (a ref, so it holds before React re-renders). The idempotency key is kept until the
  // delete succeeds, so a retry after an unknown outcome (offline, 5xx) is the SAME request.
  const deleting = useRef(false)
  const [busy, setBusy] = useState(false)
  const deleteKey = useRef<string | undefined>(undefined)
  const record = useQuery({
    queryKey: ['strutvane', 'record', resource.path, recordId],
    enabled: resource.capabilities.view,
    queryFn: ({ signal }) => api.get(resource.path, recordId, signal),
    retry: false,
  })

  if (!resource.capabilities.view) return <p role="alert">{t('ui.app.forbidden')}</p>
  if (record.isPending)
    return <p aria-live="polite">{t('ui.form.loading', { resource: resource.label })}</p>
  if (record.isError) {
    const status = isApiProblemError(record.error) ? record.error.problem.status : 0
    if (status === 404) return <p role="alert">{t('ui.app.notFound')}</p>
    if (status === 403) return <p role="alert">{t('ui.app.forbidden')}</p>
    return (
      <p role="alert">
        {isApiProblemError(record.error)
          ? problemBannerText(record.error.problem, registry.messages, locale)
          : t('ui.form.loadFailed')}
      </p>
    )
  }
  const data = record.data
  const title = recordTitle(resource, data)
  const remove = async () => {
    if (!props.confirmDelete || deleting.current) return
    deleting.current = true
    setBusy(true)
    try {
      if (!(await props.confirmDelete(data))) return
      setDeleteError(undefined)
      deleteKey.current ??= createIdempotencyKey()
      await api.delete(resource.path, data.id, { idempotencyKey: deleteKey.current })
      deleteKey.current = undefined
      await queryClient.invalidateQueries({ queryKey: ['strutvane', 'list', resource.path] })
      props.onDeleted?.(data)
    } catch (error) {
      setDeleteError(
        isApiProblemError(error)
          ? problemBannerText(error.problem, registry.messages, locale)
          : t('ui.list.deleteFailed', { title }),
      )
    } finally {
      deleting.current = false
      setBusy(false)
    }
  }
  const related = resource.fields.filter((f) => {
    if (f.type !== 'hasMany' || !f.relation) return false
    const child = manifest.resources.find((r) => r.name === f.relation?.target)
    const fk = child?.fields.find((c) => c.name === f.relation?.foreignKey)
    return (
      child !== undefined && child.capabilities.list && (fk?.filterOperators ?? []).includes('eq')
    )
  })

  return (
    <article aria-labelledby={headingId} className="sv-detail">
      <header className="sv-detail-header">
        <h2 id={headingId}>{title}</h2>
        <div className="sv-detail-actions">
          {props.onEdit && resource.capabilities.update ? (
            <button type="button" onClick={() => props.onEdit?.(data)}>
              {t('ui.list.editShort')}
            </button>
          ) : null}
          {props.confirmDelete && resource.capabilities.delete ? (
            <button
              type="button"
              className="sv-danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              {t('ui.list.deleteShort')}
            </button>
          ) : null}
        </div>
      </header>
      {deleteError ? <p role="alert">{deleteError}</p> : null}
      <dl className="sv-detail-fields">
        {detailFields(resource).map((field) => {
          const Cell = resolveCell(registry, resource, field)
          return (
            <div key={field.name} className="sv-detail-field">
              <dt>{field.label}</dt>
              <dd>
                <RenderBoundary fallback={<CellFallback />} resetKey={data[field.name]}>
                  <Cell field={field} value={data[field.name]} record={data} resource={resource} />
                </RenderBoundary>
              </dd>
            </div>
          )
        })}
      </dl>
      {related.map((field) => {
        const child = manifest.resources.find((r) => r.name === field.relation?.target)
        if (!child || !field.relation) return null
        return (
          <section key={field.name} className="sv-detail-related" aria-label={field.label}>
            <h3>{field.label}</h3>
            <ResourceList
              resource={child}
              initialSearch={`filter[${field.relation.foreignKey}][eq]=${encodeURIComponent(data.id)}`}
              {...(props.onOpenRelated
                ? { onView: (r: ApiRecord) => props.onOpenRelated?.(child, r) }
                : {})}
            />
          </section>
        )
      })}
    </article>
  )
}
