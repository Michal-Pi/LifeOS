/**
 * MailboxMessageList Component
 *
 * Left panel of the Mailbox page. Shows a scrollable list of messages
 * with channel filter tabs, AI top-10 ranking, thread grouping, hover
 * quick actions, and keyboard navigation (Arrow Up/Down, Enter, 'e' to dismiss, 'r' to reply).
 *
 * Thread grouping:
 * - Messages sharing a threadId, senderEmail, or sender name are collapsed
 *   into an expandable thread header showing sender, subject, count badge,
 *   and most-recent timestamp.
 * - Single messages render as a normal row.
 *
 * Hover quick actions:
 * - Archive (X icon), Mark read/unread (eye icon), Reply (arrow icon)
 * - Appear as a floating toolbar on hover; hidden on touch via CSS.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { PrioritizedMessage, MessageSource } from '@lifeos/agents'
import { groupByThread } from './threadGrouping'
import type { MessageThread } from './threadGrouping'
import '@/styles/components/MailboxMessageList.css'

// ----- SVG icon helpers (inline, no external dep) -----

/** X / close icon for Archive */
function ArchiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

/** Eye icon for Mark read / unread */
function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    )
  }
  // Closed eye (slash through)
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M3 3l10 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/** Reply arrow icon */
function ReplyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 3L2 7.5 6 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 7.5h8.5a3 3 0 013 3V12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

/** Chevron (right when collapsed, down when expanded) */
function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={`mailbox-thread__chevron ${expanded ? 'mailbox-thread__chevron--expanded' : ''}`}
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ----- Props -----

interface MailboxMessageListProps {
  messages: PrioritizedMessage[]
  loading: boolean
  error: string | null
  selectedMessageId: string | null
  channelFilter: MessageSource | 'all'
  followUpOnly?: boolean
  focusedIndex: number
  onChannelFilterChange: (filter: MessageSource | 'all') => void
  onSelectMessage: (message: PrioritizedMessage) => void
  onDismiss: (messageId: string) => void
  onFocusedIndexChange: (index: number) => void
  onReply?: (message: PrioritizedMessage) => void
  onMarkAsRead?: (messageId: string) => Promise<void>
}

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

const CHANNEL_TABS: Array<{ value: MessageSource | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'gmail', label: 'Gmail' },
  { value: 'slack', label: 'Slack' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
]

export function MailboxMessageList({
  messages,
  loading,
  error,
  selectedMessageId,
  channelFilter,
  followUpOnly = false,
  focusedIndex,
  onChannelFilterChange,
  onSelectMessage,
  onDismiss,
  onFocusedIndexChange,
  onReply,
  onMarkAsRead,
}: MailboxMessageListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set())

  const toggleThread = useCallback((threadKey: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev)
      if (next.has(threadKey)) {
        next.delete(threadKey)
      } else {
        next.add(threadKey)
      }
      return next
    })
  }, [])

  // Filter by channel + follow-up
  const filteredMessages = useMemo(() => {
    let filtered =
      channelFilter === 'all' ? messages : messages.filter((m) => m.source === channelFilter)

    if (followUpOnly) {
      filtered = filtered.filter((m) => m.requiresFollowUp && !m.isDismissed)
    }

    // Sort: AI importance score desc (top-10 first), then by receivedAtMs desc
    return [...filtered].sort((a, b) => {
      const scoreA = a.importanceScore ?? 0
      const scoreB = b.importanceScore ?? 0
      if (scoreA !== scoreB) return scoreB - scoreA
      return b.receivedAtMs - a.receivedAtMs
    })
  }, [messages, channelFilter, followUpOnly])

  // Group into threads (preserves importance-score ordering from filteredMessages)
  const threads = useMemo(() => groupByThread(filteredMessages), [filteredMessages])

  // Flat list of "visible" messages for keyboard navigation
  const flatMessages = useMemo(() => {
    const flat: PrioritizedMessage[] = []
    for (const thread of threads) {
      flat.push(thread.latestMessage)
      if (thread.messages.length > 1 && expandedThreads.has(thread.threadKey)) {
        // Add sub-messages (excluding the latest which is already shown)
        for (let i = 1; i < thread.messages.length; i++) {
          flat.push(thread.messages[i])
        }
      }
    }
    return flat
  }, [threads, expandedThreads])

  // Only show tabs for sources that have messages
  const activeSources = useMemo(() => {
    const sources = new Set(messages.map((m) => m.source))
    return CHANNEL_TABS.filter((tab) => tab.value === 'all' || sources.has(tab.value))
  }, [messages])

  // Scroll focused item into view
  useEffect(() => {
    if (listRef.current && focusedIndex >= 0) {
      const items = listRef.current.querySelectorAll('[role="option"]')
      const focusedItem = items[focusedIndex] as HTMLElement
      if (focusedItem) {
        focusedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [focusedIndex])

  // Keyboard navigation handler for the list
  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (flatMessages.length === 0) return

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          const nextIndex = Math.min(focusedIndex + 1, flatMessages.length - 1)
          onFocusedIndexChange(nextIndex)
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          const prevIndex = Math.max(focusedIndex - 1, 0)
          onFocusedIndexChange(prevIndex)
          break
        }
        case 'Enter': {
          e.preventDefault()
          const msg = flatMessages[focusedIndex]
          if (msg) void onSelectMessage(msg)
          break
        }
        case 'e': {
          // Dismiss focused message
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
            return
          e.preventDefault()
          const msg = flatMessages[focusedIndex]
          if (msg) {
            void onDismiss(msg.messageId)
            if (focusedIndex >= flatMessages.length - 1) {
              onFocusedIndexChange(Math.max(0, focusedIndex - 1))
            }
          }
          break
        }
        case 'r': {
          // Reply to focused message
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
            return
          e.preventDefault()
          const msg = flatMessages[focusedIndex]
          if (msg && onReply) onReply(msg)
          break
        }
      }
    },
    [flatMessages, focusedIndex, onFocusedIndexChange, onSelectMessage, onDismiss, onReply]
  )

  const handleToggleRead = useCallback(
    (e: React.MouseEvent, message: PrioritizedMessage) => {
      e.stopPropagation()
      if (onMarkAsRead) {
        void onMarkAsRead(message.messageId)
      }
    },
    [onMarkAsRead]
  )

  if (loading && messages.length === 0) {
    return (
      <div className="mailbox-list">
        <div className="mailbox-list__loading">Loading messages...</div>
      </div>
    )
  }

  if (error && messages.length === 0) {
    return (
      <div className="mailbox-list">
        <div className="mailbox-list__error">
          <p>Failed to load messages</p>
          <p className="mailbox-list__error-detail">{error}</p>
        </div>
      </div>
    )
  }

  // Track flat index for keyboard nav
  let flatIndex = -1

  return (
    <div className="mailbox-list">
      {/* Channel filter tabs */}
      {activeSources.length > 2 && (
        <div className="mailbox-list__tabs" role="tablist" aria-label="Channel filter">
          {activeSources.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={channelFilter === tab.value}
              className={`mailbox-list__tab ${channelFilter === tab.value ? 'mailbox-list__tab--active' : ''}`}
              onClick={() => onChannelFilterChange(tab.value)}
            >
              {tab.label}
              {tab.value !== 'all' && (
                <span className="mailbox-list__tab-count">
                  {messages.filter((m) => m.source === tab.value).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Message count */}
      <div className="mailbox-list__count">
        {filteredMessages.length} message{filteredMessages.length !== 1 ? 's' : ''}
        {followUpOnly && ' (follow-up)'}
        {threads.length < filteredMessages.length && (
          <span className="mailbox-list__thread-count">
            {' '}
            in {threads.length} thread{threads.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Messages grouped by thread */}
      {filteredMessages.length === 0 ? (
        <div className="mailbox-list__empty">No messages to show</div>
      ) : (
        <div
          ref={listRef}
          className="mailbox-list__items"
          role="listbox"
          aria-label="Messages"
          tabIndex={0}
          onKeyDown={handleListKeyDown}
        >
          {threads.map((thread) => {
            const isSingleMessage = thread.messages.length === 1
            const isExpanded = expandedThreads.has(thread.threadKey)

            if (isSingleMessage) {
              // Render as regular message item
              flatIndex++
              const message = thread.latestMessage
              return (
                <MessageRow
                  key={message.messageId}
                  message={message}
                  flatIndex={flatIndex}
                  selectedMessageId={selectedMessageId}
                  focusedIndex={focusedIndex}
                  onSelectMessage={onSelectMessage}
                  onDismiss={onDismiss}
                  onReply={onReply}
                  onToggleRead={handleToggleRead}
                />
              )
            }

            // Multi-message thread
            flatIndex++
            const headerFlatIndex = flatIndex

            return (
              <ThreadGroup
                key={thread.threadKey}
                thread={thread}
                isExpanded={isExpanded}
                headerFlatIndex={headerFlatIndex}
                focusedIndex={focusedIndex}
                selectedMessageId={selectedMessageId}
                onToggleThread={toggleThread}
                onSelectMessage={onSelectMessage}
                onDismiss={onDismiss}
                onReply={onReply}
                onToggleRead={handleToggleRead}
                assignFlatIndex={() => {
                  flatIndex++
                  return flatIndex
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ----- ThreadGroup -----

interface ThreadGroupProps {
  thread: MessageThread
  isExpanded: boolean
  headerFlatIndex: number
  focusedIndex: number
  selectedMessageId: string | null
  onToggleThread: (threadKey: string) => void
  onSelectMessage: (message: PrioritizedMessage) => void
  onDismiss: (messageId: string) => void
  onReply?: (message: PrioritizedMessage) => void
  onToggleRead: (e: React.MouseEvent, message: PrioritizedMessage) => void
  /** Call to get the next flat index for expanded child messages */
  assignFlatIndex: () => number
}

function ThreadGroup({
  thread,
  isExpanded,
  headerFlatIndex,
  focusedIndex,
  selectedMessageId,
  onToggleThread,
  onSelectMessage,
  onDismiss,
  onReply,
  onToggleRead,
  assignFlatIndex,
}: ThreadGroupProps) {
  const hasUnread = thread.unreadCount > 0
  const timeAgo = formatDistanceToNow(new Date(thread.latestTimestamp), { addSuffix: true })
  const displaySubject = thread.subject || thread.latestMessage.snippet

  return (
    <div className="mailbox-thread">
      <button
        className={[
          'mailbox-thread__header',
          headerFlatIndex === focusedIndex && 'mailbox-thread__header--focused',
          hasUnread && 'mailbox-thread__header--has-unread',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onToggleThread(thread.threadKey)}
        role="option"
        aria-selected={thread.latestMessage.messageId === selectedMessageId}
        aria-expanded={isExpanded}
      >
        <ChevronIcon expanded={isExpanded} />
        <span className="mailbox-thread__sender">{thread.sender}</span>
        <span className="mailbox-thread__count">{thread.messages.length}</span>
        <span className="mailbox-thread__subject">{displaySubject}</span>
        <span className="mailbox-thread__time">{timeAgo}</span>
        {hasUnread && <span className="mailbox-thread__unread">{thread.unreadCount}</span>}
      </button>

      {isExpanded && (
        <div
          className="mailbox-thread__messages"
          role="group"
          aria-label={`Thread: ${displaySubject}`}
        >
          {thread.messages.map((message) => {
            const currentFlatIndex =
              message.messageId === thread.latestMessage.messageId
                ? headerFlatIndex
                : assignFlatIndex()

            return (
              <MessageRow
                key={message.messageId}
                message={message}
                flatIndex={currentFlatIndex}
                selectedMessageId={selectedMessageId}
                focusedIndex={focusedIndex}
                onSelectMessage={onSelectMessage}
                onDismiss={onDismiss}
                onReply={onReply}
                onToggleRead={onToggleRead}
                isThreadChild
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ----- MessageRow (extracted for reuse) -----

interface MessageRowProps {
  message: PrioritizedMessage
  flatIndex: number
  selectedMessageId: string | null
  focusedIndex: number
  onSelectMessage: (message: PrioritizedMessage) => void
  onDismiss: (messageId: string) => void
  onReply?: (message: PrioritizedMessage) => void
  onToggleRead: (e: React.MouseEvent, message: PrioritizedMessage) => void
  isThreadChild?: boolean
}

function MessageRow({
  message,
  flatIndex,
  selectedMessageId,
  focusedIndex,
  onSelectMessage,
  onDismiss,
  onReply,
  onToggleRead,
  isThreadChild = false,
}: MessageRowProps) {
  const isSelected = message.messageId === selectedMessageId
  const isFocused = flatIndex === focusedIndex
  const isTop10 = flatIndex < 10 && message.importanceScore != null
  const timeAgo = formatDistanceToNow(new Date(message.receivedAtMs), { addSuffix: true })

  return (
    <div
      className={[
        'mailbox-list__item',
        isSelected && 'mailbox-list__item--selected',
        isFocused && 'mailbox-list__item--focused',
        message.isRead && 'mailbox-list__item--read',
        isTop10 && 'mailbox-list__item--top10',
        isThreadChild && 'mailbox-list__item--thread-child',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => void onSelectMessage(message)}
      role="option"
      aria-selected={isSelected}
      id={`mailbox-msg-${message.messageId}`}
    >
      <div className={`mailbox-list__source mailbox-list__source--${message.source}`}>
        <span className="mailbox-list__source-icon">{SOURCE_ICONS[message.source] ?? '>'}</span>
      </div>

      <div className="mailbox-list__item-body">
        <div className="mailbox-list__item-header">
          <span className="mailbox-list__sender">
            {message.sender}
            {message.contactId && (
              <a
                className="mailbox-list__contact-dot"
                href={`/people?contactId=${message.contactId}`}
                title="Linked contact"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </span>
          <span className="mailbox-list__time">{timeAgo}</span>
        </div>
        {message.subject && <div className="mailbox-list__subject">{message.subject}</div>}
        <div className="mailbox-list__snippet">{message.aiSummary}</div>
        <div className="mailbox-list__meta">
          <span className={`mailbox-list__priority mailbox-list__priority--${message.priority}`}>
            {message.priority}
          </span>
          <span className="mailbox-list__channel-label">{SOURCE_LABELS[message.source]}</span>
          {isTop10 && <span className="mailbox-list__ai-badge">AI Top 10</span>}
        </div>
      </div>

      {/* Hover quick actions */}
      <div className="mailbox-list__hover-actions">
        <button
          type="button"
          className="mailbox-list__hover-btn"
          title="Archive"
          onClick={(e) => {
            e.stopPropagation()
            void onDismiss(message.messageId)
          }}
          aria-label={`Archive message from ${message.sender}`}
        >
          <ArchiveIcon />
        </button>
        <button
          type="button"
          className="mailbox-list__hover-btn"
          title={message.isRead ? 'Mark unread' : 'Mark read'}
          onClick={(e) => onToggleRead(e, message)}
          aria-label={message.isRead ? 'Mark as unread' : 'Mark as read'}
        >
          <EyeIcon open={!message.isRead} />
        </button>
        {onReply && (
          <button
            type="button"
            className="mailbox-list__hover-btn"
            title="Reply"
            onClick={(e) => {
              e.stopPropagation()
              onReply(message)
            }}
            aria-label={`Reply to ${message.sender}`}
          >
            <ReplyIcon />
          </button>
        )}
      </div>
    </div>
  )
}
