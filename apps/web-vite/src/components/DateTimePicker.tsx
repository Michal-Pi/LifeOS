/**
 * DateTimePicker Component
 *
 * A custom date and time picker that follows the design system
 * with support for light and dark modes.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import './DateTimePicker.css'

export interface DateTimePickerProps {
  /** Current value as ISO string or timestamp */
  value?: string | number | null
  /** Called when date/time changes */
  onChange: (value: string | null) => void
  /** Whether to show time picker */
  showTime?: boolean
  /** Minimum selectable date */
  minDate?: Date
  /** Maximum selectable date */
  maxDate?: Date
  /** Placeholder text */
  placeholder?: string
  /** Whether the picker is disabled */
  disabled?: boolean
  /** Additional class name */
  className?: string
  /** Format for display (date-only or datetime) */
  displayFormat?: 'date' | 'datetime'
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function DateTimePicker({
  value,
  onChange,
  showTime = true,
  minDate,
  maxDate,
  placeholder = 'Select date & time',
  disabled = false,
  className = '',
  displayFormat = 'datetime',
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (value) {
      const date = new Date(value)
      return isNaN(date.getTime()) ? new Date() : date
    }
    return new Date()
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLButtonElement>(null)

  // Parse current value
  const selectedDate = useMemo(() => {
    if (!value) return null
    const date = new Date(value)
    return isNaN(date.getTime()) ? null : date
  }, [value])

  // Time state
  const [hours, setHours] = useState(() => selectedDate?.getHours() ?? 9)
  const [minutes, setMinutes] = useState(() => selectedDate?.getMinutes() ?? 0)

  // Sync time state when the external value changes - this is intentional
  // for controlled input synchronization where we need to reflect external
  // value changes in our local time state.
  useEffect(() => {
    if (selectedDate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: sync controlled value
      setHours(selectedDate.getHours())
      setMinutes(selectedDate.getMinutes())
    }
  }, [selectedDate])

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
        inputRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()

    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startDayOfWeek = firstDay.getDay()

    const days: { date: Date; isCurrentMonth: boolean; isToday: boolean }[] = []

    // Previous month's days
    const prevMonth = new Date(year, month, 0)
    const prevMonthDays = prevMonth.getDate()
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isCurrentMonth: false,
        isToday: false,
      })
    }

    // Current month's days
    const today = new Date()
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i)
      const isToday =
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear()
      days.push({ date, isCurrentMonth: true, isToday })
    }

    // Next month's days to fill the grid
    const remainingDays = 42 - days.length
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
        isToday: false,
      })
    }

    return days
  }, [viewDate])

  // Check if date is within range
  const isDateInRange = useCallback(
    (date: Date) => {
      if (minDate && date < minDate) return false
      if (maxDate && date > maxDate) return false
      return true
    },
    [minDate, maxDate]
  )

  // Check if date is selected
  const isDateSelected = useCallback(
    (date: Date) => {
      if (!selectedDate) return false
      return (
        date.getDate() === selectedDate.getDate() &&
        date.getMonth() === selectedDate.getMonth() &&
        date.getFullYear() === selectedDate.getFullYear()
      )
    },
    [selectedDate]
  )

  // Handle date selection
  const handleDateSelect = useCallback(
    (date: Date) => {
      if (!isDateInRange(date)) return

      const newDate = new Date(date)
      if (showTime) {
        newDate.setHours(hours, minutes, 0, 0)
      } else {
        newDate.setHours(0, 0, 0, 0)
      }

      // Output as ISO string
      onChange(newDate.toISOString())

      if (!showTime) {
        setIsOpen(false)
      }
    },
    [hours, minutes, showTime, isDateInRange, onChange]
  )

  // Handle time change
  const handleTimeChange = useCallback(
    (newHours: number, newMinutes: number) => {
      setHours(newHours)
      setMinutes(newMinutes)

      if (selectedDate) {
        const newDate = new Date(selectedDate)
        newDate.setHours(newHours, newMinutes, 0, 0)
        onChange(newDate.toISOString())
      }
    },
    [selectedDate, onChange]
  )

  // Navigate months
  const goToPreviousMonth = useCallback(() => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }, [])

  const goToNextMonth = useCallback(() => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }, [])

  const goToToday = useCallback(() => {
    setViewDate(new Date())
  }, [])

  // Format display value
  const displayValue = useMemo(() => {
    if (!selectedDate) return ''

    if (displayFormat === 'date' || !showTime) {
      return selectedDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    }

    return selectedDate.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }, [selectedDate, displayFormat, showTime])

  // Handle clear
  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onChange(null)
    },
    [onChange]
  )

  // Generate hour options (12-hour format)
  const hourOptions = useMemo(() => {
    const options: { value: number; label: string }[] = []
    for (let i = 0; i < 24; i++) {
      const displayHour = i === 0 ? 12 : i > 12 ? i - 12 : i
      const period = i < 12 ? 'AM' : 'PM'
      options.push({
        value: i,
        label: `${displayHour} ${period}`,
      })
    }
    return options
  }, [])

  // Generate minute options (5-minute intervals)
  const minuteOptions = useMemo(() => {
    const options: { value: number; label: string }[] = []
    for (let i = 0; i < 60; i += 5) {
      options.push({
        value: i,
        label: i.toString().padStart(2, '0'),
      })
    }
    return options
  }, [])

  return (
    <div ref={containerRef} className={`datetime-picker ${className}`}>
      <button
        ref={inputRef}
        type="button"
        className={`datetime-picker-trigger ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <span className="datetime-picker-icon">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5 1V3M11 1V3M2 6H14M3 2.5H13C13.5523 2.5 14 2.94772 14 3.5V13C14 13.5523 13.5523 14 13 14H3C2.44772 14 2 13.5523 2 13V3.5C2 2.94772 2.44772 2.5 3 2.5Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className={`datetime-picker-value ${selectedDate ? '' : 'placeholder'}`}>
          {displayValue || placeholder}
        </span>
        {selectedDate && (
          <button
            type="button"
            className="datetime-picker-clear"
            onClick={handleClear}
            aria-label="Clear date"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </button>

      {isOpen && (
        <div className="datetime-picker-dropdown" role="dialog" aria-modal="true">
          {/* Calendar Header */}
          <div className="datetime-picker-header">
            <button
              type="button"
              className="datetime-picker-nav-button"
              onClick={goToPreviousMonth}
              aria-label="Previous month"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M10 12L6 8L10 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <button
              type="button"
              className="datetime-picker-month-label"
              onClick={goToToday}
              title="Go to today"
            >
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
            </button>

            <button
              type="button"
              className="datetime-picker-nav-button"
              onClick={goToNextMonth}
              aria-label="Next month"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 4L10 8L6 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="datetime-picker-calendar">
            {/* Day headers */}
            <div className="datetime-picker-weekdays">
              {DAYS.map((day) => (
                <div key={day} className="datetime-picker-weekday">
                  {day}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="datetime-picker-days">
              {calendarDays.map(({ date, isCurrentMonth, isToday }, index) => {
                const isSelected = isDateSelected(date)
                const isDisabled = !isDateInRange(date)

                return (
                  <button
                    key={index}
                    type="button"
                    className={`datetime-picker-day ${isCurrentMonth ? '' : 'other-month'} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                    onClick={() => handleDateSelect(date)}
                    disabled={isDisabled}
                    tabIndex={isCurrentMonth && !isDisabled ? 0 : -1}
                    aria-label={date.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    aria-selected={isSelected}
                  >
                    {date.getDate()}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Time Picker */}
          {showTime && (
            <div className="datetime-picker-time">
              <span className="datetime-picker-time-label">Time</span>
              <div className="datetime-picker-time-inputs">
                <select
                  className="datetime-picker-time-select"
                  value={hours}
                  onChange={(e) => handleTimeChange(Number(e.target.value), minutes)}
                  aria-label="Hour"
                >
                  {hourOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="datetime-picker-time-separator">:</span>
                <select
                  className="datetime-picker-time-select"
                  value={minutes}
                  onChange={(e) => handleTimeChange(hours, Number(e.target.value))}
                  aria-label="Minute"
                >
                  {minuteOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="datetime-picker-footer">
            <button
              type="button"
              className="datetime-picker-today-button"
              onClick={() => {
                const today = new Date()
                if (showTime) {
                  today.setHours(hours, minutes, 0, 0)
                } else {
                  today.setHours(0, 0, 0, 0)
                }
                onChange(today.toISOString())
                setViewDate(today)
              }}
            >
              Today
            </button>
            <button
              type="button"
              className="datetime-picker-done-button"
              onClick={() => setIsOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
