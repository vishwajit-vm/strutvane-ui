/**
 * The reference screens: the real `<StrutvaneApp>` on the reference API, rendered with a design
 * into jsdom, in the states that matter for accessibility and layout (sign-in, a list, an empty
 * list, the delete confirmation, a form with errors, a record, the command palette, the shortcuts
 * help).
 *
 * Rendering uses `react-dom/client` and `act` directly, so the kit needs no testing library. It
 * must run in a DOM environment (`// @vitest-environment jsdom`).
 *
 * @module
 */
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DesignProvider } from '../design/DesignProvider.tsx'
import type { Design } from '../design/define-design.ts'
import type { PublicOverrides } from '../design/tokens.ts'
import { StrutvaneApp } from '../react/StrutvaneApp.tsx'
import { createReferenceApi } from './reference-api.ts'

/** The reference screens, by name. */
export const REFERENCE_SCREENS = [
  'sign-in',
  'list',
  'empty-list',
  'delete-dialog',
  'form-errors',
  'detail',
  'palette',
  'shortcuts',
] as const

/** One reference screen name. */
export type ReferenceScreen = (typeof REFERENCE_SCREENS)[number]

/** A rendered screen; call `unmount()` when done. */
export interface RenderedScreen {
  readonly container: HTMLElement
  unmount(): Promise<void>
}

/** Options for {@link renderReferenceScreen}. */
export interface RenderOptions {
  readonly theme?: 'light' | 'dark'
  readonly overrides?: PublicOverrides
  /** How long to wait for the screen to settle, in ms. Default 5,000. */
  readonly timeout?: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Wait (inside `act`) until `ready()` holds; throws a clear error on timeout. */
async function until(ready: () => boolean, what: string, timeout: number): Promise<void> {
  const deadline = Date.now() + timeout
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(`reference screen: timed out waiting for ${what}`)
    await act(async () => {
      await sleep(10)
    })
  }
}

function assertDom(): void {
  if (typeof document === 'undefined')
    throw new Error(
      'The conformance kit renders screens: run this test file in a DOM environment (add `// @vitest-environment jsdom` at the top).',
    )
}

/** Render `element` into a fresh container with React's act environment on. */
export async function mount(element: ReactElement): Promise<RenderedScreen> {
  assertDom()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.append(container)
  let root: Root | undefined
  await act(async () => {
    root = createRoot(container)
    root.render(element)
  })
  return {
    container,
    async unmount() {
      await act(async () => root?.unmount())
      container.remove()
    },
  }
}

const PATHS: Readonly<Record<ReferenceScreen, string>> = {
  'sign-in': '/',
  list: '/posts',
  'empty-list': '/posts?search=no-such-post',
  'delete-dialog': '/posts',
  'form-errors': '/posts/new',
  detail: '/posts/launch-notes-1',
  palette: '/posts',
  shortcuts: '/posts',
}

const press = (init: KeyboardEventInit) =>
  act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
  })

/**
 * Render one reference screen with `design` and bring it to its state (a dialog open, errors
 * shown). The returned container holds the whole app, styled by the design's injected stylesheet.
 *
 * @example
 * const screen = await renderReferenceScreen(plain, 'form-errors')
 * // … run axe on screen.container …
 * await screen.unmount()
 */
export async function renderReferenceScreen(
  design: Design,
  name: ReferenceScreen,
  options: RenderOptions = {},
): Promise<RenderedScreen> {
  assertDom()
  const timeout = options.timeout ?? 5000
  const api = createReferenceApi({ signedIn: name !== 'sign-in' })
  window.history.replaceState({ svIndex: 0 }, '', PATHS[name])
  const screen = await mount(
    <DesignProvider
      design={design}
      theme={options.theme ?? 'light'}
      {...(options.overrides ? { overrides: options.overrides } : {})}
    >
      <StrutvaneApp apiUrl="/api" appName="Reference" fetch={api.fetch} />
    </DesignProvider>,
  )
  const c = screen.container
  const has = (selector: string) => c.querySelector(selector) !== null
  const text = (needle: string) => (c.textContent ?? '').includes(needle)
  const button = (label: RegExp) =>
    [...c.querySelectorAll('button')].find((b) =>
      label.test(b.getAttribute('aria-label') ?? b.textContent ?? ''),
    )
  try {
    switch (name) {
      case 'sign-in':
        await until(() => has('input[type="password"]'), 'the sign-in form', timeout)
        break
      case 'list':
      case 'delete-dialog':
      case 'palette':
      case 'shortcuts':
        await until(() => has('tbody tr'), 'the list rows', timeout)
        if (name === 'delete-dialog') {
          const del = button(/^Delete /)
          if (!del) throw new Error('reference screen: no Delete button on the list')
          await act(async () => del.click())
          await until(() => has('[role="alertdialog"]'), 'the delete dialog', timeout)
        } else if (name === 'palette') {
          await press({ key: 'k', ctrlKey: true })
          await until(() => has('[role="combobox"]'), 'the command palette', timeout)
        } else if (name === 'shortcuts') {
          await press({ key: '?' })
          await until(
            () => text('Keyboard shortcuts') && has('[aria-modal="true"]'),
            'the help',
            timeout,
          )
        }
        break
      case 'empty-list':
        await until(() => has('[data-sv-part="empty"]'), 'the empty state', timeout)
        break
      case 'form-errors': {
        await until(() => has('form[data-sv-part="form"]'), 'the form', timeout)
        const submit = c.querySelector<HTMLButtonElement>('button[type="submit"]')
        await act(async () => submit?.click())
        await until(() => has('[aria-invalid="true"]'), 'the field errors', timeout)
        break
      }
      case 'detail':
        await until(() => has('[data-sv-part="details"]'), 'the record', timeout)
        break
    }
  } catch (error) {
    await screen.unmount()
    throw error
  }
  return screen
}
