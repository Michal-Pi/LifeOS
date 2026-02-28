import { describe, expect, it } from 'vitest'
import { groupByThread, type MessageThread } from '../threadGrouping'
import type { PrioritizedMessage } from '@lifeos/agents'

function makeMessage(overrides: Partial<PrioritizedMessage> = {}): PrioritizedMessage {
  return {
    messageId: `msg-${Math.random().toString(36).slice(2)}` as PrioritizedMessage['messageId'],
    userId: 'user-1',
    source: 'gmail',
    accountId: 'acc-1',
    originalMessageId: 'orig-1',
    sender: 'Test User',
    snippet: 'test snippet',
    receivedAtMs: Date.now(),
    priority: 'medium',
    aiSummary: 'test summary',
    requiresFollowUp: false,
    isRead: false,
    isDismissed: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    ...overrides,
  } as PrioritizedMessage
}

describe('groupByThread', () => {
  it('groups messages by threadId', () => {
    const messages = [
      makeMessage({ threadId: 'thread-1', sender: 'Alice', receivedAtMs: 1000 }),
      makeMessage({ threadId: 'thread-1', sender: 'Alice', receivedAtMs: 2000 }),
      makeMessage({ threadId: 'thread-1', sender: 'Alice', receivedAtMs: 3000 }),
    ]

    const threads = groupByThread(messages)

    expect(threads).toHaveLength(1)
    expect(threads[0].messages).toHaveLength(3)
    expect(threads[0].threadKey).toBe('thread-1')
  })

  it('does not group single messages', () => {
    const messages = [
      makeMessage({ threadId: 'thread-1', sender: 'Alice' }),
      makeMessage({ threadId: 'thread-2', sender: 'Bob' }),
      makeMessage({ threadId: 'thread-3', sender: 'Charlie' }),
    ]

    const threads = groupByThread(messages)

    expect(threads).toHaveLength(3)
    threads.forEach((thread: MessageThread) => {
      expect(thread.messages).toHaveLength(1)
    })
  })

  it('preserves input order (first-seen position) for threads', () => {
    const messages = [
      makeMessage({ threadId: 'old-thread', sender: 'Alice', receivedAtMs: 1000 }),
      makeMessage({ threadId: 'new-thread', sender: 'Bob', receivedAtMs: 5000 }),
      makeMessage({ threadId: 'mid-thread', sender: 'Charlie', receivedAtMs: 3000 }),
    ]

    const threads = groupByThread(messages)

    // Order matches the first-seen position in the input array,
    // so the caller's sort (e.g. importance score) is respected.
    expect(threads[0].threadKey).toBe('old-thread')
    expect(threads[1].threadKey).toBe('new-thread')
    expect(threads[2].threadKey).toBe('mid-thread')
  })

  it('falls back to senderEmail when threadId is missing', () => {
    const messages = [
      makeMessage({ senderEmail: 'alice@test.com', sender: 'Alice', receivedAtMs: 1000 }),
      makeMessage({ senderEmail: 'alice@test.com', sender: 'Alice', receivedAtMs: 2000 }),
      makeMessage({ senderEmail: 'bob@test.com', sender: 'Bob', receivedAtMs: 3000 }),
    ]

    const threads = groupByThread(messages)

    expect(threads).toHaveLength(2)
    const aliceThread = threads.find((t: MessageThread) => t.sender === 'Alice')
    expect(aliceThread?.messages).toHaveLength(2)
  })

  it('calculates unread count correctly', () => {
    const messages = [
      makeMessage({ threadId: 'thread-1', isRead: false, receivedAtMs: 1000 }),
      makeMessage({ threadId: 'thread-1', isRead: true, receivedAtMs: 2000 }),
      makeMessage({ threadId: 'thread-1', isRead: false, receivedAtMs: 3000 }),
    ]

    const threads = groupByThread(messages)

    expect(threads[0].unreadCount).toBe(2)
  })

  it('sets latestMessage to the most recent message', () => {
    const messages = [
      makeMessage({ threadId: 'thread-1', sender: 'Alice', receivedAtMs: 1000 }),
      makeMessage({ threadId: 'thread-1', sender: 'Alice', receivedAtMs: 3000 }),
      makeMessage({ threadId: 'thread-1', sender: 'Alice', receivedAtMs: 2000 }),
    ]

    const threads = groupByThread(messages)

    expect(threads[0].latestMessage.receivedAtMs).toBe(3000)
    expect(threads[0].latestTimestamp).toBe(3000)
  })

  it('exposes subject from the earliest message in the thread', () => {
    const messages = [
      makeMessage({
        threadId: 'thread-1',
        sender: 'Alice',
        receivedAtMs: 3000,
        subject: 'Re: Hello',
      }),
      makeMessage({ threadId: 'thread-1', sender: 'Alice', receivedAtMs: 1000, subject: 'Hello' }),
      makeMessage({
        threadId: 'thread-1',
        sender: 'Alice',
        receivedAtMs: 2000,
        subject: 'Re: Hello',
      }),
    ]

    const threads = groupByThread(messages)

    // The earliest message (receivedAtMs: 1000) has the original subject
    expect(threads[0].subject).toBe('Hello')
  })

  it('computes topImportanceScore across thread messages', () => {
    const messages = [
      makeMessage({ threadId: 'thread-1', importanceScore: 30, receivedAtMs: 1000 }),
      makeMessage({ threadId: 'thread-1', importanceScore: 85, receivedAtMs: 2000 }),
      makeMessage({ threadId: 'thread-1', importanceScore: 50, receivedAtMs: 3000 }),
    ]

    const threads = groupByThread(messages)

    expect(threads[0].topImportanceScore).toBe(85)
  })

  it('handles messages without subject gracefully', () => {
    const messages = [
      makeMessage({ threadId: 'thread-1', receivedAtMs: 1000 }),
      makeMessage({ threadId: 'thread-1', receivedAtMs: 2000 }),
    ]

    const threads = groupByThread(messages)

    expect(threads[0].subject).toBeUndefined()
  })
})
