// @vitest-environment jsdom
import { plain } from '../../src/design/plain/index.ts'
import { designConformance } from '../../src/testing/index.ts'

designConformance(plain, {
  sources: ['src/design/plain'],
  tokenFiles: ['src/design/plain/tokens.ts'],
})
