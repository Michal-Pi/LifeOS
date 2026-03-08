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
import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react'
import { QuickEventCreate } from '@/components/calendar/QuickEventCreate'

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
  /** Callback when quick-create saves a new event */
  onQuickCreate?: (data: { title: string; startMs: number; endMs: number }) => void
  /** Callback when "More options" is clicked from quick-create */
  onQuickCreateMore?: (data: { title: string; startMs: number; endMs: number }) => void
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
  onQuickCreate,
  onQuickCreateMore,
}: DailyViewProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const now = useMemo(() => new Date(), [])

  // Quick-create popover state
  const [quickCreate, setQuickCreate] = useState<{
    startTime: Date
    endTime: Date
    position: { top: number; left: number }
  } | null>(null)

  // Always render full 24-hour timeline so users can scroll through the entire day
  const timelineHeight = useMemo(() => {
    if (typeof window === 'undefined') return 2400 // SSR fallback
    const isMobile = window.innerWidth < 768
    const h = isMobile ? 40 : 100
    return 24 * h
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

  // Scroll to show 2 hours before current time (or start of day for non-today dates)
  useEffect(() => {
    if (!timelineRef.current) return
    const targetHour = isSameDay(date, now)
      ? Math.max(0, now.getHours() - 2)
      : Math.max(0, 8 - 2) // Default to 6 AM for non-today dates
    const scrollPosition = (targetHour / 24) * timelineRef.current.scrollHeight
    timelineRef.current.scrollTo({
      top: scrollPosition,
      behavior: 'smooth',
    })
  }, [date, now])

  // Handle click on empty time slot to show quick-create popover
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Don't trigger when clicking on an event card
      if ((e.target as HTMLElement).closest('.daily-event-card')) return
      if (!onQuickCreate) return

      const container = timelineRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const clickY = e.clientY - rect.top + container.scrollTop
      const hour = Math.max(0, Math.min(23, Math.floor((clickY / timelineHeight) * 24)))

      const startTime = new Date(date)
      startTime.setHours(hour, 0, 0, 0)
      const endTime = new Date(date)
      endTime.setHours(hour + 1, 0, 0, 0)

      setQuickCreate({
        startTime,
        endTime,
        position: { top: e.clientY, left: rect.left + rect.width / 2 - 140 },
      })
    },
    [date, onQuickCreate, timelineHeight]
  )

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
        onClick={handleTimelineClick}
        style={
          {
            '--timeline-height': `${timelineHeight}px`,
            '--hour-height': `${hourHeight}px`,
            cursor: onQuickCreate ? 'crosshair' : undefined,
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
          <p>This day is free. Click a time slot to create an event.</p>
        </div>
      )}

      {/* Quick-create popover */}
      {quickCreate && onQuickCreate && (
        <QuickEventCreate
          startTime={quickCreate.startTime}
          endTime={quickCreate.endTime}
          position={quickCreate.position}
          onSave={(data) => {
            onQuickCreate(data)
            setQuickCreate(null)
          }}
          onMoreOptions={(data) => {
            onQuickCreateMore?.(data)
            setQuickCreate(null)
          }}
          onClose={() => setQuickCreate(null)}
        />
      )}
    </div>
  )
}
