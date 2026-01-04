/**
 * CalendarViewsContainer Component
 *
 * Manages the main calendar view rendering including:
 * - Month view (grid calendar)
 * - Week view (7-day view)
 * - Daily view (placeholder for now)
 * - Agenda view (list of upcoming events)
 *
 * This component handles view switching and delegates to specialized view components.
 */

import type {
  CanonicalCalendarEvent,
  CanonicalCalendar,
  SyncState,
  RecurrenceInstance,
} from '@lifeos/calendar'
import type { OutboxOp } from '@/outbox/types'
import { describeRecurrence } from '@lifeos/calendar'
import { useMemo } from 'react'
import { MonthView } from '@/components/MonthView'
import { WeeklyView } from '@/components/WeeklyView'
import { AgendaView } from '@/components/AgendaView'

type ViewType = 'daily' | 'weekly' | 'monthly' | 'agenda'

interface CalendarViewsContainerProps {
  // View state
  viewType: ViewType

  // Date state
  currentYear: number
  currentMonth: number
  selectedMonthDate: Date | null
  today: Date

  // Event data
  events: CanonicalCalendarEvent[]
  instances: RecurrenceInstance[]
  loading: boolean

  // Calendar data (for color mapping)
  calendars: CanonicalCalendar[]

  // Selected event
  selectedEvent: CanonicalCalendarEvent | null

  // Outbox state
  pendingOps: OutboxOp[]

  // Event handlers
  onDateSelect: (date: Date | null) => void
  onEventSelect: (event: CanonicalCalendarEvent) => void
}

/**
 * Get display info for sync state
 */
function getSyncStateDisplay(syncState?: SyncState): {
  label: string
  className: string
  icon: string
} {
  switch (syncState) {
    case 'synced':
      return { label: 'Synced', className: 'synced', icon: '✓' }
    case 'pending_writeback':
      return { label: 'Syncing to Google…', className: 'pending', icon: '↻' }
    case 'error':
      return { label: 'Sync failed', className: 'error', icon: '!' }
    case 'conflict':
      return { label: 'Conflict', className: 'conflict', icon: '⚠' }
    case 'read_only_provider':
      return { label: 'Read-only', className: 'readonly', icon: '◎' }
    default:
      return { label: 'Local', className: 'local', icon: '○' }
  }
}

/**
 * Adjust color brightness for light/dark variations
 */
function adjustColor(hex: string, percent: number): string {
  // Remove # if present
  const color = hex.replace('#', '')

  // Parse RGB
  const r = parseInt(color.substring(0, 2), 16)
  const g = parseInt(color.substring(2, 4), 16)
  const b = parseInt(color.substring(4, 6), 16)

  // Adjust brightness
  const adjust = (c: number) => {
    const adjusted = Math.round(c + ((255 - c) * percent) / 100)
    return Math.min(255, Math.max(0, adjusted))
  }

  const newR = adjust(r)
  const newG = adjust(g)
  const newB = adjust(b)

  // Convert back to hex
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`
}

/**
 * Get color variations for a calendar
 */
function getCalendarColors(calendar: CanonicalCalendar | undefined) {
  const baseColor = calendar?.lifeosColor ?? calendar?.color ?? '#4f46e5'
  return {
    light: adjustColor(baseColor, 40), // Lighter version
    normal: baseColor, // Base color
    dark: adjustColor(baseColor, -20), // Darker version
  }
}

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: 'numeric',
})

export function CalendarViewsContainer({
  viewType,
  currentYear,
  currentMonth,
  selectedMonthDate,
  today,
  events,
  instances,
  loading,
  calendars,
  selectedEvent,
  pendingOps,
  onDateSelect,
  onEventSelect,
}: CalendarViewsContainerProps) {
  // Create calendar lookup map
  const calendarsById = useMemo(() => {
    const map = new Map<string, CanonicalCalendar>()
    calendars.forEach((cal) => map.set(cal.calendarId, cal))
    return map
  }, [calendars])

  // Scroll to event timeline helper
  const scrollToTimeline = () => {
    document.querySelector('.calendar-events')?.scrollIntoView({
      behavior: 'smooth',
    })
  }

  // Filter events for timeline: show selected day + next 7 days, limit to 10 events
  const timelineEvents = useMemo(() => {
    const startDate = selectedMonthDate || today
    const startKey = startDate.toISOString().split('T')[0]
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + 7)
    const endKey = endDate.toISOString().split('T')[0]

    return events
      .filter((event) => {
        const eventKey = new Date(event.startIso).toISOString().split('T')[0]
        return eventKey >= startKey && eventKey < endKey
      })
      .sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime())
      .slice(0, 10)
  }, [events, selectedMonthDate, today])

  // Calculate meeting time (events with attendees) for today and next 7 days
  const { todayMeetingMinutes, weekMeetingMinutes, todayEventsCount, weekEventsCount } =
    useMemo(() => {
      const startDate = selectedMonthDate || today
      const todayKey = startDate.toISOString().split('T')[0]
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 7)

      let todayMinutes = 0
      let weekMinutes = 0
      let todayCount = 0
      let weekCount = 0

      for (const event of events) {
        const eventKey = new Date(event.startIso).toISOString().split('T')[0]
        if (eventKey < todayKey || eventKey >= endDate.toISOString().split('T')[0]) continue

        const hasAttendees = (event.attendees?.length ?? 0) > 0
        if (!hasAttendees) continue

        const duration =
          (new Date(event.endIso).getTime() - new Date(event.startIso).getTime()) / 60000

        if (eventKey === todayKey) {
          todayMinutes += duration
          todayCount += 1
        }
        weekMinutes += duration
        weekCount += 1
      }

      return {
        todayMeetingMinutes: Math.round(todayMinutes),
        weekMeetingMinutes: Math.round(weekMinutes),
        todayEventsCount: todayCount,
        weekEventsCount: weekCount,
      }
    }, [events, selectedMonthDate, today])

  // Format meeting time as hours and minutes
  const formatMeetingTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours === 0) return `${mins}m`
    if (mins === 0) return `${hours}h`
    return `${hours}h ${mins}m`
  }

  return (
    <>
      {/* Calendar Views */}
      {viewType === 'monthly' && (
        <MonthView
          year={currentYear}
          month={currentMonth}
          events={events}
          instances={instances}
          onDateSelect={onDateSelect}
          selectedDate={selectedMonthDate}
          onDateClick={scrollToTimeline}
        />
      )}

      {viewType === 'weekly' && (
        <WeeklyView
          weekStartDate={selectedMonthDate || today}
          events={events}
          instances={instances}
          onDateSelect={onDateSelect}
          selectedDate={selectedMonthDate}
          onDateClick={scrollToTimeline}
        />
      )}

      {viewType === 'daily' && (
        <div className="daily-view-placeholder">
          <p className="section-label">Daily View</p>
          <p>Daily view shows detailed events for the selected date in the timeline below.</p>
          <p>Select a date from the month or week view to see its events.</p>
        </div>
      )}

      {viewType === 'agenda' && (
        <AgendaView
          events={events}
          onEventSelect={onEventSelect}
          selectedEventId={selectedEvent?.canonicalEventId}
        />
      )}

      {/* Event Timeline */}
      <section className="calendar-timeline">
        <div className="calendar-events">
          <div className="calendar-events-header">
            <p className="section-label">Event timeline</p>
            <p className="calendar-meta">
              {selectedMonthDate ? 'Selected date' : 'Today'}: {todayEventsCount} meeting
              {todayEventsCount !== 1 ? 's' : ''}{' '}
              {todayMeetingMinutes > 0 && `(${formatMeetingTime(todayMeetingMinutes)})`}
              {' · '}
              Next 7 days: {weekEventsCount} meeting{weekEventsCount !== 1 ? 's' : ''}{' '}
              {weekMeetingMinutes > 0 && `(${formatMeetingTime(weekMeetingMinutes)})`}
              {' · '}
              Showing {timelineEvents.length} of {events.length} event
              {events.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div role="list" aria-label="Today's events">
            {loading ? (
              <p>Loading events…</p>
            ) : timelineEvents.length === 0 ? (
              <div className="calendar-empty-banner">
                <p className="section-label">Event Timeline</p>
                <p>System idle. Add an event or sync a calendar to populate this timeline.</p>
                <p className="calendar-empty-hint">
                  Unlocks: automatic focus windows + conflict-aware scheduling.
                </p>
              </div>
            ) : (
              timelineEvents.map((event) => {
                const isSelected = selectedEvent?.canonicalEventId === event.canonicalEventId
                const eventSyncState = getSyncStateDisplay(event.syncState)
                const hasPendingOp = pendingOps.some((op) => op.eventId === event.canonicalEventId)
                const isRecurring = Boolean(
                  event.isRecurringSeries ||
                  event.recurrenceV2?.rule ||
                  event.recurrence?.recurrenceRules?.length
                )
                const hasGuests = (event.attendees?.length ?? 0) > 0

                // Get calendar and its color variations
                const calendar = calendarsById.get(event.calendarId ?? '')
                const colors = getCalendarColors(calendar)
                const borderColor = hasGuests
                  ? colors.dark
                  : isRecurring
                    ? colors.light
                    : colors.normal

                return (
                  <button
                    key={event.canonicalEventId}
                    className={`event-card ${isSelected ? 'selected' : ''}`}
                    style={{ borderLeftColor: borderColor }}
                    type="button"
                    onClick={() => onEventSelect(event)}
                  >
                    <div className="event-time">
                      <strong>
                        {event.allDay
                          ? 'All day'
                          : `${timeFormatter.format(new Date(event.startIso))} — ${timeFormatter.format(new Date(event.endIso))}`}
                      </strong>
                      <span className="calendar-meta">{event.location ?? 'No location'}</span>
                    </div>
                    <div className="event-body">
                      <h3>
                        {event.title ?? 'Untitled event'}
                        {isRecurring && (
                          <span className="recurrence-indicator" title="Recurring event">
                            ↻
                          </span>
                        )}
                        <span
                          className={`sync-indicator ${eventSyncState.className}`}
                          title={hasPendingOp ? 'Saving to device…' : eventSyncState.label}
                        >
                          {hasPendingOp ? '↻' : eventSyncState.icon}
                        </span>
                      </h3>
                      <p>{event.description ?? 'No description'}</p>
                      {isRecurring && event.recurrenceV2 && (
                        <p className="calendar-meta recurrence-description">
                          {describeRecurrence(event.recurrenceV2)}
                        </p>
                      )}
                      {event.attendees?.length ? (
                        <p className="calendar-meta">
                          {event.attendees.length} attendee{event.attendees.length > 1 ? 's' : ''}
                        </p>
                      ) : (
                        <p className="calendar-meta">Private focus time</p>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </section>
    </>
  )
}
