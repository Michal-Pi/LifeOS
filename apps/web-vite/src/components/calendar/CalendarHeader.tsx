/**
 * CalendarHeader Component
 *
 * Displays calendar header with:
 * - Current date/time information
 * - View type toggles (Day/Week/Month/Agenda)
 * - Timezone display
 */

type ViewType = 'daily' | 'weekly' | 'monthly' | 'agenda'

interface CalendarHeaderProps {
  // Current view state
  viewType: ViewType
  onViewTypeChange: (view: ViewType) => void

  // Date information
  selectedMonthDate: Date | null
  timezone: string
}

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: 'numeric',
})

export function CalendarHeader({
  viewType,
  onViewTypeChange,
  selectedMonthDate,
  timezone,
}: CalendarHeaderProps) {
  const today = new Date()

  return (
    <>
      <div>
        <h1>
          {selectedMonthDate ? 'Selected Date' : 'Today'} in {timezone}
        </h1>
        <p className="calendar-meta">
          {selectedMonthDate
            ? timeFormatter.format(selectedMonthDate)
            : timeFormatter.format(today)}
        </p>
      </div>

      <div className="view-toggles">
        <button
          className={`view-toggle ${viewType === 'daily' ? 'active' : ''}`}
          onClick={() => onViewTypeChange('daily')}
        >
          Day
        </button>
        <button
          className={`view-toggle ${viewType === 'weekly' ? 'active' : ''}`}
          onClick={() => onViewTypeChange('weekly')}
        >
          Week
        </button>
        <button
          className={`view-toggle ${viewType === 'monthly' ? 'active' : ''}`}
          onClick={() => onViewTypeChange('monthly')}
        >
          Month
        </button>
        <button
          className={`view-toggle ${viewType === 'agenda' ? 'active' : ''}`}
          onClick={() => onViewTypeChange('agenda')}
        >
          Agenda
        </button>
      </div>
    </>
  )
}
