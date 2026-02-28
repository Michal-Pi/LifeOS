/**
 * CalendarHeader Component
 *
 * Displays calendar header with:
 * - Current date/time information
 * - View type toggles (Day/Week/Month/Agenda) using SegmentedControl
 * - Timezone display
 */

import { SegmentedControl } from '@/components/SegmentedControl'

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

const VIEW_OPTIONS = [
  { value: 'daily', label: 'Day' },
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'agenda', label: 'Agenda' },
]

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

      <SegmentedControl
        value={viewType}
        options={VIEW_OPTIONS}
        onChange={(value) => onViewTypeChange(value as ViewType)}
      />
    </>
  )
}
