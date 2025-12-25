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

import type { CanonicalCalendarEvent, SyncState, RecurrenceInstance } from '@lifeos/calendar'
import type { OutboxOp } from '@/outbox/types'
import { describeRecurrence } from '@lifeos/calendar'
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
function getSyncStateDisplay(syncState?: SyncState): { label: string; className: string; icon: string } {
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

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: 'numeric'
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
  selectedEvent,
  pendingOps,
  onDateSelect,
  onEventSelect
}: CalendarViewsContainerProps) {
  // Scroll to event timeline helper
  const scrollToTimeline = () => {
    document.querySelector('.calendar-events')?.scrollIntoView({
      behavior: 'smooth'
    })
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
      <section className="calendar-grid">
        <div className="calendar-events">
          <div className="calendar-events-header">
            <p className="section-label">Event timeline</p>
            <p className="calendar-meta">
              {events.length} event{events.length !== 1 ? 's' : ''} {selectedMonthDate ? 'on selected date' : 'today'}
            </p>
          </div>
          <div role="list" aria-label="Today's events">
            {loading ? (
              <p>Loading events…</p>
            ) : events.length === 0 ? (
              <p>Nothing planned yet. Create an event or sync a calendar account to get started.</p>
            ) : (
              events.map((event) => {
                const isSelected = selectedEvent?.canonicalEventId === event.canonicalEventId
                const eventSyncState = getSyncStateDisplay(event.syncState)
                const hasPendingOp = pendingOps.some((op) => op.eventId === event.canonicalEventId)
                const isRecurring = Boolean(event.isRecurringSeries || event.recurrenceV2?.rule || event.recurrence?.recurrenceRules?.length)
                const hasGuests = (event.attendees?.length ?? 0) > 0
                const colorTone = hasGuests ? 'dark' : isRecurring ? 'light' : 'normal'

                return (
                  <button
                    key={event.canonicalEventId}
                    className={`event-card ${isSelected ? 'selected' : ''} event-card--${colorTone}`}
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
                      <p>{event.description ?? 'No description yet'}</p>
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
