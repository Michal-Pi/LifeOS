/**
 * @fileoverview Mini calendar date picker for the booking page.
 */

import { useState, useMemo } from 'react'

interface DatePickerProps {
  selectedDate: Date | null
  onSelect: (date: Date) => void
  /** Days of week that have availability (0=Sun..6=Sat) */
  availableDays?: number[]
  /** Max number of days ahead from today that are bookable */
  maxDaysAhead: number
  timezone: string
}

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function DatePicker({
  selectedDate,
  onSelect,
  availableDays,
  maxDaysAhead,
  timezone: _timezone,
}: DatePickerProps) {
  const today = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }, [])

  const maxDate = useMemo(() => {
    const d = new Date(today)
    d.setDate(d.getDate() + maxDaysAhead)
    return d
  }, [today, maxDaysAhead])

  const [viewMonth, setViewMonth] = useState(() => {
    const d = selectedDate ?? today
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const daysInMonth = useMemo(() => {
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const lastDate = new Date(year, month + 1, 0).getDate()

    const days: (Date | null)[] = []
    // Leading empty cells
    for (let i = 0; i < firstDay; i++) days.push(null)
    // Actual days
    for (let d = 1; d <= lastDate; d++) days.push(new Date(year, month, d))

    return days
  }, [viewMonth])

  const isDisabled = (date: Date): boolean => {
    if (date < today) return true
    if (date > maxDate) return true
    if (availableDays && !availableDays.includes(date.getDay())) return true
    return false
  }

  const prevMonth = () => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const monthLabel = viewMonth.toLocaleString('default', { month: 'long', year: 'numeric' })
  const canGoPrev = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0) >= today

  return (
    <div className="calendar-mini">
      <div className="calendar-mini__nav">
        <button type="button" onClick={prevMonth} disabled={!canGoPrev} aria-label="Previous month">
          &larr;
        </button>
        <span className="calendar-mini__nav-title">{monthLabel}</span>
        <button type="button" onClick={nextMonth} aria-label="Next month">
          &rarr;
        </button>
      </div>

      <div className="calendar-grid">
        {DAY_LABELS.map((d) => (
          <span key={d} className="calendar-grid__day-label">
            {d}
          </span>
        ))}

        {daysInMonth.map((date, i) => {
          if (!date) {
            return <span key={`empty-${i}`} className="calendar-day calendar-day--empty" />
          }

          const disabled = isDisabled(date)
          const selected = selectedDate && isSameDay(date, selectedDate)
          const isToday = isSameDay(date, today)

          return (
            <button
              key={date.toISOString()}
              type="button"
              className={[
                'calendar-day',
                selected && 'calendar-day--selected',
                isToday && !selected && 'calendar-day--today',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={disabled}
              onClick={() => onSelect(date)}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
