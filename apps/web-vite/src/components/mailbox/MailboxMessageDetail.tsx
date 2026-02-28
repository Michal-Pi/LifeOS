/**
 * MailboxMessageDetail Component
 *
 * Right panel of the Mailbox page. Shows the full message content,
 * AI summary, thread context, draft reply with tone selection,
 * extracted action items, and action buttons (reply, dismiss, open original).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import type { PrioritizedMessage, MessageSource, TriageCategory } from '@lifeos/agents'
import { TRIAGE_LABELS } from '@lifeos/agents'
import {
  generateContextualDraft,
  extractActionItems,
  type DraftReplyTone,
  type DraftReplyResult,
  type ExtractedAction,
} from '@/lib/mailboxAITools'
import '@/styles/components/MailboxMessageDetail.css'

interface MailboxMessageDetailProps {
  message: PrioritizedMessage
  onDismiss: (messageId: string) => void
  onReply: (message: PrioritizedMessage) => void
  onOverrideTriage?: (messageId: string, category: TriageCategory) => Promise<void>
  onOpenComposerWithDraft?: (draft: {
    inReplyTo: string
    threadId?: string
    recipientId: string
    recipientName: string
    subject: string
    body: string
    source: MessageSource
  }) => void
  onCreateTask?: (data: {
    title: string
    dueDate?: string
    description: string
    sourceMessageId: string
  }) => void
  onCreateEvent?: (data: { title: string; description?: string }) => void
  onSetFollowUp?: (contactId: string, dueDate?: string) => void
  onEditContact?: (contactId: string, details?: string) => void
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

const TRIAGE_OPTIONS: Array<{ value: TriageCategory; label: string }> = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'important', label: 'Important' },
  { value: 'fyi', label: 'FYI' },
  { value: 'automated', label: 'Auto' },
]

const ACTION_TYPE_LABELS: Record<ExtractedAction['type'], string> = {
  task: 'Task',
  event: 'Event',
  contact_update: 'Update',
  follow_up: 'Follow-up',
}

export function MailboxMessageDetail({
  message,
  onDismiss,
  onReply,
  onOverrideTriage,
  onOpenComposerWithDraft,
  onCreateTask,
  onCreateEvent,
  onSetFollowUp,
  onEditContact,
}: MailboxMessageDetailProps) {
  const timeAgo = formatDistanceToNow(new Date(message.receivedAtMs), { addSuffix: true })
  const fullDate = format(new Date(message.receivedAtMs), 'PPpp')

  // Draft reply state
  const [generating, setGenerating] = useState(false)
  const [draftResult, setDraftResult] = useState<DraftReplyResult | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [selectedTone, setSelectedTone] = useState<DraftReplyTone>('professional')

  // Action extraction state with cache
  const [actions, setActions] = useState<ExtractedAction[]>([])
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const actionsCache = useRef<Map<string, ExtractedAction[]>>(new Map())

  // Reset state when message changes
  useEffect(() => {
    setDraftResult(null)
    setDraftError(null)
    setGenerating(false)

    // Use cached actions if available
    const cached = actionsCache.current.get(message.messageId)
    if (cached) {
      setActions(cached)
      setExtracting(false)
      setExtractError(null)
      return
    }

    // Extract actions for new message
    setActions([])
    setExtractError(null)
    setExtracting(true)
    let cancelled = false

    void extractActionItems(message.messageId)
      .then((result) => {
        if (!cancelled) {
          setActions(result.data)
          actionsCache.current.set(message.messageId, result.data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExtractError('Failed to extract actions')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setExtracting(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [message.messageId])

  const handleGenerateDraft = useCallback(
    async (tone: DraftReplyTone) => {
      setSelectedTone(tone)
      setGenerating(true)
      setDraftError(null)
      try {
        const result = await generateContextualDraft({
          messageId: message.messageId,
          tone,
        })
        setDraftResult(result.data)

        // Auto-open composer if handler is provided
        if (onOpenComposerWithDraft && result.data) {
          onOpenComposerWithDraft({
            inReplyTo: message.messageId,
            threadId: message.threadId,
            recipientId: message.senderEmail || message.sender,
            recipientName: message.sender,
            subject: result.data.subject,
            body: result.data.body,
            source: message.source,
          })
        }
      } catch {
        setDraftError('Failed to generate draft. Click a tone to retry.')
      } finally {
        setGenerating(false)
      }
    },
    [message, onOpenComposerWithDraft]
  )

  const handleRetryExtract = useCallback(() => {
    setExtractError(null)
    setExtracting(true)

    void extractActionItems(message.messageId)
      .then((result) => {
        setActions(result.data)
        actionsCache.current.set(message.messageId, result.data)
      })
      .catch(() => {
        setExtractError('Failed to extract actions')
      })
      .finally(() => {
        setExtracting(false)
      })
  }, [message.messageId])

  const handleCreateAction = useCallback(
    (action: ExtractedAction) => {
      switch (action.type) {
        case 'task':
          onCreateTask?.({
            title: action.title,
            dueDate: action.dueDate,
            description: `From message: ${message.subject}\nSender: ${message.sender}`,
            sourceMessageId: message.messageId,
          })
          break
        case 'event':
          onCreateEvent?.({
            title: action.title,
            description: action.details,
          })
          break
        case 'follow_up':
          if (message.contactId) {
            onSetFollowUp?.(message.contactId, action.dueDate)
          }
          break
        case 'contact_update':
          if (message.contactId) {
            onEditContact?.(message.contactId, action.details)
          }
          break
      }
    },
    [message, onCreateTask, onCreateEvent, onSetFollowUp, onEditContact]
  )

  const triageCategory = message.triageCategoryOverride || message.triageCategory

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
          {triageCategory && (
            <span className={`triage-badge triage-badge--${triageCategory}`}>
              {TRIAGE_LABELS[triageCategory]}
            </span>
          )}
          {message.importanceScore != null && (
            <span className="mailbox-detail__score">Score: {message.importanceScore}</span>
          )}
        </div>

        {/* Triage override selector */}
        {onOverrideTriage && (
          <div className="mailbox-detail__triage-override">
            <span className="mailbox-detail__triage-label">Triage:</span>
            {TRIAGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`mailbox-detail__triage-btn ${triageCategory === opt.value ? 'mailbox-detail__triage-btn--active' : ''}`}
                onClick={() => void onOverrideTriage(message.messageId, opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

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

      {/* Draft Reply section */}
      <div className="draft-reply-actions">
        <span className="draft-reply-label">Draft Reply</span>
        <div className="draft-reply-tones">
          {(['professional', 'friendly', 'brief'] as const).map((tone) => (
            <button
              key={tone}
              type="button"
              className={`tone-button ${selectedTone === tone && draftResult ? 'tone-button--active' : ''}`}
              onClick={() => void handleGenerateDraft(tone)}
              disabled={generating}
            >
              {tone.charAt(0).toUpperCase() + tone.slice(1)}
            </button>
          ))}
        </div>
        {generating && <span className="draft-reply-generating">Generating...</span>}
        {draftError && !generating && <span className="draft-reply-error">{draftError}</span>}
        {draftResult && !generating && (
          <div className="draft-reply-preview">
            {draftResult.subject && (
              <div className="draft-reply-preview__subject">
                <strong>Subject:</strong> {draftResult.subject}
              </div>
            )}
            <p className="draft-reply-preview__body">{draftResult.body}</p>
            {draftResult.suggestedFollowUp && (
              <p className="draft-reply-preview__followup">
                Suggested follow-up: {draftResult.suggestedFollowUp}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Extracted Actions panel */}
      {extracting && (
        <div className="action-panel">
          <span className="action-panel__loading">Extracting actions...</span>
        </div>
      )}
      {extractError && !extracting && (
        <div className="action-panel">
          <span className="action-panel__error">{extractError}</span>
          <button type="button" className="ghost-button small" onClick={handleRetryExtract}>
            Retry
          </button>
        </div>
      )}
      {actions.length > 0 && !extracting && (
        <div className="action-panel">
          <h4 className="action-panel__title">Extracted Actions</h4>
          {actions.map((action, i) => (
            <div key={i} className="action-item">
              <div className="action-item__header">
                <span className={`action-item__type action-item__type--${action.type}`}>
                  {ACTION_TYPE_LABELS[action.type]}
                </span>
                <span className="action-item__title">{action.title}</span>
              </div>
              {action.details && <p className="action-item__details">{action.details}</p>}
              <button
                type="button"
                className="action-item__create"
                onClick={() => handleCreateAction(action)}
              >
                Create
              </button>
            </div>
          ))}
        </div>
      )}

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
