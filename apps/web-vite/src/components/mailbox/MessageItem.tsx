/**
 * MessageItem Component
 *
 * Displays a single prioritized message in the mailbox.
 * Shows source icon, sender, AI summary, triage badge, and dismiss button.
 */

import { useCallback } from 'react'
import type { PrioritizedMessage, PrioritizedMessageId } from '@lifeos/agents'
import { TRIAGE_LABELS } from '@lifeos/agents'
import { formatDistanceToNow } from 'date-fns'

interface MessageItemProps {
  message: PrioritizedMessage
  onDismiss: (messageId: PrioritizedMessageId | string) => Promise<void>
  onMarkAsRead?: (messageId: PrioritizedMessageId | string) => Promise<void>
}

const sourceIcons: Record<string, string> = {
  slack: '#',
  gmail: '@',
}

export function MessageItem({ message, onDismiss, onMarkAsRead }: MessageItemProps) {
  const handleDismiss = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      await onDismiss(message.messageId)
    },
    [message.messageId, onDismiss]
  )

  const handleClick = useCallback(async () => {
    if (onMarkAsRead && !message.isRead) {
      await onMarkAsRead(message.messageId)
    }
    if (message.originalUrl) {
      window.open(message.originalUrl, '_blank', 'noopener,noreferrer')
    }
  }, [message.messageId, message.originalUrl, message.isRead, onMarkAsRead])

  const timeAgo = formatDistanceToNow(new Date(message.receivedAtMs), { addSuffix: true })
  const sourceIcon = sourceIcons[message.source] ?? '>'

  return (
    <div
      className={`message-item ${message.isRead ? 'message-item--read' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          void handleClick()
        }
      }}
    >
      <div className={`message-item-source message-item-source--${message.source}`}>
        <span className="source-icon" title={message.source === 'slack' ? 'Slack' : 'Gmail'}>
          {sourceIcon}
        </span>
      </div>
      <div className="message-item-content">
        <div className="message-item-header">
          <span className="message-sender">
            {message.sender}
            {message.contactId && (
              <a
                className="message-contact-dot"
                href={`/people?contactId=${message.contactId}`}
                title="Linked contact"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </span>
          {message.subject && <span className="message-subject">{message.subject}</span>}
          <span className="message-time">{timeAgo}</span>
        </div>
        <p className="message-summary">{message.aiSummary}</p>
        {message.requiresFollowUp && message.followUpReason && (
          <p className="message-followup-reason">{message.followUpReason}</p>
        )}
      </div>
      <div className="message-item-actions">
        {(() => {
          const triageCategory = message.triageCategoryOverride || message.triageCategory
          if (triageCategory) {
            return (
              <span className={`triage-badge triage-badge--${triageCategory}`}>
                {TRIAGE_LABELS[triageCategory]}
              </span>
            )
          }
          return null
        })()}
        <button
          type="button"
          className="message-dismiss-btn"
          onClick={handleDismiss}
          aria-label="Dismiss message"
        >
          ×
        </button>
      </div>
    </div>
  )
}
