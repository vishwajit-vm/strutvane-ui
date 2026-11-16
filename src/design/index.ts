/**
 * `@strutvane/ui/design`: the Design contract.
 *
 * `@strutvane/ui` has no look of its own. A design package (Crisp, Vivid, or a community design)
 * provides tokens for light and dark, fonts, the shell, component skins, a chart palette and
 * illustrations through {@link defineDesign}; `<DesignProvider>` puts it on screen. Every design
 * maps the four public override tokens (`--brand-hue`, `--font-sans`, `--radius`, `--density`) and
 * passes `designConformance()` from `@strutvane/ui/testing`. The guide is `docs/design-contract.md`.
 *
 * @module
 */
export { contrastRatio, type LinearRgb, luminance, parseColor, resolveVars } from './color.ts'
export {
  DesignContext,
  type DesignContextValue,
  DesignProvider,
  type DesignProviderProps,
  THEME_SCRIPT,
  THEME_SCRIPT_HASH,
  THEME_STORAGE_KEY,
  type ThemePreference,
  useDesign,
} from './DesignProvider.tsx'
export {
  type ChartPalette,
  type Design,
  type DesignDefinition,
  DesignError,
  type DesignFonts,
  defineDesign,
  isColorValue,
  isLengthValue,
  isSafeCssValue,
  overrideProblems,
  safeOverrides,
  validateDesign,
} from './define-design.ts'
export {
  type AlertProps,
  type AuthLayoutProps,
  type BadgeProps,
  type ButtonProps,
  type ButtonVariant,
  type CardProps,
  type CheckboxProps,
  type ChipProps,
  type DialogProps,
  type FieldProps,
  type IconProps,
  ILLUSTRATION_SLOTS,
  type IllustrationProps,
  type IllustrationSlots,
  type InputProps,
  type NavLinkProps,
  type PageHeaderProps,
  type PopoverProps,
  type SelectProps,
  SHELL_SLOTS,
  type ShellProps,
  type ShellSlots,
  type SidebarLinkView,
  type SidebarProps,
  SKIN_SLOTS,
  type SkeletonProps,
  type SkinSlots,
  type TableProps,
  type TextareaProps,
  type ToastProps,
  type Tone,
  type TopBarProps,
} from './slots.ts'
export {
  COMPACT_STEP,
  customPropertiesFor,
  declaredAt,
  designSelector,
  designStylesheet,
  resolveDeclarations,
  resolveDesignTokens,
  type StylesheetOptions,
  type ThemeName,
} from './stylesheet.ts'
export {
  COLOR_TOKENS,
  CONTRAST_PAIRS,
  type ColorToken,
  type ColorTokens,
  type ContrastPair,
  type CssColor,
  type CssLength,
  chartVar,
  cssVar,
  EXTRA_VARS,
  PUBLIC_OVERRIDE_TOKENS,
  type PublicDefaults,
  type PublicOverrides,
  type PublicOverrideToken,
  SCALE_TOKENS,
  type ScaleToken,
  type ScaleTokens,
  type ThemeTokens,
} from './tokens.ts'
