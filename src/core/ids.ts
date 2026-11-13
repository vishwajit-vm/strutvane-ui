/**
 * Idempotency keys for mutations (RFC-0003 §4, row 12).
 *
 * A key identifies one USER ACTION, not one request: the form reuses the same key when the user
 * retries after a network error or timeout, so the server can return the original result instead of
 * creating a duplicate. A new key is generated only after the action succeeded.
 *
 * @module
 */

/** A new random idempotency key (UUID v4 from the platform's CSPRNG). */
export function createIdempotencyKey(): string {
  return globalThis.crypto.randomUUID()
}
