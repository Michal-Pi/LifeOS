import { describe, it, expect } from 'vitest'
import { computeKeywordOverlap, suggestNoteConnections } from '../knowledgeGraphSuggestions.js'
import { analyzeCalendarPatterns, type CalendarEvent } from '../calendarIntelligence.js'

describe('Phase 47 — suggestNoteConnections', () => {
  const allNotes = [
    {
      noteId: 'note-1',
      title: 'React Performance',
      contentPreview: 'React rendering optimization virtual DOM reconciliation memoization',
    },
    {
      noteId: 'note-2',
      title: 'Vue Composition API',
      contentPreview: 'Vue composition reactive refs computed watchers',
    },
    {
      noteId: 'note-3',
      title: 'React Hooks Guide',
      contentPreview: 'React hooks useState useEffect memoization performance rendering',
    },
    {
      noteId: 'note-4',
      title: 'Cooking Recipes',
      contentPreview: 'pasta sauce ingredients preparation cooking time temperature',
    },
  ]

  it('returns suggestions excluding already-connected notes', () => {
    const suggestions = suggestNoteConnections(
      'note-0',
      'React rendering performance hooks optimization memoization',
      allNotes,
      ['note-1'], // already connected
      0.1
    )
    const ids = suggestions.map((s) => s.targetNoteId)
    expect(ids).not.toContain('note-1') // already connected
    expect(ids).toContain('note-3') // React hooks — high overlap
  })

  it('suggestions have valid strength scores (0-1)', () => {
    const suggestions = suggestNoteConnections(
      'note-0',
      'React rendering performance hooks optimization',
      allNotes,
      [],
      0.05
    )
    for (const s of suggestions) {
      expect(s.strength).toBeGreaterThanOrEqual(0)
      expect(s.strength).toBeLessThanOrEqual(1)
    }
  })

  it('handles notes with no potential connections', () => {
    const suggestions = suggestNoteConnections(
      'note-0',
      'quantum entanglement superposition decoherence',
      allNotes,
      [],
      0.5
    )
    expect(suggestions).toHaveLength(0)
  })

  it('excludes self from suggestions', () => {
    const suggestions = suggestNoteConnections(
      'note-1',
      'React rendering optimization virtual DOM',
      allNotes,
      [],
      0.1
    )
    const ids = suggestions.map((s) => s.targetNoteId)
    expect(ids).not.toContain('note-1')
  })

  it('computeKeywordOverlap returns 0 for unrelated texts', () => {
    const score = computeKeywordOverlap('React hooks rendering', 'pasta cooking ingredients')
    expect(score).toBe(0)
  })

  it('computeKeywordOverlap returns >0 for related texts', () => {
    const score = computeKeywordOverlap(
      'React hooks performance rendering',
      'React rendering optimization performance'
    )
    expect(score).toBeGreaterThan(0)
  })
})

describe('Phase 47 — analyzeCalendarPatterns', () => {
  const makeEvent = (
    title: string,
    startHour: number,
    durationHours: number,
    dayOffset = 0
  ): CalendarEvent => {
    const base = new Date('2026-03-02T00:00:00Z')
    base.setDate(base.getDate() + dayOffset)
    base.setHours(startHour)
    const end = new Date(base.getTime() + durationHours * 60 * 60 * 1000)
    return {
      id: `event-${Math.random().toString(36).slice(2, 8)}`,
      title,
      startTime: base.toISOString(),
      endTime: end.toISOString(),
    }
  }

  it('correctly counts meetings and hours', () => {
    const events = [
      makeEvent('Standup', 9, 0.5, 0),
      makeEvent('Standup', 9, 0.5, 1),
      makeEvent('Planning', 14, 1, 0),
    ]
    const analysis = analyzeCalendarPatterns(events)
    expect(analysis.totalMeetingsThisWeek).toBe(3)
    expect(analysis.totalMeetingHours).toBe(2)
  })

  it('groups recurring meetings correctly', () => {
    const events = [
      makeEvent('Weekly Sync', 10, 1, 0),
      makeEvent('Weekly Sync', 10, 1, 1),
      makeEvent('Weekly Sync', 10, 1, 2),
      makeEvent('One-off Review', 14, 0.5, 0),
    ]
    const analysis = analyzeCalendarPatterns(events)
    expect(analysis.recurringMeetings).toHaveLength(1)
    expect(analysis.recurringMeetings[0].title).toBe('weekly sync')
    expect(analysis.recurringMeetings[0].occurrences).toBe(3)
  })

  it('identifies meeting-free focus blocks', () => {
    const events = [makeEvent('Morning Meeting', 9, 1, 0), makeEvent('Afternoon Meeting', 14, 1, 0)]
    const analysis = analyzeCalendarPatterns(events)
    // Gap from 10:00 to 14:00 = 4 hours = 240 minutes
    expect(analysis.meetingFreeBlocks.length).toBeGreaterThanOrEqual(1)
    expect(analysis.meetingFreeBlocks[0].durationMinutes).toBe(240)
  })

  it('generates suggestion for high meeting load', () => {
    // Create 25+ hours of meetings
    const events = Array.from({ length: 25 }, (_, i) =>
      makeEvent(`Meeting ${i}`, 9 + (i % 8), 1, Math.floor(i / 5))
    )
    const analysis = analyzeCalendarPatterns(events)
    expect(analysis.suggestions.some((s) => s.includes('consider declining'))).toBe(true)
  })

  it('handles empty events list', () => {
    const analysis = analyzeCalendarPatterns([])
    expect(analysis.totalMeetingsThisWeek).toBe(0)
    expect(analysis.totalMeetingHours).toBe(0)
    expect(analysis.recurringMeetings).toHaveLength(0)
    expect(analysis.meetingFreeBlocks).toHaveLength(0)
  })
})
