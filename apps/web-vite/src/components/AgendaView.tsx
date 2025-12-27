import type { CanonicalCalendarEvent } from '@lifeos/calendar'
import { useMemo } from 'react'

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
      <div className="agenda-empty">
        <p>No upcoming events scheduled.</p>
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
        <div
          style={{
            padding: '8px 16px',
            position: 'sticky',
            top: 0,
            zIndex: 10,
            backgroundColor: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <button onClick={scrollToToday} className="ghost-button small">
            Jump to Today
          </button>
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

              return (
                <button
                  key={event.canonicalEventId}
                  type="button"
                  className={`agenda-event-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => onEventSelect(event)}
                >
                  <div className="agenda-time">
                    {event.allDay ? (
                      <span className="all-day-badge">All Day</span>
                    ) : (
                      <>
                        <span>{timeFormatter.format(new Date(event.startMs))}</span>
                        <span className="time-separator"> - </span>
                        <span className="end-time">
                          {timeFormatter.format(new Date(event.endMs))}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="agenda-details">
                    <div className="agenda-title-row">
                      <h4>{event.title || 'Untitled Event'}</h4>
                      {isRecurring && (
                        <span className="recurrence-icon" title="Recurring">
                          ↻
                        </span>
                      )}
                    </div>
                    {event.location && <p className="agenda-location">{event.location}</p>}
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
