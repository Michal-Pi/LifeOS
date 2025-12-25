/**
 * useCalendarAccountStatus Hook
 *
 * Manages fetching of calendar account status.
 */
import { useState, useEffect } from 'react'
import type { CalendarAccountStatus } from '@lifeos/calendar'
import { fetchCalendarAccountStatus } from '@/lib/accountStatus'

const ACCOUNT_ID = 'primary'

export function useCalendarAccountStatus(userId: string) {
  const [accountStatus, setAccountStatus] = useState<CalendarAccountStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!userId) {
      setAccountStatus(null)
      setLoading(false)
      return
    }

    let active = true
    const loadStatus = async () => {
      setLoading(true)
      setError(null)
      try {
        const status = await fetchCalendarAccountStatus(userId, ACCOUNT_ID)
        if (active) {
          setAccountStatus(status)
        }
      } catch (err) {
        if (active) {
          setError(err as Error)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadStatus()

    return () => {
      active = false
    }
  }, [userId])

  return { accountStatus, loading, error }
}
