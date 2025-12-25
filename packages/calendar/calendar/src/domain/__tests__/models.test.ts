import { describe, it, expect } from 'vitest'
import {
  computeOccursOn,
  isDeleted,
  determineEventRole,
  findSelfAttendee,
  deriveRSVP,
  isEventBusy,
  getEventRole,
  canRespond,
  canUpdate,
  canCancel,
  getPrimaryAlert,
  computeAlertFireTimeMs,
  isAlertDismissed,
  shouldAlertFire,
  describeAlert,
  deriveCalendarCanWrite,
  normalizeAccessRole,
  deriveEventCanWrite,
  canEditEvent,
  canRSVPToEvent,
  resolveConflict,
  wouldConflict,
  type CanonicalCalendarEvent,
  type CanonicalAttendee,
  type CanonicalAlert,
  type CanonicalCalendar,
  type CalendarsById,
  type IncomingUpdate
} from '../models'

describe('computeOccursOn', () => {
  it('returns single day for same-day event', () => {
    const result = computeOccursOn(
      '2025-06-15T09:00:00Z',
      '2025-06-15T17:00:00Z'
    )
    expect(result).toEqual(['2025-06-15'])
  })

  it('returns multiple days for multi-day event', () => {
    const result = computeOccursOn(
      '2025-06-15T09:00:00Z',
      '2025-06-17T17:00:00Z'
    )
    expect(result).toEqual(['2025-06-15', '2025-06-16', '2025-06-17'])
  })

  it('caps at 60 days by default', () => {
    const start = new Date('2025-01-01T00:00:00Z')
    const end = new Date('2025-06-01T00:00:00Z') // ~150 days later

    const result = computeOccursOn(start.toISOString(), end.toISOString())

    expect(result.length).toBe(60)
    expect(result[0]).toBe('2025-01-01')
    expect(result[59]).toBe('2025-03-01')
  })

  it('respects custom cap', () => {
    const result = computeOccursOn(
      '2025-01-01T00:00:00Z',
      '2025-01-31T00:00:00Z',
      10
    )
    expect(result.length).toBe(10)
  })

  it('handles all-day events correctly', () => {
    // All-day events typically use date-only format or midnight
    const result = computeOccursOn(
      '2025-07-04T00:00:00Z',
      '2025-07-04T23:59:59Z'
    )
    expect(result).toEqual(['2025-07-04'])
  })
})

describe('isDeleted', () => {
  const baseEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'test-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'local',
      accountId: 'local',
      providerCalendarId: 'local',
      providerEventId: 'local-1'
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
    title: 'Test Event',
    occursOn: ['2025-01-01']
  }

  it('returns false for event without deletedAtMs', () => {
    expect(isDeleted(baseEvent)).toBe(false)
  })

  it('returns false for event with deletedAtMs = 0', () => {
    expect(isDeleted({ ...baseEvent, deletedAtMs: 0 })).toBe(false)
  })

  it('returns false for event with deletedAtMs = undefined', () => {
    expect(isDeleted({ ...baseEvent, deletedAtMs: undefined })).toBe(false)
  })

  it('returns true for event with positive deletedAtMs', () => {
    expect(isDeleted({ ...baseEvent, deletedAtMs: Date.now() })).toBe(true)
  })

  it('returns true for event with deletedAtMs = 1', () => {
    expect(isDeleted({ ...baseEvent, deletedAtMs: 1 })).toBe(true)
  })
})

// ==================== Attendee Helper Tests ====================

describe('determineEventRole', () => {
  const baseEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'test-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId: 'account-1',
      providerCalendarId: 'primary',
      providerEventId: 'google-1'
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1704067200000,
    syncState: 'synced',
    source: { type: 'provider' },
    startMs: 1704110400000,
    endMs: 1704114000000,
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Test Event',
    occursOn: ['2025-01-01']
  }

  it('returns organizer when organizer.self is true', () => {
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      organizer: { email: 'me@example.com', self: true }
    }
    expect(determineEventRole(event)).toBe('organizer')
  })

  it('returns attendee when any attendee has self === true', () => {
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      organizer: { email: 'other@example.com', self: false },
      attendees: [
        { email: 'me@example.com', self: true, responseStatus: 'accepted' },
        { email: 'coworker@example.com', self: false, responseStatus: 'needsAction' }
      ]
    }
    expect(determineEventRole(event)).toBe('attendee')
  })

  it('returns organizer when creator.self is true and no explicit organizer', () => {
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      creator: { email: 'me@example.com', self: true }
    }
    expect(determineEventRole(event)).toBe('organizer')
  })

  it('returns unknown when no self markers are present', () => {
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      organizer: { email: 'other@example.com', self: false },
      attendees: [
        { email: 'other@example.com', self: false, responseStatus: 'accepted' }
      ]
    }
    expect(determineEventRole(event)).toBe('unknown')
  })

  it('returns unknown for events with no organizer/creator/attendees', () => {
    expect(determineEventRole(baseEvent)).toBe('unknown')
  })
})

describe('findSelfAttendee', () => {
  const baseEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'test-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId: 'account-1',
      providerCalendarId: 'primary',
      providerEventId: 'google-1'
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1704067200000,
    syncState: 'synced',
    source: { type: 'provider' },
    startMs: 1704110400000,
    endMs: 1704114000000,
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Test Event',
    occursOn: ['2025-01-01']
  }

  it('returns undefined when no attendees', () => {
    expect(findSelfAttendee(baseEvent)).toBeUndefined()
  })

  it('returns undefined when no self attendee', () => {
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      attendees: [
        { email: 'other@example.com', self: false, responseStatus: 'accepted' }
      ]
    }
    expect(findSelfAttendee(event)).toBeUndefined()
  })

  it('returns self attendee when present', () => {
    const selfAttendee: CanonicalAttendee = {
      email: 'me@example.com',
      self: true,
      responseStatus: 'tentative'
    }
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      attendees: [
        { email: 'other@example.com', self: false, responseStatus: 'accepted' },
        selfAttendee
      ]
    }
    expect(findSelfAttendee(event)).toEqual(selfAttendee)
  })
})

describe('isEventBusy', () => {
  const baseEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'test-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId: 'account-1',
      providerCalendarId: 'primary',
      providerEventId: 'google-1'
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1704067200000,
    syncState: 'synced',
    source: { type: 'provider' },
    startMs: 1704110400000,
    endMs: 1704114000000,
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Test Event',
    occursOn: ['2025-01-01']
  }

  it('returns true for regular event', () => {
    expect(isEventBusy(baseEvent)).toBe(true)
  })

  it('returns false for transparent event', () => {
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      transparency: 'transparent'
    }
    expect(isEventBusy(event)).toBe(false)
  })

  it('returns true for opaque event', () => {
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      transparency: 'opaque'
    }
    expect(isEventBusy(event)).toBe(true)
  })

  it('returns false when self attendee has declined', () => {
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      attendees: [
        { email: 'me@example.com', self: true, responseStatus: 'declined' }
      ]
    }
    expect(isEventBusy(event)).toBe(false)
  })

  it('returns true when self attendee has accepted', () => {
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      attendees: [
        { email: 'me@example.com', self: true, responseStatus: 'accepted' }
      ]
    }
    expect(isEventBusy(event)).toBe(true)
  })

  it('returns true when self attendee has tentative', () => {
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      attendees: [
        { email: 'me@example.com', self: true, responseStatus: 'tentative' }
      ]
    }
    expect(isEventBusy(event)).toBe(true)
  })

  it('returns true when self attendee has needsAction', () => {
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      attendees: [
        { email: 'me@example.com', self: true, responseStatus: 'needsAction' }
      ]
    }
    expect(isEventBusy(event)).toBe(true)
  })

  it('returns false when declined even if opaque', () => {
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      transparency: 'opaque',
      attendees: [
        { email: 'me@example.com', self: true, responseStatus: 'declined' }
      ]
    }
    expect(isEventBusy(event)).toBe(false)
  })

  it('uses selfAttendee property if available', () => {
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      selfAttendee: { email: 'me@example.com', self: true, responseStatus: 'declined' }
    }
    expect(isEventBusy(event)).toBe(false)
  })
})

describe('deriveRSVP', () => {
  const baseEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'test-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId: 'account-1',
      providerCalendarId: 'primary',
      providerEventId: 'google-1'
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1704067200000,
    syncState: 'synced',
    source: { type: 'provider' },
    startMs: 1704110400000,
    endMs: 1704114000000,
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Test Event',
    occursOn: ['2025-01-01']
  }

  it('returns canRespond: false for organizer', () => {
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      organizer: { email: 'me@example.com', self: true }
    }
    expect(deriveRSVP(event).canRespond).toBe(false)
  })

  it('returns canRespond: true for attendee with self marker', () => {
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      organizer: { email: 'other@example.com', self: false },
      attendees: [
        { email: 'me@example.com', self: true, responseStatus: 'needsAction' }
      ]
    }
    expect(deriveRSVP(event).canRespond).toBe(true)
  })

  it('returns current status from self attendee', () => {
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      organizer: { email: 'other@example.com', self: false },
      attendees: [
        { email: 'me@example.com', self: true, responseStatus: 'tentative' }
      ]
    }
    expect(deriveRSVP(event).status).toBe('tentative')
  })

  it('returns canRespond: false when unknown role', () => {
    expect(deriveRSVP(baseEvent).canRespond).toBe(false)
  })
})

describe('convenience aliases', () => {
  const baseEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'test-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId: 'account-1',
      providerCalendarId: 'primary',
      providerEventId: 'google-1'
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1704067200000,
    syncState: 'synced',
    source: { type: 'provider' },
    startMs: 1704110400000,
    endMs: 1704114000000,
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Test Event',
    occursOn: ['2025-01-01']
  }

  describe('getEventRole', () => {
    it('uses stored role if available', () => {
      const event: CanonicalCalendarEvent = {
        ...baseEvent,
        role: 'organizer'
      }
      expect(getEventRole(event)).toBe('organizer')
    })

    it('derives role if not stored', () => {
      const event: CanonicalCalendarEvent = {
        ...baseEvent,
        organizer: { email: 'me@example.com', self: true }
      }
      expect(getEventRole(event)).toBe('organizer')
    })
  })

  describe('canRespond', () => {
    it('returns true for attendee', () => {
      const event: CanonicalCalendarEvent = {
        ...baseEvent,
        organizer: { email: 'other@example.com', self: false },
        attendees: [
          { email: 'me@example.com', self: true, responseStatus: 'needsAction' }
        ]
      }
      expect(canRespond(event)).toBe(true)
    })

    it('returns false for organizer', () => {
      const event: CanonicalCalendarEvent = {
        ...baseEvent,
        organizer: { email: 'me@example.com', self: true }
      }
      expect(canRespond(event)).toBe(false)
    })
  })

  describe('canUpdate', () => {
    it('returns true for organizer', () => {
      const event: CanonicalCalendarEvent = {
        ...baseEvent,
        organizer: { email: 'me@example.com', self: true }
      }
      expect(canUpdate(event)).toBe(true)
    })

    it('returns false for attendee', () => {
      const event: CanonicalCalendarEvent = {
        ...baseEvent,
        organizer: { email: 'other@example.com', self: false },
        attendees: [
          { email: 'me@example.com', self: true, responseStatus: 'accepted' }
        ]
      }
      expect(canUpdate(event)).toBe(false)
    })
  })

  describe('canCancel', () => {
    it('returns true for organizer', () => {
      const event: CanonicalCalendarEvent = {
        ...baseEvent,
        organizer: { email: 'me@example.com', self: true }
      }
      expect(canCancel(event)).toBe(true)
    })

    it('returns false for attendee', () => {
      const event: CanonicalCalendarEvent = {
        ...baseEvent,
        organizer: { email: 'other@example.com', self: false },
        attendees: [
          { email: 'me@example.com', self: true, responseStatus: 'accepted' }
        ]
      }
      expect(canCancel(event)).toBe(false)
    })
  })
})

// ==================== Alert Helper Tests ====================

describe('getPrimaryAlert', () => {
  const baseEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'test-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId: 'account-1',
      providerCalendarId: 'primary',
      providerEventId: 'google-1'
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1704067200000,
    syncState: 'synced',
    source: { type: 'provider' },
    startMs: 1704110400000, // Jan 1, 2025 12:00 UTC
    endMs: 1704114000000,   // Jan 1, 2025 13:00 UTC
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Test Event',
    occursOn: ['2025-01-01']
  }

  it('returns null when no alerts', () => {
    expect(getPrimaryAlert(baseEvent)).toBeNull()
  })

  it('returns null when alerts is empty array', () => {
    const event = { ...baseEvent, alerts: [] }
    expect(getPrimaryAlert(event)).toBeNull()
  })

  it('returns first enabled alert', () => {
    const alert1: CanonicalAlert = { method: 'in_app_banner', minutesBefore: 10, enabled: false }
    const alert2: CanonicalAlert = { method: 'in_app_banner', minutesBefore: 5, enabled: true }
    const event = { ...baseEvent, alerts: [alert1, alert2] }
    expect(getPrimaryAlert(event)).toEqual(alert2)
  })

  it('returns first alert if none enabled', () => {
    const alert1: CanonicalAlert = { method: 'in_app_banner', minutesBefore: 10, enabled: false }
    const event = { ...baseEvent, alerts: [alert1] }
    expect(getPrimaryAlert(event)).toEqual(alert1)
  })
})

describe('computeAlertFireTimeMs', () => {
  const baseEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'test-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId: 'account-1',
      providerCalendarId: 'primary',
      providerEventId: 'google-1'
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1704067200000,
    syncState: 'synced',
    source: { type: 'provider' },
    startMs: 1704110400000, // Jan 1, 2025 12:00 UTC
    endMs: 1704114000000,   // Jan 1, 2025 13:00 UTC
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Test Event',
    occursOn: ['2025-01-01']
  }

  const enabledAlert: CanonicalAlert = { method: 'in_app_banner', minutesBefore: 10, enabled: true }

  it('returns correct fire time for timed event', () => {
    const result = computeAlertFireTimeMs(baseEvent, enabledAlert)
    // startMs - 10 minutes = 1704110400000 - 600000 = 1704109800000
    expect(result).toBe(1704109800000)
  })

  it('returns startMs for "at time of event" alert (0 minutes)', () => {
    const alert: CanonicalAlert = { method: 'in_app_banner', minutesBefore: 0, enabled: true }
    const result = computeAlertFireTimeMs(baseEvent, alert)
    expect(result).toBe(baseEvent.startMs)
  })

  it('returns null for disabled alert', () => {
    const disabledAlert: CanonicalAlert = { method: 'in_app_banner', minutesBefore: 10, enabled: false }
    expect(computeAlertFireTimeMs(baseEvent, disabledAlert)).toBeNull()
  })

  it('returns null for all-day event', () => {
    const allDayEvent = { ...baseEvent, allDay: true }
    expect(computeAlertFireTimeMs(allDayEvent, enabledAlert)).toBeNull()
  })

  it('returns null for event without startMs', () => {
    const noStartEvent = { ...baseEvent, startMs: 0 }
    expect(computeAlertFireTimeMs(noStartEvent, enabledAlert)).toBeNull()
  })
})

describe('isAlertDismissed', () => {
  const baseEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'test-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId: 'account-1',
      providerCalendarId: 'primary',
      providerEventId: 'google-1'
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1704067200000,
    syncState: 'synced',
    source: { type: 'provider' },
    startMs: 1704110400000,
    endMs: 1704114000000,
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Test Event',
    occursOn: ['2025-01-01']
  }

  it('returns false when no dismissal state', () => {
    expect(isAlertDismissed(baseEvent, Date.now())).toBe(false)
  })

  it('returns true when now < dismissedUntilMs', () => {
    const event = {
      ...baseEvent,
      alertDismissal: {
        dismissedUntilMs: baseEvent.startMs,
        dismissedAtMs: baseEvent.startMs - 600000
      }
    }
    // Check at 10 minutes before start
    const nowMs = baseEvent.startMs - 600000
    expect(isAlertDismissed(event, nowMs)).toBe(true)
  })

  it('returns false when now >= dismissedUntilMs', () => {
    const event = {
      ...baseEvent,
      alertDismissal: {
        dismissedUntilMs: baseEvent.startMs,
        dismissedAtMs: baseEvent.startMs - 600000
      }
    }
    // Check at start time
    expect(isAlertDismissed(event, baseEvent.startMs)).toBe(false)
  })
})

describe('shouldAlertFire', () => {
  const baseEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'test-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId: 'account-1',
      providerCalendarId: 'primary',
      providerEventId: 'google-1'
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1704067200000,
    syncState: 'synced',
    source: { type: 'provider' },
    startMs: 1704110400000, // Jan 1, 2025 12:00 UTC
    endMs: 1704114000000,
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Test Event',
    occursOn: ['2025-01-01']
  }

  const alert: CanonicalAlert = { method: 'in_app_banner', minutesBefore: 10, enabled: true }
  // Fire time: startMs - 10 min = 1704109800000

  it('returns true when in fire window', () => {
    // 5 minutes before start (after fire time, before start)
    const nowMs = baseEvent.startMs - 5 * 60 * 1000
    expect(shouldAlertFire(baseEvent, alert, nowMs)).toBe(true)
  })

  it('returns false when before fire time', () => {
    // 15 minutes before start (before fire time)
    const nowMs = baseEvent.startMs - 15 * 60 * 1000
    expect(shouldAlertFire(baseEvent, alert, nowMs)).toBe(false)
  })

  it('returns false when after event start', () => {
    // 5 minutes after start
    const nowMs = baseEvent.startMs + 5 * 60 * 1000
    expect(shouldAlertFire(baseEvent, alert, nowMs)).toBe(false)
  })

  it('returns false for deleted event', () => {
    const deletedEvent = { ...baseEvent, deletedAtMs: Date.now() }
    const nowMs = baseEvent.startMs - 5 * 60 * 1000
    expect(shouldAlertFire(deletedEvent, alert, nowMs)).toBe(false)
  })

  it('returns false for cancelled event', () => {
    const cancelledEvent = { ...baseEvent, status: 'cancelled' }
    const nowMs = baseEvent.startMs - 5 * 60 * 1000
    expect(shouldAlertFire(cancelledEvent, alert, nowMs)).toBe(false)
  })

  it('returns false when dismissed', () => {
    const dismissedEvent = {
      ...baseEvent,
      alertDismissal: {
        dismissedUntilMs: baseEvent.startMs,
        dismissedAtMs: baseEvent.startMs - 600000
      }
    }
    const nowMs = baseEvent.startMs - 5 * 60 * 1000
    expect(shouldAlertFire(dismissedEvent, alert, nowMs)).toBe(false)
  })

  it('returns false for all-day event', () => {
    const allDayEvent = { ...baseEvent, allDay: true }
    const nowMs = baseEvent.startMs - 5 * 60 * 1000
    expect(shouldAlertFire(allDayEvent, alert, nowMs)).toBe(false)
  })
})

describe('describeAlert', () => {
  it('returns "No alert" for null', () => {
    expect(describeAlert(null)).toBe('No alert')
  })

  it('returns "No alert" for disabled alert', () => {
    const alert: CanonicalAlert = { method: 'in_app_banner', minutesBefore: 10, enabled: false }
    expect(describeAlert(alert)).toBe('No alert')
  })

  it('returns "At time of event" for 0 minutes', () => {
    const alert: CanonicalAlert = { method: 'in_app_banner', minutesBefore: 0, enabled: true }
    expect(describeAlert(alert)).toBe('At time of event')
  })

  it('returns minutes description for < 60 minutes', () => {
    const alert5: CanonicalAlert = { method: 'in_app_banner', minutesBefore: 5, enabled: true }
    expect(describeAlert(alert5)).toBe('5 minutes before')

    const alert1: CanonicalAlert = { method: 'in_app_banner', minutesBefore: 1, enabled: true }
    expect(describeAlert(alert1)).toBe('1 minute before')
  })

  it('returns hours description for >= 60 minutes', () => {
    const alert60: CanonicalAlert = { method: 'in_app_banner', minutesBefore: 60, enabled: true }
    expect(describeAlert(alert60)).toBe('1 hour before')

    const alert120: CanonicalAlert = { method: 'in_app_banner', minutesBefore: 120, enabled: true }
    expect(describeAlert(alert120)).toBe('2 hours before')
  })

  it('returns minutes for non-whole hours', () => {
    const alert90: CanonicalAlert = { method: 'in_app_banner', minutesBefore: 90, enabled: true }
    expect(describeAlert(alert90)).toBe('90 minutes before')
  })
})

// ==================== Permission Helper Tests (Phase 2.6) ====================

describe('deriveCalendarCanWrite', () => {
  it('returns true for owner role', () => {
    expect(deriveCalendarCanWrite('owner')).toBe(true)
  })

  it('returns true for writer role', () => {
    expect(deriveCalendarCanWrite('writer')).toBe(true)
  })

  it('returns false for reader role', () => {
    expect(deriveCalendarCanWrite('reader')).toBe(false)
  })

  it('returns false for freeBusyReader role', () => {
    expect(deriveCalendarCanWrite('freeBusyReader')).toBe(false)
  })

  it('returns false for unknown role', () => {
    expect(deriveCalendarCanWrite('unknown')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(deriveCalendarCanWrite(undefined)).toBe(false)
  })
})

describe('normalizeAccessRole', () => {
  it('normalizes owner', () => {
    expect(normalizeAccessRole('owner')).toBe('owner')
    expect(normalizeAccessRole('OWNER')).toBe('owner')
  })

  it('normalizes writer', () => {
    expect(normalizeAccessRole('writer')).toBe('writer')
    expect(normalizeAccessRole('Writer')).toBe('writer')
  })

  it('normalizes reader', () => {
    expect(normalizeAccessRole('reader')).toBe('reader')
    expect(normalizeAccessRole('READER')).toBe('reader')
  })

  it('normalizes freeBusyReader', () => {
    expect(normalizeAccessRole('freeBusyReader')).toBe('freeBusyReader')
    expect(normalizeAccessRole('FREEBUSYREADER')).toBe('freeBusyReader')
  })

  it('returns unknown for invalid roles', () => {
    expect(normalizeAccessRole('invalid')).toBe('unknown')
    expect(normalizeAccessRole('')).toBe('unknown')
    expect(normalizeAccessRole(undefined)).toBe('unknown')
  })
})

describe('deriveEventCanWrite', () => {
  const baseEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'test-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId: 'account-1',
      providerCalendarId: 'calendar-1',
      providerEventId: 'google-1'
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1704067200000,
    syncState: 'synced',
    source: { type: 'provider' },
    startMs: 1704110400000,
    endMs: 1704114000000,
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Test Event',
    occursOn: ['2025-01-01'],
    calendarId: 'calendar-1'
  }

  const writableCalendar: CanonicalCalendar = {
    calendarId: 'calendar-1',
    name: 'My Calendar',
    accessRole: 'owner',
    canWrite: true,
    providerMeta: {
      provider: 'google',
      providerCalendarId: 'calendar-1',
      accountId: 'account-1'
    },
    visible: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  }

  const readOnlyCalendar: CanonicalCalendar = {
    calendarId: 'calendar-2',
    name: 'Shared Calendar',
    accessRole: 'reader',
    canWrite: false,
    providerMeta: {
      provider: 'google',
      providerCalendarId: 'calendar-2',
      accountId: 'account-1'
    },
    visible: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  }

  it('uses cached canWrite from event if set', () => {
    const eventWithCanWrite = { ...baseEvent, canWrite: true }
    expect(deriveEventCanWrite(eventWithCanWrite)).toBe(true)

    const eventWithCannotWrite = { ...baseEvent, canWrite: false }
    expect(deriveEventCanWrite(eventWithCannotWrite)).toBe(false)
  })

  it('returns false if calendar is read-only', () => {
    const calendarsMap: CalendarsById = new Map([['calendar-2', readOnlyCalendar]])
    const event = { ...baseEvent, calendarId: 'calendar-2' }
    expect(deriveEventCanWrite(event, calendarsMap)).toBe(false)
  })

  it('returns true for organizer on writable calendar', () => {
    const calendarsMap: CalendarsById = new Map([['calendar-1', writableCalendar]])
    const event = {
      ...baseEvent,
      organizer: { email: 'me@example.com', self: true }
    }
    expect(deriveEventCanWrite(event, calendarsMap)).toBe(true)
  })

  it('returns false for attendee (cannot edit event)', () => {
    const calendarsMap: CalendarsById = new Map([['calendar-1', writableCalendar]])
    const event = {
      ...baseEvent,
      organizer: { email: 'other@example.com', self: false },
      attendees: [
        { email: 'me@example.com', self: true, responseStatus: 'accepted' as const }
      ]
    }
    expect(deriveEventCanWrite(event, calendarsMap)).toBe(false)
  })
})

describe('canEditEvent', () => {
  const baseEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'test-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId: 'account-1',
      providerCalendarId: 'calendar-1',
      providerEventId: 'google-1'
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1704067200000,
    syncState: 'synced',
    source: { type: 'provider' },
    startMs: 1704110400000,
    endMs: 1704114000000,
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Test Event',
    occursOn: ['2025-01-01'],
    calendarId: 'calendar-1'
  }

  const writableCalendar: CanonicalCalendar = {
    calendarId: 'calendar-1',
    name: 'My Calendar',
    accessRole: 'owner',
    canWrite: true,
    providerMeta: {
      provider: 'google',
      providerCalendarId: 'calendar-1',
      accountId: 'account-1'
    },
    visible: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  }

  const readOnlyCalendar: CanonicalCalendar = {
    calendarId: 'calendar-2',
    name: 'Shared Calendar',
    accessRole: 'reader',
    canWrite: false,
    providerMeta: {
      provider: 'google',
      providerCalendarId: 'calendar-2',
      accountId: 'account-1'
    },
    visible: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  }

  it('returns true for organizer on writable calendar', () => {
    const calendarsMap: CalendarsById = new Map([['calendar-1', writableCalendar]])
    const event = {
      ...baseEvent,
      organizer: { email: 'me@example.com', self: true }
    }
    expect(canEditEvent(event, calendarsMap)).toBe(true)
  })

  it('returns false for organizer on read-only calendar', () => {
    const calendarsMap: CalendarsById = new Map([['calendar-2', readOnlyCalendar]])
    const event = {
      ...baseEvent,
      calendarId: 'calendar-2',
      organizer: { email: 'me@example.com', self: true }
    }
    expect(canEditEvent(event, calendarsMap)).toBe(false)
  })

  it('returns false for attendee', () => {
    const calendarsMap: CalendarsById = new Map([['calendar-1', writableCalendar]])
    const event = {
      ...baseEvent,
      organizer: { email: 'other@example.com', self: false },
      attendees: [
        { email: 'me@example.com', self: true, responseStatus: 'accepted' as const }
      ]
    }
    expect(canEditEvent(event, calendarsMap)).toBe(false)
  })

  it('returns true for event without attendees on writable calendar', () => {
    const calendarsMap: CalendarsById = new Map([['calendar-1', writableCalendar]])
    expect(canEditEvent(baseEvent, calendarsMap)).toBe(true)
  })
})

describe('canRSVPToEvent', () => {
  const baseEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'test-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId: 'account-1',
      providerCalendarId: 'calendar-1',
      providerEventId: 'google-1'
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1704067200000,
    syncState: 'synced',
    source: { type: 'provider' },
    startMs: 1704110400000,
    endMs: 1704114000000,
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Test Event',
    occursOn: ['2025-01-01']
  }

  it('returns true for attendee who can respond', () => {
    const event = {
      ...baseEvent,
      organizer: { email: 'other@example.com', self: false },
      attendees: [
        { email: 'me@example.com', self: true, responseStatus: 'needsAction' as const }
      ],
      rsvp: { canRespond: true, status: 'needsAction' as const }
    }
    expect(canRSVPToEvent(event)).toBe(true)
  })

  it('returns false for organizer', () => {
    const event = {
      ...baseEvent,
      organizer: { email: 'me@example.com', self: true }
    }
    expect(canRSVPToEvent(event)).toBe(false)
  })

  it('returns false for event with no attendees', () => {
    expect(canRSVPToEvent(baseEvent)).toBe(false)
  })
})

// ==================== Conflict Resolution Tests (Phase 2.7) ====================

describe('wouldConflict', () => {
  const baseEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'test-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId: 'account-1',
      providerCalendarId: 'calendar-1',
      providerEventId: 'google-1'
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1704067200000,
    syncState: 'synced',
    source: { type: 'provider' },
    startMs: 1704110400000,
    endMs: 1704114000000,
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Test Event',
    occursOn: ['2025-01-01'],
    rev: 5
  }

  it('returns false when baseRev matches server rev', () => {
    expect(wouldConflict(baseEvent, 5)).toBe(false)
  })

  it('returns true when baseRev differs from server rev', () => {
    expect(wouldConflict(baseEvent, 4)).toBe(true)
    expect(wouldConflict(baseEvent, 6)).toBe(true)
  })

  it('handles undefined rev (defaults to 0)', () => {
    const eventNoRev = { ...baseEvent, rev: undefined }
    expect(wouldConflict(eventNoRev, 0)).toBe(false)
    expect(wouldConflict(eventNoRev, 1)).toBe(true)
  })
})

describe('resolveConflict', () => {
  const baseServerEvent: CanonicalCalendarEvent = {
    canonicalEventId: 'test-1',
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId: 'account-1',
      providerCalendarId: 'calendar-1',
      providerEventId: 'google-1'
    },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdAtMs: 1704067200000,
    updatedAtMs: 1704067200000,
    canonicalUpdatedAtMs: 1000,
    syncState: 'synced',
    source: { type: 'provider' },
    startMs: 1704110400000,
    endMs: 1704114000000,
    startIso: '2025-01-01T12:00:00Z',
    endIso: '2025-01-01T13:00:00Z',
    title: 'Server Title',
    occursOn: ['2025-01-01'],
    rev: 5,
    updatedByDeviceId: 'device-server'
  }

  it('applies update without conflict when baseRev matches', () => {
    const incoming: IncomingUpdate = {
      baseRev: 5,
      event: {
        canonicalEventId: 'test-1',
        title: 'New Title'
      },
      updatedAtMs: 2000,
      deviceId: 'device-client'
    }

    const result = resolveConflict(baseServerEvent, incoming)

    expect(result.hasConflict).toBe(false)
    expect(result.reason).toBe('no_conflict')
    expect(result.winner.title).toBe('New Title')
    expect(result.newRev).toBe(6)
    expect(result.winner.updatedByDeviceId).toBe('device-client')
  })

  it('incoming wins by timestamp when conflict detected', () => {
    const incoming: IncomingUpdate = {
      baseRev: 4, // Old base, will conflict
      event: {
        canonicalEventId: 'test-1',
        title: 'Incoming Title'
      },
      updatedAtMs: 2000, // Newer than server's 1000
      deviceId: 'device-client'
    }

    const result = resolveConflict(baseServerEvent, incoming)

    expect(result.hasConflict).toBe(true)
    expect(result.reason).toBe('incoming_wins_timestamp')
    expect(result.winner.title).toBe('Incoming Title')
    expect(result.newRev).toBe(6)
  })

  it('server wins by timestamp when conflict detected', () => {
    const incoming: IncomingUpdate = {
      baseRev: 4, // Old base, will conflict
      event: {
        canonicalEventId: 'test-1',
        title: 'Old Incoming Title'
      },
      updatedAtMs: 500, // Older than server's 1000
      deviceId: 'device-client'
    }

    const result = resolveConflict(baseServerEvent, incoming)

    expect(result.hasConflict).toBe(true)
    expect(result.reason).toBe('server_wins_timestamp')
    expect(result.winner.title).toBe('Server Title')
    expect(result.newRev).toBe(5) // No rev increment when server wins
  })

  it('tie-breaks by deviceId when timestamps equal (incoming wins)', () => {
    const incoming: IncomingUpdate = {
      baseRev: 4, // Old base, will conflict
      event: {
        canonicalEventId: 'test-1',
        title: 'Incoming Title'
      },
      updatedAtMs: 1000, // Same as server
      deviceId: 'aaa-device' // Lexicographically lower than 'device-server'
    }

    const result = resolveConflict(baseServerEvent, incoming)

    expect(result.hasConflict).toBe(true)
    expect(result.reason).toBe('incoming_wins_deviceid')
    expect(result.winner.title).toBe('Incoming Title')
    expect(result.newRev).toBe(6)
  })

  it('tie-breaks by deviceId when timestamps equal (server wins)', () => {
    const incoming: IncomingUpdate = {
      baseRev: 4, // Old base, will conflict
      event: {
        canonicalEventId: 'test-1',
        title: 'Incoming Title'
      },
      updatedAtMs: 1000, // Same as server
      deviceId: 'zzz-device' // Lexicographically higher than 'device-server'
    }

    const result = resolveConflict(baseServerEvent, incoming)

    expect(result.hasConflict).toBe(true)
    expect(result.reason).toBe('server_wins_deviceid')
    expect(result.winner.title).toBe('Server Title')
    expect(result.newRev).toBe(5)
  })

  it('preserves immutable fields', () => {
    const incoming: IncomingUpdate = {
      baseRev: 5,
      event: {
        canonicalEventId: 'different-id', // Should be ignored
        title: 'New Title'
      },
      updatedAtMs: 2000,
      deviceId: 'device-client'
    }

    const result = resolveConflict(baseServerEvent, incoming)

    expect(result.winner.canonicalEventId).toBe('test-1') // Original preserved
    expect(result.winner.providerRef).toEqual(baseServerEvent.providerRef) // Original preserved
    expect(result.winner.createdAtMs).toBe(baseServerEvent.createdAtMs) // Original preserved
  })

  it('handles cross-device concurrent edits deterministically', () => {
    // Device A and Device B both edit from rev 5
    const incomingA: IncomingUpdate = {
      baseRev: 5,
      event: { canonicalEventId: 'test-1', title: 'Title from A' },
      updatedAtMs: 1500,
      deviceId: 'device-A'
    }

    const incomingB: IncomingUpdate = {
      baseRev: 5,
      event: { canonicalEventId: 'test-1', location: 'Location from B' },
      updatedAtMs: 1500,
      deviceId: 'device-B'
    }

    // Apply A first
    const resultA = resolveConflict(baseServerEvent, incomingA)
    expect(resultA.hasConflict).toBe(false)
    expect(resultA.winner.title).toBe('Title from A')

    // Apply B after A (B sees A's changes as server state)
    const serverAfterA = resultA.winner
    const resultB = resolveConflict(serverAfterA, { ...incomingB, baseRev: 5 }) // B still has old baseRev

    expect(resultB.hasConflict).toBe(true)
    // B has same timestamp but device-A < device-B, so A wins
    expect(resultB.reason).toBe('server_wins_deviceid')
    expect(resultB.winner.title).toBe('Title from A')

    // Final state is deterministic
    expect(resultB.winner.updatedByDeviceId).toBe('device-A')
  })
})

