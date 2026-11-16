// @vitest-environment jsdom
// Render cost for 500 rows: full render vs virtualized. jsdom has no layout or paint, so absolute
// numbers are a proxy (DOM work + React reconciliation), useful for comparing the two strategies and
// catching regressions, not a browser frame-time guarantee (that needs Playwright).
import type { ListResult } from '@strutvane/framework/contracts'
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ApiRecord, ResourceApi } from '../src/core/types.ts'
import { ResourceList, virtualWindow } from '../src/react/ResourceList.tsx'
import { invoiceResource } from './fixtures/manifest.ts'
import { customers, makeInvoices, renderWithUI } from './helpers.tsx'

const ROWS = 500
const invoices: ApiRecord[] = makeInvoices(ROWS)
const unused = async (): Promise<never> => {
  throw new Error('not used')
}

/** Returns all 500 rows in one response, simulating accumulated pages ("load more"). */
const bulkApi: ResourceApi = {
  async list(path): Promise<ListResult<ApiRecord>> {
    const data = path === 'customers' ? customers : invoices
    return { data, meta: { page: { size: data.length, hasMore: false } } }
  },
  get: async (_path, id) => customers.find((c) => c.id === id) ?? { id },
  create: unused,
  update: unused,
  delete: unused,
}

async function measure(virtualizeThreshold: number) {
  const t0 = performance.now()
  const utils = renderWithUI(
    <ResourceList
      resource={invoiceResource}
      virtualizeThreshold={virtualizeThreshold}
      onEdit={() => {}}
    />,
    { api: bulkApi },
  )
  await screen.findByText(`Showing ${ROWS} invoices`)
  const ms = performance.now() - t0
  const bodyRows = utils.container.querySelectorAll('tbody tr:not([data-sv-spacer])').length
  const table = utils.container.querySelector('table')
  const rowCount = table?.getAttribute('aria-rowcount')
  utils.unmount()
  return { ms, bodyRows, rowCount }
}

/** Give every element a 1024×600 box, as a browser would for the scroll container. */
function withLayout() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 1024,
    bottom: 600,
    width: 1024,
    height: 600,
    toJSON: () => ({}),
  } as DOMRect)
}

afterEach(() => vi.restoreAllMocks())

describe(`render ${ROWS} rows`, () => {
  test('full render vs virtualized: virtualization renders a window, not all rows', async () => {
    withLayout()
    await measure(Number.POSITIVE_INFINITY) // warm-up (module/JIT), not measured
    const runs = 3
    const full: number[] = []
    const virtual: number[] = []
    let fullRows = 0
    let virtualRows = 0
    let rowCount: string | null | undefined
    for (let i = 0; i < runs; i++) {
      const f = await measure(Number.POSITIVE_INFINITY)
      const v = await measure(100)
      full.push(f.ms)
      virtual.push(v.ms)
      fullRows = f.bodyRows
      virtualRows = v.bodyRows
      rowCount = v.rowCount
    }
    const median = (xs: number[]) =>
      [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? Number.NaN
    process.stdout.write(
      `\n[perf] ${JSON.stringify({
        rows: ROWS,
        fullRender: { medianMs: Math.round(median(full)), domRows: fullRows },
        virtualized: { medianMs: Math.round(median(virtual)), domRows: virtualRows },
      })}\n`,
    )
    expect(fullRows).toBe(ROWS)
    expect(virtualRows).toBeGreaterThan(0)
    expect(virtualRows).toBeLessThan(60) // viewport (600px / 40px) + overscan
    expect(rowCount).toBe(String(ROWS + 1)) // semantics keep the full row count
    expect(median(virtual)).toBeLessThan(median(full))
    // Four full 500-row renders take ~17 s on an idle machine, right at the 20 s default: a busy CI
    // runner timed out. The assertions are relative (window vs full), so more time cannot hide a
    // regression; it only removes the flake.
  }, 90_000)

  test('regression: an unmeasurable (0px) container still shows the first rows, never an empty table', async () => {
    const { bodyRows } = await measure(100) // no layout mock: container measures 0x0
    expect(bodyRows).toBeGreaterThan(0)
    expect(bodyRows).toBeLessThan(60)
  })

  test('virtualWindow: measured items pass through; nothing measured → first rows; no rows → none', () => {
    const measured = [{ index: 5, start: 200, end: 240 }]
    expect(virtualWindow(measured, 500)).toEqual(measured)
    expect(virtualWindow([], 500)).toHaveLength(25)
    expect(virtualWindow([], 3).map((w) => w.index)).toEqual([0, 1, 2])
    expect(virtualWindow([], 0)).toEqual([])
  })
})
