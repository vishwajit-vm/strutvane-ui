/**
 * `designConformance(design)`: the vitest suite every design must pass before it is listed
 * (blueprint §5.1, §3.3). Put it in a test file of the design package:
 *
 * ```ts
 * // test/conformance.test.ts
 * // @vitest-environment jsdom
 * import { designConformance } from '@strutvane/ui/testing'
 * import { crisp } from '../src/index.ts'
 * designConformance(crisp, { sources: ['src'], tokenFiles: ['src/tokens.ts'] })
 * ```
 *
 * It checks, each as its own test:
 * 1. every slot is present and every token well-formed;
 * 2. every required token pair meets WCAG AA in light and dark (at every brand hue, when the
 *    accent follows `--brand-hue`);
 * 3. no hard-coded colours outside the token files (the stylesheet, font faces and `sources`);
 * 4. each public override token (`--brand-hue`, `--font-sans`, `--radius`, `--density`) changes
 *    the rendered result, and `<DesignProvider>` emits the overrides into the injected stylesheet;
 * 5. no horizontal overflow at 375 px: structurally (no fixed widths wider than a phone; tables
 *    scroll inside a positioned box; `<main>` can shrink). The visual browser check is in
 *    `docs/design-contract.md`;
 * 6. axe finds 0 violations on every reference screen rendered with the design.
 *
 * @module
 */
import { describe, expect, it } from 'vitest'
import { DesignProvider } from '../design/DesignProvider.tsx'
import type { Design } from '../design/define-design.ts'
import { axeViolations } from './axe.ts'
import {
  checkContrast,
  checkInjectedOverrides,
  checkOverflowDom,
  checkOverflowStylesheet,
  checkOverrides,
  checkSlots,
  checkSourceColours,
  OVERRIDE_SAMPLES,
  type SourceOptions,
} from './checks.ts'
import {
  mount,
  REFERENCE_SCREENS,
  type ReferenceScreen,
  renderReferenceScreen,
} from './screens.tsx'

/** Options for {@link designConformance}. */
export interface ConformanceOptions extends SourceOptions {
  /** The reference screens to render (default: all of them). */
  readonly screens?: readonly ReferenceScreen[]
  /** Per-test timeout for rendered screens, in ms. Default 30,000. */
  readonly timeout?: number
}

/**
 * Register the conformance suite for `design` (call it at the top level of a test file).
 *
 * @example
 * designConformance(plain, { sources: ['src/design/plain'], tokenFiles: ['src/design/plain/tokens.ts'] })
 */
export function designConformance(design: Design, options: ConformanceOptions = {}): void {
  const timeout = options.timeout ?? 30_000
  describe(`design "${String(design.name)}" conformance`, () => {
    it('provides every slot, with well-formed tokens', () => {
      expect(checkSlots(design)).toEqual([])
    })

    it('meets WCAG AA contrast for every token pair, in light and dark', () => {
      expect(checkContrast(design)).toEqual([])
    })

    it('has no hard-coded colours outside its token files', () => {
      expect(checkSourceColours(design, options)).toEqual([])
    })

    it('maps every public override token, and each one changes the result', () => {
      expect(checkOverrides(design)).toEqual([])
    })

    it('emits the overrides into the stylesheet it injects', async () => {
      const screen = await mount(
        <DesignProvider design={design} overrides={OVERRIDE_SAMPLES} nonce="conformance">
          <p>overrides</p>
        </DesignProvider>,
      )
      try {
        const style = screen.container.querySelector('style')
        expect(style?.getAttribute('nonce') ?? style?.nonce).toBe('conformance')
        expect(checkInjectedOverrides(design, style?.textContent ?? '')).toEqual([])
      } finally {
        await screen.unmount()
      }
    })

    it('has no fixed width wider than a 375 px phone', () => {
      expect(checkOverflowStylesheet(design)).toEqual([])
    })

    for (const name of options.screens ?? REFERENCE_SCREENS) {
      it(
        `reference screen "${name}": axe finds no violations and nothing overflows at 375 px`,
        async () => {
          const screen = await renderReferenceScreen(design, name)
          try {
            expect(await axeViolations(screen.container)).toEqual([])
            expect(checkOverflowDom(screen.container)).toEqual([])
          } finally {
            await screen.unmount()
          }
        },
        timeout,
      )
    }
  })
}
