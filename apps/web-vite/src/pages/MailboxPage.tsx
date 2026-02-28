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
import { useMessageMailbox } from '@/hooks/useMessageMailbox'
import { MailboxMessageList } from '@/components/mailbox/MailboxMessageList'
import { MailboxMessageDetail } from '@/components/mailbox/MailboxMessageDetail'
import { MailboxComposer } from '@/components/mailbox/MailboxComposer'
import { MailboxDashboard } from '@/components/mailbox/MailboxDashboard'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import type { PrioritizedMessage, MessageSource } from '@lifeos/agents'
import '@/styles/pages/MailboxPage.css'

export function MailboxPage() {
  const [selectedMessage, setSelectedMessage] = useState<PrioritizedMessage | null>(null)
  const [channelFilter, setChannelFilter] = useState<MessageSource | 'all'>('all')
  const [followUpOnly, setFollowUpOnly] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<PrioritizedMessage | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)

  const { messages, loading, error, syncStatus, syncMailbox, markAsRead, dismissMessage } =
    useMessageMailbox({ maxMessages: 100, autoSync: true })

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
    setComposerOpen(true)
  }, [])

  const handleCompose = useCallback(() => {
    setReplyTo(null)
    setComposerOpen(true)
  }, [])

  const handleCloseComposer = useCallback(() => {
    setComposerOpen(false)
    setReplyTo(null)
  }, [])

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

      {composerOpen && <MailboxComposer replyTo={replyTo} onClose={handleCloseComposer} />}
    </div>
  )
}
