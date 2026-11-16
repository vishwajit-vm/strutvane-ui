/**
 * The renderer's React context and the hooks that read it.
 *
 * Kept separate from the provider component so widgets and cells can use these hooks without
 * importing the default registry (which imports them): no import cycles.
 *
 * @module
 */
import type { ResourceDescriptor, ResourceManifest } from '@strutvane/framework/contracts'
import { type Context, createContext, useContext } from 'react'
import { formatMessage, type MessageParams } from '../core/messages.ts'
import type { ResourceApi } from '../core/types.ts'
import type { UiRegistry } from './types.ts'

/** Everything the renderer components need. */
export interface StrutvaneContextValue {
  readonly api: ResourceApi
  readonly manifest: ResourceManifest
  readonly registry: UiRegistry
  /** BCP 47 locale for plural rules, numbers and dates. */
  readonly locale: string
  /** Render a catalog message with the registry's messages and the locale. */
  readonly t: (key: string, params?: MessageParams) => string
  /**
   * Called when a request answers 401 (the session ended). The app shell opens "sign in again"
   * over the current screen, so a form keeps its draft. Absent outside the shell.
   */
  readonly onUnauthenticated?: () => void
}

/** The context. `null` outside a provider (the hooks then throw a clear error). */
export const StrutvaneContext: Context<StrutvaneContextValue | null> =
  createContext<StrutvaneContextValue | null>(null)

/** Build a context value (used by the provider; exported for custom providers and tests). */
export function createContextValue(
  api: ResourceApi,
  manifest: ResourceManifest,
  registry: UiRegistry,
  locale: string,
  onUnauthenticated?: () => void,
): StrutvaneContextValue {
  return {
    api,
    manifest,
    registry,
    locale,
    t: (key, params = {}) => formatMessage(registry.messages, key, params, locale),
    ...(onUnauthenticated ? { onUnauthenticated } : {}),
  }
}

/** Read the renderer context. Throws when used outside `<StrutvaneProvider>`. */
export function useStrutvane(): StrutvaneContextValue {
  const ctx = useContext(StrutvaneContext)
  if (!ctx) throw new Error('useStrutvane() must be used inside <StrutvaneProvider>.')
  return ctx
}

/** Look up a resource descriptor by name (e.g. a belongsTo target). */
export function useResource(name: string | undefined): ResourceDescriptor | undefined {
  const { manifest } = useStrutvane()
  return name === undefined ? undefined : manifest.resources.find((r) => r.name === name)
}
