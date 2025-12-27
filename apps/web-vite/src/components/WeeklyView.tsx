/**
 * Weekly View Component - Calendar Week Display
 *
 * Displays a 7-day week view of calendar events, similar to the MonthView
 * but focused on a single week. Shows event indicators for each day and
 * supports date selection for filtering the event timeline.
 *
 * Features:
 * - 7-day week grid (Sunday to Saturday)
 * - Event dots with recurring event indicators
 * - "+X more" for days with >3 events
 * - Today highlighting
 * - Date selection with callback support
 * - Smooth scroll integration with event timeline
 *
 * @component
 */

import type { CanonicalCalendarEvent, RecurrenceInstance } from '@lifeos/calendar'
import React, { useMemo } from 'react'
import { getWeekGrid, isSameDay, formatDateKey, WEEKDAYS, type DayCell } from './MonthView.utils'

interface WeeklyViewProps {
  /** Date within the week to display (component calculates the full week range) */
  weekStartDate: Date
  /** Calendar events to display in the week view */
  events: CanonicalCalendarEvent[]
  /** Recurrence instances for complex recurring events */
  instances?: RecurrenceInstance[]
  /** Callback when a date is selected (for filtering event timeline) */
  onDateSelect?: (date: Date) => void
  /** Currently selected date for highlighting */
  selectedDate?: Date | null
  /** Additional callback for date clicks (e.g., scroll to timeline) */
  onDateClick?: (date: Date) => void
}

/**
 * WeeklyView Component
 *
 * Renders a 7-day week calendar view with event indicators.
 * Calculates the week range from the provided date and displays
 * events distributed across the week days.
 *
 * Event Display Logic:
 * - Shows up to 3 event dots per day
 * - Displays "+X more" for additional events
 * - Recurring events get special styling
 * - Today is highlighted with distinct styling
 * - Selected date shows selection state
 */
export const WeeklyView = React.memo(function WeeklyView({
  weekStartDate,
  events,
  instances = [],
  onDateSelect,
  selectedDate,
  onDateClick,
}: WeeklyViewProps) {
  const today = useMemo(() => new Date(), [])

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
      const colorTone = hasGuests ? 'dark' : isRecurring ? 'light' : 'normal'

      for (const dayKey of event.occursOn ?? []) {
        const existing = map.get(dayKey) ?? []
        existing.push({
          title: event.title ?? 'Untitled',
          isRecurring,
          isInstance: false,
          colorTone,
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
      const colorTone = hasGuests ? 'dark' : 'light'
      existing.push({
        title: instance.title ?? 'Untitled',
        isRecurring: true,
        isInstance: true,
        colorTone,
      })
      map.set(dateKey, existing)
    }

    return map
  }, [events, instances])

  const weekGrid = useMemo(() => getWeekGrid(weekStartDate), [weekStartDate])

  const cells: DayCell[] = useMemo(() => {
    return weekGrid.map((date) => {
      const dateKey = formatDateKey(date)
      return {
        date,
        dayOfMonth: date.getDate(),
        isCurrentMonth: date.getMonth() === weekStartDate.getMonth(),
        isToday: isSameDay(date, today),
        events: eventsByDate.get(dateKey) ?? [],
      }
    })
  }, [weekGrid, today, eventsByDate, weekStartDate])

  const weekRange = `${weekGrid[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekGrid[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  return (
    <div className="weekly-view">
      <div className="week-header">
        <h3>{weekRange}</h3>
      </div>
      <div className="weekday-headers">
        {WEEKDAYS.map((day) => (
          <div key={day} className="weekday-header">
            {day}
          </div>
        ))}
      </div>
      <div className="week-grid">
        {cells.map((cell, index) => (
          <button
            key={index}
            type="button"
            className={`day-cell ${cell.isToday ? 'today' : ''} ${selectedDate && isSameDay(cell.date, selectedDate) ? 'selected' : ''}`}
            onClick={() => {
              onDateSelect?.(cell.date)
              onDateClick?.(cell.date)
            }}
          >
            <span className="day-number">{cell.dayOfMonth}</span>
            {cell.events.length > 0 && (
              <div className="event-indicators">
                {cell.events.slice(0, 3).map((event, i) => (
                  <div
                    key={i}
                    className={`event-dot ${event.isRecurring ? 'recurring' : ''} ${event.colorTone ? `event-dot--${event.colorTone}` : ''}`}
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
