import { describe, expect, it, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMailboxComposer } from '@/hooks/useMailboxComposer'
import type { PrioritizedMessage } from '@lifeos/agents'

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

vi.mock('@/lib/firestoreClient', () => ({
  getFirestoreClient: vi.fn().mockResolvedValue('mock-db'),
}))

const mockUser = {
  uid: 'user-1',
  getIdToken: vi.fn().mockResolvedValue('mock-token'),
}

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: mockUser })),
}))

describe('useMailboxComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetDoc.mockResolvedValue(undefined)
    mockDeleteDoc.mockResolvedValue(undefined)
    mockGetDocs.mockResolvedValue({ docs: [] })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('returns correct initial state with no options', () => {
    const { result } = renderHook(() => useMailboxComposer())

    expect(result.current.state).toEqual({
      draftId: null,
      source: 'gmail',
      recipientId: '',
      recipientName: '',
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
    expect(result.current.state.recipientId).toBe('alice@example.com')
    expect(result.current.state.recipientName).toBe('Alice')
    expect(result.current.state.subject).toBe('Re: Hello')
    expect(result.current.state.inReplyTo).toBe('orig-1')
  })

  it('state setters update individual fields', () => {
    const { result } = renderHook(() => useMailboxComposer())

    act(() => {
      result.current.setSource('linkedin')
    })
    expect(result.current.state.source).toBe('linkedin')

    act(() => {
      result.current.setRecipientId('bob@example.com')
    })
    expect(result.current.state.recipientId).toBe('bob@example.com')

    act(() => {
      result.current.setRecipientName('Bob')
    })
    expect(result.current.state.recipientName).toBe('Bob')

    act(() => {
      result.current.setSubject('New Subject')
    })
    expect(result.current.state.subject).toBe('New Subject')

    act(() => {
      result.current.setBody('Message body')
    })
    expect(result.current.state.body).toBe('Message body')
  })

  it('send validates that recipient is required', async () => {
    const { result } = renderHook(() => useMailboxComposer())

    act(() => {
      result.current.setBody('Hello world')
    })

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.send()
    })

    expect(success).toBe(false)
    expect(result.current.error).toBe('Recipient is required')
  })

  it('send validates that message body is required', async () => {
    const { result } = renderHook(() => useMailboxComposer())

    act(() => {
      result.current.setRecipientId('bob@example.com')
    })

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.send()
    })

    expect(success).toBe(false)
    expect(result.current.error).toBe('Message body is required')
  })

  it('send calls the Cloud Function on valid input', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useMailboxComposer())

    act(() => {
      result.current.setRecipientId('bob@example.com')
      result.current.setBody('Hello!')
    })

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.send()
    })

    expect(success).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
    // State should be reset after successful send
    expect(result.current.state.body).toBe('')
    expect(result.current.state.recipientId).toBe('')
  })

  it('send sets error on API failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Rate limited' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useMailboxComposer())

    act(() => {
      result.current.setRecipientId('bob@example.com')
      result.current.setBody('Hello!')
    })

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.send()
    })

    expect(success).toBe(false)
    expect(result.current.error).toBe('Rate limited')
  })

  it('saveDraft writes to Firestore when content exists', async () => {
    const { result } = renderHook(() => useMailboxComposer())

    act(() => {
      result.current.setRecipientId('bob@example.com')
      result.current.setBody('Draft content')
    })

    await act(async () => {
      await result.current.saveDraft()
    })

    expect(mockSetDoc).toHaveBeenCalledTimes(1)
    expect(result.current.lastSavedMs).not.toBeNull()
  })

  it('saveDraft skips when body and recipientId are empty', async () => {
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
      result.current.setRecipientId('bob@example.com')
      result.current.setBody('Draft content')
      result.current.setSubject('Subject')
    })

    await act(async () => {
      await result.current.discardDraft()
    })

    expect(result.current.state.recipientId).toBe('')
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
