/**
 * Batched record lookup by id, for relation labels.
 *
 * A list of 100 invoices shows a customer name in every row. Fetching each customer separately
 * would cost one request per distinct id; this batcher collects every id requested in the same tick
 * and loads them together:
 * - with `filter[id][in]=…` (chunks of {@link LIST_QUERY_LIMITS.maxPageSize}) when the target
 *   resource allows `in` on its `id` field, the server-side cheap path;
 * - otherwise with one `GET {path}/{id}` per id, so it works against any API that has `show`.
 *
 * An id the server does not return resolves to `undefined` (deleted, or not visible to this actor:
 * the UI then shows the raw id, never an error). A failed request rejects only the ids it covered.
 *
 * @module
 */
import { LIST_QUERY_LIMITS, type ResourceDescriptor } from '@strutvane/contracts'
import { isApiProblemError } from './problems.ts'
import type { ApiRecord, ResourceApi } from './types.ts'

/** Loads records of one resource by id, batching requests made in the same tick. */
export interface RecordBatcher {
  load(id: string): Promise<ApiRecord | undefined>
}

interface Pending {
  readonly resolve: (record: ApiRecord | undefined) => void
  readonly reject: (error: unknown) => void
}

/** Create a batcher for `resource`. Keep one per (api, resource), e.g. in a WeakMap. */
export function createRecordBatcher(api: ResourceApi, resource: ResourceDescriptor): RecordBatcher {
  const idField = resource.fields.find((f) => f.name === 'id')
  const canFilterIn = idField?.filterOperators.includes('in') === true
  let queue = new Map<string, Pending[]>()
  let scheduled = false

  async function loadChunk(ids: readonly string[]): Promise<Map<string, ApiRecord>> {
    const found = new Map<string, ApiRecord>()
    if (canFilterIn) {
      const result = await api.list(resource.path, {
        filter: { op: 'in', field: 'id', values: ids },
        page: { kind: 'cursor', size: ids.length },
      })
      for (const record of result.data) found.set(record.id, record)
      return found
    }
    await Promise.all(
      ids.map(async (id) => {
        try {
          found.set(id, await api.get(resource.path, id))
        } catch (error) {
          // A missing or hidden record is not an error for a label; anything else is.
          if (
            !(
              isApiProblemError(error) &&
              (error.problem.status === 404 || error.problem.status === 403)
            )
          )
            throw error
        }
      }),
    )
    return found
  }

  async function flush(): Promise<void> {
    const batch = queue
    queue = new Map()
    scheduled = false
    const ids = [...batch.keys()]
    for (let i = 0; i < ids.length; i += LIST_QUERY_LIMITS.maxPageSize) {
      const chunk = ids.slice(i, i + LIST_QUERY_LIMITS.maxPageSize)
      try {
        const found = await loadChunk(chunk)
        for (const id of chunk) for (const p of batch.get(id) ?? []) p.resolve(found.get(id))
      } catch (error) {
        for (const id of chunk) for (const p of batch.get(id) ?? []) p.reject(error)
      }
    }
  }

  return {
    load(id) {
      return new Promise((resolve, reject) => {
        const waiting = queue.get(id) ?? []
        waiting.push({ resolve, reject })
        queue.set(id, waiting)
        if (!scheduled) {
          scheduled = true
          setTimeout(() => void flush(), 0)
        }
      })
    },
  }
}
