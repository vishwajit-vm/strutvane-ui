/**
 * `@strutvane/ui/testing`: the design conformance kit.
 *
 * `designConformance(design)` registers the vitest suite every design must pass (slots, WCAG AA
 * contrast in both themes, no hard-coded colours, the public override tokens, no overflow at
 * 375 px, axe on the reference screens). The individual checks are exported too, as pure functions
 * returning problems, plus the reference app (manifest and in-memory API) the screens run on.
 *
 * Needs `vitest` (and `axe-core` for the accessibility pass) in the design's devDependencies, and
 * a DOM environment for the rendered checks (`// @vitest-environment jsdom`).
 *
 * @module
 */
export { axeViolations } from './axe.ts'
export {
  checkContrast,
  checkInjectedOverrides,
  checkOverflowDom,
  checkOverflowStylesheet,
  checkOverrides,
  checkSlots,
  checkSourceColours,
  HUE_STEPS,
  OVERRIDE_SAMPLES,
  PHONE_WIDTH,
  type SourceOptions,
} from './checks.ts'
export { findHardCodedColours } from './colours.ts'
export { type ConformanceOptions, designConformance } from './conformance.tsx'
export {
  createReferenceApi,
  type ReferenceApi,
  type ReferenceApiOptions,
  type ReferenceRequest,
  referenceManifest,
} from './reference-api.ts'
export {
  mount,
  REFERENCE_SCREENS,
  type ReferenceScreen,
  type RenderedScreen,
  type RenderOptions,
  renderReferenceScreen,
} from './screens.tsx'
