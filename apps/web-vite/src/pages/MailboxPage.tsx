/**
 * MailboxPage
 *
 * Two-panel layout: conversation feed on the left, inline detail on the right.
 * Supports three folders: Inbox, Drafts, Outbox.
 * Stats bar provides folder tabs + inbox filters (All, Today, etc.).
 *
 * Both replies and new messages use inline editors in the detail panel.
 *
 * Keyboard shortcuts:
 * - Cmd+N or 'c': Open inline composer (new message)
 * - Escape: Close composer
 * - Arrow Up/Down, Enter, 'e': Delegated to MailboxMessageList
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useMessageMailbox } from '@/hooks/useMessageMailbox'
import { useMailboxDrafts } from '@/hooks/useMailboxDrafts'
import { useMailboxOutbox } from '@/hooks/useMailboxOutbox'
import { useMailboxOutboxList } from '@/hooks/useMailboxOutboxList'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import { useRepositories } from '@/contexts/RepositoryContext'
import { MailboxMessageList } from '@/components/mailbox/MailboxMessageList'
import { MailboxMessageDetail } from '@/components/mailbox/MailboxMessageDetail'
import { MailboxComposeInline } from '@/components/mailbox/MailboxComposeInline'
import { MailboxFolderList } from '@/components/mailbox/MailboxFolderList'
import { MailboxOutboxDetail } from '@/components/mailbox/MailboxOutboxDetail'
import { MailboxStatsBar } from '@/components/mailbox/MailboxStatsBar'
import type { MailboxFilter, MailboxFolder } from '@/components/mailbox/MailboxStatsBar'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useGmailLabels } from '@/hooks/useGmailLabels'
import { useGmailLabelMessages } from '@/hooks/useGmailLabelMessages'
import type { PrioritizedMessage, DraftMessage, ContactId } from '@lifeos/agents'
import type { MailboxSendOp } from '@/outbox/mailboxOutbox'
import '@/styles/pages/MailboxPage.css'

const IMPORTANCE_THRESHOLD = 70

export function MailboxPage() {
  const { user } = useAuth()
  const userId = user?.uid ?? ''
  const navigate = useNavigate()
  const { contactRepository } = useRepositories()
  const { createTask } = useTodoOperations({ userId })

  const [activeFolder, setActiveFolder] = useState<MailboxFolder>('inbox')
  const [activeFilter, setActiveFilter] = useState<MailboxFilter>({ type: 'all' })
  const [selectedMessage, setSelectedMessage] = useState<PrioritizedMessage | null>(null)
  const [selectedDraft, setSelectedDraft] = useState<DraftMessage | null>(null)
  const [selectedOutboxItem, setSelectedOutboxItem] = useState<MailboxSendOp | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)

  // ---- Data hooks ----
  const {
    messages,
    loading,
    error,
    syncStatus,
    syncMailbox,
    markAsRead,
    dismissMessage,
    overrideTriageCategory,
    archiveConversation,
    labelConversation,
  } = useMessageMailbox({ maxMessages: 100, autoSync: true })

  const { labels: gmailLabels } = useGmailLabels()
  const {
    messages: labelMessages,
    loading: labelMessagesLoading,
    fetchByLabel,
  } = useGmailLabelMessages()

  const { drafts, loading: draftsLoading, deleteDraft } = useMailboxDrafts()
  useMailboxOutbox() // Start outbox worker so replies sent from this page are drained
  const { items: outboxItems, loading: outboxLoading, retry: retryOutbox } = useMailboxOutboxList()

  // ---- Fetch label messages when label filter is active ----
  useEffect(() => {
    if (activeFilter.type === 'label') {
      void fetchByLabel(activeFilter.labelName)
    }
  }, [activeFilter, fetchByLabel])

  // ---- Inbox filtering ----
  const filteredMessages = useMemo(() => {
    switch (activeFilter.type) {
      case 'today': {
        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)
        const startMs = startOfToday.getTime()
        return messages.filter((m) => m.receivedAtMs >= startMs)
      }
      case 'top-priority':
        return messages.filter((m) => (m.importanceScore ?? 0) >= IMPORTANCE_THRESHOLD)
      case 'needs-reply':
        return messages.filter((m) => m.requiresFollowUp && !m.isDismissed)
      case 'unread':
        return messages.filter((m) => !m.isRead)
      case 'channel':
        return messages.filter((m) => m.source === activeFilter.source)
      case 'label':
        // When browsing by label, adapt label messages to PrioritizedMessage shape.
        // These defaults are intentional: label-browsed messages haven't been
        // through AI triage, so we use neutral values until analysis runs.
        return labelMessages.map((m) => {
          const receivedAtMs = new Date(m.date).getTime()
          return {
            messageId: m.messageId as PrioritizedMessage['messageId'],
            userId,
            source: 'gmail' as const,
            accountId: '', // Label messages don't carry accountId
            originalMessageId: m.messageId,
            sender: m.from,
            senderEmail: m.from,
            subject: m.subject,
            snippet: m.snippet,
            receivedAtMs,
            priority: 'medium' as const, // Neutral — not yet triaged
            aiSummary: m.snippet,
            requiresFollowUp: false,
            isRead: true,
            isDismissed: false,
            gmailLabelIds: m.labelIds,
            createdAtMs: receivedAtMs,
            updatedAtMs: receivedAtMs,
            importanceScore: 50, // Neutral — not yet scored
          } satisfies PrioritizedMessage
        })
      case 'all':
      default:
        return messages
    }
  }, [messages, activeFilter, labelMessages, userId])

  // Keep selected message in sync with the latest data, auto-selecting
  // the first conversation when none is explicitly selected (inbox only).
  const displayedMessage = useMemo(() => {
    if (selectedMessage) {
      return (
        filteredMessages.find((m) => m.messageId === selectedMessage.messageId) ?? selectedMessage
      )
    }
    // Auto-select first message when inbox is active with no explicit selection
    if (activeFolder === 'inbox' && !composerOpen && !loading && filteredMessages.length > 0) {
      return filteredMessages[0]
    }
    return null
  }, [selectedMessage, filteredMessages, activeFolder, composerOpen, loading])

  // ---- Folder switching ----
  const handleFolderChange = useCallback((folder: MailboxFolder) => {
    setActiveFolder(folder)
    setSelectedMessage(null)
    setSelectedDraft(null)
    setSelectedOutboxItem(null)
    setComposerOpen(false)
  }, [])

  // ---- Inbox selection ----
  const handleSelectMessage = useCallback((message: PrioritizedMessage) => {
    setSelectedMessage(message)
    setComposerOpen(false)
  }, [])

  // Mark selected message as read
  useEffect(() => {
    if (selectedMessage && !selectedMessage.isRead) {
      void markAsRead(selectedMessage.messageId)
    }
  }, [selectedMessage, markAsRead])

  const handleDismiss = useCallback(
    async (messageIds: string[]) => {
      const idSet = new Set(messageIds)
      await Promise.all(
        messageIds.map((id) => {
          const msg = filteredMessages.find((m) => m.messageId === id)
          return dismissMessage(id, msg?.source === 'gmail' ? { archive: true } : undefined)
        })
      )
      if (selectedMessage && idSet.has(selectedMessage.messageId)) {
        const currentIdx = filteredMessages.findIndex(
          (m) => m.messageId === selectedMessage.messageId
        )
        const remaining = filteredMessages.filter((m) => !idSet.has(m.messageId))
        if (remaining.length > 0) {
          const nextIdx = Math.min(currentIdx, remaining.length - 1)
          setSelectedMessage(remaining[nextIdx])
        } else {
          setSelectedMessage(null)
        }
      }
    },
    [dismissMessage, filteredMessages, selectedMessage]
  )

  const handleReplySent = useCallback(
    (messageId: string) => {
      void markAsRead(messageId)
    },
    [markAsRead]
  )

  // ---- Compose ----
  const handleCompose = useCallback(() => {
    setSelectedMessage(null)
    setSelectedDraft(null)
    setSelectedOutboxItem(null)
    setComposerOpen(true)
    // Switch to inbox folder when composing to keep consistent
    setActiveFolder('inbox')
  }, [])

  const handleCloseComposer = useCallback(() => {
    setComposerOpen(false)
    if (filteredMessages.length > 0) {
      setSelectedMessage(filteredMessages[0])
    }
  }, [filteredMessages])

  // ---- Drafts selection ----
  const handleSelectDraft = useCallback((draft: DraftMessage) => {
    setSelectedDraft(draft)
  }, [])

  const handleDeleteDraft = useCallback(
    async (draftId: string) => {
      await deleteDraft(draftId)
      if (selectedDraft?.draftId === draftId) {
        setSelectedDraft(null)
      }
    },
    [deleteDraft, selectedDraft]
  )

  const handleDraftSentOrDiscarded = useCallback(() => {
    setSelectedDraft(null)
  }, [])

  // ---- Outbox selection ----
  const handleSelectOutboxItem = useCallback((item: MailboxSendOp) => {
    setSelectedOutboxItem(item)
  }, [])

  const handleRetryOutbox = useCallback(
    async (opId: string) => {
      await retryOutbox(opId)
    },
    [retryOutbox]
  )

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return
      }

      if ((e.metaKey && e.key === 'n') || (e.key === 'c' && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault()
        handleCompose()
        return
      }

      if (e.key === 'Escape' && composerOpen) {
        handleCloseComposer()
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [composerOpen, handleCompose, handleCloseComposer])

  // ---- Render list panel ----
  const renderListPanel = () => {
    switch (activeFolder) {
      case 'drafts':
        return (
          <MailboxFolderList
            folder="drafts"
            drafts={drafts}
            loading={draftsLoading}
            selectedId={selectedDraft?.draftId}
            onSelectDraft={handleSelectDraft}
            onDeleteDraft={(id) => void handleDeleteDraft(id)}
          />
        )
      case 'outbox':
        return (
          <MailboxFolderList
            folder="outbox"
            outboxItems={outboxItems}
            loading={outboxLoading}
            selectedId={selectedOutboxItem?.opId}
            onSelectOutboxItem={handleSelectOutboxItem}
            onRetryOutbox={(id) => void handleRetryOutbox(id)}
          />
        )
      case 'inbox':
      default:
        return (
          <MailboxMessageList
            messages={filteredMessages}
            loading={activeFilter.type === 'label' ? labelMessagesLoading : loading}
            error={error}
            selectedMessageId={selectedMessage?.messageId}
            onSelectMessage={handleSelectMessage}
            onDismiss={handleDismiss}
            onMarkAsRead={markAsRead}
          />
        )
    }
  }

  // ---- Render detail panel ----
  const renderDetailPanel = () => {
    // Compose mode (any folder)
    if (composerOpen) {
      return <MailboxComposeInline onSent={handleCloseComposer} onDiscard={handleCloseComposer} />
    }

    switch (activeFolder) {
      case 'drafts':
        if (selectedDraft) {
          return (
            <MailboxComposeInline
              key={selectedDraft.draftId}
              draft={selectedDraft}
              onSent={handleDraftSentOrDiscarded}
              onDiscard={handleDraftSentOrDiscarded}
            />
          )
        }
        return (
          <div className="mailbox-page__empty-detail">
            <span>{drafts.length > 0 ? 'Select a draft to edit' : 'No drafts'}</span>
          </div>
        )

      case 'outbox':
        if (selectedOutboxItem) {
          return (
            <MailboxOutboxDetail
              item={selectedOutboxItem}
              onRetry={(id) => void handleRetryOutbox(id)}
            />
          )
        }
        return (
          <div className="mailbox-page__empty-detail">
            <span>
              {outboxItems.length > 0 ? 'Select an item to view details' : 'Outbox is empty'}
            </span>
          </div>
        )

      case 'inbox':
      default:
        if (displayedMessage) {
          return (
            <MailboxMessageDetail
              key={displayedMessage.messageId}
              message={displayedMessage}
              threadMessages={
                displayedMessage.threadId
                  ? filteredMessages.filter((m) => m.threadId === displayedMessage.threadId)
                  : undefined
              }
              onDismiss={handleDismiss}
              onReplySent={handleReplySent}
              onOverrideTriage={overrideTriageCategory}
              onCreateTask={async (data) => {
                try {
                  await createTask({
                    title: data.title,
                    description: data.description,
                    dueDate: data.dueDate,
                    domain: 'work',
                    importance: 4,
                    status: 'inbox',
                    completed: false,
                    archived: false,
                  })
                } catch (err) {
                  toast.error('Failed to create task', {
                    description: (err as Error).message,
                  })
                }
              }}
              onCreateEvent={(data) => {
                const params = new URLSearchParams({ title: data.title })
                if (data.description) params.set('description', data.description)
                navigate(`/calendar?newEvent=1&${params.toString()}`)
              }}
              onSetFollowUp={async (contactId, dueDate) => {
                try {
                  const followUpMs = dueDate
                    ? new Date(dueDate).getTime()
                    : Date.now() + 7 * 24 * 60 * 60 * 1000
                  await contactRepository.update(userId, contactId as ContactId, {
                    nextFollowUpMs: followUpMs,
                  })
                  toast.success('Follow-up reminder set')
                } catch (err) {
                  toast.error('Failed to set follow-up', {
                    description: (err as Error).message,
                  })
                }
              }}
              onEditContact={(contactId) => {
                navigate(`/contacts/${contactId}`)
              }}
              gmailLabels={gmailLabels}
              onLabelConversation={labelConversation}
              onArchiveConversation={archiveConversation}
            />
          )
        }
        return (
          <div className="mailbox-page__empty-detail">
            <span>Select a conversation to view details</span>
          </div>
        )
    }
  }

  return (
    <div className="mailbox-page">
      <MailboxStatsBar
        messages={messages}
        activeFilter={activeFilter}
        activeFolder={activeFolder}
        draftsCount={drafts.length}
        outboxCount={outboxItems.filter((i) => i.status !== 'applied').length}
        onFilterChange={setActiveFilter}
        onFolderChange={handleFolderChange}
        onCompose={handleCompose}
        onSync={() => void syncMailbox()}
        isSyncing={syncStatus.isSyncing}
        gmailLabels={gmailLabels}
      />

      <div className="mailbox-page__content">
        <div className="mailbox-page__list">
          <ErrorBoundary
            fallback={(err, reset) => (
              <div className="mailbox-page__panel-error">
                <p>Something went wrong</p>
                <p className="mailbox-page__panel-error-detail">{err.message}</p>
                <button type="button" className="ghost-button small" onClick={reset}>
                  Try again
                </button>
              </div>
            )}
          >
            {renderListPanel()}
          </ErrorBoundary>
        </div>

        <div className="mailbox-page__detail">
          <ErrorBoundary
            fallback={(err, reset) => (
              <div className="mailbox-page__panel-error">
                <p>Something went wrong</p>
                <p className="mailbox-page__panel-error-detail">{err.message}</p>
                <button type="button" className="ghost-button small" onClick={reset}>
                  Try again
                </button>
              </div>
            )}
          >
            {renderDetailPanel()}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}
