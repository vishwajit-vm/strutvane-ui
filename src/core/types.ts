/**
 * Types shared by the framework-free core and every renderer.
 *
 * The renderer never calls `fetch` directly: it talks to a {@link ResourceApi}. The default
 * implementation is the HTTP client in `http-client.ts`; tests and UI-only apps can provide their
 * own (for example an adapter over a generated OpenAPI client). Keeping this seam explicit is what
 * keeps the components testable and transport-agnostic.
 *
 * @module
 */
import type { ListQuery, ListResult } from '@strutvane/framework/contracts'

/** A record as returned by a Strutvane API: an `id` plus the resource's fields. */
export interface ApiRecord {
  readonly id: string
  readonly [field: string]: unknown
}

/** Per-request options for mutations. */
export interface MutationOptions {
  /**
   * Sent as the `Idempotency-Key` header. Reuse the same key when retrying the same user action
   * (network error, timeout), so the server never creates a duplicate (RFC-0003 §4, row 12).
   */
  readonly idempotencyKey?: string
  readonly signal?: AbortSignal
}

/** The API surface the renderer depends on. Paths are resource paths, e.g. `"invoices"`. */
export interface ResourceApi {
  list(path: string, query: ListQuery, signal?: AbortSignal): Promise<ListResult<ApiRecord>>
  get(path: string, id: string, signal?: AbortSignal): Promise<ApiRecord>
  create(
    path: string,
    values: Readonly<Record<string, unknown>>,
    options?: MutationOptions,
  ): Promise<ApiRecord>
  update(
    path: string,
    id: string,
    values: Readonly<Record<string, unknown>>,
    options?: MutationOptions,
  ): Promise<ApiRecord>
  delete(path: string, id: string, options?: MutationOptions): Promise<void>
  /**
   * Undo a soft delete (`POST {path}/{id}/restore`, decision #56). Optional: without it the UI
   * offers no Undo, and deleted records stay reachable through the server's own restore flow.
   */
  restore?(path: string, id: string, options?: MutationOptions): Promise<ApiRecord | undefined>
}
