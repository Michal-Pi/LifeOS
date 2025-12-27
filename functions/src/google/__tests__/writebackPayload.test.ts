import type { CanonicalCalendarEvent } from '@lifeos/calendar'
import { describe, it, expect } from 'vitest'
import { buildWritebackPayload } from '../writebackPayload.js'

const baseEvent: CanonicalCalendarEvent = {
  canonicalEventId: 'local:1',
  schemaVersion: 1,
  normalizationVersion: 1,
  providerRef: {
    provider: 'google',
    accountId: 'primary',
    providerCalendarId: 'primary',
    providerEventId: 'evt-1',
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdAtMs: Date.now(),
  updatedAtMs: Date.now(),
  canonicalUpdatedAtMs: Date.now(),
  syncState: 'synced',
  source: { type: 'local' },
  startMs: Date.parse('2025-01-01T10:00:00Z'),
  endMs: Date.parse('2025-01-01T11:00:00Z'),
  startIso: '2025-01-01T10:00:00Z',
  endIso: '2025-01-01T11:00:00Z',
  allDay: false,
  title: 'Test Event',
  occursOn: ['2025-01-01'],
  visibility: 'default',
}

describe('buildWritebackPayload', () => {
  it('forces private visibility for create when configured', () => {
    const payload = buildWritebackPayload({
      op: 'create',
      event: baseEvent,
      writebackVisibility: 'private',
    })
    expect(payload.visibility).toBe('private')
  })

  it('requires RSVP details for rsvp op', () => {
    expect(() => buildWritebackPayload({ op: 'rsvp', event: baseEvent })).toThrow(
      'Missing RSVP details'
    )
  })

  it('requires attendees for update_attendees op', () => {
    expect(() => buildWritebackPayload({ op: 'update_attendees', event: baseEvent })).toThrow(
      'Missing attendees for update'
    )
  })

  it('uses instance override for instance edit updates', () => {
    const event: CanonicalCalendarEvent = {
      ...baseEvent,
      recurrenceV2: {
        rule: { freq: 'DAILY' },
        overrides: {
          [String(baseEvent.startMs)]: {
            startMs: baseEvent.startMs + 3600000,
            endMs: baseEvent.endMs + 3600000,
            title: 'Override',
            updatedAtMs: Date.now(),
          },
        },
      },
    }

    const payload = buildWritebackPayload({
      op: 'update',
      event,
      isInstanceEdit: true,
      occurrenceStartMs: baseEvent.startMs,
    })

    expect(payload.title).toBe('Override')
    expect(payload.startIso).toContain('11:00:00.000Z')
  })
})
