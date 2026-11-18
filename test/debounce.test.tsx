// @vitest-environment jsdom
// The real search debounce, on fake timers: nothing else is asynchronous here, so the timing is
// exact and independent of machine load. Screen tests drive the same semantics through the manual
// clock in `debounce-clock.ts`.
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useDebouncedValue } from '../src/react/relations.ts'
import { debounceClock, useManualDebouncedValue } from './debounce-clock.ts'

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('updates once, delay ms after the last change; every change restarts the wait', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: '' },
    })
    for (const value of ['I', 'IN', 'INV']) {
      rerender({ value })
      act(() => vi.advanceTimersByTime(299)) // a slow typist: still inside the window
      expect(result.current).toBe('')
    }
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('INV')
    expect(vi.getTimerCount()).toBe(0)
  })

  test('unmounting cancels the pending update', () => {
    const { rerender, unmount } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: 'a' },
    })
    rerender({ value: 'ab' })
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('the manual debounce clock (test helper) behaves like the real hook', () => {
  beforeEach(() => debounceClock.reset())

  test('updates once, delay ms of clock time after the last change', () => {
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useManualDebouncedValue(value, 300),
      { initialProps: { value: '' } },
    )
    for (const value of ['I', 'IN', 'INV']) {
      rerender({ value })
      debounceClock.advance(299)
      expect(result.current).toBe('')
    }
    expect(debounceClock.pending()).toBe(1)
    debounceClock.advance(1)
    expect(result.current).toBe('INV')
    expect(debounceClock.pending()).toBe(0)
    rerender({ value: 'INV-1' })
    unmount()
    expect(debounceClock.pending()).toBe(0)
  })
})
