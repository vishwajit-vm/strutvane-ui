/**
 * `<ResourceDetail>`: the detail page of one record, built from its descriptor.
 *
 * - Every readable field of the manifest is shown as a description list, rendered with the same
 *   registry cells as the list (so overrides apply here too). Fields the actor may not read are not
 *   in the manifest, so they never appear.
 * - `hasMany` relations whose foreign key is filterable on the child get a related list
 *   (`filter[<fk>][eq]=<id>`) under the record, permission-aware like every list.
 * - Edit and Delete appear only when the manifest allows them; the API still enforces every rule.
 *   Delete runs the shared flow (confirm, type-to-confirm when permanent, Undo when soft).
 * - The record is addressed by its URL key: a slug for resources with a route key (decision #55).
 * - Failures: a 404 (missing, or not visible to this actor) and a 403 render a clear message, any
 *   other problem the standard banner. 5xx details are never shown.
 *
 * @module
 */
import type { FieldDescriptor, ResourceDescriptor } from '@strutvane/framework/contracts'
import { useQuery } from '@tanstack/react-query'
import { type ReactElement, type ReactNode, useEffect, useId } from 'react'
import { isApiProblemError, problemBannerText } from '../core/problems.ts'
import { resolveCell } from '../core/registry.ts'
import type { ApiRecord } from '../core/types.ts'
import { COLLECTION_RELATION_TYPES } from '../core/validation.ts'
import { CellFallback } from './cells.tsx'
import { useStrutvane } from './context.ts'
import { useIllustrations, useSkins } from './design-hooks.ts'
import { type Crumb, PageHeading } from './PageHeading.tsx'
import { RenderBoundary } from './RenderBoundary.tsx'
import { ResourceList } from './ResourceList.tsx'
import { recordTitle } from './relations.ts'
import { useDeleteRecord } from './useDeleteRecord.tsx'

/** Props of {@link ResourceDetail}. */
export interface ResourceDetailProps {
  readonly resource: ResourceDescriptor
  /** The record's URL key: its route key value (such as a slug), else its id. */
  readonly recordId: string
  /** Shows an Edit button (when the actor may update). */
  readonly onEdit?: (record: ApiRecord) => void
  /** Shows a Delete button (when the actor may delete); the shared confirm flow runs first. */
  readonly deletable?: boolean
  readonly onDeleted?: (record: ApiRecord) => void
  /** Open a related record (from a related list). */
  readonly onOpenRelated?: (resource: ResourceDescriptor, record: ApiRecord) => void
  /** Breadcrumbs before the record's own title (the shell passes Home › Posts). */
  readonly breadcrumbs?: readonly Crumb[]
  /** The parent page, for the Back control. */
  readonly parent?: { readonly to: string; readonly label: string }
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
  const { api, registry, t, manifest, locale, onUnauthenticated } = useStrutvane()
  const { Button, Card, Alert } = useSkins()
  const { NotFound, Forbidden, Error: ErrorPicture } = useIllustrations()
  const headingId = useId()
  const removal = useDeleteRecord(resource, props.onDeleted)
  const record = useQuery({
    queryKey: ['strutvane', 'record', resource.path, recordId],
    enabled: resource.capabilities.view,
    queryFn: ({ signal }) => api.get(resource.path, recordId, signal),
    retry: false,
  })
  const status = isApiProblemError(record.error) ? record.error.problem.status : 0
  useEffect(() => {
    if (status === 401) onUnauthenticated?.()
  }, [status, onUnauthenticated])

  if (!resource.capabilities.view)
    return <Notice picture={<Forbidden />} text={t('ui.app.forbidden')} />
  if (record.isPending)
    return <p aria-live="polite">{t('ui.form.loading', { resource: resource.label })}</p>
  if (record.isError) {
    if (status === 404) return <Notice picture={<NotFound />} text={t('ui.app.notFound')} />
    if (status === 403) return <Notice picture={<Forbidden />} text={t('ui.app.forbidden')} />
    return (
      <Notice
        picture={<ErrorPicture />}
        text={
          isApiProblemError(record.error)
            ? problemBannerText(record.error.problem, registry.messages, locale)
            : t('ui.form.loadFailed')
        }
      />
    )
  }
  const data = record.data
  const title = recordTitle(resource, data)
  const related = resource.fields.filter((f) => {
    if (f.type !== 'hasMany' || !f.relation) return false
    const child = manifest.resources.find((r) => r.name === f.relation?.target)
    const fk = child?.fields.find((c) => c.name === f.relation?.foreignKey)
    return child?.capabilities.list === true && (fk?.filterOperators ?? []).includes('eq')
  })

  return (
    <article aria-labelledby={headingId} data-sv-part="detail">
      <PageHeading
        title={title}
        titleId={headingId}
        breadcrumbs={[...(props.breadcrumbs ?? []), { label: title }]}
        {...(props.parent ? { parent: props.parent } : {})}
        actions={
          <>
            {props.onEdit && resource.capabilities.update ? (
              <Button data-sv-shortcut="edit" onClick={() => props.onEdit?.(data)}>
                {t('ui.list.editShort')}
              </Button>
            ) : null}
            {props.deletable && resource.capabilities.delete ? (
              <Button
                variant="danger"
                disabled={removal.busyId !== undefined}
                onClick={() => removal.request(data)}
              >
                {t('ui.list.deleteShort')}
              </Button>
            ) : null}
          </>
        }
      />
      {removal.error ? (
        <Alert tone="danger" role="alert">
          {removal.error}
        </Alert>
      ) : null}
      <Card aria-label={t('ui.detail.fields')}>
        <dl data-sv-part="details">
          {detailFields(resource).map((field) => {
            const Cell = resolveCell(registry, resource, field)
            return (
              <div key={field.name}>
                <dt>{field.label}</dt>
                <dd>
                  <RenderBoundary fallback={<CellFallback />} resetKey={data[field.name]}>
                    <Cell
                      field={field}
                      value={data[field.name]}
                      record={data}
                      resource={resource}
                    />
                  </RenderBoundary>
                </dd>
              </div>
            )
          })}
        </dl>
      </Card>
      {related.map((field) => {
        const child = manifest.resources.find((r) => r.name === field.relation?.target)
        if (!child || !field.relation) return null
        return (
          // Not a landmark itself: the embedded list is the "Posts" region (landmark names must be unique).
          <div key={field.name} data-sv-part="related">
            <h2>{field.label}</h2>
            <ResourceList
              resource={child}
              embedded
              embeddedLabel={field.label}
              initialSearch={`filter[${field.relation.foreignKey}][eq]=${encodeURIComponent(data.id)}`}
              {...(props.onOpenRelated
                ? { onView: (r: ApiRecord) => props.onOpenRelated?.(child, r) }
                : {})}
            />
          </div>
        )
      })}
      {removal.dialog}
    </article>
  )
}

/** A full-page notice (not found, forbidden, failed) with the design's illustration. */
function Notice(props: { readonly picture: ReactNode; readonly text: string }): ReactElement {
  return (
    <div data-sv-part="empty" role="alert">
      {props.picture}
      <p>{props.text}</p>
    </div>
  )
}
