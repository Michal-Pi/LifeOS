import { describe, expect, it, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMailboxComposer } from '@/hooks/useMailboxComposer'
import type { PrioritizedMessage, Recipient } from '@lifeos/agents'

// --- Firestore mocks ---
const mockSetDoc = vi.fn()
const mockDeleteDoc = vi.fn()
const mockGetDocs = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'mock-col-ref'),
  doc: vi.fn((...args: unknown[]) => {
    // When called with collection ref only (auto-id), return an object with id
    if (args.length === 1) return { id: 'auto-draft-id' }
    // When called with db + path, return a ref string
    return `doc-ref-${args[args.length - 1]}`
  }),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  query: vi.fn((...args: unknown[]) => args),
  orderBy: vi.fn(),
  limit: vi.fn(),
}))

// --- Outbox mocks ---
const mockEnqueueSend = vi.fn()
const mockTriggerDrain = vi.fn()

vi.mock('@/outbox/mailboxOutbox', () => ({
  enqueueSend: (...args: unknown[]) => mockEnqueueSend(...args),
}))

vi.mock('@/outbox/mailboxOutboxWorker', () => ({
  triggerDrain: () => mockTriggerDrain(),
}))

vi.mock('@/lib/firestoreClient', () => ({
  getFirestoreClient: vi.fn().mockResolvedValue('mock-db'),
}))

const mockUser = {
  uid: 'user-1',
  email: 'me@example.com',
  getIdToken: vi.fn().mockResolvedValue('mock-token'),
}

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: mockUser })),
}))

const bobRecipient: Recipient = {
  id: 'bob@example.com',
  name: 'Bob',
  email: 'bob@example.com',
  channel: 'gmail',
}

describe('useMailboxComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetDoc.mockResolvedValue(undefined)
    mockDeleteDoc.mockResolvedValue(undefined)
    mockGetDocs.mockResolvedValue({ docs: [] })
    mockEnqueueSend.mockResolvedValue({ opId: 'test-op' })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('returns correct initial state with no options', () => {
    const { result } = renderHook(() => useMailboxComposer())

    expect(result.current.state).toEqual({
      draftId: null,
      source: 'gmail',
      toRecipients: [],
      ccRecipients: [],
      bccRecipients: [],
      subject: '',
      body: '',
      richContent: null,
      inReplyTo: null,
      threadId: null,
    })
    expect(result.current.isSaving).toBe(false)
    expect(result.current.isSending).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.lastSavedMs).toBeNull()
  })

  it('pre-fills state when replyTo is provided', () => {
    const replyTo: PrioritizedMessage = {
      messageId: 'msg-1',
      userId: 'user-1',
      source: 'slack',
      accountId: 'acc-1',
      originalMessageId: 'orig-1',
      sender: 'Alice',
      senderEmail: 'alice@example.com',
      subject: 'Hello',
      snippet: 'Test',
      aiSummary: 'Test summary',
      priority: 'high',
      requiresFollowUp: false,
      isRead: true,
      isDismissed: false,
      receivedAtMs: Date.now(),
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    } as PrioritizedMessage

    const { result } = renderHook(() => useMailboxComposer({ replyTo }))

    expect(result.current.state.source).toBe('slack')
    expect(result.current.state.toRecipients).toHaveLength(1)
    expect(result.current.state.toRecipients[0].id).toBe('alice@example.com')
    expect(result.current.state.toRecipients[0].name).toBe('Alice')
    expect(result.current.state.subject).toBe('Re: Hello')
    expect(result.current.state.inReplyTo).toBe('orig-1')
  })

  it('pre-fills Reply All with To and CC recipients', () => {
    const replyTo = {
      messageId: 'msg-1',
      userId: 'user-1',
      source: 'gmail',
      accountId: 'acc-1',
      originalMessageId: 'orig-1',
      sender: 'Alice',
      senderEmail: 'alice@example.com',
      subject: 'Hello',
      snippet: 'Test',
      aiSummary: 'Test summary',
      priority: 'high',
      requiresFollowUp: false,
      isRead: true,
      isDismissed: false,
      receivedAtMs: Date.now(),
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      toRecipients: ['me@example.com', 'carol@example.com'],
      ccRecipients: ['dave@example.com'],
    } as PrioritizedMessage

    const { result } = renderHook(() => useMailboxComposer({ replyTo, replyAll: true }))

    // To should include sender + other To recipients (excluding self)
    expect(result.current.state.toRecipients).toHaveLength(2)
    expect(result.current.state.toRecipients[0].id).toBe('alice@example.com')
    expect(result.current.state.toRecipients[1].id).toBe('carol@example.com')

    // CC should include original CC recipients (excluding self)
    expect(result.current.state.ccRecipients).toHaveLength(1)
    expect(result.current.state.ccRecipients[0].id).toBe('dave@example.com')
  })

  it('state setters update individual fields', () => {
    const { result } = renderHook(() => useMailboxComposer())

    act(() => {
      result.current.setSource('linkedin')
    })
    expect(result.current.state.source).toBe('linkedin')

    act(() => {
      result.current.setToRecipients([bobRecipient])
    })
    expect(result.current.state.toRecipients).toHaveLength(1)
    expect(result.current.state.toRecipients[0].id).toBe('bob@example.com')

    act(() => {
      result.current.setSubject('New Subject')
    })
    expect(result.current.state.subject).toBe('New Subject')

    act(() => {
      result.current.setBody('Message body')
    })
    expect(result.current.state.body).toBe('Message body')
  })

  it('send validates that at least one recipient is required', async () => {
    const { result } = renderHook(() => useMailboxComposer())

    act(() => {
      result.current.setBody('Hello world')
    })

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.send()
    })

    expect(success).toBe(false)
    expect(result.current.error).toBe('At least one recipient is required')
  })

  it('send validates that message body is required', async () => {
    const { result } = renderHook(() => useMailboxComposer())

    act(() => {
      result.current.setToRecipients([bobRecipient])
    })

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.send()
    })

    expect(success).toBe(false)
    expect(result.current.error).toBe('Message body is required')
  })

  it('send enqueues to outbox on valid input', async () => {
    const { result } = renderHook(() => useMailboxComposer())

    act(() => {
      result.current.setToRecipients([bobRecipient])
      result.current.setBody('Hello!')
    })

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.send()
    })

    expect(success).toBe(true)
    expect(mockEnqueueSend).toHaveBeenCalledTimes(1)
    expect(mockEnqueueSend).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        source: 'gmail',
        recipientId: 'bob@example.com',
        body: 'Hello!',
      })
    )
    expect(mockTriggerDrain).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
    // State should be reset after successful send
    expect(result.current.state.body).toBe('')
    expect(result.current.state.toRecipients).toEqual([])
  })

  it('send sets error on outbox failure', async () => {
    mockEnqueueSend.mockRejectedValue(new Error('IndexedDB error'))

    const { result } = renderHook(() => useMailboxComposer())

    act(() => {
      result.current.setToRecipients([bobRecipient])
      result.current.setBody('Hello!')
    })

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.send()
    })

    expect(success).toBe(false)
    expect(result.current.error).toBe('IndexedDB error')
  })

  it('saveDraft writes to Firestore when content exists', async () => {
    const { result } = renderHook(() => useMailboxComposer())

    act(() => {
      result.current.setToRecipients([bobRecipient])
      result.current.setBody('Draft content')
    })

    await act(async () => {
      await result.current.saveDraft()
    })

    expect(mockSetDoc).toHaveBeenCalledTimes(1)
    expect(result.current.lastSavedMs).not.toBeNull()
  })

  it('saveDraft skips when body and recipients are empty', async () => {
    const { result } = renderHook(() => useMailboxComposer())

    await act(async () => {
      await result.current.saveDraft()
    })

    expect(mockSetDoc).not.toHaveBeenCalled()
    expect(result.current.lastSavedMs).toBeNull()
  })

  it('discardDraft resets state', async () => {
    const { result } = renderHook(() => useMailboxComposer())

    act(() => {
      result.current.setToRecipients([bobRecipient])
      result.current.setBody('Draft content')
      result.current.setSubject('Subject')
    })

    await act(async () => {
      await result.current.discardDraft()
    })

    expect(result.current.state.toRecipients).toEqual([])
    expect(result.current.state.body).toBe('')
    expect(result.current.state.subject).toBe('')
  })

  it('loadDrafts returns draft list from Firestore', async () => {
    const mockDraft = {
      draftId: 'draft-1',
      userId: 'user-1',
      source: 'gmail',
      body: 'Saved draft',
      createdAtMs: 1000,
      updatedAtMs: 2000,
    }
    mockGetDocs.mockResolvedValue({
      docs: [{ data: () => mockDraft }],
    })

    const { result } = renderHook(() => useMailboxComposer())

    let drafts: unknown[] = []
    await act(async () => {
      drafts = await result.current.loadDrafts()
    })

    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toEqual(mockDraft)
  })
})
