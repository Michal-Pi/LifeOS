import { describe, it, expect, vi, beforeEach } from 'vitest'

// Track batch operations
const batchSet = vi.fn()
const batchUpdate = vi.fn()
const batchCommit = vi.fn(() => Promise.resolve())

// Mock firebase before imports
vi.mock('../../lib/firebase.js', () => ({
  firestore: {
    doc: vi.fn((path: string) => ({
      path,
      get: vi.fn(() => Promise.resolve({ exists: false, data: () => null })),
    })),
    collection: vi.fn((path: string) => ({
      path,
      doc: vi.fn((id: string) => ({ path: `${path}/${id}` })),
    })),
    batch: vi.fn(() => ({
      set: batchSet,
      update: batchUpdate,
      commit: batchCommit,
    })),
    getAll: vi.fn((...refs: Array<{ path: string }>) => {
      return Promise.resolve(
        refs.map((ref) => {
          // contactEmailIndex lookups
          if (ref.path.includes('contactEmailIndex/alice@example.com')) {
            return {
              exists: true,
              data: () => ({ contactId: 'contact:alice' }),
            }
          }
          if (ref.path.includes('contactEmailIndex/bob@example.com')) {
            return {
              exists: true,
              data: () => ({ contactId: 'contact:bob' }),
            }
          }
          // Contact document lookups
          if (ref.path.includes('contacts/contact:alice')) {
            return {
              exists: true,
              data: () => ({
                contactId: 'contact:alice',
                displayName: 'Alice Johnson',
                circle: 2,
                lastInteractionMs: 1700000000000,
              }),
            }
          }
          if (ref.path.includes('contacts/contact:bob')) {
            return {
              exists: true,
              data: () => ({
                contactId: 'contact:bob',
                displayName: 'Bob Smith',
                circle: 3,
                lastInteractionMs: 1699000000000,
              }),
            }
          }
          return { exists: false, data: () => null }
        })
      )
    }),
  },
}))

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { handleCalendarEventCreated } from '../onCalendarEventCreated.js'

function makeEvent(
  eventData: Record<string, unknown> | undefined,
  params: Record<string, string> = { uid: 'user1', eventId: 'evt1' }
) {
  return {
    data: eventData
      ? {
          data: () => eventData,
        }
      : undefined,
    params,
  } as unknown as Parameters<typeof handleCalendarEventCreated>[0]
}

describe('handleCalendarEventCreated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('links event with known attendee to contact', async () => {
    await handleCalendarEventCreated(
      makeEvent({
        canonicalEventId: 'evt1',
        title: 'Sprint Planning',
        startMs: 1700100000000,
        attendees: [
          { email: 'me@myself.com', self: true, responseStatus: 'accepted' },
          { email: 'Alice@Example.com', responseStatus: 'accepted' },
        ],
      })
    )

    // Should create interaction + update contact + write linkedContactIds
    expect(batchSet).toHaveBeenCalledTimes(1)
    expect(batchUpdate).toHaveBeenCalledTimes(2) // contact update + event writeback
    expect(batchCommit).toHaveBeenCalledTimes(1)

    // Verify interaction
    const interaction = batchSet.mock.calls[0][1]
    expect(interaction.contactId).toBe('contact:alice')
    expect(interaction.type).toBe('meeting')
    expect(interaction.summary).toBe('Sprint Planning')
    expect(interaction.meetingTitle).toBe('Sprint Planning')
    expect(interaction.source).toBe('calendar')
    expect(interaction.direction).toBe('bilateral')
    expect(interaction.occurredAtMs).toBe(1700100000000)

    // Verify linkedContactIds written back on event
    const eventUpdate = batchUpdate.mock.calls[1][1]
    expect(eventUpdate.linkedContactIds).toEqual(['contact:alice'])
  })

  it('links multiple known attendees', async () => {
    await handleCalendarEventCreated(
      makeEvent({
        canonicalEventId: 'evt2',
        title: 'Team Standup',
        startMs: 1700200000000,
        attendees: [
          { email: 'me@myself.com', self: true, responseStatus: 'accepted' },
          { email: 'alice@example.com', responseStatus: 'accepted' },
          { email: 'bob@example.com', responseStatus: 'tentative' },
        ],
      })
    )

    // 2 interactions + 2 contact updates + 1 event writeback
    expect(batchSet).toHaveBeenCalledTimes(2)
    expect(batchUpdate).toHaveBeenCalledTimes(3)
    expect(batchCommit).toHaveBeenCalledTimes(1)

    const eventUpdate = batchUpdate.mock.calls[2][1]
    expect(eventUpdate.linkedContactIds).toEqual(['contact:alice', 'contact:bob'])
  })

  it('skips events with no attendees', async () => {
    await handleCalendarEventCreated(
      makeEvent({
        canonicalEventId: 'evt3',
        title: 'Focus Time',
        startMs: 1700300000000,
      })
    )

    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('skips events with empty attendees array', async () => {
    await handleCalendarEventCreated(
      makeEvent({
        canonicalEventId: 'evt4',
        title: 'Focus Time',
        startMs: 1700300000000,
        attendees: [],
      })
    )

    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('skips events with only self attendee', async () => {
    await handleCalendarEventCreated(
      makeEvent({
        canonicalEventId: 'evt5',
        title: 'Blocked Time',
        startMs: 1700400000000,
        attendees: [{ email: 'me@myself.com', self: true, responseStatus: 'accepted' }],
      })
    )

    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('filters out resource attendees', async () => {
    await handleCalendarEventCreated(
      makeEvent({
        canonicalEventId: 'evt6',
        title: 'Meeting Room',
        startMs: 1700500000000,
        attendees: [
          { email: 'me@myself.com', self: true, responseStatus: 'accepted' },
          { email: 'room-b2@resource.calendar.google.com', resource: true, responseStatus: 'accepted' },
          { email: 'alice@example.com', responseStatus: 'accepted' },
        ],
      })
    )

    // Only Alice should be linked, not the room
    expect(batchSet).toHaveBeenCalledTimes(1)
    const interaction = batchSet.mock.calls[0][1]
    expect(interaction.contactId).toBe('contact:alice')
  })

  it('does nothing when no attendees match contacts', async () => {
    await handleCalendarEventCreated(
      makeEvent({
        canonicalEventId: 'evt7',
        title: 'External Meeting',
        startMs: 1700600000000,
        attendees: [
          { email: 'me@myself.com', self: true, responseStatus: 'accepted' },
          { email: 'unknown@stranger.com', responseStatus: 'accepted' },
        ],
      })
    )

    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('returns early when event has no data', async () => {
    await handleCalendarEventCreated(makeEvent(undefined))

    expect(batchCommit).not.toHaveBeenCalled()
  })
})
