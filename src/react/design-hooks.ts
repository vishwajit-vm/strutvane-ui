/**
 * How behaviour components reach the design: the slots of the nearest `<DesignProvider>`, or the
 * plain design's when there is none.
 *
 * Why a fallback instead of an error: a widget or a cell rendered in an app's own page, or in a
 * unit test, should still work. The plain design is the neutral fallback by definition, so using
 * its components there is correct (it only lacks its injected stylesheet, which
 * `<StrutvaneApp>` and `<DesignProvider>` add).
 *
 * @module
 */
import { useContext } from 'react'
import { DesignContext } from '../design/DesignProvider.tsx'
import type { Design } from '../design/define-design.ts'
import { plain } from '../design/plain/index.ts'
import type { IllustrationSlots, ShellSlots, SkinSlots } from '../design/slots.ts'

/** The design in effect: the provider's, else the plain design. */
export function useActiveDesign(): Design {
  return useContext(DesignContext)?.design ?? plain
}

/**
 * The component skins of the design in effect.
 *
 * @example
 * const { Button } = useSkins()
 * return <Button variant="primary">Save</Button>
 */
export function useSkins(): SkinSlots {
  return useActiveDesign().skins
}

/** The shell slots of the design in effect. */
export function useShellSlots(): ShellSlots {
  return useActiveDesign().shell
}

/** The illustrations of the design in effect. */
export function useIllustrations(): IllustrationSlots {
  return useActiveDesign().illustrations
}
