/**
 * MessageMailbox Component
 *
 * Compact unified mailbox widget for the Today page.
 * Shows unread count across all channels, channel breakdown chips,
 * top 3-5 AI-ranked messages with source icons, and a "View All" link to /mailbox.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMessageMailbox } from '@/hooks/useMessageMailbox'
import type { PrioritizedMessage, MessageSource } from '@lifeos/agents'
import { Button } from '@/components/ui/button'
import '@/styles/components/MessageMailbox.css'

const SOURCE_ICONS: Record<MessageSource, string> = {
  gmail: '@',
  slack: '#',
  linkedin: 'in',
  whatsapp: 'W',
  telegram: 'T',
}

const SOURCE_LABELS: Record<MessageSource, string> = {
  gmail: 'Gmail',
  slack: 'Slack',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
}

interface MessageMailboxProps {
  maxMessages?: number
}

export function MessageMailbox({ maxMessages = 50 }: MessageMailboxProps) {
  const navigate = useNavigate()
  const {
    messages,
    loading,
    error,
    syncStatus,
    requiresAPIKeySetup,
    highPriorityCount,
    totalMessagesScanned,
    followUpCount,
    syncMailbox,
    dismissMessage,
  } = useMessageMailbox({ maxMessages, autoSync: false })

  // Sort by importance score (desc), then receivedAtMs (desc) — top 5 for compact view
  const topMessages = useMemo(() => {
    return [...messages]
      .sort((a, b) => {
        const scoreA = a.importanceScore ?? 0
        const scoreB = b.importanceScore ?? 0
        if (scoreA !== scoreB) return scoreB - scoreA
        return b.receivedAtMs - a.receivedAtMs
      })
      .slice(0, 5)
  }, [messages])

  // Compute channel breakdown
  const channelBreakdown = useMemo(() => {
    const counts: Partial<Record<MessageSource, number>> = {}
    for (const msg of messages) {
      counts[msg.source] = (counts[msg.source] ?? 0) + 1
    }
    return Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a) as Array<[MessageSource, number]>
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

  // Tick a "now" timestamp every minute so relative-time labels stay pure
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])

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
        <div className="today-card-header">
          <div>
            <p className="section-label">Message Mailbox</p>
            <p className="section-hint">AI-prioritized messages from your inbox.</p>
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
        <div className="today-card-header">
          <div>
            <p className="section-label">Message Mailbox</p>
            <p className="section-hint">AI-prioritized messages from your inbox.</p>
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
        <div className="today-card-header">
          <div>
            <p className="section-label">Message Mailbox</p>
            <p className="section-hint">AI-prioritized messages from your inbox.</p>
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
        <div className="today-card-header">
          <div>
            <p className="section-label">Message Mailbox</p>
            <p className="section-hint">AI-prioritized messages from your inbox.</p>
          </div>
          <div className="mailbox-header-actions">
            <Button
              variant="ghost"
              className="small"
              onClick={handleSync}
              disabled={syncStatus.isSyncing}
            >
              {syncStatus.isSyncing ? 'Syncing...' : 'Sync Now'}
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
      <div className="today-card-header">
        <div>
          <p className="section-label">
            Message Mailbox
            {unreadCount > 0 && <span className="mailbox-unread-count">{unreadCount} unread</span>}
            {highPriorityCount > 0 && (
              <span className="mailbox-priority-count">{highPriorityCount} urgent</span>
            )}
          </p>
          <p className="section-hint">
            {followUpCount} follow-up{followUpCount !== 1 ? 's' : ''} of {totalMessagesScanned}{' '}
            scanned
          </p>
        </div>
        <div className="mailbox-header-actions">
          {syncStatus.lastSyncMs && (
            <span className="mailbox-last-sync">{formatLastSync(syncStatus.lastSyncMs)}</span>
          )}
          <Button
            variant="ghost"
            className="small"
            onClick={handleSync}
            disabled={syncStatus.isSyncing}
          >
            {syncStatus.isSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>
      </div>

      {/* Channel breakdown chips */}
      {channelBreakdown.length > 0 && (
        <div className="mailbox-channel-chips">
          {channelBreakdown.map(([source, count]) => (
            <span key={source} className={`mailbox-channel-chip mailbox-channel-chip--${source}`}>
              <span className="mailbox-channel-chip__icon">{SOURCE_ICONS[source]}</span>
              {count} {SOURCE_LABELS[source]}
            </span>
          ))}
        </div>
      )}

      {syncStatus.isSyncing && (
        <div className="mailbox-syncing-overlay">
          <span className="mailbox-syncing-spinner" />
          <span className="mailbox-syncing-text">Syncing messages...</span>
        </div>
      )}

      {/* Compact top AI-ranked messages */}
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
            <div
              className={`mailbox-compact-item__source mailbox-compact-item__source--${message.source}`}
            >
              <span className="mailbox-compact-item__source-icon">
                {SOURCE_ICONS[message.source]}
              </span>
            </div>
            <div className="mailbox-compact-item__body">
              <div className="mailbox-compact-item__header">
                <span className="mailbox-compact-item__sender">{message.sender}</span>
                <span className="mailbox-compact-item__time">
                  {formatTimeAgo(message.receivedAtMs)}
                </span>
              </div>
              <p className="mailbox-compact-item__summary">{message.aiSummary}</p>
            </div>
            <div className="mailbox-compact-item__meta">
              <span
                className={`mailbox-compact-item__priority mailbox-compact-item__priority--${message.priority}`}
              >
                {message.priority}
              </span>
              <button
                type="button"
                className="mailbox-compact-item__dismiss"
                onClick={(e) => {
                  e.stopPropagation()
                  void dismissMessage(message.messageId)
                }}
                aria-label="Dismiss message"
              >
                ×
              </button>
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
