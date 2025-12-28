/**
 * SessionTimer Component
 *
 * Displays and tracks workout session duration.
 * Features:
 * - Shows elapsed time for in-progress sessions
 * - Shows total duration for completed sessions
 * - Auto-updates every second for active sessions
 */

import { useState, useEffect, useMemo } from 'react'
import type { SessionStatus } from '@lifeos/training'

interface SessionTimerProps {
  startedAtMs?: number
  completedAtMs?: number
  status: SessionStatus
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`
  } else {
    return `${secs}s`
  }
}

export function SessionTimer({ startedAtMs, completedAtMs, status }: SessionTimerProps) {
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  // Update current time for in-progress sessions
  useEffect(() => {
    if (status === 'in_progress' && startedAtMs) {
      const interval = setInterval(() => {
        setCurrentTime(Date.now())
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [status, startedAtMs])

  // Calculate elapsed seconds based on status
  const elapsedSeconds = useMemo(() => {
    if (status === 'in_progress' && startedAtMs) {
      return Math.floor((currentTime - startedAtMs) / 1000)
    } else if (status === 'completed' && startedAtMs && completedAtMs) {
      return Math.floor((completedAtMs - startedAtMs) / 1000)
    }
    return 0
  }, [status, startedAtMs, completedAtMs, currentTime])

  if (status === 'planned' || (!startedAtMs && !completedAtMs)) {
    return null
  }

  return (
    <div className="session-timer">
      <div className="timer-icon">⏱️</div>
      <div className="timer-content">
        <div className="timer-label">
          {status === 'in_progress' ? 'Duration' : 'Total Duration'}
        </div>
        <div className="timer-value">{formatDuration(elapsedSeconds)}</div>
      </div>
    </div>
  )
}
