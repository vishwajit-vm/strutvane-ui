import { defineConfig } from 'tsdown'

// Entry points: the root (re-exports the framework-free core), `./core`, `./react`, `./design`
// (the Design contract), `./design/plain` (the fallback design) and `./testing` (the conformance
// kit). React, TanStack, the framework, vitest and axe-core are peer dependencies and stay external.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'react/index': 'src/react/index.ts',
    'design/index': 'src/design/index.ts',
    'design/plain/index': 'src/design/plain/index.ts',
    'testing/index': 'src/testing/index.ts',
  },
  format: 'esm',
  platform: 'neutral',
  // .mjs / .d.mts like every other Strutvane package (platform 'neutral' would otherwise emit .js).
  fixedExtension: true,
  target: 'es2024',
  dts: true,
  sourcemap: true,
  clean: true,
})
