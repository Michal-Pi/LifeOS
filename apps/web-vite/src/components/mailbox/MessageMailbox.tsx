/**
 * MessageMailbox Component
 *
 * Compact unified mailbox widget for the Today page.
 * Shows unread count across all channels, channel breakdown chips,
 * top 3-5 AI-ranked messages with source icons, and a "View All" link to /mailbox.
 */

import { useCallback, useMemo } from 'react'
import { useNow } from '@/hooks/useNow'
import { useNavigate } from 'react-router-dom'
import { useMessageMailbox } from '@/hooks/useMessageMailbox'
import { useMailboxOutbox } from '@/hooks/useMailboxOutbox'
import type { PrioritizedMessage, MessageSource } from '@lifeos/agents'
import { Button } from '@/components/ui/button'
import '@/styles/components/MessageMailbox.css'

function SourceIcon({ source }: { source: MessageSource }) {
  switch (source) {
    case 'gmail':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <polyline points="22,4 12,13 2,4" />
        </svg>
      )
    case 'slack':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
          <path d="M6 15a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2h2v2zm1 0a2 2 0 0 1 2-2a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2a2 2 0 0 1-2-2v-5zm2-8a2 2 0 0 1-2-2a2 2 0 0 1 2-2a2 2 0 0 1 2 2v2H9zm0 1a2 2 0 0 1 2 2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2a2 2 0 0 1 2-2h5zm8 2a2 2 0 0 1 2-2a2 2 0 0 1 2 2a2 2 0 0 1-2 2h-2v-2zm-1 0a2 2 0 0 1-2 2a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2a2 2 0 0 1 2 2v5zm-2 8a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2v-2h2zm0-1a2 2 0 0 1-2-2a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2a2 2 0 0 1-2 2h-5z" />
        </svg>
      )
    case 'linkedin':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
          <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
          <rect x="2" y="9" width="4" height="12" />
          <circle cx="4" cy="4" r="2" />
        </svg>
      )
    case 'whatsapp':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      )
    case 'telegram':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      )
  }
}

interface MessageMailboxProps {
  maxMessages?: number
}

export function MessageMailbox({ maxMessages = 8 }: MessageMailboxProps) {
  const navigate = useNavigate()
  const {
    messages,
    loading,
    error,
    syncStatus,
    requiresAPIKeySetup,
    totalMessagesScanned,
    followUpCount,
    syncMailbox,
  } = useMessageMailbox({ maxMessages, autoSync: false })
  const { pendingCount: outboxPending, failedCount: outboxFailed, retryFailed } = useMailboxOutbox()

  // Sort by importance score (desc), then receivedAtMs (desc) — top 5 for compact view
  const topMessages = useMemo(() => {
    return [...messages]
      .sort((a, b) => {
        const scoreA = a.importanceScore ?? 0
        const scoreB = b.importanceScore ?? 0
        if (scoreA !== scoreB) return scoreB - scoreA
        return b.receivedAtMs - a.receivedAtMs
      })
      .slice(0, 8)
  }, [messages])

  // Unread count
  const unreadCount = useMemo(() => messages.filter((m) => !m.isRead).length, [messages])

  const handleSync = useCallback(async () => {
    try {
      await syncMailbox()
    } catch {
      // Error is already handled in the hook
    }
  }, [syncMailbox])

  const handleGoToSettings = useCallback(() => {
    navigate('/settings/model')
  }, [navigate])

  const handleViewAll = useCallback(() => {
    navigate('/mailbox')
  }, [navigate])

  const handleMessageClick = useCallback(
    (message: PrioritizedMessage) => {
      navigate('/mailbox', { state: { selectedMessageId: message.messageId } })
    },
    [navigate]
  )

  // Tick a "now" timestamp every minute so relative-time labels stay fresh
  const now = useNow(60_000).getTime()

  // Format relative time
  const formatTimeAgo = useCallback(
    (ms: number) => {
      const diffMins = Math.round((now - ms) / 60000)
      if (diffMins < 1) return 'now'
      if (diffMins < 60) return `${diffMins}m`
      const diffHours = Math.round(diffMins / 60)
      if (diffHours < 24) return `${diffHours}h`
      const diffDays = Math.round(diffHours / 24)
      return `${diffDays}d`
    },
    [now]
  )

  // Format last sync time
  const formatLastSync = useCallback(
    (ms?: number) => {
      if (!ms) return null
      const diffMins = Math.round((now - ms) / 60000)

      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins}m ago`
      const diffHours = Math.round(diffMins / 60)
      if (diffHours < 24) return `${diffHours}h ago`
      return new Date(ms).toLocaleDateString()
    },
    [now]
  )

  // Show API key setup prompt
  if (requiresAPIKeySetup) {
    return (
      <section className="today-card message-mailbox-card today-grid-mailbox">
        <div className="mailbox-header">
          <div className="mailbox-header__left">
            <p className="section-label">Mailbox</p>
          </div>
        </div>
        <div className="mailbox-setup-prompt">
          <div className="setup-icon">⚙️</div>
          <p className="setup-title">API Key Required</p>
          <p className="setup-text">
            Configure an AI provider API key to enable message prioritization.
          </p>
          <Button variant="default" className="small" onClick={handleGoToSettings}>
            Go to Settings
          </Button>
        </div>
      </section>
    )
  }

  // Loading state
  if (loading && messages.length === 0) {
    return (
      <section className="today-card message-mailbox-card today-grid-mailbox">
        <div className="mailbox-header">
          <div className="mailbox-header__left">
            <p className="section-label">Mailbox</p>
          </div>
        </div>
        <div className="mailbox-loading">Loading messages...</div>
      </section>
    )
  }

  // Error state
  if (error && messages.length === 0) {
    return (
      <section className="today-card message-mailbox-card today-grid-mailbox">
        <div className="mailbox-header">
          <div className="mailbox-header__left">
            <p className="section-label">Mailbox</p>
          </div>
        </div>
        <div className="mailbox-error">
          <p>Failed to load messages</p>
          <Button variant="ghost" className="small" onClick={handleSync}>
            Retry
          </Button>
        </div>
      </section>
    )
  }

  // Empty state
  if (messages.length === 0) {
    return (
      <section className="today-card message-mailbox-card today-grid-mailbox">
        <div className="mailbox-header">
          <div className="mailbox-header__left">
            <p className="section-label">Mailbox</p>
          </div>
          <div className="mailbox-header__right">
            <Button
              variant="ghost"
              className="small"
              onClick={handleSync}
              disabled={syncStatus.isSyncing}
            >
              {syncStatus.isSyncing ? 'Syncing...' : 'Sync'}
            </Button>
          </div>
        </div>
        <div className="mailbox-empty">
          <p className="today-empty-title">Inbox is clear</p>
          <p className="today-empty-text">No messages require your attention right now.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="today-card message-mailbox-card today-grid-mailbox">
      <div className="mailbox-header">
        <div className="mailbox-header__left">
          <p className="section-label">Mailbox</p>
          <div className="mailbox-header__indicators">
            {unreadCount > 0 && (
              <span className="mailbox-indicator">
                <span className="mailbox-indicator__dot mailbox-indicator__dot--unread" />
                {unreadCount} unread
              </span>
            )}
            <span className="mailbox-indicator mailbox-indicator--muted">
              {followUpCount}/{totalMessagesScanned} need action
            </span>
          </div>
        </div>
        <div className="mailbox-header__right">
          {syncStatus.lastSyncMs && (
            <span className="mailbox-last-sync">{formatLastSync(syncStatus.lastSyncMs)}</span>
          )}
          <Button
            variant="ghost"
            className="small"
            onClick={handleSync}
            disabled={syncStatus.isSyncing}
          >
            {syncStatus.isSyncing ? 'Syncing...' : 'Sync'}
          </Button>
        </div>
      </div>

      {syncStatus.isSyncing && (
        <div className="mailbox-syncing-overlay">
          <span className="mailbox-syncing-spinner" />
          <span className="mailbox-syncing-text">Syncing messages...</span>
        </div>
      )}

      {/* Outbox status indicator */}
      {(outboxPending > 0 || outboxFailed > 0) && (
        <div className="mailbox-outbox-status">
          {outboxPending > 0 && (
            <span className="mailbox-outbox-status__pending">
              {outboxPending} message{outboxPending !== 1 ? 's' : ''} sending...
            </span>
          )}
          {outboxFailed > 0 && (
            <span className="mailbox-outbox-status__failed">
              {outboxFailed} failed to send.{' '}
              <button type="button" className="mailbox-outbox-status__retry" onClick={() => void retryFailed()}>
                Retry
              </button>
            </span>
          )}
        </div>
      )}

      {/* Compact top AI-ranked messages — 2-column layout */}
      <div className="mailbox-compact-messages">
        {topMessages.map((message) => (
          <div
            key={message.messageId}
            className={`mailbox-compact-item ${message.isRead ? 'mailbox-compact-item--read' : ''}`}
            onClick={() => handleMessageClick(message)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleMessageClick(message)
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="mailbox-compact-item__left">
              <span className="mailbox-compact-item__source">
                <SourceIcon source={message.source} />
              </span>
              <div className="mailbox-compact-item__body">
                <span className="mailbox-compact-item__sender">{message.sender}</span>
                <p className="mailbox-compact-item__summary">{message.aiSummary}</p>
              </div>
            </div>
            <div className="mailbox-compact-item__right">
              <span className="mailbox-compact-item__time">
                {formatTimeAgo(message.receivedAtMs)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* View All link */}
      {messages.length > 0 && (
        <div className="mailbox-view-all">
          <Button variant="ghost" className="small" onClick={handleViewAll}>
            View All ({messages.length})
          </Button>
        </div>
      )}
    </section>
  )
}
