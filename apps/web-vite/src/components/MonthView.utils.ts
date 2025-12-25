export interface DayCell {
  date: Date
  dayOfMonth: number
  isCurrentMonth: boolean
  isToday: boolean
  events: Array<{ title: string; isRecurring: boolean; isInstance: boolean; colorTone?: 'light' | 'normal' | 'dark' }>
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Get all days for a month view grid (6 weeks)
 */
export function getMonthGrid(year: number, month: number): Date[] {
  const days: Date[] = []
  const firstDay = new Date(year, month, 1)
  const startOffset = firstDay.getDay() // 0 = Sunday
  const startDate = new Date(year, month, 1 - startOffset)

  for (let i = 0; i < 42; i++) {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + i)
    days.push(date)
  }

  return days
}

/**
 * Get all days for a week view (7 days)
 */
export function getWeekGrid(dateInWeek: Date): Date[] {
  const days: Date[] = []
  const startOfWeek = new Date(dateInWeek)
  const dayOfWeek = startOfWeek.getDay() // 0 = Sunday
  startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek) // Go to Sunday

  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek)
    date.setDate(startOfWeek.getDate() + i)
    days.push(date)
  }

  return days
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Format date key (YYYY-MM-DD)
 */
export function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0]
}
