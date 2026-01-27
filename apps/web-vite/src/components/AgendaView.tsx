import type { CanonicalCalendarEvent } from '@lifeos/calendar'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'

interface AgendaViewProps {
  events: CanonicalCalendarEvent[]
  onEventSelect: (event: CanonicalCalendarEvent) => void
  selectedEventId?: string
}

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
})

export function AgendaView({ events, onEventSelect, selectedEventId }: AgendaViewProps) {
  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups = new Map<string, CanonicalCalendarEvent[]>()

    // Sort events by start time first
    const sortedEvents = [...events].sort((a, b) => a.startMs - b.startMs)

    for (const event of sortedEvents) {
      const dateKey = new Date(event.startMs).toDateString()
      const group = groups.get(dateKey) ?? []
      group.push(event)
      groups.set(dateKey, group)
    }

    return Array.from(groups.entries()).map(([dateStr, events]) => ({
      date: new Date(dateStr),
      events,
    }))
  }, [events])

  if (events.length === 0) {
    return (
      <div className="calendar-empty-banner">
        <p className="section-label">Agenda</p>
        <p>No upcoming events scheduled.</p>
        <p className="calendar-empty-hint">Stay clear for deep work blocks.</p>
      </div>
    )
  }

  const scrollToToday = () => {
    const todayKey = new Date().toDateString()
    const element = document.getElementById(`agenda-date-${todayKey}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const hasToday = groupedEvents.some((g) => g.date.toDateString() === new Date().toDateString())

  return (
    <div className="agenda-view">
      {hasToday && (
        <div className="agenda-sticky-bar">
          <Button variant="ghost" className="small" onClick={scrollToToday}>
            Jump to Today
          </Button>
        </div>
      )}

      {groupedEvents.map(({ date, events }) => (
        <div
          key={date.toISOString()}
          className="agenda-group"
          id={`agenda-date-${date.toDateString()}`}
        >
          <div className="agenda-date-header">
            <span className="agenda-date-day">{date.getDate()}</span>
            <div className="agenda-date-meta">
              <span className="agenda-date-weekday">
                {date.toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
              <span className="agenda-date-month">
                {date.toLocaleDateString('en-US', { month: 'long' })}
              </span>
            </div>
          </div>

          <div className="agenda-events-list">
            {events.map((event) => {
              const isSelected = selectedEventId === event.canonicalEventId
              const isRecurring = Boolean(
                event.isRecurringSeries ||
                event.recurrenceV2?.rule ||
                event.recurrence?.recurrenceRules?.length
              )
              const timeLabel = event.allDay
                ? 'All day'
                : `${timeFormatter.format(new Date(event.startMs))} — ${timeFormatter.format(
                    new Date(event.endMs)
                  )}`
              const attendeeNames =
                event.attendees
                  ?.map((attendee) => attendee.displayName || attendee.email || 'Guest')
                  .filter(Boolean) ?? []
              const participantsLabel =
                attendeeNames.length > 0
                  ? `${attendeeNames.slice(0, 3).join(', ')}${
                      attendeeNames.length > 3 ? ` +${attendeeNames.length - 3}` : ''
                    }`
                  : 'Private focus time'
              const locationLabel = event.location ?? 'No location'

              return (
                <button
                  key={event.canonicalEventId}
                  type="button"
                  className={`agenda-event-card ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => onEventSelect(event)}
                >
                  <div className="agenda-title-row">
                    <h4 className="agenda-event-title">{event.title || 'Untitled Event'}</h4>
                    {isRecurring && (
                      <span className="recurrence-indicator" title="Recurring">
                        ↻
                      </span>
                    )}
                  </div>
                  <div className="agenda-event-details">
                    <div className="agenda-event-detail">
                      <span className="agenda-event-detail-label">Time</span>
                      <span className="agenda-event-detail-value">{timeLabel}</span>
                    </div>
                    <div className="agenda-event-detail">
                      <span className="agenda-event-detail-label">Participants</span>
                      <span className="agenda-event-detail-value">{participantsLabel}</span>
                    </div>
                    <div className="agenda-event-detail">
                      <span className="agenda-event-detail-label">Location</span>
                      <span className="agenda-event-detail-value">{locationLabel}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
