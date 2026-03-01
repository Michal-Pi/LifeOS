import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useNow } from '../useNow'

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a Date on initial render', () => {
    const { result } = renderHook(() => useNow())
    expect(result.current).toBeInstanceOf(Date)
  })

  it('updates every intervalMs', () => {
    const { result } = renderHook(() => useNow(1000))
    const initial = result.current.getTime()

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.getTime()).toBeGreaterThan(initial)
  })

  it('uses 60s default interval', () => {
    const { result } = renderHook(() => useNow())
    const initial = result.current.getTime()

    // After 30s — no update yet
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(result.current.getTime()).toBe(initial)

    // After another 30s (60s total) — should update
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(result.current.getTime()).toBeGreaterThan(initial)
  })

  it('cleans up interval on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const { unmount } = renderHook(() => useNow(1000))

    unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})
