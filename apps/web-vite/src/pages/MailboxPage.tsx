/**
 * MailboxPage
 *
 * Full-page unified mailbox with a list/detail split layout.
 * Left panel: MailboxMessageList (scrollable, filterable, AI top-10)
 * Right panel: MailboxMessageDetail (full message, actions, thread context)
 *
 * Keyboard shortcuts:
 * - Cmd+N or 'c': Open composer
 * - Escape: Close detail panel or composer
 * - Arrow Up/Down, Enter, 'e', 'r': Delegated to MailboxMessageList
 */

import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useMessageMailbox } from '@/hooks/useMessageMailbox'
import { useAuth } from '@/hooks/useAuth'
import { MailboxMessageList } from '@/components/mailbox/MailboxMessageList'
import { MailboxMessageDetail } from '@/components/mailbox/MailboxMessageDetail'
import { MailboxComposer } from '@/components/mailbox/MailboxComposer'
import { MailboxDashboard } from '@/components/mailbox/MailboxDashboard'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { generateId } from '@/lib/idGenerator'
import { saveTaskLocally } from '@/todos/offlineStore'
import { enqueueTaskOp } from '@/todos/todoOutbox'
import { createFirestoreTodoRepository } from '@/adapters/firestoreTodoRepository'
import { doc, updateDoc } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import type { PrioritizedMessage, MessageSource } from '@lifeos/agents'
import '@/styles/pages/MailboxPage.css'

export function MailboxPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [selectedMessage, setSelectedMessage] = useState<PrioritizedMessage | null>(null)
  const [channelFilter, setChannelFilter] = useState<MessageSource | 'all'>('all')
  const [followUpOnly, setFollowUpOnly] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<PrioritizedMessage | null>(null)
  const [composerInitialBody, setComposerInitialBody] = useState<string | undefined>()
  const [focusedIndex, setFocusedIndex] = useState(0)

  const {
    messages,
    loading,
    error,
    syncStatus,
    syncMailbox,
    markAsRead,
    dismissMessage,
    overrideTriageCategory,
  } = useMessageMailbox({ maxMessages: 100, autoSync: true })

  const handleSelectMessage = useCallback(
    async (message: PrioritizedMessage) => {
      setSelectedMessage(message)
      if (!message.isRead) {
        await markAsRead(message.messageId)
      }
    },
    [markAsRead]
  )

  const handleDismiss = useCallback(
    async (messageId: string) => {
      await dismissMessage(messageId)
      if (selectedMessage?.messageId === messageId) {
        setSelectedMessage(null)
      }
    },
    [dismissMessage, selectedMessage]
  )

  const handleReply = useCallback((message: PrioritizedMessage) => {
    setReplyTo(message)
    setComposerInitialBody(undefined)
    setComposerOpen(true)
  }, [])

  const handleCompose = useCallback(() => {
    setReplyTo(null)
    setComposerInitialBody(undefined)
    setComposerOpen(true)
  }, [])

  const handleCloseComposer = useCallback(() => {
    setComposerOpen(false)
    setReplyTo(null)
    setComposerInitialBody(undefined)
  }, [])

  // Open composer pre-filled with an AI-generated draft
  const handleOpenComposerWithDraft = useCallback(
    (draft: {
      inReplyTo: string
      threadId?: string
      recipientId: string
      recipientName: string
      subject: string
      body: string
      source: MessageSource
    }) => {
      if (selectedMessage) {
        setReplyTo(selectedMessage)
      }
      setComposerInitialBody(draft.body)
      setComposerOpen(true)
    },
    [selectedMessage]
  )

  // Create a task from an extracted action
  const handleCreateTask = useCallback(
    async (data: {
      title: string
      dueDate?: string
      description: string
      sourceMessageId: string
    }) => {
      if (!user?.uid) return
      const now = new Date().toISOString()
      const task = {
        id: generateId(),
        userId: user.uid,
        title: data.title,
        description: data.description,
        domain: 'work' as const,
        importance: 4 as const,
        status: 'inbox' as const,
        completed: false,
        archived: false,
        dueDate: data.dueDate,
        createdAt: now,
        updatedAt: now,
      }
      await saveTaskLocally({ ...task, syncState: 'pending' })
      await enqueueTaskOp('create', user.uid, task.id, { task })
      toast.success(`Task created: ${data.title}`)
      // Background sync to Firestore
      const repo = createFirestoreTodoRepository()
      repo.saveTask(task).catch(() => {
        // Outbox will retry later
      })
    },
    [user]
  )

  // Create a calendar event from an extracted action
  const handleCreateEvent = useCallback(
    (data: { title: string; description?: string }) => {
      const params = new URLSearchParams({ newEvent: 'true', title: data.title })
      if (data.description) params.set('description', data.description)
      navigate(`/calendar?${params.toString()}`)
      toast.success(`Navigating to create event: ${data.title}`)
    },
    [navigate]
  )

  // Set a follow-up on a contact
  const handleSetFollowUp = useCallback(
    async (contactId: string, dueDate?: string) => {
      if (!user?.uid) return
      try {
        const nextFollowUpMs = dueDate
          ? new Date(dueDate).getTime()
          : Date.now() + 7 * 24 * 60 * 60 * 1000 // Default: 1 week
        const db = await getDb()
        await updateDoc(doc(db, `users/${user.uid}/contacts/${contactId}`), {
          nextFollowUpMs,
          updatedAtMs: Date.now(),
        })
        toast.success('Follow-up set')
      } catch {
        toast.error('Failed to set follow-up')
      }
    },
    [user]
  )

  // Navigate to edit a contact
  const handleEditContact = useCallback(
    (contactId: string) => {
      navigate(`/people?contactId=${contactId}`)
    },
    [navigate]
  )

  // Page-level keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return
      }

      // Cmd+N or 'c' to open composer
      if ((e.metaKey && e.key === 'n') || (e.key === 'c' && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault()
        handleCompose()
        return
      }

      // Escape to close composer or deselect message
      if (e.key === 'Escape') {
        if (composerOpen) {
          handleCloseComposer()
        } else if (selectedMessage) {
          setSelectedMessage(null)
        }
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [composerOpen, selectedMessage, handleCompose, handleCloseComposer])

  return (
    <div className="mailbox-page">
      <div className="mailbox-page__header">
        <h1 className="mailbox-page__title">Mailbox</h1>
        <div className="mailbox-page__actions">
          <button type="button" className="primary-button small" onClick={handleCompose}>
            Compose
          </button>
          <button
            type="button"
            className="ghost-button small"
            onClick={() => void syncMailbox()}
            disabled={syncStatus.isSyncing}
          >
            {syncStatus.isSyncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      <div className="mailbox-page__content">
        <div className="mailbox-page__list">
          <ErrorBoundary
            fallback={(err, reset) => (
              <div className="mailbox-page__panel-error">
                <p>Message list encountered an error</p>
                <p className="mailbox-page__panel-error-detail">{err.message}</p>
                <button type="button" className="ghost-button small" onClick={reset}>
                  Try again
                </button>
              </div>
            )}
          >
            <MailboxMessageList
              messages={messages}
              loading={loading}
              error={error}
              selectedMessageId={selectedMessage?.messageId ?? null}
              channelFilter={channelFilter}
              followUpOnly={followUpOnly}
              focusedIndex={focusedIndex}
              onChannelFilterChange={(filter) => {
                setChannelFilter(filter)
                setFollowUpOnly(false)
              }}
              onSelectMessage={handleSelectMessage}
              onDismiss={handleDismiss}
              onFocusedIndexChange={setFocusedIndex}
              onReply={handleReply}
              onMarkAsRead={markAsRead}
            />
          </ErrorBoundary>
        </div>

        <div className="mailbox-page__detail" aria-live="polite">
          <ErrorBoundary
            fallback={(err, reset) => (
              <div className="mailbox-page__panel-error">
                <p>Detail panel encountered an error</p>
                <p className="mailbox-page__panel-error-detail">{err.message}</p>
                <button type="button" className="ghost-button small" onClick={reset}>
                  Try again
                </button>
              </div>
            )}
          >
            {selectedMessage ? (
              <MailboxMessageDetail
                message={selectedMessage}
                onDismiss={handleDismiss}
                onReply={handleReply}
                onOverrideTriage={overrideTriageCategory}
                onOpenComposerWithDraft={handleOpenComposerWithDraft}
                onCreateTask={handleCreateTask}
                onCreateEvent={handleCreateEvent}
                onSetFollowUp={handleSetFollowUp}
                onEditContact={handleEditContact}
              />
            ) : (
              <MailboxDashboard
                messages={messages}
                syncStatus={syncStatus}
                onFilterChannel={(channel) => {
                  setChannelFilter(channel)
                  setFollowUpOnly(false)
                }}
                onFilterFollowUp={() => {
                  setFollowUpOnly(true)
                  setChannelFilter('all')
                }}
                onSync={() => void syncMailbox()}
              />
            )}
          </ErrorBoundary>
        </div>
      </div>

      {composerOpen && (
        <MailboxComposer
          replyTo={replyTo}
          initialBody={composerInitialBody}
          onClose={handleCloseComposer}
        />
      )}
    </div>
  )
}
