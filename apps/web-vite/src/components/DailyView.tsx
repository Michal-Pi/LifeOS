/**
 * Daily View Component - Calendar Day Display
 *
 * Displays a single day's events in a timeline format with hours of the day.
 * Shows event cards positioned by their start time, with duration represented
 * by the card height.
 *
 * Features:
 * - Timeline with hour markers (00:00 - 23:59)
 * - Event cards positioned by time
 * - All-day events shown at the top
 * - Color-coded by calendar and event type
 * - Click to select/edit events
 * - Smooth scrolling to current time
 */

import type { CanonicalCalendarEvent, RecurrenceInstance } from '@lifeos/calendar'
import React, { useMemo, useEffect, useRef } from 'react'

interface DailyViewProps {
  /** Date to display */
  date: Date
  /** Calendar events to display */
  events: CanonicalCalendarEvent[]
  /** Recurrence instances for complex recurring events */
  instances?: RecurrenceInstance[]
  /** Callback when an event is selected */
  onEventSelect?: (event: CanonicalCalendarEvent) => void
  /** Currently selected event ID */
  selectedEventId?: string
  /** Calendar objects for color mapping */
  calendarsById?: Map<string, { calendarId: string; name: string; color?: string }>
  /** Loading state */
  loading?: boolean
}

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/**
 * Calculate the position of an event in the timeline (0-100%)
 */
function getEventPosition(startMs: number, dayStartMs: number, dayEndMs: number): number {
  const dayDuration = dayEndMs - dayStartMs
  const offset = startMs - dayStartMs
  return Math.max(0, Math.min(100, (offset / dayDuration) * 100))
}

/**
 * Calculate the height of an event card (0-100%)
 */
function getEventHeight(
  startMs: number,
  endMs: number,
  dayStartMs: number,
  dayEndMs: number
): number {
  const dayDuration = dayEndMs - dayStartMs
  const eventDuration = endMs - startMs
  return Math.max(2, Math.min(100, (eventDuration / dayDuration) * 100)) // Min 2% for visibility
}

/**
 * Detect overlapping events and calculate layout (columns and positions)
 */
interface EventLayout {
  left: number // Percentage from left (0-100)
  width: number // Percentage width (0-100)
}

function calculateEventLayout(events: CanonicalCalendarEvent[]): Map<string, EventLayout> {
  const layout = new Map<string, EventLayout>()

  if (events.length === 0) {
    return layout
  }

  const sorted = [...events].sort((a, b) => a.startMs - b.startMs)
  const clusters: CanonicalCalendarEvent[][] = []
  let currentCluster: CanonicalCalendarEvent[] = []
  let currentEnd = -Infinity

  for (const event of sorted) {
    if (currentCluster.length === 0 || event.startMs < currentEnd) {
      currentCluster.push(event)
      currentEnd = Math.max(currentEnd, event.endMs)
    } else {
      clusters.push(currentCluster)
      currentCluster = [event]
      currentEnd = event.endMs
    }
  }

  if (currentCluster.length > 0) {
    clusters.push(currentCluster)
  }

  for (const cluster of clusters) {
    const columns: CanonicalCalendarEvent[][] = []

    for (const event of cluster) {
      let placed = false

      for (const column of columns) {
        const lastEvent = column[column.length - 1]
        if (event.startMs >= lastEvent.endMs) {
          column.push(event)
          placed = true
          break
        }
      }

      if (!placed) {
        columns.push([event])
      }
    }

    const totalColumns = Math.max(1, columns.length)
    const columnWidth = 100 / totalColumns

    for (let colIndex = 0; colIndex < columns.length; colIndex++) {
      const column = columns[colIndex]
      for (const event of column) {
        layout.set(event.canonicalEventId, { left: columnWidth * colIndex, width: columnWidth })
      }
    }
  }

  return layout
}

/**
 * DailyView Component
 *
 * Renders a single day's calendar view with a timeline showing hours
 * and event cards positioned by their start time.
 */
export function DailyView({
  date,
  events,
  instances = [],
  onEventSelect,
  selectedEventId,
  calendarsById = new Map(),
  loading = false,
}: DailyViewProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const now = useMemo(() => new Date(), [])

  // Calculate responsive timeline height based on viewport
  const timelineHeight = useMemo(() => {
    if (typeof window === 'undefined') return 2400 // SSR fallback

    const viewportHeight = window.innerHeight
    const headerHeight = 120 // Approximate header + all-day section height
    const padding = 40
    const calculatedHeight = Math.max(600, viewportHeight - headerHeight - padding)

    // For mobile, use smaller hour height (40px), for desktop use 100px
    const isMobile = window.innerWidth < 768
    const hourHeight = isMobile ? 40 : 100
    const hoursInView = Math.ceil(calculatedHeight / hourHeight)

    // Ensure we show at least 12 hours, but calculate based on viewport
    return Math.max(12 * hourHeight, hoursInView * hourHeight)
  }, [])

  // Calculate hour height dynamically
  const hourHeight = useMemo(() => {
    if (typeof window === 'undefined') return 100
    const isMobile = window.innerWidth < 768
    return isMobile ? 40 : 100
  }, [])

  // Calculate day boundaries (00:00 to 23:59:59)
  const dayStart = useMemo(() => {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }, [date])

  const dayEnd = useMemo(() => {
    const d = new Date(date)
    d.setHours(23, 59, 59, 999)
    return d.getTime()
  }, [date])

  // Filter events for this day
  const dayEvents = useMemo(() => {
    const filtered: CanonicalCalendarEvent[] = []

    // Add regular events that occur on this day
    for (const event of events) {
      if (event.startMs < dayEnd && event.endMs > dayStart) {
        filtered.push(event)
      }
    }

    // Add recurrence instances for this day
    for (const instance of instances) {
      if (instance.startMs < dayEnd && instance.endMs > dayStart) {
        // Find the master event
        const masterEvent = events.find((e) => e.canonicalEventId === instance.seriesId)
        if (masterEvent) {
          // Create a synthetic event for this instance
          filtered.push({
            ...masterEvent,
            canonicalEventId: `${masterEvent.canonicalEventId}-${instance.startMs}`,
            startMs: instance.startMs,
            endMs: instance.endMs,
            startIso: new Date(instance.startMs).toISOString(),
            endIso: new Date(instance.endMs).toISOString(),
          })
        }
      }
    }

    // Sort by start time
    return filtered.sort((a, b) => a.startMs - b.startMs)
  }, [dayEnd, dayStart, events, instances])

  // Separate all-day events from timed events
  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay: CanonicalCalendarEvent[] = []
    const timed: CanonicalCalendarEvent[] = []

    for (const event of dayEvents) {
      if (event.allDay) {
        allDay.push(event)
      } else {
        timed.push(event)
      }
    }

    return { allDayEvents: allDay, timedEvents: timed }
  }, [dayEvents])

  // Calculate layout for overlapping events
  const eventLayout = useMemo(() => {
    return calculateEventLayout(timedEvents)
  }, [timedEvents])

  // Generate hour markers (00:00 to 23:00)
  const hours = useMemo(() => {
    const h: number[] = []
    for (let hour = 0; hour < 24; hour++) {
      const d = new Date(date)
      d.setHours(hour, 0, 0, 0)
      h.push(d.getTime())
    }
    return h
  }, [date])

  // Scroll to current time on mount (if viewing today)
  useEffect(() => {
    if (timelineRef.current && isSameDay(date, now)) {
      const currentHour = now.getHours()
      const scrollPosition = (currentHour / 24) * timelineRef.current.scrollHeight
      timelineRef.current.scrollTo({
        top: scrollPosition - 200, // Offset to show current time in view
        behavior: 'smooth',
      })
    }
  }, [date, now])

  // Helper to check if two dates are the same day
  function isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    )
  }

  // Get calendar color for event
  function getEventColor(event: CanonicalCalendarEvent): string {
    const calendar = calendarsById.get(event.calendarId ?? '')
    if (calendar?.color) {
      return calendar.color
    }
    // Default colors based on event type
    const isRecurring = Boolean(
      event.isRecurringSeries ||
      event.recurrenceV2?.rule ||
      event.recurrence?.recurrenceRules?.length
    )
    const hasGuests = (event.attendees?.length ?? 0) > 0
    if (hasGuests) return 'var(--info)'
    if (isRecurring) return 'var(--success)'
    return 'var(--muted-foreground)'
  }

  return (
    <div className="daily-view">
      {/* Header */}
      <div className="daily-view-header">
        <h2 className="daily-view-title">
          {date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </h2>
        {isSameDay(date, now) && <span className="daily-view-today-badge">Today</span>}
      </div>

      {/* All-day events section */}
      {allDayEvents.length > 0 && (
        <div className="daily-all-day-section">
          <div className="daily-all-day-label">All Day</div>
          <div className="daily-all-day-events">
            {allDayEvents.map((event) => {
              const isSelected = selectedEventId === event.canonicalEventId
              const color = getEventColor(event)
              const isRecurring = Boolean(
                event.isRecurringSeries ||
                event.recurrenceV2?.rule ||
                event.recurrence?.recurrenceRules?.length
              )

              return (
                <button
                  key={event.canonicalEventId}
                  type="button"
                  className={`daily-all-day-event ${isSelected ? 'selected' : ''}`}
                  onClick={() => onEventSelect?.(event)}
                  style={{ borderLeftColor: color }}
                >
                  <span className="daily-event-title">{event.title || 'Untitled Event'}</span>
                  {isRecurring && (
                    <span className="daily-recurrence-icon" title="Recurring">
                      ↻
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div
        className="daily-timeline-container"
        ref={timelineRef}
        style={
          {
            '--timeline-height': `${timelineHeight}px`,
            '--hour-height': `${hourHeight}px`,
          } as React.CSSProperties
        }
      >
        {loading ? (
          <div className="daily-timeline-skeleton">
            {Array.from({ length: 24 }).map((_, i) => (
              <div
                key={i}
                className="daily-hour-skeleton"
                style={{ top: `${(i / 24) * timelineHeight}px` }}
              />
            ))}
          </div>
        ) : (
          <>
            {/* Hour markers */}
            <div className="daily-hour-markers">
              {hours.map((hourMs) => {
                const hour = new Date(hourMs)
                const isCurrentHour = isSameDay(date, now) && hour.getHours() === now.getHours()
                const hourPosition = (hour.getHours() / 24) * timelineHeight
                return (
                  <div
                    key={hourMs}
                    className={`daily-hour-marker ${isCurrentHour ? 'current' : ''}`}
                    style={{ top: `${hourPosition}px` }}
                  >
                    <span className="daily-hour-label">{timeFormatter.format(hour)}</span>
                    {isCurrentHour && <div className="daily-current-time-indicator" />}
                  </div>
                )
              })}
            </div>

            {/* Event cards */}
            <div className="daily-events-container">
              {timedEvents.map((event) => {
                const isSelected = selectedEventId === event.canonicalEventId
                const color = getEventColor(event)
                const isRecurring = Boolean(
                  event.isRecurringSeries ||
                  event.recurrenceV2?.rule ||
                  event.recurrence?.recurrenceRules?.length
                )
                const hasGuests = (event.attendees?.length ?? 0) > 0

                const top = getEventPosition(event.startMs, dayStart, dayEnd)
                const height = getEventHeight(event.startMs, event.endMs, dayStart, dayEnd)

                // Get layout for overlapping events
                const layout = eventLayout.get(event.canonicalEventId) || { left: 0, width: 100 }

                return (
                  <button
                    key={event.canonicalEventId}
                    type="button"
                    className={`daily-event-card ${isSelected ? 'selected' : ''} ${
                      hasGuests ? 'has-guests' : ''
                    } ${isRecurring ? 'is-recurring' : ''}`}
                    onClick={() => onEventSelect?.(event)}
                    style={{
                      top: `${top}%`,
                      height: `${height}%`,
                      left: `${layout.left}%`,
                      width: `${layout.width}%`,
                      borderLeftColor: color,
                      backgroundColor: `${color}15`, // 15% opacity
                    }}
                    title={`${event.title || 'Untitled Event'} - ${timeFormatter.format(
                      new Date(event.startMs)
                    )} - ${timeFormatter.format(new Date(event.endMs))}`}
                  >
                    <div className="daily-event-time">
                      {timeFormatter.format(new Date(event.startMs))} -{' '}
                      {timeFormatter.format(new Date(event.endMs))}
                    </div>
                    <div className="daily-event-title">{event.title || 'Untitled Event'}</div>
                    {event.location && (
                      <div className="daily-event-location">📍 {event.location}</div>
                    )}
                    {isRecurring && (
                      <span className="daily-recurrence-icon" title="Recurring">
                        ↻
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Empty state */}
      {dayEvents.length === 0 && (
        <div className="daily-empty-state">
          <p className="section-label">No events scheduled</p>
          <p>This day is free. Add an event to get started.</p>
        </div>
      )}

      <style>
        {`
        .daily-view {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }

        .daily-view-header {
          padding: 1rem 1.5rem;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .daily-view-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--foreground);
          margin: 0;
        }

        .daily-view-today-badge {
          padding: 0.25rem 0.75rem;
          background: var(--accent);
          color: var(--accent-foreground);
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .daily-all-day-section {
          padding: 0.75rem 1.5rem;
          border-bottom: 1px solid var(--border);
          background: var(--background-secondary);
        }

        .daily-all-day-label {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--muted-foreground);
          margin-bottom: 0.5rem;
        }

        .daily-all-day-events {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .daily-all-day-event {
          padding: 0.5rem 0.75rem;
          background: var(--card);
          border: 1px solid var(--border);
          border-left: 3px solid;
          border-radius: 6px;
          text-align: left;
          cursor: pointer;
          transition: all var(--motion-fast) var(--motion-ease);
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .daily-all-day-event:hover {
          background: var(--background-secondary);
          transform: translateX(2px);
        }

        .daily-all-day-event.selected {
          background: var(--accent-subtle);
          border-color: var(--accent);
        }

        .daily-timeline-container {
          flex: 1;
          position: relative;
          overflow-y: auto;
          overflow-x: hidden;
        }

        .daily-hour-markers {
          position: absolute;
          left: 0;
          right: 0;
          height: var(--timeline-height, 2400px);
          pointer-events: none;
        }

        .daily-hour-marker {
          position: absolute;
          left: 0;
          right: 0;
          height: var(--hour-height, 100px);
          border-top: 1px solid var(--border);
          display: flex;
          align-items: center;
          padding-left: 1.5rem;
        }

        .daily-hour-marker.current {
          border-top-color: var(--accent);
        }

        .daily-hour-label {
          font-size: 0.75rem;
          color: var(--muted-foreground);
          font-weight: 500;
        }

        .daily-current-time-indicator {
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          height: 2px;
          background: var(--accent);
          z-index: 10;
        }

        .daily-events-container {
          position: relative;
          height: var(--timeline-height, 2400px);
          margin-left: 5rem; /* Space for hour labels */
          padding-right: 1rem;
        }

        .daily-event-card {
          position: absolute;
          left: 0;
          right: 0;
          min-height: 40px;
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--border);
          border-left: 3px solid;
          border-radius: 6px;
          text-align: left;
          cursor: pointer;
          transition: all var(--motion-fast) var(--motion-ease);
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          overflow: hidden;
        }

        .daily-event-card:hover {
          transform: translateX(2px);
          box-shadow: 0 2px 8px var(--shadow-soft);
        }

        .daily-event-card.selected {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--accent-subtle);
        }

        .daily-event-time {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--muted-foreground);
        }

        .daily-event-title {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .daily-event-location {
          font-size: 0.7rem;
          color: var(--muted-foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .daily-recurrence-icon {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          font-size: 0.875rem;
          color: var(--muted-foreground);
        }

        .daily-empty-state {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem;
          text-align: center;
          color: var(--muted-foreground);
        }

        .daily-empty-state .section-label {
          font-size: 1rem;
          font-weight: 600;
          color: var(--foreground);
          margin-bottom: 0.5rem;
        }

        .daily-timeline-skeleton {
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          height: var(--timeline-height, 2400px);
        }

        .daily-hour-skeleton {
          position: absolute;
          left: 0;
          right: 0;
          height: var(--hour-height, 100px);
          border-top: 1px solid var(--border);
          background: linear-gradient(
            90deg,
            var(--background-secondary) 0%,
            var(--background) 50%,
            var(--background-secondary) 100%
          );
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s ease-in-out infinite;
        }

        @keyframes skeleton-loading {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        @media (max-width: 768px) {
          .daily-hour-marker {
            padding-left: 0.75rem;
          }

          .daily-hour-label {
            font-size: 0.7rem;
          }

          .daily-event-card {
            padding: 0.4rem 0.6rem;
            font-size: 0.8rem;
          }

          .daily-event-time {
            font-size: 0.65rem;
          }

          .daily-event-title {
            font-size: 0.75rem;
          }
        }
      `}
      </style>
    </div>
  )
}
