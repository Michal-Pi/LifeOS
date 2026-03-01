/**
 * MailboxMessageList — Conversation Feed
 *
 * AI-first decision feed. Each row is a conversation (thread), not a message.
 * Primary element: AI summary — what's happening, what changed, what to do.
 * Secondary: last message preview — trust layer for verification.
 * Expansion: click to expand full thread inline (accordion — one at a time).
 *
 * Keyboard navigation:
 * - Arrow Up/Down: move between conversations
 * - Enter: expand/collapse
 * - 'e': archive focused conversation
 * - 'r': select message (opens inline reply in detail panel)
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { PrioritizedMessage, MessageSource, TriageCategory } from '@lifeos/agents'
import { TRIAGE_LABELS } from '@lifeos/agents'
import { groupByThread } from './threadGrouping'
import type { MessageThread } from './threadGrouping'
import { useMailboxMessageBody } from '@/hooks/useMailboxMessageBody'
import '@/styles/components/MailboxMessageList.css'

// ----- SVG icon helpers -----

function SourceIcon({ source }: { source: MessageSource }) {
  const props = { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true as const }
  switch (source) {
    case 'gmail':
      return (
        <svg {...props} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="2.5" width="10" height="7" rx="1" />
          <polyline points="1,2.5 6,7 11,2.5" />
        </svg>
      )
    case 'slack':
      return (
        <svg {...props} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <line x1="3.5" y1="1.5" x2="3.5" y2="10.5" />
          <line x1="8.5" y1="1.5" x2="8.5" y2="10.5" />
          <line x1="1.5" y1="4" x2="10.5" y2="4" />
          <line x1="1.5" y1="8" x2="10.5" y2="8" />
        </svg>
      )
    case 'linkedin':
      return (
        <svg {...props} fill="currentColor">
          <text x="1" y="10" fontSize="10" fontWeight="700" fontFamily="system-ui, sans-serif" letterSpacing="-0.5">in</text>
        </svg>
      )
    case 'whatsapp':
      return (
        <svg {...props} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.5 5.8a4.2 4.2 0 0 1-.45 1.9A4.25 4.25 0 0 1 6.25 10a4.2 4.2 0 0 1-1.9-.45L1.5 10.5l.95-2.85A4.2 4.2 0 0 1 2 5.75 4.25 4.25 0 0 1 4.35 2a4.2 4.2 0 0 1 1.9-.45h.25a4.24 4.24 0 0 1 4 4v.25z" />
        </svg>
      )
    case 'telegram':
      return (
        <svg {...props} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.5 1.5L5.5 6.5" />
          <polygon points="10.5,1.5 7,10.5 5.5,6.5 1.5,5 10.5,1.5" fill="none" />
        </svg>
      )
  }
}

function ReplyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 3L2 7.5 6 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 7.5h8.5a3 3 0 013 3V12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ChevronDown({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={`conv-chevron ${expanded ? 'conv-chevron--expanded' : ''}`}
    >
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ----- Constants -----

const TRIAGE_ORDER: Record<TriageCategory, number> = {
  urgent: 0,
  important: 1,
  fyi: 2,
  automated: 3,
}

// ----- Props -----

interface MailboxMessageListProps {
  messages: PrioritizedMessage[]
  loading: boolean
  error: string | null
  selectedMessageId?: string | null
  onSelectMessage?: (message: PrioritizedMessage) => void
  onDismiss: (messageId: string) => void
  onMarkAsRead?: (messageId: string) => Promise<void>
}

// ----- Main Component -----

export function MailboxMessageList({
  messages,
  loading,
  error,
  selectedMessageId,
  onSelectMessage,
  onDismiss,
  onMarkAsRead,
}: MailboxMessageListProps) {
  const feedRef = useRef<HTMLDivElement>(null)
  const [expandedThread, setExpandedThread] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)

  // Sort: triage category first, then recency
  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const catA = a.triageCategoryOverride || a.triageCategory || 'fyi'
      const catB = b.triageCategoryOverride || b.triageCategory || 'fyi'
      const orderDiff = TRIAGE_ORDER[catA] - TRIAGE_ORDER[catB]
      if (orderDiff !== 0) return orderDiff
      return b.receivedAtMs - a.receivedAtMs
    })
  }, [messages])

  // Group into conversations (threads)
  const threads = useMemo(() => groupByThread(sortedMessages), [sortedMessages])

  // Accordion toggle — only one thread expanded at a time
  const toggleThread = useCallback((threadKey: string) => {
    setExpandedThread((prev) => (prev === threadKey ? null : threadKey))
  }, [])

  // Mark latest message as read when expanding
  const handleToggle = useCallback(
    (thread: MessageThread) => {
      toggleThread(thread.threadKey)
      if (thread.unreadCount > 0 && onMarkAsRead) {
        void onMarkAsRead(thread.latestMessage.messageId)
      }
    },
    [toggleThread, onMarkAsRead]
  )

  // Scroll focused item into view
  useEffect(() => {
    if (feedRef.current && focusedIndex >= 0) {
      const items = feedRef.current.querySelectorAll('[data-conv-row]')
      const item = items[focusedIndex] as HTMLElement | undefined
      item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [focusedIndex])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (threads.length === 0) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setFocusedIndex((i) => Math.min(i + 1, threads.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setFocusedIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (threads[focusedIndex]) handleToggle(threads[focusedIndex])
          break
        case 'e': {
          e.preventDefault()
          const thread = threads[focusedIndex]
          if (thread) {
            void onDismiss(thread.latestMessage.messageId)
            setFocusedIndex((i) => Math.min(i, threads.length - 2))
          }
          break
        }
        case 'r': {
          e.preventDefault()
          const thread = threads[focusedIndex]
          if (thread && onSelectMessage) onSelectMessage(thread.latestMessage)
          break
        }
      }
    },
    [threads, focusedIndex, handleToggle, onDismiss, onSelectMessage]
  )

  if (loading && messages.length === 0) {
    return (
      <div className="conv-feed">
        <div className="conv-feed__loading">Loading messages...</div>
      </div>
    )
  }

  if (error && messages.length === 0) {
    return (
      <div className="conv-feed">
        <div className="conv-feed__error">
          <p>Failed to load messages</p>
          <p className="conv-feed__error-detail">{error}</p>
        </div>
      </div>
    )
  }

  if (sortedMessages.length === 0) {
    return (
      <div className="conv-feed">
        <div className="conv-feed__empty">No messages to show</div>
      </div>
    )
  }

  return (
    <div className="conv-feed">
      <div className="conv-feed__summary">
        {threads.length} conversation{threads.length !== 1 ? 's' : ''}
        <span className="conv-feed__msg-count">
          {' '}({sortedMessages.length} message{sortedMessages.length !== 1 ? 's' : ''})
        </span>
      </div>

      <div
        ref={feedRef}
        className="conv-feed__list"
        role="list"
        aria-label="Conversations"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {threads.map((thread, index) => (
          <ConversationRow
            key={thread.threadKey}
            thread={thread}
            isExpanded={expandedThread === thread.threadKey}
            isFocused={index === focusedIndex}
            isSelected={selectedMessageId === thread.latestMessage.messageId}
            onToggle={() => handleToggle(thread)}
            onSelect={onSelectMessage}
            onDismiss={onDismiss}
            onSelectForReply={onSelectMessage}
          />
        ))}
      </div>
    </div>
  )
}

// ----- ConversationRow -----

interface ConversationRowProps {
  thread: MessageThread
  isExpanded: boolean
  isFocused: boolean
  isSelected: boolean
  onToggle: () => void
  onSelect?: (message: PrioritizedMessage) => void
  onDismiss: (messageId: string) => void
  onSelectForReply?: (message: PrioritizedMessage) => void
}

function ConversationRow({
  thread,
  isExpanded,
  isFocused,
  isSelected,
  onToggle,
  onSelect,
  onDismiss,
  onSelectForReply,
}: ConversationRowProps) {
  const latest = thread.latestMessage
  const triageCategory = latest.triageCategoryOverride || latest.triageCategory
  const timeAgo = formatDistanceToNow(new Date(thread.latestTimestamp), { addSuffix: true })
  const hasMultiple = thread.messages.length > 1

  return (
    <div
      className={[
        'conv-row',
        isExpanded && 'conv-row--expanded',
        isFocused && 'conv-row--focused',
        isSelected && 'conv-row--selected',
        triageCategory === 'urgent' && 'conv-row--urgent',
        latest.requiresFollowUp && 'conv-row--action-required',
        thread.unreadCount > 0 && 'conv-row--unread',
      ]
        .filter(Boolean)
        .join(' ')}
      data-conv-row
      role="listitem"
    >
      {/* Clickable header area */}
      <div className="conv-row__clickable" onClick={() => onSelect?.(latest)} role="button" tabIndex={-1}>
        {/* Top row: participants + meta */}
        <div className="conv-row__header">
          <div className="conv-row__participants">
            <div className="conv-row__source">
              <SourceIcon source={latest.source} />
            </div>
            <span className="conv-row__sender">{thread.sender}</span>
            {hasMultiple && (
              <span className="conv-row__count">{thread.messages.length}</span>
            )}
            {thread.unreadCount > 0 && (
              <span className="conv-row__unread-dot" />
            )}
          </div>
          <div className="conv-row__meta">
            {triageCategory && triageCategory !== 'fyi' && triageCategory !== 'automated' && (
              <span className={`conv-row__triage conv-row__triage--${triageCategory}`}>
                {TRIAGE_LABELS[triageCategory]}
              </span>
            )}
            {latest.requiresFollowUp && (
              <span className="conv-row__action-badge">Action</span>
            )}
            <span className="conv-row__time">{timeAgo}</span>
          </div>
        </div>

        {/* Subject */}
        {thread.subject && (
          <div className="conv-row__subject">{thread.subject}</div>
        )}

        {/* AI Summary — PRIMARY ELEMENT */}
        <div className="conv-row__summary">{latest.aiSummary}</div>

        {/* Last message preview — TRUST LAYER */}
        <div className="conv-row__preview">
          <span className="conv-row__preview-sender">{latest.sender}:</span>
          <span className="conv-row__preview-text">{latest.snippet}</span>
        </div>
      </div>

      {/* Inline actions */}
      <div className="conv-row__actions">
        {onSelectForReply && (
          <button
            type="button"
            className="conv-row__action-btn conv-row__action-btn--reply"
            onClick={(e) => { e.stopPropagation(); onSelectForReply(latest) }}
            aria-label={`Reply to ${thread.sender}`}
          >
            <ReplyIcon />
            <span>Reply</span>
          </button>
        )}
        <button
          type="button"
          className="conv-row__action-btn conv-row__action-btn--archive"
          onClick={(e) => { e.stopPropagation(); void onDismiss(latest.messageId) }}
          aria-label={`Archive conversation with ${thread.sender}`}
        >
          <ArchiveIcon />
          <span>Done</span>
        </button>
        {hasMultiple && (
          <button
            type="button"
            className="conv-row__action-btn conv-row__action-btn--expand"
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            aria-label={isExpanded ? 'Collapse thread' : 'Expand thread'}
          >
            <ChevronDown expanded={isExpanded} />
            <span>{isExpanded ? 'Collapse' : `${thread.messages.length} messages`}</span>
          </button>
        )}
      </div>

      {/* Expanded thread view */}
      {isExpanded && (
        <div className="conv-row__thread">
          <div className="conv-row__thread-divider" />
          {[...thread.messages].reverse().map((msg) => (
            <ThreadMessage key={msg.messageId} message={msg} />
          ))}
        </div>
      )}
    </div>
  )
}

// ----- ThreadMessage (individual message within expanded thread) -----

function ThreadMessage({ message }: { message: PrioritizedMessage }) {
  const { body: fullBody, loading: bodyLoading } = useMailboxMessageBody(
    message.messageId,
    message.accountId,
    message.source
  )
  const timeAgo = formatDistanceToNow(new Date(message.receivedAtMs), { addSuffix: true })

  return (
    <div className="thread-msg">
      <div className="thread-msg__header">
        <div className="thread-msg__source">
          <SourceIcon source={message.source} />
        </div>
        <span className="thread-msg__sender">{message.sender}</span>
        <span className="thread-msg__time">{timeAgo}</span>
      </div>
      <div className="thread-msg__body">
        {bodyLoading ? (
          <span className="thread-msg__loading">Loading message...</span>
        ) : (
          <div className="thread-msg__text">{fullBody || message.snippet}</div>
        )}
      </div>
    </div>
  )
}
