/**
 * Phase 47 — Calendar Intelligence
 *
 * Analyzes calendar event patterns to identify meeting load,
 * recurring meetings, and focus blocks.
 */

export interface CalendarEvent {
  id: string
  title: string
  startTime: string // ISO 8601
  endTime: string // ISO 8601
  isRecurring?: boolean
  recurrenceRule?: string
}

export interface RecurringMeetingSummary {
  title: string
  frequency: string
  totalHoursPerMonth: number
  occurrences: number
}

export interface FocusBlock {
  day: string
  startTime: string
  durationMinutes: number
}

export interface CalendarAnalysis {
  totalMeetingsThisWeek: number
  totalMeetingHours: number
  recurringMeetings: RecurringMeetingSummary[]
  meetingFreeBlocks: FocusBlock[]
  suggestions: string[]
}

/**
 * Calculate meeting duration in hours.
 */
function meetingDurationHours(event: CalendarEvent): number {
  const start = new Date(event.startTime).getTime()
  const end = new Date(event.endTime).getTime()
  return Math.max(0, (end - start) / (1000 * 60 * 60))
}

/**
 * Group events by normalized title and count occurrences.
 */
function groupRecurringMeetings(events: CalendarEvent[]): RecurringMeetingSummary[] {
  const groups = new Map<string, { count: number; totalHours: number }>()

  for (const event of events) {
    const key = event.title.trim().toLowerCase()
    const existing = groups.get(key) || { count: 0, totalHours: 0 }
    existing.count++
    existing.totalHours += meetingDurationHours(event)
    groups.set(key, existing)
  }

  return Array.from(groups.entries())
    .filter(([, data]) => data.count >= 2) // at least 2 occurrences = recurring
    .map(([title, data]) => ({
      title,
      frequency: data.count >= 4 ? 'weekly' : data.count >= 2 ? 'bi-weekly' : 'monthly',
      totalHoursPerMonth: data.totalHours,
      occurrences: data.count,
    }))
    .sort((a, b) => b.totalHoursPerMonth - a.totalHoursPerMonth)
}

/**
 * Find meeting-free blocks longer than the threshold.
 *
 * @param events - Calendar events sorted by start time
 * @param minBlockMinutes - Minimum gap to qualify as a focus block (default 120 = 2 hours)
 */
function findFocusBlocks(events: CalendarEvent[], minBlockMinutes: number = 120): FocusBlock[] {
  if (events.length === 0) return []

  // Sort by start time
  const sorted = [...events].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  )

  const blocks: FocusBlock[] = []

  for (let i = 0; i < sorted.length - 1; i++) {
    const currentEnd = new Date(sorted[i].endTime).getTime()
    const nextStart = new Date(sorted[i + 1].startTime).getTime()
    const gapMinutes = (nextStart - currentEnd) / (1000 * 60)

    if (gapMinutes >= minBlockMinutes) {
      const endDate = new Date(sorted[i].endTime)
      blocks.push({
        day: endDate.toLocaleDateString('en-US', { weekday: 'long' }),
        startTime: endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        durationMinutes: Math.round(gapMinutes),
      })
    }
  }

  return blocks
}

/**
 * Generate actionable suggestions based on calendar analysis.
 */
function generateSuggestions(
  totalHours: number,
  recurring: RecurringMeetingSummary[],
  focusBlocks: FocusBlock[]
): string[] {
  const suggestions: string[] = []

  if (totalHours > 20) {
    suggestions.push(
      `You have ${totalHours.toFixed(1)} hours of meetings this week — consider declining non-essential meetings.`
    )
  }

  for (const meeting of recurring.slice(0, 2)) {
    if (meeting.totalHoursPerMonth > 4) {
      suggestions.push(
        `"${meeting.title}" takes ${meeting.totalHoursPerMonth.toFixed(1)} hours/month — consider reducing frequency or duration.`
      )
    }
  }

  if (focusBlocks.length === 0) {
    suggestions.push('No focus blocks (>2 hours uninterrupted) found — consider blocking dedicated deep work time.')
  } else if (focusBlocks.length >= 3) {
    suggestions.push(
      `You have ${focusBlocks.length} focus blocks available — protect these for deep work.`
    )
  }

  return suggestions
}

/**
 * Analyze calendar patterns from a list of events.
 *
 * @param events - Calendar events for the analysis period
 * @returns CalendarAnalysis with meeting stats, recurring meetings, focus blocks, and suggestions
 */
export function analyzeCalendarPatterns(events: CalendarEvent[]): CalendarAnalysis {
  const totalMeetingsThisWeek = events.length
  const totalMeetingHours = events.reduce((sum, e) => sum + meetingDurationHours(e), 0)
  const recurringMeetings = groupRecurringMeetings(events)
  const meetingFreeBlocks = findFocusBlocks(events)
  const suggestions = generateSuggestions(totalMeetingHours, recurringMeetings, meetingFreeBlocks)

  return {
    totalMeetingsThisWeek,
    totalMeetingHours: Math.round(totalMeetingHours * 10) / 10,
    recurringMeetings,
    meetingFreeBlocks,
    suggestions,
  }
}
