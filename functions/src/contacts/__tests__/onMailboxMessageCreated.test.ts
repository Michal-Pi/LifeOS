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
      get: vi.fn(() => {
        // contactEmailIndex lookup
        if (path.includes('contactEmailIndex/alice@example.com')) {
          return Promise.resolve({
            exists: true,
            data: () => ({ contactId: 'contact:abc', displayName: 'Alice' }),
          })
        }
        // Contact document
        if (path.includes('contacts/contact:abc')) {
          return Promise.resolve({
            exists: true,
            data: () => ({
              contactId: 'contact:abc',
              displayName: 'Alice Johnson',
              circle: 1,
              followUpIntervalDays: 14,
              lastInteractionMs: 1700000000000,
            }),
          })
        }
        // Default: not found
        return Promise.resolve({ exists: false, data: () => null })
      }),
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
  },
}))

// Mock slack paths — uses getFirestore() instead of firestore from lib/firebase
vi.mock('../../slack/paths.js', () => ({
  prioritizedMessageRef: vi.fn((uid: string, messageId: string) => ({
    path: `users/${uid}/mailboxMessages/${messageId}`,
  })),
}))

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { handleMailboxMessageCreated } from '../onMailboxMessageCreated.js'

function makeEvent(
  messageData: Record<string, unknown> | undefined,
  params: Record<string, string> = { uid: 'user1', messageId: 'msg1' }
) {
  return {
    data: messageData
      ? {
          data: () => messageData,
        }
      : undefined,
    params,
  } as unknown as Parameters<typeof handleMailboxMessageCreated>[0]
}

describe('handleMailboxMessageCreated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('links a Gmail message with known sender to a contact', async () => {
    await handleMailboxMessageCreated(
      makeEvent({
        senderEmail: 'Alice@Example.com',
        sender: 'Alice Johnson',
        subject: 'Project update',
        source: 'gmail',
        receivedAtMs: 1700100000000,
        originalMessageId: 'gmail:abc123',
      })
    )

    // Should create interaction, update contact, and write contactId on message
    expect(batchSet).toHaveBeenCalledTimes(1)
    expect(batchUpdate).toHaveBeenCalledTimes(2)
    expect(batchCommit).toHaveBeenCalledTimes(1)

    // Verify interaction was created with correct fields
    const interaction = batchSet.mock.calls[0][1]
    expect(interaction.contactId).toBe('contact:abc')
    expect(interaction.type).toBe('email')
    expect(interaction.summary).toBe('Project update')
    expect(interaction.source).toBe('gmail')
    expect(interaction.direction).toBe('inbound')
    expect(interaction.occurredAtMs).toBe(1700100000000)

    // Verify contactId was written back on the message
    const messageUpdate = batchUpdate.mock.calls[1][1]
    expect(messageUpdate.contactId).toBe('contact:abc')
  })

  it('skips messages with no senderEmail', async () => {
    await handleMailboxMessageCreated(
      makeEvent({
        sender: 'Slack Bot',
        source: 'slack',
        receivedAtMs: 1700100000000,
      })
    )

    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('skips messages with empty senderEmail', async () => {
    await handleMailboxMessageCreated(
      makeEvent({
        senderEmail: '   ',
        source: 'gmail',
        receivedAtMs: 1700100000000,
      })
    )

    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('skips messages with unknown sender email', async () => {
    await handleMailboxMessageCreated(
      makeEvent({
        senderEmail: 'unknown@stranger.com',
        source: 'gmail',
        receivedAtMs: 1700100000000,
      })
    )

    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('returns early when event has no data', async () => {
    await handleMailboxMessageCreated(makeEvent(undefined))

    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('uses "message" interactionType for non-Gmail sources', async () => {
    await handleMailboxMessageCreated(
      makeEvent({
        senderEmail: 'Alice@Example.com',
        sender: 'Alice',
        source: 'slack',
        receivedAtMs: 1700100000000,
      })
    )

    const interaction = batchSet.mock.calls[0][1]
    expect(interaction.type).toBe('message')
    expect(interaction.source).toBe('slack')
  })

  it('falls back to snippet and aiSummary for summary', async () => {
    await handleMailboxMessageCreated(
      makeEvent({
        senderEmail: 'Alice@Example.com',
        sender: 'Alice',
        source: 'gmail',
        snippet: 'Hey, quick question...',
        receivedAtMs: 1700100000000,
      })
    )

    const interaction = batchSet.mock.calls[0][1]
    expect(interaction.summary).toBe('Hey, quick question...')
  })
})
