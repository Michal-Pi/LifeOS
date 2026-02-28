import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CanonicalCalendarEvent } from '../../domain/models'
import type { Weekday } from '../../domain/recurrence/types'
import { createEvent, updateEvent, deleteEvent, type EventUsecaseDeps } from '../eventUsecases'
import {
  createRecurringSeries,
  editRecurringEvent,
  deleteRecurringEvent,
} from '../recurrenceUsecases'

// Mock repository
const mockRepository = {
  listByOccursOn: vi.fn(),
  listByRange: vi.fn(),
  getById: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}

const deps: EventUsecaseDeps = { repository: mockRepository }

describe('createEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a timed event with valid times', async () => {
    const input = {
      userId: 'user-1',
      title: 'Meeting',
      startMs: Date.now(),
      endMs: Date.now() + 3600000, // 1 hour later
      allDay: false,
    }

    mockRepository.createEvent.mockResolvedValue(undefined)

    const result = await createEvent(deps, input)

    expect(result.title).toBe('Meeting')
    expect(result.source?.type).toBe('local')
    expect(result.occursOn.length).toBeGreaterThan(0)
    expect(mockRepository.createEvent).toHaveBeenCalledTimes(1)
  })

  it('throws error for timed event where end is before start', async () => {
    const input = {
      userId: 'user-1',
      title: 'Bad Meeting',
      startMs: Date.now() + 3600000,
      endMs: Date.now(), // Before start
      allDay: false,
    }

    await expect(createEvent(deps, input)).rejects.toThrow('Timed events must end after they start')
  })

  it('creates an all-day event spanning multiple days', async () => {
    const startDate = new Date('2025-01-15T00:00:00Z')
    const endDate = new Date('2025-01-17T23:59:59Z')

    const input = {
      userId: 'user-1',
      title: 'Conference',
      startMs: startDate.getTime(),
      endMs: endDate.getTime(),
      allDay: true,
    }

    mockRepository.createEvent.mockResolvedValue(undefined)

    const result = await createEvent(deps, input)

    expect(result.occursOn).toContain('2025-01-15')
    expect(result.occursOn).toContain('2025-01-16')
    expect(result.occursOn).toContain('2025-01-17')
  })

  it('normalizes occursOn for single-day events', async () => {
    const startDate = new Date('2025-06-20T09:00:00Z')
    const endDate = new Date('2025-06-20T10:00:00Z')

    const input = {
      userId: 'user-1',
      title: 'Quick Call',
      startMs: startDate.getTime(),
      endMs: endDate.getTime(),
      allDay: false,
    }

    mockRepository.createEvent.mockResolvedValue(undefined)

    const result = await createEvent(deps, input)

    expect(result.occursOn).toEqual(['2025-06-20'])
  })
})

describe('updateEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const existingEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'event-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'local',
      accountId: 'local',
      providerCalendarId: 'local',
      providerEventId: 'local-1',
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1704067200000,
    syncState: 'synced',
    source: { type: 'local' },
    startMs: 1704110400000,
    endMs: 1704114000000,
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Original Title',
    occursOn: ['2025-01-01'],
  }

  it('updates event title', async () => {
    mockRepository.getById.mockResolvedValue(existingEvent)
    mockRepository.updateEvent.mockResolvedValue(undefined)

    const result = await updateEvent(deps, {
      userId: 'user-1',
      eventId: 'event-1',
      patch: { title: 'Updated Title' },
    })

    expect(result.title).toBe('Updated Title')
    expect(result.updatedAtMs).toBeGreaterThan(existingEvent.updatedAtMs)
  })

  it('throws error when event not found', async () => {
    mockRepository.getById.mockResolvedValue(null)

    await expect(
      updateEvent(deps, {
        userId: 'user-1',
        eventId: 'nonexistent',
        patch: { title: 'New Title' },
      })
    ).rejects.toThrow('Event not found or deleted')
  })

  it('throws error when updating a deleted event', async () => {
    mockRepository.getById.mockResolvedValue({
      ...existingEvent,
      deletedAtMs: Date.now(),
    })

    await expect(
      updateEvent(deps, {
        userId: 'user-1',
        eventId: 'event-1',
        patch: { title: 'New Title' },
      })
    ).rejects.toThrow('Event not found or deleted')
  })

  it('recalculates occursOn when times change', async () => {
    mockRepository.getById.mockResolvedValue(existingEvent)
    mockRepository.updateEvent.mockResolvedValue(undefined)

    const newStartIso = '2025-02-15T09:00:00Z'
    const newEndIso = '2025-02-17T17:00:00Z'

    const result = await updateEvent(deps, {
      userId: 'user-1',
      eventId: 'event-1',
      patch: {
        startIso: newStartIso,
        endIso: newEndIso,
        startMs: new Date(newStartIso).getTime(),
        endMs: new Date(newEndIso).getTime(),
      },
    })

    expect(result.occursOn).toContain('2025-02-15')
    expect(result.occursOn).toContain('2025-02-16')
    expect(result.occursOn).toContain('2025-02-17')
  })
})

describe('deleteEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const existingEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'event-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'local',
      accountId: 'local',
      providerCalendarId: 'local',
      providerEventId: 'local-1',
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1704067200000,
    syncState: 'synced',
    source: { type: 'local' },
    startMs: 1704110400000,
    endMs: 1704114000000,
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Event to Delete',
    occursOn: ['2025-01-01'],
  }

  it('deletes a non-recurring event', async () => {
    mockRepository.getById.mockResolvedValue(existingEvent)
    mockRepository.deleteEvent.mockResolvedValue(undefined)

    await expect(
      deleteEvent(deps, { userId: 'user-1', eventId: 'event-1' })
    ).resolves.toBeUndefined()

    expect(mockRepository.deleteEvent).toHaveBeenCalledWith('user-1', 'event-1', undefined)
  })

  it('throws error when deleting a recurring event (recurrenceRules)', async () => {
    mockRepository.getById.mockResolvedValue({
      ...existingEvent,
      recurrence: { recurrenceRules: ['RRULE:FREQ=DAILY'] },
    })

    await expect(deleteEvent(deps, { userId: 'user-1', eventId: 'event-1' })).rejects.toThrow(
      'Cannot delete event: recurring_event_not_supported'
    )
  })

  it('throws error when deleting a recurring event (recurringEventId)', async () => {
    mockRepository.getById.mockResolvedValue({
      ...existingEvent,
      providerRef: {
        ...existingEvent.providerRef,
        recurringEventId: 'parent-event-123',
      },
    })

    await expect(deleteEvent(deps, { userId: 'user-1', eventId: 'event-1' })).rejects.toThrow(
      'Cannot delete event: recurring_event_not_supported'
    )
  })

  it('throws error when event not found', async () => {
    mockRepository.getById.mockResolvedValue(null)

    await expect(deleteEvent(deps, { userId: 'user-1', eventId: 'nonexistent' })).rejects.toThrow(
      'Event not found or already deleted'
    )
  })

  it('throws error when event already deleted', async () => {
    mockRepository.getById.mockResolvedValue({
      ...existingEvent,
      deletedAtMs: Date.now(),
    })

    await expect(deleteEvent(deps, { userId: 'user-1', eventId: 'event-1' })).rejects.toThrow(
      'Event not found or already deleted'
    )
  })
})

// ==================== Recurring Events Tests ====================

describe('createRecurringSeries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a recurring series with valid rule', async () => {
    const input = {
      userId: 'user-1',
      title: 'Weekly Meeting',
      startMs: Date.now(),
      endMs: Date.now() + 3600000,
      rule: {
        freq: 'WEEKLY' as const,
        interval: 1,
        byWeekday: ['MO', 'WE', 'FR'] as Weekday[],
      },
    }

    mockRepository.createEvent.mockResolvedValue(undefined)

    const result = await createRecurringSeries({ repository: mockRepository }, input)

    expect(result.title).toBe('Weekly Meeting')
    expect(result.isRecurringSeries).toBe(true)
    expect(result.recurrenceV2?.rule.freq).toBe('WEEKLY')
    expect(result.recurrenceV2?.rule.byWeekday).toEqual(['MO', 'WE', 'FR'])
    expect(mockRepository.createEvent).toHaveBeenCalledTimes(1)
  })

  it('throws error for invalid recurrence rule', async () => {
    const input = {
      userId: 'user-1',
      title: 'Invalid Meeting',
      startMs: Date.now(),
      endMs: Date.now() + 3600000,
      rule: {
        // Missing freq
        interval: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }

    await expect(createRecurringSeries({ repository: mockRepository }, input)).rejects.toThrow(
      'Recurrence rule must have a frequency'
    )
  })

  it('sets default interval to 1', async () => {
    const input = {
      userId: 'user-1',
      title: 'Daily Standup',
      startMs: Date.now(),
      endMs: Date.now() + 1800000,
      rule: {
        freq: 'DAILY' as const,
        // No interval specified
      },
    }

    mockRepository.createEvent.mockResolvedValue(undefined)

    const result = await createRecurringSeries({ repository: mockRepository }, input)

    expect(result.recurrenceV2?.rule.interval).toBe(1)
  })
})

describe('editRecurringEvent', () => {
  const recurringEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'series-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'local',
      accountId: 'local',
      providerCalendarId: 'local',
      providerEventId: 'local-1',
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1704067200000,
    syncState: 'synced',
    source: { type: 'local' },
    startMs: 1704110400000,
    endMs: 1704114000000,
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Weekly Meeting',
    occursOn: ['2025-01-01'],
    recurrenceV2: {
      tz: 'America/New_York',
      rule: {
        freq: 'WEEKLY',
        interval: 1,
        byWeekday: ['MO'],
      },
    },
    isRecurringSeries: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('edits all instances when scope is "all"', async () => {
    mockRepository.getById.mockResolvedValue(recurringEvent)
    mockRepository.updateEvent.mockResolvedValue(undefined)

    const result = await editRecurringEvent(
      { repository: mockRepository },
      {
        userId: 'user-1',
        eventId: 'series-1',
        scope: 'all',
        patch: { title: 'Updated Weekly Meeting' },
      }
    )

    expect(result.updatedMaster?.title).toBe('Updated Weekly Meeting')
    expect(result.newSeries).toBeUndefined()
    expect(mockRepository.updateEvent).toHaveBeenCalledTimes(1)
  })

  it('creates override when scope is "this"', async () => {
    mockRepository.getById.mockResolvedValue(recurringEvent)
    mockRepository.updateEvent.mockResolvedValue(undefined)

    const occurrenceStartMs = 1704110400000 // Same as series start

    const result = await editRecurringEvent(
      { repository: mockRepository },
      {
        userId: 'user-1',
        eventId: 'series-1',
        scope: 'this',
        occurrenceStartMs,
        patch: { title: 'Special Meeting' },
      }
    )

    expect(result.updatedMaster?.recurrenceV2?.overrides).toBeDefined()
    expect(result.overrideKey).toBe(`${occurrenceStartMs}`)
    expect(mockRepository.updateEvent).toHaveBeenCalledTimes(1)
  })

  it('splits series when scope is "this_and_future"', async () => {
    mockRepository.getById.mockResolvedValue(recurringEvent)
    mockRepository.updateEvent.mockResolvedValue(undefined)
    mockRepository.createEvent.mockResolvedValue(undefined)

    const occurrenceStartMs = 1704110400000

    const result = await editRecurringEvent(
      { repository: mockRepository },
      {
        userId: 'user-1',
        eventId: 'series-1',
        scope: 'this_and_future',
        occurrenceStartMs,
        patch: { title: 'Future Meeting' },
      }
    )

    expect(result.updatedMaster).toBeDefined()
    expect(result.newSeries).toBeDefined()
    expect(result.newSeries?.title).toBe('Future Meeting')
    expect(mockRepository.updateEvent).toHaveBeenCalledTimes(1)
    expect(mockRepository.createEvent).toHaveBeenCalledTimes(1)
  })

  it('throws error when series not found', async () => {
    mockRepository.getById.mockResolvedValue(null)

    await expect(
      editRecurringEvent(
        { repository: mockRepository },
        {
          userId: 'user-1',
          eventId: 'nonexistent',
          scope: 'all',
          patch: { title: 'New Title' },
        }
      )
    ).rejects.toThrow('Series not found')
  })

  it('throws error when event is not recurring', async () => {
    const nonRecurringEvent = {
      ...recurringEvent,
      isRecurringSeries: false,
      recurrenceV2: undefined,
    }
    mockRepository.getById.mockResolvedValue(nonRecurringEvent)

    await expect(
      editRecurringEvent(
        { repository: mockRepository },
        {
          userId: 'user-1',
          eventId: 'event-1',
          scope: 'all',
          patch: { title: 'New Title' },
        }
      )
    ).rejects.toThrow('Event is not a recurring series')
  })
})

describe('deleteRecurringEvent', () => {
  const recurringEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'series-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'local',
      accountId: 'local',
      providerCalendarId: 'local',
      providerEventId: 'local-1',
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1704067200000,
    syncState: 'synced',
    source: { type: 'local' },
    startMs: 1704110400000,
    endMs: 1704114000000,
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Weekly Meeting',
    occursOn: ['2025-01-01'],
    recurrenceV2: {
      tz: 'America/New_York',
      rule: {
        freq: 'WEEKLY',
        interval: 1,
        byWeekday: ['MO'],
      },
    },
    isRecurringSeries: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes entire series when scope is "all"', async () => {
    mockRepository.getById.mockResolvedValue(recurringEvent)
    mockRepository.deleteEvent.mockResolvedValue(undefined)

    const result = await deleteRecurringEvent(
      { repository: mockRepository },
      {
        userId: 'user-1',
        eventId: 'series-1',
        scope: 'all',
      }
    )

    expect(result.deletedSeriesId).toBe('series-1')
    expect(mockRepository.deleteEvent).toHaveBeenCalledWith('user-1', 'series-1')
  })

  it('adds exception when scope is "this"', async () => {
    mockRepository.getById.mockResolvedValue(recurringEvent)
    mockRepository.updateEvent.mockResolvedValue(undefined)

    const occurrenceStartMs = 1704110400000

    const result = await deleteRecurringEvent(
      { repository: mockRepository },
      {
        userId: 'user-1',
        eventId: 'series-1',
        scope: 'this',
        occurrenceStartMs,
      }
    )

    expect(result.updatedMaster?.recurrenceV2?.exdatesMs).toContain(occurrenceStartMs)
    expect(mockRepository.updateEvent).toHaveBeenCalledTimes(1)
  })

  it('truncates series when scope is "this_and_future"', async () => {
    mockRepository.getById.mockResolvedValue(recurringEvent)
    mockRepository.updateEvent.mockResolvedValue(undefined)

    const occurrenceStartMs = 1704110400000

    const result = await deleteRecurringEvent(
      { repository: mockRepository },
      {
        userId: 'user-1',
        eventId: 'series-1',
        scope: 'this_and_future',
        occurrenceStartMs,
      }
    )

    expect(result.updatedMaster?.recurrenceV2?.rule.untilMs).toBeDefined()
    expect(mockRepository.updateEvent).toHaveBeenCalledTimes(1)
  })
})
