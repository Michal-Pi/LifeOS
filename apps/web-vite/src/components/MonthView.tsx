import type {
  CanonicalCalendarEvent,
  CanonicalCalendar,
  RecurrenceInstance,
} from '@lifeos/calendar'
import React, { useMemo } from 'react'
import { getMonthGrid, isSameDay, formatDateKey, WEEKDAYS, type DayCell } from './MonthView.utils'
import { getCalendarColors } from '@/components/calendar/calendarColors'

interface MonthViewProps {
  year: number
  month: number // 0-indexed
  events: CanonicalCalendarEvent[]
  instances?: RecurrenceInstance[]
  calendars?: CanonicalCalendar[]
  onDateSelect?: (date: Date) => void
  selectedDate?: Date | null
  onDateClick?: (date: Date) => void // For navigation to timeline
}

export const MonthView = React.memo(function MonthView({
  year,
  month,
  events,
  instances = [],
  calendars = [],
  onDateSelect,
  selectedDate,
  onDateClick,
}: MonthViewProps) {
  const today = useMemo(() => new Date(), [])

  // Create calendar lookup map
  const calendarsById = useMemo(() => {
    const map = new Map<string, CanonicalCalendar>()
    calendars.forEach((cal) => map.set(cal.calendarId, cal))
    return map
  }, [calendars])

  // Build event map by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, DayCell['events']>()
    const masterBySeriesId = new Map<string, CanonicalCalendarEvent>()

    for (const event of events) {
      masterBySeriesId.set(event.canonicalEventId, event)
    }

    // Add regular events
    for (const event of events) {
      const isRecurring = Boolean(
        event.isRecurringSeries ||
        event.recurrenceV2?.rule ||
        event.recurrence?.recurrenceRules?.length
      )
      const hasGuests = (event.attendees?.length ?? 0) > 0

      // Get calendar and determine color
      const calendar = calendarsById.get(event.calendarId ?? '')
      const colors = getCalendarColors(calendar)
      const color = hasGuests ? colors.dark : isRecurring ? colors.light : colors.normal

      for (const dayKey of event.occursOn ?? []) {
        const existing = map.get(dayKey) ?? []
        existing.push({
          title: event.title ?? 'Untitled',
          isRecurring,
          isInstance: false,
          color,
        })
        map.set(dayKey, existing)
      }
    }

    // Add recurrence instances
    for (const instance of instances) {
      const dateKey = formatDateKey(new Date(instance.startMs))
      const existing = map.get(dateKey) ?? []
      const masterEvent = masterBySeriesId.get(instance.seriesId)
      const hasGuests = (masterEvent?.attendees?.length ?? 0) > 0

      // Get calendar and determine color
      const calendar = calendarsById.get(masterEvent?.calendarId ?? '')
      const colors = getCalendarColors(calendar)
      const color = hasGuests ? colors.dark : colors.light

      existing.push({
        title: instance.title ?? 'Untitled',
        isRecurring: true,
        isInstance: true,
        color,
      })
      map.set(dateKey, existing)
    }

    return map
  }, [events, instances, calendarsById])

  const grid = useMemo(() => getMonthGrid(year, month), [year, month])

  const cells: DayCell[] = useMemo(() => {
    return grid.map((date) => {
      const dateKey = formatDateKey(date)
      return {
        date,
        dayOfMonth: date.getDate(),
        isCurrentMonth: date.getMonth() === month,
        isToday: isSameDay(date, today),
        events: eventsByDate.get(dateKey) ?? [],
      }
    })
  }, [grid, month, today, eventsByDate])

  const monthName = new Date(year, month).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="month-view">
      <div className="month-header">
        <h3>{monthName}</h3>
      </div>
      <div className="weekday-headers">
        {WEEKDAYS.map((day) => (
          <div key={day} className="weekday-header">
            {day}
          </div>
        ))}
      </div>
      <div className="month-grid">
        {cells.map((cell, index) => (
          <button
            key={index}
            type="button"
            className={`day-cell ${cell.isCurrentMonth ? '' : 'other-month'} ${cell.isToday ? 'today' : ''} ${selectedDate && isSameDay(cell.date, selectedDate) ? 'selected' : ''}`}
            onClick={() => {
              onDateSelect?.(cell.date)
              onDateClick?.(cell.date)
            }}
            title={cell.isCurrentMonth ? 'Add event' : undefined}
          >
            <span className="day-number">{cell.dayOfMonth}</span>
            {cell.isCurrentMonth && (
              <span className="day-hover-plus" aria-hidden="true">
                +
              </span>
            )}
            {cell.events.length > 0 && (
              <div className="event-indicators">
                {cell.events.slice(0, 3).map((event, i) => (
                  <div
                    key={i}
                    className="event-dot"
                    style={{ backgroundColor: event.color }}
                    title={event.title}
                  />
                ))}
                {cell.events.length > 3 && (
                  <span className="event-count">+{cell.events.length - 3}</span>
                )}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
})
