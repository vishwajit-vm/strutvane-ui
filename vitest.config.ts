import { defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from './vitest.shared.ts'

// Repo-specific overrides. Shared defaults come from strutvane-tooling.
// - `core` tests run in the default `node` environment (it is framework-free by design);
//   React tests opt into jsdom with a `// @vitest-environment jsdom` file comment.
// - jsdom (not happy-dom): axe-core relies on DOM accessibility APIs that jsdom implements more
//   completely. Neither does layout, so color-contrast must be checked in a real browser.
export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ['test/**/*.test.{ts,tsx}'],
      testTimeout: 20_000,
      coverage: {
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/index.ts', 'src/**/index.tsx'],
      },
    },
  }),
)
