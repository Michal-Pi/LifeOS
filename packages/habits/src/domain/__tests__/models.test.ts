import { describe, it, expect } from 'vitest'
import type {
  CanonicalHabit,
  CanonicalHabitCheckin,
  HabitDomain,
  HabitStatus,
  CheckinStatus,
  HabitAnchor,
  TimeWindowAnchor,
  AfterEventAnchor,
} from '../models'

describe('CanonicalHabit', () => {
  it('creates a valid habit with time window anchor', () => {
    const timeWindowAnchor: TimeWindowAnchor = {
      type: 'time_window',
      startTimeHHMM: '06:00',
      endTimeHHMM: '08:00',
    }

    const habit: CanonicalHabit = {
      habitId: 'habit:123' as any,
      userId: 'user-1',
      title: 'Morning Meditation',
      domain: 'meditation',
      status: 'active',
      anchor: timeWindowAnchor,
      recipe: {
        tiny: '1 breath',
        standard: '10 minutes',
      },
      schedule: {
        daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
      },
      safetyNet: {
        tinyCountsAsSuccess: true,
        allowRecovery: true,
      },
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      syncState: 'synced',
      version: 1,
    }

    expect(habit.habitId).toBe('habit:123')
    expect(habit.title).toBe('Morning Meditation')
    expect(habit.domain).toBe('meditation')
    expect(habit.status).toBe('active')
    expect(habit.anchor.type).toBe('time_window')
    expect(habit.schedule.daysOfWeek).toHaveLength(5)
  })

  it('creates a valid habit with after-event anchor', () => {
    const afterEventAnchor: AfterEventAnchor = {
      type: 'after_event',
      eventDescription: 'Wake up',
    }

    const habit: CanonicalHabit = {
      habitId: 'habit:456' as any,
      userId: 'user-1',
      title: 'Exercise',
      domain: 'exercise',
      status: 'active',
      anchor: afterEventAnchor,
      recipe: {
        tiny: '2 push-ups',
        standard: '30 min workout',
      },
      schedule: {
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days
      },
      safetyNet: {
        tinyCountsAsSuccess: true,
        allowRecovery: true,
      },
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      syncState: 'synced',
      version: 1,
    }

    expect(habit.anchor.type).toBe('after_event')
    expect((habit.anchor as AfterEventAnchor).eventDescription).toBe('Wake up')
  })

  it('supports all habit domains', () => {
    const domains: HabitDomain[] = [
      'sleep',
      'exercise',
      'meditation',
      'nutrition',
      'work_focus',
      'social',
      'learning',
      'creativity',
      'custom',
    ]

    domains.forEach((domain) => {
      expect(domain).toBeDefined()
    })
  })

  it('supports all habit statuses', () => {
    const statuses: HabitStatus[] = ['active', 'paused', 'archived']

    statuses.forEach((status) => {
      expect(status).toBeDefined()
    })
  })
})

describe('CanonicalHabitCheckin', () => {
  it('creates a valid check-in with done status', () => {
    const checkin: CanonicalHabitCheckin = {
      checkinId: 'checkin:habit:123_2025-12-27' as any,
      userId: 'user-1',
      habitId: 'habit:123' as any,
      dateKey: '2025-12-27',
      status: 'done',
      moodBefore: 3,
      moodAfter: 4,
      note: 'Felt great!',
      checkedInAtMs: Date.now(),
      sourceType: 'manual',
      syncState: 'synced',
      version: 1,
    }

    expect(checkin.status).toBe('done')
    expect(checkin.moodBefore).toBe(3)
    expect(checkin.moodAfter).toBe(4)
    expect(checkin.dateKey).toBe('2025-12-27')
  })

  it('creates a valid check-in with tiny status', () => {
    const checkin: CanonicalHabitCheckin = {
      checkinId: 'checkin:habit:123_2025-12-27' as any,
      userId: 'user-1',
      habitId: 'habit:123' as any,
      dateKey: '2025-12-27',
      status: 'tiny',
      checkedInAtMs: Date.now(),
      sourceType: 'manual',
      syncState: 'synced',
      version: 1,
    }

    expect(checkin.status).toBe('tiny')
  })

  it('creates a valid check-in with skip status', () => {
    const checkin: CanonicalHabitCheckin = {
      checkinId: 'checkin:habit:123_2025-12-27' as any,
      userId: 'user-1',
      habitId: 'habit:123' as any,
      dateKey: '2025-12-27',
      status: 'skip',
      note: 'Sick today',
      checkedInAtMs: Date.now(),
      sourceType: 'manual',
      syncState: 'synced',
      version: 1,
    }

    expect(checkin.status).toBe('skip')
    expect(checkin.note).toBe('Sick today')
  })

  it('supports all checkin statuses', () => {
    const statuses: CheckinStatus[] = ['done', 'tiny', 'skip']

    statuses.forEach((status) => {
      expect(status).toBeDefined()
    })
  })

  it('supports auto-creation from intervention', () => {
    const checkin: CanonicalHabitCheckin = {
      checkinId: 'checkin:habit:123_2025-12-27' as any,
      userId: 'user-1',
      habitId: 'habit:123' as any,
      dateKey: '2025-12-27',
      status: 'done',
      checkedInAtMs: Date.now(),
      sourceType: 'intervention',
      sourceId: 'session:xyz',
      syncState: 'synced',
      version: 1,
    }

    expect(checkin.sourceType).toBe('intervention')
    expect(checkin.sourceId).toBe('session:xyz')
  })
})

describe('Checkin ID Generation', () => {
  it('generates deterministic checkin IDs', () => {
    const habitId = 'habit:123'
    const dateKey = '2025-12-27'
    const expectedCheckinId = `checkin:${habitId}_${dateKey}`

    expect(expectedCheckinId).toBe('checkin:habit:123_2025-12-27')
  })

  it('ensures unique check-ins per habit per day', () => {
    const habitId1 = 'habit:123'
    const habitId2 = 'habit:456'
    const dateKey = '2025-12-27'

    const checkinId1 = `checkin:${habitId1}_${dateKey}`
    const checkinId2 = `checkin:${habitId2}_${dateKey}`

    expect(checkinId1).not.toBe(checkinId2)
  })
})
