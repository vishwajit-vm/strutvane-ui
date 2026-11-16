/**
 * `<StrutvaneProvider>`: the root of every Strutvane screen.
 *
 * It supplies the {@link ResourceApi}, the validated manifest, the merged registry (defaults +
 * your L1/L2 overrides) and the locale to every renderer component.
 *
 * Data fetching uses TanStack Query. Pass `queryClient` to let the provider create the
 * `QueryClientProvider`, or omit it when your app already renders one (the usual case: share one
 * cache with the rest of the app).
 *
 * @module
 */
import type { ResourceManifest } from '@strutvane/framework/contracts'
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactElement, type ReactNode, useMemo } from 'react'
import { mergeRegistry } from '../core/registry.ts'
import type { ResourceApi } from '../core/types.ts'
import { createContextValue, StrutvaneContext } from './context.ts'
import { defaultRegistry } from './defaults.ts'
import type { UiOverrides, UiRegistry } from './types.ts'

/** Props of {@link StrutvaneProvider}. */
export interface StrutvaneProviderProps {
  readonly api: ResourceApi
  /** A manifest validated by `parseManifest` / `fetchManifest`. */
  readonly manifest: ResourceManifest
  /** Overrides merged on top of `base` (widgets, cells, per-field entries, messages). */
  readonly overrides?: UiOverrides
  /** The registry the overrides apply to. Defaults to the built-in {@link defaultRegistry}. */
  readonly base?: UiRegistry
  /** BCP 47 locale (plural rules, numbers, dates). Default `en`. */
  readonly locale?: string
  /** Create a `QueryClientProvider` with this client (omit if your app already has one). */
  readonly queryClient?: QueryClient
  /** Called when a request answers 401; the app shell shows "sign in again" (drafts are kept). */
  readonly onUnauthenticated?: () => void
  readonly children?: ReactNode
}

/** Provides the API, manifest, registry and locale to every Strutvane component. */
export function StrutvaneProvider({
  api,
  manifest,
  overrides,
  base = defaultRegistry,
  locale = 'en',
  queryClient,
  onUnauthenticated,
  children,
}: StrutvaneProviderProps): ReactElement {
  const registry = useMemo(() => mergeRegistry(base, overrides), [base, overrides])
  const value = useMemo(
    () => createContextValue(api, manifest, registry, locale, onUnauthenticated),
    [api, manifest, registry, locale, onUnauthenticated],
  )
  const tree = <StrutvaneContext.Provider value={value}>{children}</StrutvaneContext.Provider>
  return queryClient ? <QueryClientProvider client={queryClient}>{tree}</QueryClientProvider> : tree
}
