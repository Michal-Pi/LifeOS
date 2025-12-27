'use client'

import { useMemo } from 'react'
import type { AttendeeAvailability } from './AvailabilityTimeline.utils'

interface AvailabilityTimelineProps {
  attendees: AttendeeAvailability[]
  rangeStartMs: number
  rangeEndMs: number
  proposedStartMs?: number
  proposedEndMs?: number
  onSelectTime?: (startMs: number, endMs: number) => void
}

/**
 * Display a timeline showing busy/free blocks for attendees
 * Used for scheduling to highlight conflicts
 */
export function AvailabilityTimeline({
  attendees,
  rangeStartMs,
  rangeEndMs,
  proposedStartMs,
  proposedEndMs,
}: AvailabilityTimelineProps) {
  const rangeMs = rangeEndMs - rangeStartMs
  const hourMs = 60 * 60 * 1000

  // Generate hour markers
  const hours = useMemo(() => {
    const result: number[] = []
    const hrMs = hourMs
    let current = Math.ceil(rangeStartMs / hrMs) * hrMs
    while (current < rangeEndMs) {
      result.push(current)
      current += hrMs
    }
    return result
  }, [rangeStartMs, rangeEndMs, hourMs])

  // Check if proposed time conflicts with any busy block
  const hasConflict = useMemo(() => {
    if (!proposedStartMs || !proposedEndMs) return false

    return attendees.some((attendee) =>
      attendee.busy.some((block) => proposedStartMs < block.endMs && proposedEndMs > block.startMs)
    )
  }, [attendees, proposedStartMs, proposedEndMs])

  // Calculate position as percentage
  const getPosition = (ms: number) => ((ms - rangeStartMs) / rangeMs) * 100
  const getWidth = (startMs: number, endMs: number) => ((endMs - startMs) / rangeMs) * 100

  return (
    <div className="availability-timeline">
      {/* Hour markers */}
      <div className="timeline-hours">
        {hours.map((hour) => (
          <div key={hour} className="hour-marker" style={{ left: `${getPosition(hour)}%` }}>
            <span className="hour-label">
              {new Date(hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>

      {/* Attendee rows */}
      <div className="attendee-rows">
        {attendees.map((attendee) => (
          <div key={attendee.email} className="attendee-row">
            <div className="attendee-label">
              <span className="attendee-email" title={attendee.email}>
                {attendee.email.split('@')[0]}
              </span>
              {attendee.error && (
                <span className="attendee-error" title={attendee.error}>
                  ⚠️
                </span>
              )}
            </div>
            <div className="attendee-timeline">
              {/* Busy blocks */}
              {attendee.busy.map((block, i) => (
                <div
                  key={i}
                  className="busy-block"
                  style={{
                    left: `${getPosition(block.startMs)}%`,
                    width: `${getWidth(block.startMs, block.endMs)}%`,
                  }}
                  title={`Busy: ${formatTime(block.startMs)} - ${formatTime(block.endMs)}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Proposed time overlay */}
      {proposedStartMs && proposedEndMs && (
        <div
          className={`proposed-time ${hasConflict ? 'conflict' : 'available'}`}
          style={{
            left: `${getPosition(proposedStartMs)}%`,
            width: `${getWidth(proposedStartMs, proposedEndMs)}%`,
          }}
        >
          <span className="proposed-label">{hasConflict ? '⚠️ Conflict' : '✓ Available'}</span>
        </div>
      )}

      {/* Conflict warning */}
      {hasConflict && (
        <div className="conflict-warning">
          <span className="warning-icon">⚠️</span>
          <span className="warning-text">
            The proposed time conflicts with one or more attendees&apos; busy periods
          </span>
        </div>
      )}
    </div>
  )
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}
