import { describe, it, expect, vi } from 'vitest'
import { getFullSyncTimeMin, isSyncTokenInvalid } from '../syncHelpers.js'

describe('syncHelpers', () => {
  it('computes 90-day lookback timeMin', () => {
    vi.useFakeTimers()
    const now = new Date('2025-01-01T00:00:00Z')
    vi.setSystemTime(now)

    const timeMin = getFullSyncTimeMin()
    const diffMs = now.getTime() - new Date(timeMin).getTime()
    const days = Math.round(diffMs / (24 * 60 * 60 * 1000))
    expect(days).toBe(90)

    vi.useRealTimers()
  })

  it('detects invalid sync token errors', () => {
    expect(isSyncTokenInvalid({ code: 'SYNC_TOKEN_INVALID' })).toBe(true)
    expect(isSyncTokenInvalid({ message: 'SYNC_TOKEN_INVALID' })).toBe(true)
    expect(isSyncTokenInvalid({ message: 'other' })).toBe(false)
  })
})
