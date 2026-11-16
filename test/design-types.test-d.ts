// Type-level tests for the Design contract: misuse must fail to compile (checked by tsc and by
// vitest's typecheck mode; nothing here runs).
import type { ComponentType } from 'react'
import { describe, expectTypeOf, test } from 'vitest'
import type {
  ButtonProps,
  ColorTokens,
  Design,
  DesignDefinition,
  PublicOverrides,
  ScaleTokens,
  SkinSlots,
  TableProps,
} from '../src/design/index.ts'
import { defineDesign } from '../src/design/index.ts'
import { plain } from '../src/design/plain/index.ts'

const base: DesignDefinition = plain

describe('defineDesign', () => {
  test('a complete definition compiles and returns a Design', () => {
    expectTypeOf(defineDesign({ ...base })).toExtend<Design>()
  })

  test('a missing slot fails to compile', () => {
    const { Button: _button, ...skins } = plain.skins
    // @ts-expect-error skins.Button is required
    defineDesign({ ...base, skins })
    const { Sidebar: _sidebar, ...shell } = plain.shell
    // @ts-expect-error shell.Sidebar is required
    defineDesign({ ...base, shell })
    const { Empty: _empty, ...illustrations } = plain.illustrations
    // @ts-expect-error illustrations.Empty is required
    defineDesign({ ...base, illustrations })
    const { stylesheet: _css, ...noCss } = base
    // @ts-expect-error the stylesheet is required
    defineDesign(noCss)
  })

  test('a slot with the wrong props fails to compile', () => {
    const Wrong: ComponentType<{ readonly label: number }> = () => null
    // @ts-expect-error the Button skin must accept ButtonProps
    const skins: SkinSlots = { ...plain.skins, Button: Wrong }
    expectTypeOf(skins).toExtend<SkinSlots>()
  })

  test('a token of the wrong type fails to compile', () => {
    // @ts-expect-error a colour token is a CSS colour (hex, rgb(), oklch()), not a colour name
    const named: ColorTokens = { ...plain.tokens.light.color, accent: 'blue' }
    // @ts-expect-error a colour token is a string
    const numeric: ColorTokens = { ...plain.tokens.light.color, fg: 0 }
    // @ts-expect-error every colour role is required
    const missing: ColorTokens = { bg: '#fff' }
    // @ts-expect-error a length needs a unit (px, rem) or calc()/var()
    const unitless: ScaleTokens = { ...plain.scale, radiusMd: '6' }
    // @ts-expect-error the chart palette needs at least four colours
    defineDesign({ ...base, chartPalette: { light: ['#fff'], dark: plain.chartPalette.dark } })
    expectTypeOf([named, numeric, missing, unitless]).not.toBeNever()
  })

  test('public overrides are typed', () => {
    expectTypeOf<PublicOverrides['radius']>().toEqualTypeOf<
      `${number}px` | `${number}rem` | `calc(${string})` | `var(${string})` | undefined
    >()
    // @ts-expect-error the hue is a number of degrees
    const hue: PublicOverrides = { brandHue: 'blue' }
    expectTypeOf(hue).not.toBeNever()
  })
})

describe('slot props', () => {
  test('Button variants are a closed set; Table hands over prop bags', () => {
    expectTypeOf<ButtonProps['variant']>().toEqualTypeOf<
      'primary' | 'secondary' | 'ghost' | 'danger' | undefined
    >()
    // @ts-expect-error not a variant
    const bad: ButtonProps = { variant: 'link' }
    expectTypeOf(bad).not.toBeNever()
    expectTypeOf<TableProps['density']>().toEqualTypeOf<'default' | 'compact'>()
  })
})
