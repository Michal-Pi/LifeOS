/**
 * MailboxMessageDetail Component
 *
 * Right panel of the Mailbox page. Shows the full message content,
 * AI summary, thread context, and action buttons (reply, dismiss, open original).
 */

import { formatDistanceToNow, format } from 'date-fns'
import type { PrioritizedMessage, MessageSource } from '@lifeos/agents'
import '@/styles/components/MailboxMessageDetail.css'

interface MailboxMessageDetailProps {
  message: PrioritizedMessage
  onDismiss: (messageId: string) => void
  onReply: (message: PrioritizedMessage) => void
}

const SOURCE_LABELS: Record<MessageSource, string> = {
  gmail: 'Gmail',
  slack: 'Slack',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
}

const SOURCE_ICONS: Record<MessageSource, string> = {
  gmail: '@',
  slack: '#',
  linkedin: 'in',
  whatsapp: 'W',
  telegram: 'T',
}

export function MailboxMessageDetail({ message, onDismiss, onReply }: MailboxMessageDetailProps) {
  const timeAgo = formatDistanceToNow(new Date(message.receivedAtMs), { addSuffix: true })
  const fullDate = format(new Date(message.receivedAtMs), 'PPpp')

  return (
    <div className="mailbox-detail">
      {/* Header */}
      <div className="mailbox-detail__header">
        <div className="mailbox-detail__header-top">
          <div className={`mailbox-detail__source mailbox-detail__source--${message.source}`}>
            <span className="mailbox-detail__source-icon">{SOURCE_ICONS[message.source]}</span>
            <span className="mailbox-detail__source-label">{SOURCE_LABELS[message.source]}</span>
          </div>
          <span
            className={`mailbox-detail__priority mailbox-detail__priority--${message.priority}`}
          >
            {message.priority}
          </span>
          {message.importanceScore != null && (
            <span className="mailbox-detail__score">Score: {message.importanceScore}</span>
          )}
        </div>

        <div className="mailbox-detail__sender-row">
          <span className="mailbox-detail__sender">{message.sender}</span>
          {message.senderEmail && (
            <span className="mailbox-detail__sender-email">{message.senderEmail}</span>
          )}
        </div>

        {message.subject && <h2 className="mailbox-detail__subject">{message.subject}</h2>}

        <div className="mailbox-detail__time">
          <span title={fullDate}>{timeAgo}</span>
          <span className="mailbox-detail__full-date">{fullDate}</span>
        </div>
      </div>

      {/* AI Summary */}
      <div className="mailbox-detail__ai-section">
        <div className="mailbox-detail__ai-label">AI Summary</div>
        <p className="mailbox-detail__ai-summary">{message.aiSummary}</p>
        {message.requiresFollowUp && message.followUpReason && (
          <div className="mailbox-detail__followup">
            <span className="mailbox-detail__followup-label">Follow-up needed:</span>
            <span className="mailbox-detail__followup-reason">{message.followUpReason}</span>
          </div>
        )}
      </div>

      {/* Message content (snippet) */}
      <div className="mailbox-detail__body">
        <p className="mailbox-detail__snippet">{message.snippet}</p>
      </div>

      {/* Actions bar */}
      <div className="mailbox-detail__actions">
        <button type="button" className="primary-button small" onClick={() => onReply(message)}>
          Reply
        </button>
        {message.originalUrl && (
          <a
            href={message.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ghost-button small"
          >
            Open Original
          </a>
        )}
        <button
          type="button"
          className="ghost-button small"
          onClick={() => void onDismiss(message.messageId)}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
