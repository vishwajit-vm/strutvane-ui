/**
 * `useDeleteRecord`: the one delete flow every screen uses (list rows, detail pages).
 *
 * 1. **Confirm** in an `alertdialog` whose safe choice (Cancel) has focus. Soft deletes say the
 *    record moves to deleted records; a **permanent** delete (a resource without soft deletes)
 *    asks the person to type the record's name first (type-to-confirm), and the Delete button
 *    stays disabled until it matches.
 * 2. **Delete once:** a second click while the request is in flight is ignored, and the
 *    idempotency key is kept until the outcome is known, so a retry after a network error is the
 *    same request.
 * 3. **Undo:** after a soft delete, a toast offers Undo for 10 s (`POST …/restore`, decision #56),
 *    when the viewer may restore and the API client supports it.
 *
 * @module
 */
import type { ResourceDescriptor } from '@strutvane/framework/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { type ReactElement, type ReactNode, useId, useRef, useState } from 'react'
import { createIdempotencyKey } from '../core/ids.ts'
import { isApiProblemError, problemBannerText } from '../core/problems.ts'
import { recordKey } from '../core/resource-extensions.ts'
import type { ApiRecord } from '../core/types.ts'
import { useStrutvane } from './context.ts'
import { ModalDialog } from './Dialog.tsx'
import { useSkins } from './design-hooks.ts'
import { recordTitle } from './relations.ts'
import { useToasts } from './toasts.tsx'

/** What {@link useDeleteRecord} returns. */
export interface DeleteRecordFlow {
  /** Ask to delete `record` (opens the confirmation). */
  readonly request: (record: ApiRecord) => void
  /** Render this somewhere in the page: the confirmation dialog, when open. */
  readonly dialog: ReactNode
  /** The id of the record being deleted, if any. */
  readonly busyId: string | undefined
  /** The last failure, ready to show in a `role="alert"`. */
  readonly error: string | undefined
}

/** The delete flow for one resource; `onDeleted` runs after the server confirmed. */
export function useDeleteRecord(
  resource: ResourceDescriptor,
  onDeleted?: (record: ApiRecord) => void,
): DeleteRecordFlow {
  const { api, t, registry, locale, onUnauthenticated } = useStrutvane()
  const queryClient = useQueryClient()
  const toasts = useToasts()
  const [target, setTarget] = useState<ApiRecord | undefined>()
  const [busyId, setBusyId] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const keys = useRef(new Map<string, string>())
  const inFlight = useRef(false)

  const refresh = async (record: ApiRecord) => {
    queryClient.removeQueries({
      queryKey: ['strutvane', 'record', resource.path, recordKey(resource, record)],
    })
    await queryClient.invalidateQueries({ queryKey: ['strutvane', 'list', resource.path] })
  }

  const failure = (fallback: string, cause: unknown): string => {
    if (!isApiProblemError(cause)) return fallback
    if (cause.problem.status === 401) onUnauthenticated?.()
    return `${fallback} ${problemBannerText(cause.problem, registry.messages, locale)}`
  }

  const restore = async (record: ApiRecord) => {
    const title = recordTitle(resource, record)
    try {
      await api.restore?.(resource.path, recordKey(resource, record))
      await refresh(record)
      toasts?.show({ message: t('ui.list.restored', { title }), tone: 'success' })
    } catch (cause) {
      toasts?.show({
        message: failure(t('ui.list.restoreFailed', { title }), cause),
        tone: 'danger',
      })
    }
  }

  const confirm = async (record: ApiRecord) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusyId(record.id)
    setError(undefined)
    const key = keys.current.get(record.id) ?? createIdempotencyKey()
    keys.current.set(record.id, key)
    const title = recordTitle(resource, record)
    try {
      await api.delete(resource.path, recordKey(resource, record), { idempotencyKey: key })
      keys.current.delete(record.id)
      setTarget(undefined)
      await refresh(record)
      const canUndo = resource.softDeletes && resource.capabilities.restore && api.restore
      toasts?.show({
        message: t('ui.list.deleted', { title }),
        tone: 'success',
        ...(canUndo
          ? { action: { label: t('ui.list.undo'), run: () => void restore(record) } }
          : {}),
      })
      onDeleted?.(record)
    } catch (cause) {
      // A definitive answer (4xx) ends this action; an unknown outcome keeps the key for a retry.
      if (isApiProblemError(cause) && cause.problem.status >= 400 && cause.problem.status < 500)
        keys.current.delete(record.id)
      setTarget(undefined)
      setError(failure(t('ui.list.deleteFailed', { title }), cause))
    } finally {
      inFlight.current = false
      setBusyId(undefined)
    }
  }

  return {
    request: (record) => {
      if (inFlight.current) return
      setError(undefined)
      setTarget(record)
    },
    dialog: target ? (
      <DeleteDialog
        resource={resource}
        record={target}
        busy={busyId !== undefined}
        onCancel={() => setTarget(undefined)}
        onConfirm={() => void confirm(target)}
      />
    ) : null,
    busyId,
    error,
  }
}

/** The confirmation dialog (soft: a sentence; permanent: type the name to confirm). */
function DeleteDialog(props: {
  readonly resource: ResourceDescriptor
  readonly record: ApiRecord
  readonly busy: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => void
}): ReactElement {
  const { t } = useStrutvane()
  const { Button, Field, Input } = useSkins()
  const cancel = useRef<HTMLButtonElement>(null)
  const inputId = useId()
  const [typed, setTyped] = useState('')
  const title = recordTitle(props.resource, props.record)
  const permanent = !props.resource.softDeletes
  const matches = !permanent || typed.trim() === title
  return (
    <ModalDialog
      role="alertdialog"
      title={t('ui.delete.title', { title })}
      description={permanent ? t('ui.delete.permanent', { title }) : t('ui.delete.soft', { title })}
      onClose={props.onCancel}
      initialFocus={cancel}
      size="sm"
      footer={
        <>
          <Button ref={cancel} onClick={props.onCancel}>
            {t('ui.delete.cancel')}
          </Button>
          <Button variant="danger" disabled={!matches || props.busy} onClick={props.onConfirm}>
            {t('ui.delete.confirm')}
          </Button>
        </>
      }
    >
      {permanent ? (
        <Field label={t('ui.delete.typeToConfirm', { title })} htmlFor={inputId} required={false}>
          <Input
            id={inputId}
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </Field>
      ) : null}
    </ModalDialog>
  )
}
