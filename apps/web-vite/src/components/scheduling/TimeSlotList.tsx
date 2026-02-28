/**
 * @fileoverview Scrollable list of available time slots for the selected date.
 */

interface TimeSlot {
  startMs: number
  endMs: number
}

interface TimeSlotListProps {
  date: Date | null
  slots: TimeSlot[]
  selectedSlot: TimeSlot | null
  onSelect: (slot: TimeSlot) => void
  timezone: string
  loading: boolean
}

function formatTime(ms: number, timezone: string): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  })
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function TimeSlotList({
  date,
  slots,
  selectedSlot,
  onSelect,
  timezone,
  loading,
}: TimeSlotListProps) {
  if (!date) {
    return (
      <div className="booking-slots">
        <p className="booking-slots__empty">Select a date to see available times</p>
      </div>
    )
  }

  return (
    <div className="booking-slots">
      <h3 className="booking-slots__header">{formatDate(date)}</h3>

      {loading ? (
        <p className="booking-slots__empty">Loading available times...</p>
      ) : slots.length === 0 ? (
        <p className="booking-slots__empty">No available times on this date</p>
      ) : (
        <div className="booking-slots__list">
          {slots.map((slot) => (
            <button
              key={slot.startMs}
              type="button"
              className={`time-slot${selectedSlot?.startMs === slot.startMs ? ' time-slot--selected' : ''}`}
              onClick={() => onSelect(slot)}
            >
              {formatTime(slot.startMs, timezone)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
