/**
 * Weekly View Component - Scrollable Day Strip
 *
 * Displays a 7-day trailing window of calendar events. Only 5 complete days
 * are visible at a time with left/right arrow navigation. Clicking a weekday
 * header in the full week row sets that day as the first visible day.
 *
 * Features:
 * - 5 visible day columns with left/right arrows
 * - Up to 10 event cards per day (scrollable overflow)
 * - Weekday header row — clicking any day scrolls it into the first position
 * - Today highlighting
 * - Date selection with callback support
 *
 * @component
 */

import type { CanonicalCalendarEvent, RecurrenceInstance } from '@lifeos/calendar'
import React, { useMemo, useState, useCallback } from 'react'
import { formatDateKey, isSameDay, type DayCell } from './MonthView.utils'

const MAX_EVENTS_PER_DAY = 10
const VISIBLE_DAYS = 5
const TOTAL_DAYS = 7

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

/** Build a 7-day window starting from the given date */
function getTrailingDays(startDate: Date): Date[] {
  const days: Date[] = []
  for (let i = 0; i < TOTAL_DAYS; i++) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    days.push(d)
  }
  return days
}

const dayLabelFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
const dateLabelFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})
const rangeLabelFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export const WeeklyView = React.memo(function WeeklyView({
  weekStartDate,
  events,
  instances = [],
  onDateSelect,
  selectedDate,
  onDateClick,
}: WeeklyViewProps) {
  const today = useMemo(() => new Date(), [])

  // The first visible day offset within the 7-day strip
  const [startOffset, setStartOffset] = useState(0)

  // Build the full 7-day range
  const allDays = useMemo(() => getTrailingDays(weekStartDate), [weekStartDate])

  // Build event map by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, DayCell['events']>()
    const masterBySeriesId = new Map<string, CanonicalCalendarEvent>()

    for (const event of events) {
      masterBySeriesId.set(event.canonicalEventId, event)
    }

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

  // Build cell data for all 7 days
  const cells: DayCell[] = useMemo(() => {
    return allDays.map((date) => {
      const dateKey = formatDateKey(date)
      return {
        date,
        dayOfMonth: date.getDate(),
        isCurrentMonth: date.getMonth() === weekStartDate.getMonth(),
        isToday: isSameDay(date, today),
        events: eventsByDate.get(dateKey) ?? [],
      }
    })
  }, [allDays, today, eventsByDate, weekStartDate])

  // Visible slice
  const visibleCells = cells.slice(startOffset, startOffset + VISIBLE_DAYS)

  // When shifting the week window via arrows, preserve the desired offset
  const [desiredOffset, setDesiredOffset] = useState<number | null>(null)

  // Reset offset when weekStartDate changes (React docs: "storing information from previous renders")
  const weekStartKey = formatDateKey(weekStartDate)
  const [prevWeekKey, setPrevWeekKey] = useState(weekStartKey)
  if (prevWeekKey !== weekStartKey) {
    setPrevWeekKey(weekStartKey)
    setStartOffset(desiredOffset ?? 0)
    setDesiredOffset(null)
  }

  const goLeft = useCallback(() => {
    if (startOffset > 0) {
      setStartOffset((prev) => prev - 1)
    } else {
      // Shift entire week window backward by 1 day
      const prevDay = new Date(allDays[0])
      prevDay.setDate(prevDay.getDate() - 1)
      setDesiredOffset(0)
      onDateSelect?.(prevDay)
    }
  }, [startOffset, allDays, onDateSelect])

  const goRight = useCallback(() => {
    if (startOffset + VISIBLE_DAYS < TOTAL_DAYS) {
      setStartOffset((prev) => prev + 1)
    } else {
      // Shift entire week window forward by 1 day
      const nextStart = new Date(allDays[0])
      nextStart.setDate(nextStart.getDate() + 1)
      setDesiredOffset(TOTAL_DAYS - VISIBLE_DAYS)
      onDateSelect?.(nextStart)
    }
  }, [startOffset, allDays, onDateSelect])

  const rangeStart = allDays[0]
  const rangeEnd = allDays[TOTAL_DAYS - 1]
  const weekRange = `${dateLabelFormatter.format(rangeStart)} \u2013 ${rangeLabelFormatter.format(rangeEnd)}`

  return (
    <div className="weekly-view">
      <div className="week-header">
        <h3>{weekRange}</h3>
      </div>

      {/* Arrows at extremes, day content between them */}
      <div className="weekly-strip">
        <button
          type="button"
          className="weekly-strip__arrow weekly-strip__arrow--left"
          onClick={goLeft}
          aria-label="Show earlier days"
        >
          &#x2039;
        </button>

        <div className="weekly-strip__content">
          {/* Day header tabs */}
          <div className="weekly-day-tabs">
            {visibleCells.map((cell, i) => (
              <button
                key={startOffset + i}
                type="button"
                className={`weekly-day-tab ${cell.isToday ? 'today' : ''} ${
                  selectedDate && isSameDay(cell.date, selectedDate) ? 'selected' : ''
                }`}
                onClick={() => {
                  onDateSelect?.(cell.date)
                  onDateClick?.(cell.date)
                }}
              >
                <span className="weekly-day-tab__weekday">
                  {dayLabelFormatter.format(cell.date)}
                </span>
                <span className="weekly-day-tab__date">{cell.dayOfMonth}</span>
              </button>
            ))}
          </div>

          {/* Day columns with events */}
          <div className="weekly-strip__grid">
            {visibleCells.map((cell, i) => (
              <button
                key={startOffset + i}
                type="button"
                className={`weekly-day-col ${cell.isToday ? 'today' : ''} ${
                  selectedDate && isSameDay(cell.date, selectedDate) ? 'selected' : ''
                }`}
                onClick={() => {
                  onDateSelect?.(cell.date)
                  onDateClick?.(cell.date)
                }}
              >
                <span className="weekly-day-col__label">
                  {dayLabelFormatter.format(cell.date)} {cell.dayOfMonth}
                </span>

                <div className="weekly-day-col__events">
                  {cell.events.slice(0, MAX_EVENTS_PER_DAY).map((event, ei) => (
                    <div
                      key={ei}
                      className={`event-card ${event.isRecurring ? 'recurring' : ''} ${
                        event.colorTone ? `event-card--${event.colorTone}` : ''
                      }`}
                      title={event.title}
                    >
                      <span className="event-title">{event.title}</span>
                    </div>
                  ))}
                  {cell.events.length > MAX_EVENTS_PER_DAY && (
                    <span className="event-more">
                      +{cell.events.length - MAX_EVENTS_PER_DAY} more
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="weekly-strip__arrow weekly-strip__arrow--right"
          onClick={goRight}
          aria-label="Show later days"
        >
          &#x203A;
        </button>
      </div>
    </div>
  )
})
