import { defineConfig } from 'tsdown'

// Three entry points: the root (re-exports the framework-free core), `./core` and `./react`.
// React and TanStack are peer dependencies and stay external.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'react/index': 'src/react/index.ts',
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
