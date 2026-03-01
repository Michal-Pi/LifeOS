import { useState, useEffect } from 'react'

/**
 * Returns a Date that auto-updates at a given interval.
 * Default interval: 60 seconds.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
