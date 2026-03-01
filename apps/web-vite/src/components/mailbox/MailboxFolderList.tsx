/**
 * MailboxFolderList Component
 *
 * Unified list view for Drafts and Outbox folders.
 * Reuses the conv-feed/conv-row visual pattern from MailboxMessageList.
 */

import { useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { DraftMessage, MessageSource } from '@lifeos/agents'
import type { MailboxSendOp } from '@/outbox/mailboxOutbox'
import '@/styles/components/MailboxMessageList.css'

// ----- Source icon (mirrors MailboxMessageList) -----

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

// ----- Status badges -----

const OUTBOX_STATUS_LABELS: Record<string, string> = {
  pending: 'Sending',
  applying: 'Sending',
  failed: 'Failed',
  applied: 'Sent',
}

const OUTBOX_STATUS_CLASS: Record<string, string> = {
  pending: 'folder-row__status--pending',
  applying: 'folder-row__status--pending',
  failed: 'folder-row__status--failed',
  applied: 'folder-row__status--sent',
}

// ----- Props -----

interface MailboxFolderListProps {
  folder: 'drafts' | 'outbox'
  drafts?: DraftMessage[]
  outboxItems?: MailboxSendOp[]
  loading: boolean
  selectedId?: string | null
  onSelectDraft?: (draft: DraftMessage) => void
  onSelectOutboxItem?: (item: MailboxSendOp) => void
  onDeleteDraft?: (draftId: string) => void
  onRetryOutbox?: (opId: string) => void
}

export function MailboxFolderList({
  folder,
  drafts = [],
  outboxItems = [],
  loading,
  selectedId,
  onSelectDraft,
  onSelectOutboxItem,
  onDeleteDraft,
  onRetryOutbox,
}: MailboxFolderListProps) {
  const items = useMemo(() => {
    if (folder === 'drafts') {
      return drafts.map((d) => ({
        id: d.draftId,
        source: d.source,
        recipient: d.recipientName || d.recipientId || 'No recipient',
        subject: d.subject || '',
        preview: d.body.slice(0, 200),
        timestamp: d.updatedAtMs,
        status: 'draft' as const,
        original: d,
      }))
    }
    return outboxItems.map((op) => ({
      id: op.opId,
      source: op.source,
      recipient: op.recipientName || op.recipientId,
      subject: op.subject || '',
      preview: op.body.slice(0, 200),
      timestamp: op.createdAtMs,
      status: op.status,
      lastError: op.lastError?.message,
      original: op,
    }))
  }, [folder, drafts, outboxItems])

  const folderLabel = folder === 'drafts' ? 'Drafts' : 'Outbox'

  if (loading && items.length === 0) {
    return (
      <div className="conv-feed">
        <div className="conv-feed__loading">Loading {folderLabel.toLowerCase()}...</div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="conv-feed">
        <div className="conv-feed__empty">
          {folder === 'drafts' ? 'No saved drafts' : 'Outbox is empty'}
        </div>
      </div>
    )
  }

  return (
    <div className="conv-feed">
      <div className="conv-feed__summary">
        {items.length} {folderLabel.toLowerCase()}
      </div>

      <div className="conv-feed__list" role="list" aria-label={folderLabel}>
        {items.map((item) => (
          <div
            key={item.id}
            className={`conv-row ${selectedId === item.id ? 'conv-row--selected' : ''}`}
            role="listitem"
          >
            <div
              className="conv-row__clickable"
              onClick={() => {
                if (folder === 'drafts' && onSelectDraft) {
                  onSelectDraft(item.original as DraftMessage)
                } else if (folder === 'outbox' && onSelectOutboxItem) {
                  onSelectOutboxItem(item.original as MailboxSendOp)
                }
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (folder === 'drafts' && onSelectDraft) {
                    onSelectDraft(item.original as DraftMessage)
                  } else if (folder === 'outbox' && onSelectOutboxItem) {
                    onSelectOutboxItem(item.original as MailboxSendOp)
                  }
                }
              }}
            >
              {/* Header */}
              <div className="conv-row__header">
                <div className="conv-row__participants">
                  <div className="conv-row__source">
                    <SourceIcon source={item.source} />
                  </div>
                  <span className="conv-row__sender">
                    {folder === 'drafts' ? 'Draft' : 'To'}: {item.recipient}
                  </span>
                </div>
                <div className="conv-row__meta">
                  {folder === 'outbox' && item.status !== 'draft' && (
                    <span className={`folder-row__status ${OUTBOX_STATUS_CLASS[item.status] || ''}`}>
                      {OUTBOX_STATUS_LABELS[item.status] || item.status}
                    </span>
                  )}
                  <span className="conv-row__time">
                    {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                  </span>
                </div>
              </div>

              {/* Subject */}
              {item.subject && (
                <div className="conv-row__subject">{item.subject}</div>
              )}

              {/* Body preview */}
              <div className="conv-row__summary">{item.preview || 'Empty draft'}</div>

              {/* Error message for failed outbox items */}
              {item.status === 'failed' && 'lastError' in item && item.lastError && (
                <div className="conv-row__preview">
                  <span className="conv-row__preview-sender">Error:</span>
                  <span className="conv-row__preview-text">{item.lastError}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="conv-row__actions" style={{ opacity: 1 }}>
              {folder === 'drafts' && onDeleteDraft && (
                <button
                  type="button"
                  className="conv-row__action-btn conv-row__action-btn--archive"
                  onClick={(e) => {
                    e.stopPropagation()
                    void onDeleteDraft(item.id)
                  }}
                  aria-label="Delete draft"
                >
                  <span>Delete</span>
                </button>
              )}
              {folder === 'outbox' && item.status === 'failed' && onRetryOutbox && (
                <button
                  type="button"
                  className="conv-row__action-btn conv-row__action-btn--reply"
                  onClick={(e) => {
                    e.stopPropagation()
                    void onRetryOutbox(item.id)
                  }}
                  aria-label="Retry sending"
                >
                  <span>Retry</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
