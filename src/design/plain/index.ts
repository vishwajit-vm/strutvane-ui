/**
 * `@strutvane/ui/design/plain`: the neutral fallback design.
 *
 * Tiny and deliberately unstyled beyond legibility: system fonts, quiet greys, one accent from
 * `--brand-hue`. It exists so that tests, and apps that haven't installed Crisp or Vivid, still get
 * an accessible, usable admin. It passes `designConformance()` like any other design, which also
 * makes it the reference a third party can read when building one.
 *
 * ```tsx
 * import { plain } from '@strutvane/ui/design/plain'
 * <DesignProvider design={plain}>…</DesignProvider>
 * ```
 *
 * @module
 */
import { type Design, defineDesign } from '../define-design.ts'
import {
  Alert,
  AuthLayout,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  Dialog,
  Field,
  Icon,
  Input,
  NoIllustration,
  PageHeader,
  Popover,
  Select,
  Shell,
  Sidebar,
  Skeleton,
  Table,
  Textarea,
  Toast,
  TopBar,
} from './components.tsx'
import { PLAIN_STYLESHEET } from './styles.ts'
import { chartPalette, dark, light, scale } from './tokens.ts'

/** The plain design. */
export const plain: Design = defineDesign({
  name: 'plain',
  description: 'Neutral and unstyled: the fallback when no design package is installed.',
  tokens: { light, dark },
  scale,
  defaults: { brandHue: 255, radius: '6px', density: 1 },
  fonts: {
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  },
  shell: { Shell, Sidebar, TopBar, AuthLayout, PageHeader },
  skins: {
    Button,
    Input,
    Textarea,
    Select,
    Checkbox,
    Field,
    Card,
    Badge,
    Alert,
    Table,
    Dialog,
    Popover,
    Toast,
    Chip,
    Skeleton,
    Icon,
  },
  chartPalette,
  illustrations: {
    Empty: NoIllustration,
    NotFound: NoIllustration,
    Forbidden: NoIllustration,
    Error: NoIllustration,
  },
  stylesheet: PLAIN_STYLESHEET,
})
