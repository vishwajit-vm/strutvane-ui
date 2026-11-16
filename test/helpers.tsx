/**
 * React test helpers: render inside the providers an app would use, seed data, and run axe.
 * Imported only by jsdom test files (they declare `// @vitest-environment jsdom`).
 */
import '@testing-library/jest-dom/vitest'
import type { ResourceManifest } from '@strutvane/framework/contracts'
import { QueryClient } from '@tanstack/react-query'
import { cleanup, type RenderResult, render } from '@testing-library/react'
import axe from 'axe-core'
import type { ReactElement } from 'react'
import { afterEach } from 'vitest'
import type { ResourceApi } from '../src/core/types.ts'
import { DesignProvider } from '../src/design/DesignProvider.tsx'
import { plain } from '../src/design/plain/index.ts'
import { StrutvaneProvider } from '../src/react/StrutvaneProvider.tsx'
import { ToastProvider } from '../src/react/toasts.tsx'
import type { UiOverrides } from '../src/react/types.ts'
import { FakeApi, type Row } from './fixtures/fake-api.ts'
import { manifest } from './fixtures/manifest.ts'

afterEach(() => cleanup())

// axe-core probes <canvas> (icon-font detection); jsdom has no canvas and logs "Not implemented".
// Returning null is what a browser without 2D support does, and axe handles it.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext

export const customers: Row[] = [
  { id: 'c1', name: 'Acme GmbH', region: 'EU' },
  { id: 'c2', name: 'Globex Inc', region: 'US' },
  { id: 'c3', name: 'Initech', region: 'US' },
]

export function makeInvoices(count: number): Row[] {
  const statuses = ['draft', 'sent', 'paid'] as const
  return Array.from({ length: count }, (_, i) => ({
    id: `inv-${String(i + 1).padStart(4, '0')}`,
    number: `INV-${1000 + i}`,
    customer: customers[i % customers.length]?.id ?? null,
    amount: (i * 37) % 5000,
    status: statuses[i % 3] ?? 'draft',
    issueDate: '2026-11-01',
    dueDate: '2026-12-01',
    paid: i % 3 === 2,
    notes: null,
    lines: [],
    createdAt: '2026-11-01T09:00:00.000Z',
  }))
}

export function seededApi(invoiceCount = 30, customerRows: Row[] = customers): FakeApi {
  return new FakeApi(manifest, { invoices: makeInvoices(invoiceCount), customers: customerRows })
}

export interface RenderOptions {
  readonly api?: ResourceApi
  readonly overrides?: UiOverrides
  readonly manifest?: ResourceManifest
  readonly locale?: string
}

/** What {@link renderWithUI} returns. */
export type RenderWithUIResult = RenderResult & {
  readonly api: ResourceApi
  readonly queryClient: QueryClient
}

export function renderWithUI(ui: ReactElement, opts: RenderOptions = {}): RenderWithUIResult {
  const api = opts.api ?? seededApi()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(
    <DesignProvider design={plain} theme="light" injectStyles={false}>
      <ToastProvider dismissLabel="Dismiss">
        <StrutvaneProvider
          api={api}
          manifest={opts.manifest ?? manifest}
          queryClient={queryClient}
          {...(opts.overrides ? { overrides: opts.overrides } : {})}
          {...(opts.locale ? { locale: opts.locale } : {})}
        >
          {ui}
        </StrutvaneProvider>
      </ToastProvider>
    </DesignProvider>,
  )
  return { ...result, api, queryClient }
}

/**
 * The list's status line for `count` rows starting at `from`, with or without a total:
 * "Showing 1–25 of 30 invoices" (and "Showing 0 invoices" for none).
 */
export function showing(count: number, resource = 'invoices', from = 1): RegExp {
  if (count === 0) return new RegExp(`^Showing 0 ${resource}$`)
  const range = `${from}–${from + count - 1}`
  return new RegExp(`^Showing ${range}( of (more than )?[\\d,]+)? ${resource}$`)
}

/** One axe violation, summarised. */
export interface Violation {
  readonly id: string
  readonly impact: string | null | undefined
  readonly nodes: number
  readonly help: string
}

/**
 * Run axe-core on a container. `color-contrast` is disabled: jsdom has no layout or CSS engine, so
 * the rule cannot produce meaningful results here (it runs in a real browser, e.g. Playwright).
 */
export async function axeViolations(container: Element): Promise<Violation[]> {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
    resultTypes: ['violations'],
  })
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.length,
    help: v.help,
  }))
}
