/**
 * A manual clock for search-as-you-type debounces, so tests never depend on how fast the machine is.
 *
 * Why: the debounced searches (list search 300 ms, command palette and relation picker 250 ms) used
 * real timers, and the tests waited for them with `waitFor`'s 1 s budget. On a loaded machine the
 * typing itself, or the debounce plus the render, took longer: the request had not happened yet
 * (a failed assertion), or a pause between two keystrokes outlasted the debounce (two requests for
 * one word). With this clock, time moves only when a test calls {@link DebounceClock.advance}.
 *
 * Use it by mocking the hook in a test file (the mock keeps every other export of the module):
 *
 * ```ts
 * vi.mock('../src/react/relations.ts', async (importOriginal) => ({
 *   ...(await importOriginal<typeof import('../src/react/relations.ts')>()),
 *   useDebouncedValue: (await import('./debounce-clock.ts')).useManualDebouncedValue,
 * }))
 * ```
 *
 * The real hook's timing (fires once, `delay` ms after the last change) is proven on its own with
 * fake timers in `test/debounce.test.tsx`; {@link useManualDebouncedValue} has the same semantics,
 * driven by this clock instead of `setTimeout`.
 */
import { act } from '@testing-library/react'
import { useEffect, useState } from 'react'

interface Timer {
  readonly at: number
  readonly run: () => void
}

/** A clock whose time only moves when a test says so. */
export interface DebounceClock {
  /** Schedule `run` after `delay` ms of clock time; returns a handle for {@link cancel}. */
  schedule(run: () => void, delay: number): number
  /** Drop a scheduled timer (a newer keystroke restarts the debounce). */
  cancel(handle: number): void
  /** Move time forward, running every timer that falls due, in order, inside React's `act`. */
  advance(ms: number): void
  /** How many timers are waiting. */
  pending(): number
  /** Forget every timer and go back to time 0 (call in `beforeEach`). */
  reset(): void
}

function createDebounceClock(): DebounceClock {
  let now = 0
  let nextHandle = 1
  const timers = new Map<number, Timer>()
  return {
    schedule(run, delay) {
      const handle = nextHandle++
      timers.set(handle, { at: now + delay, run })
      return handle
    },
    cancel(handle) {
      timers.delete(handle)
    },
    advance(ms) {
      const until = now + ms
      for (;;) {
        let due: [number, Timer] | undefined
        for (const entry of timers)
          if (entry[1].at <= until && (!due || entry[1].at < due[1].at)) due = entry
        if (!due) break
        const [handle, timer] = due
        timers.delete(handle)
        now = timer.at
        act(() => timer.run())
      }
      now = until
    },
    pending: () => timers.size,
    reset() {
      timers.clear()
      now = 0
    },
  }
}

/** The clock every mocked debounce in this test file uses. */
export const debounceClock: DebounceClock = createDebounceClock()

/**
 * `useDebouncedValue` on {@link debounceClock}: the value updates `delay` ms of clock time after it
 * stops changing; every change restarts the wait.
 */
export function useManualDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handle = debounceClock.schedule(() => setDebounced(value), delay)
    return () => debounceClock.cancel(handle)
  }, [value, delay])
  return debounced
}
