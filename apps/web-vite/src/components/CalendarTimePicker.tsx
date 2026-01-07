/**
 * CalendarTimePicker Component
 *
 * Allows users to manually select a time block from a calendar view
 * for scheduling tasks. Shows busy blocks and available slots.
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createFirestoreCalendarEventRepository } from '@/adapters/firestoreCalendarEventRepository'
import type { CanonicalCalendarEvent } from '@lifeos/calendar'

export interface CalendarTimePickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (startMs: number, endMs: number) => void
  defaultDurationMinutes?: number
  selectedDate?: Date
}

interface TimeSlot {
  hour: number
  minute: number
  timeMs: number
}

export function CalendarTimePicker({
  isOpen,
  onClose,
  onSelect,
  defaultDurationMinutes = 60,
  selectedDate,
}: CalendarTimePickerProps) {
  const { user } = useAuth()
  const calendarRepository = createFirestoreCalendarEventRepository()
  const [viewDate, setViewDate] = useState<Date>(selectedDate || new Date())
  const [events, setEvents] = useState<CanonicalCalendarEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedStart, setSelectedStart] = useState<number | null>(null)
  const [selectedEnd, setSelectedEnd] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Generate time slots for the day (30-minute intervals)
  const timeSlots = useMemo(() => {
    const slots: TimeSlot[] = []
    const date = new Date(viewDate)
    date.setHours(0, 0, 0, 0)

    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const slotDate = new Date(date)
        slotDate.setHours(hour, minute, 0, 0)
        slots.push({
          hour,
          minute,
          timeMs: slotDate.getTime(),
        })
      }
    }
    return slots
  }, [viewDate])

  // Load events for the selected date
  const loadEvents = useCallback(async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const startOfDay = new Date(viewDate)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(viewDate)
      endOfDay.setHours(23, 59, 59, 999)

      const loadedEvents = await calendarRepository.listByRange(
        user.uid,
        startOfDay.getTime(),
        endOfDay.getTime()
      )
      setEvents(loadedEvents || [])
    } catch (error) {
      console.error('Failed to load events:', error)
    } finally {
      setIsLoading(false)
    }
  }, [user?.uid, viewDate, calendarRepository])

  // Load events when component opens or date changes
  useEffect(() => {
    if (isOpen && user?.uid) {
      void loadEvents()
    }
  }, [isOpen, user?.uid, loadEvents])

  // Check if a time slot is busy (overlaps with any event)
  const isSlotBusy = useCallback(
    (timeMs: number) => {
      const slotEnd = timeMs + 30 * 60 * 1000 // 30 minutes
      return events.some((event) => {
        // Skip transparent, cancelled, or declined events
        if (event.transparency === 'transparent') return false
        if (event.status === 'cancelled') return false
        if (event.selfAttendee?.responseStatus === 'declined') return false
        if (event.deletedAtMs) return false

        // Check if slot overlaps with event
        return (
          (timeMs >= event.startMs && timeMs < event.endMs) ||
          (slotEnd > event.startMs && slotEnd <= event.endMs) ||
          (timeMs <= event.startMs && slotEnd >= event.endMs)
        )
      })
    },
    [events]
  )

  // Handle slot click
  const handleSlotClick = useCallback(
    (timeMs: number) => {
      if (isSlotBusy(timeMs)) return

      if (!selectedStart || selectedEnd) {
        // Start new selection
        setSelectedStart(timeMs)
        setSelectedEnd(null)
        setIsDragging(true)
      } else {
        // Complete selection
        const end = timeMs + defaultDurationMinutes * 60 * 1000
        setSelectedEnd(end)
        setIsDragging(false)
      }
    },
    [selectedStart, selectedEnd, defaultDurationMinutes, isSlotBusy]
  )

  // Handle slot hover (for dragging)
  const handleSlotHover = useCallback(
    (timeMs: number) => {
      if (!isDragging || !selectedStart || isSlotBusy(timeMs)) return

      const end = timeMs + defaultDurationMinutes * 60 * 1000
      setSelectedEnd(end)
    },
    [isDragging, selectedStart, defaultDurationMinutes, isSlotBusy]
  )

  // Format time for display
  const formatTime = useCallback((timeMs: number) => {
    const date = new Date(timeMs)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }, [])

  // Handle confirm
  const handleConfirm = useCallback(() => {
    if (selectedStart && selectedEnd && selectedEnd > selectedStart) {
      onSelect(selectedStart, selectedEnd)
      onClose()
    }
  }, [selectedStart, selectedEnd, onSelect, onClose])

  // Handle cancel
  const handleCancel = useCallback(() => {
    setSelectedStart(null)
    setSelectedEnd(null)
    setIsDragging(false)
    onClose()
  }, [onClose])

  // Format date for display
  const dateLabel = useMemo(() => {
    return viewDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }, [viewDate])

  // Navigate dates
  const handlePreviousDay = useCallback(() => {
    const newDate = new Date(viewDate)
    newDate.setDate(newDate.getDate() - 1)
    setViewDate(newDate)
  }, [viewDate])

  const handleNextDay = useCallback(() => {
    const newDate = new Date(viewDate)
    newDate.setDate(newDate.getDate() + 1)
    setViewDate(newDate)
  }, [viewDate])

  const handleToday = useCallback(() => {
    setViewDate(new Date())
  }, [])

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-content calendar-time-picker" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Select Time Block</h2>
          <button className="close-button" onClick={handleCancel} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* Date Navigation */}
          <div className="time-picker-date-nav">
            <button type="button" className="ghost-button small" onClick={handlePreviousDay}>
              ← Previous
            </button>
            <div className="date-display">
              <button type="button" className="date-button" onClick={handleToday}>
                {dateLabel}
              </button>
            </div>
            <button type="button" className="ghost-button small" onClick={handleNextDay}>
              Next →
            </button>
          </div>

          {/* Time Slots Grid */}
          <div className="time-slots-container">
            {isLoading ? (
              <div className="loading-text">Loading calendar...</div>
            ) : (
              <div className="time-slots-grid">
                {timeSlots.map((slot) => {
                  const isBusy = isSlotBusy(slot.timeMs)
                  const isSelected =
                    selectedStart &&
                    selectedEnd &&
                    slot.timeMs >= selectedStart &&
                    slot.timeMs < selectedEnd
                  const isStart = selectedStart === slot.timeMs
                  const isEnd = selectedEnd && slot.timeMs + 30 * 60 * 1000 === selectedEnd

                  return (
                    <button
                      key={slot.timeMs}
                      type="button"
                      className={`time-slot ${isBusy ? 'busy' : ''} ${isSelected ? 'selected' : ''} ${isStart ? 'start' : ''} ${isEnd ? 'end' : ''}`}
                      onClick={() => handleSlotClick(slot.timeMs)}
                      onMouseEnter={() => handleSlotHover(slot.timeMs)}
                      disabled={isBusy}
                      title={isBusy ? 'Busy' : formatTime(slot.timeMs)}
                    >
                      {slot.minute === 0 && (
                        <span className="time-label">{formatTime(slot.timeMs)}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Selection Summary */}
          {selectedStart && selectedEnd && (
            <div className="selection-summary">
              <p>
                <strong>Selected:</strong> {formatTime(selectedStart)} - {formatTime(selectedEnd)}
              </p>
              <p className="duration-text">
                Duration: {Math.round((selectedEnd - selectedStart) / 60000)} minutes
              </p>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={handleCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleConfirm}
            disabled={!selectedStart || !selectedEnd || selectedEnd <= selectedStart}
          >
            Confirm Selection
          </button>
        </div>
      </div>

      <style>{`
        .calendar-time-picker {
          max-width: 600px;
          max-height: 90vh;
        }

        .time-picker-date-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1.5rem;
          padding: 0.75rem;
          background: var(--background-secondary);
          border-radius: 8px;
        }

        .date-display {
          flex: 1;
          text-align: center;
        }

        .date-button {
          background: transparent;
          border: none;
          color: var(--foreground);
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          transition: background-color var(--motion-standard) var(--motion-ease);
        }

        .date-button:hover {
          background: var(--background-tertiary);
        }

        .time-slots-container {
          max-height: 500px;
          overflow-y: auto;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.5rem;
        }

        .time-slots-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 2px;
        }

        .time-slot {
          position: relative;
          min-height: 40px;
          padding: 0.5rem 1rem;
          border: 1px solid var(--border);
          border-radius: 4px;
          background: var(--card);
          cursor: pointer;
          text-align: left;
          transition:
            background-color var(--motion-fast) var(--motion-ease),
            border-color var(--motion-fast) var(--motion-ease);
        }

        .time-slot:hover:not(:disabled) {
          background: var(--background-secondary);
          border-color: var(--accent);
        }

        .time-slot.busy {
          background: var(--background-tertiary);
          opacity: 0.6;
          cursor: not-allowed;
        }

        .time-slot.selected {
          background: var(--accent-subtle);
          border-color: var(--accent);
        }

        .time-slot.start {
          border-top-color: var(--accent);
          border-top-width: 2px;
        }

        .time-slot.end {
          border-bottom-color: var(--accent);
          border-bottom-width: 2px;
        }

        .time-label {
          font-size: 0.75rem;
          color: var(--muted-foreground);
          font-weight: 600;
        }

        .selection-summary {
          margin-top: 1rem;
          padding: 1rem;
          background: var(--background-secondary);
          border-radius: 8px;
        }

        .selection-summary p {
          margin: 0.25rem 0;
          font-size: 0.875rem;
        }

        .duration-text {
          color: var(--muted-foreground);
          font-size: 0.8125rem;
        }

        .loading-text {
          text-align: center;
          padding: 2rem;
          color: var(--muted-foreground);
        }
      `}</style>
    </div>
  )
}
