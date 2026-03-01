/**
 * MailboxOutboxDetail Component
 *
 * Read-only detail view for a selected outbox item.
 * Shows message content, status, and retry button for failed items.
 * Follows the same layout as MailboxMessageDetail.
 */

import { format, formatDistanceToNow } from 'date-fns'
import type { MailboxSendOp } from '@/outbox/mailboxOutbox'
import '@/styles/components/MailboxMessageDetail.css'

const SOURCE_LABELS: Record<string, string> = {
  gmail: 'Gmail',
  slack: 'Slack',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  applying: 'Sending...',
  failed: 'Failed',
  applied: 'Sent',
}

interface MailboxOutboxDetailProps {
  item: MailboxSendOp
  onRetry?: (opId: string) => void
}

export function MailboxOutboxDetail({ item, onRetry }: MailboxOutboxDetailProps) {
  const timeAgo = formatDistanceToNow(new Date(item.createdAtMs), { addSuffix: true })
  const fullDate = format(new Date(item.createdAtMs), 'PPpp')

  return (
    <div className="mailbox-detail">
      {/* Header */}
      <div className="mailbox-detail__header">
        <div className="mailbox-detail__header-top">
          <div className={`mailbox-detail__source mailbox-detail__source--${item.source}`}>
            <span className="mailbox-detail__source-label">{SOURCE_LABELS[item.source]}</span>
          </div>
          <span className={`folder-row__status folder-row__status--${item.status}`}>
            {STATUS_LABELS[item.status]}
          </span>
        </div>

        <div className="mailbox-detail__sender-row">
          <span className="mailbox-detail__sender">
            To: {item.recipientName || item.recipientId}
          </span>
        </div>

        {item.subject && <h2 className="mailbox-detail__subject">{item.subject}</h2>}

        <div className="mailbox-detail__time">
          <span title={fullDate}>{timeAgo}</span>
          <span className="mailbox-detail__full-date">{fullDate}</span>
        </div>

        {item.attempts > 0 && (
          <div className="mailbox-detail__time">
            <span>Attempts: {item.attempts}/{item.maxAttempts}</span>
          </div>
        )}
      </div>

      {/* Message body */}
      <details className="mailbox-detail__collapsible" open>
        <summary className="mailbox-detail__collapsible-header">
          <span>Message</span>
        </summary>
        <div className="mailbox-detail__collapsible-body">
          <pre className="mailbox-detail__full-body">{item.body}</pre>
        </div>
      </details>

      {/* Error details */}
      {item.status === 'failed' && item.lastError && (
        <div className="mailbox-detail__composer-error">
          {item.lastError.message}
        </div>
      )}

      {/* Actions */}
      <div className="mailbox-detail__actions">
        {item.status === 'failed' && onRetry && (
          <button
            type="button"
            className="primary-button small"
            onClick={() => void onRetry(item.opId)}
          >
            Retry
          </button>
        )}
        {(item.status === 'pending' || item.status === 'applying') && (
          <span className="mailbox-detail__composer-error" style={{ color: 'var(--text-tertiary)' }}>
            This message is queued and will be sent automatically.
          </span>
        )}
        {item.status === 'applied' && (
          <span className="mailbox-detail__composer-error" style={{ color: 'var(--success-color, #22c55e)' }}>
            This message was sent successfully.
          </span>
        )}
      </div>
    </div>
  )
}
