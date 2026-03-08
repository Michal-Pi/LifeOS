/**
 * MailboxMessageDetail Component
 *
 * Inline reply view for the Mailbox detail panel. Layout from top to bottom:
 * 1. TipTap toolbar (sticky) — controls the reply editor
 * 2. Message metadata (source, triage, sender, subject, time)
 * 3. AI Summary — collapsible
 * 4. Message body — collapsible
 * 5. Reply mode toggle (Reply / Reply All) + editable recipient chips
 * 6. Reply editor — inline TipTap, populated by AI draft or typed manually
 * 7. Action buttons — Send Reply, Save Draft, Open Original, Extract Actions, Archive
 *
 * IMPORTANT: Render with key={message.messageId} so useMailboxComposer re-initializes per message.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { formatDistanceToNow, format } from 'date-fns'
import { EditorContent } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import type { PrioritizedMessage, MessageSource, TriageCategory } from '@lifeos/agents'
import { TRIAGE_LABELS } from '@lifeos/agents'
import {
  generateContextualDraft,
  extractActionItems,
  type DraftReplyTone,
  type ExtractedAction,
} from '@/lib/mailboxAITools'
import { TipTapMenuBar } from '@/components/editor/TipTapMenuBar'
import { useMailboxMessageBody } from '@/hooks/useMailboxMessageBody'
import { useMailboxReplyEditor } from '@/hooks/useMailboxReplyEditor'
import { useMailboxComposer } from '@/hooks/useMailboxComposer'
import { RecipientChipInput } from '@/components/mailbox/RecipientChipInput'
import { formatRecipientSummary } from '@/components/mailbox/recipientUtils'
import { SegmentedControl } from '@/components/SegmentedControl'
import '@/styles/components/MailboxMessageDetail.css'

interface MailboxMessageDetailProps {
  message: PrioritizedMessage
  threadMessages?: PrioritizedMessage[]
  onDismiss: (messageId: string) => void
  onReplySent?: (messageId: string) => void
  onOverrideTriage?: (messageId: string, category: TriageCategory) => Promise<void>
  onCreateTask?: (data: {
    title: string
    dueDate?: string
    description: string
    sourceMessageId: string
  }) => void
  onCreateEvent?: (data: { title: string; description?: string }) => void
  onSetFollowUp?: (contactId: string, dueDate?: string) => void
  onEditContact?: (contactId: string, details?: string) => void
  gmailLabels?: Array<{ id: string; name: string }>
  onLabelMessage?: (messageId: string, addLabels?: string[], removeLabels?: string[]) => Promise<void>
  onArchiveMessage?: (messageId: string) => Promise<void>
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
  threadMessages,
  onDismiss,
  onReplySent,
  onOverrideTriage,
  onCreateTask,
  onCreateEvent,
  onSetFollowUp,
  onEditContact,
  gmailLabels,
  onLabelMessage,
  onArchiveMessage,
}: MailboxMessageDetailProps) {
  const timeAgo = formatDistanceToNow(new Date(message.receivedAtMs), { addSuffix: true })
  const fullDate = format(new Date(message.receivedAtMs), 'PPpp')

  // ---- Reply mode (Reply vs Reply All) ----
  const [replyAll, setReplyAll] = useState(false)
  const isEmail = message.source === 'gmail' || message.source === 'linkedin'
  const hasMultipleRecipients =
    (message.toRecipients && message.toRecipients.length > 1) ||
    (message.ccRecipients && message.ccRecipients.length > 0)

  // ---- Composer state (draft save/send) ----
  const composer = useMailboxComposer({ replyTo: message, replyAll })

  // ---- Progressive disclosure for recipients ----
  const recipientDetailsRef = useRef<HTMLDetailsElement>(null)
  const recipientSummaryText = formatRecipientSummary(composer.state.toRecipients)
  const [recipientsInitialOpen] = useState(
    () =>
      composer.state.toRecipients.length === 0 ||
      composer.state.ccRecipients.length > 0 ||
      composer.state.bccRecipients.length > 0
  )

  // Force-open when CC/BCC become populated (e.g. Reply All switch)
  useEffect(() => {
    if (
      (composer.state.ccRecipients.length > 0 || composer.state.bccRecipients.length > 0) &&
      recipientDetailsRef.current &&
      !recipientDetailsRef.current.open
    ) {
      recipientDetailsRef.current.open = true
    }
  }, [composer.state.ccRecipients.length, composer.state.bccRecipients.length])

  // ---- Reply editor ----
  const handleEditorChange = useCallback(
    (_json: JSONContent, text: string) => {
      composer.setBody(text)
    },
    [composer]
  )

  const { editor, setContent, clearContent } = useMailboxReplyEditor({
    onChange: handleEditorChange,
  })

  // ---- Message body ----
  const {
    body: fullBody,
    loading: bodyLoading,
    error: bodyError,
    retry: retryBody,
  } = useMailboxMessageBody(message.messageId, message.accountId, message.source)

  // ---- AI draft generation ----
  const [generating, setGenerating] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [selectedTone, setSelectedTone] = useState<DraftReplyTone>('professional')

  const handleGenerateDraft = useCallback(async () => {
    setGenerating(true)
    setDraftError(null)
    try {
      const body = fullBody || message.snippet
      if (!body) {
        setDraftError('Message body not available yet. Please wait for it to load.')
        return
      }
      const currentText = composer.state.body.trim()
      const result = await generateContextualDraft({
        messageId: message.messageId,
        messageBody: body,
        senderName: message.sender,
        tone: selectedTone,
        userInstructions: currentText || undefined,
        messageSource: message.source,
      })

      if (result.data?.body) {
        const escapeHtml = (s: string) =>
          s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
        const htmlContent = result.data.body
          .split('\n')
          .map((line: string) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<p><br></p>'))
          .join('')
        setContent(htmlContent)
        composer.setBody(result.data.body)
        if (result.data.subject) {
          composer.setSubject(result.data.subject)
        }
      }
    } catch {
      setDraftError('Failed to generate draft. Try again.')
    } finally {
      setGenerating(false)
    }
  }, [message, fullBody, selectedTone, setContent, composer])

  // ---- Action extraction ----
  const [actions, setActions] = useState<ExtractedAction[]>([])
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const actionsCache = useRef<Map<string, ExtractedAction[]>>(new Map())

  const handleExtractActions = useCallback(() => {
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

  // ---- Send reply ----
  const handleSend = useCallback(async () => {
    const success = await composer.send()
    if (success) {
      clearContent()
      onReplySent?.(message.messageId)
    }
  }, [composer, clearContent, onReplySent, message.messageId])

  // ---- Label picker ----
  const [labelPickerOpen, setLabelPickerOpen] = useState(false)
  const [appliedLabels, setAppliedLabels] = useState<Set<string>>(
    () => new Set(message.gmailLabelIds ?? [])
  )
  const [labelBusy, setLabelBusy] = useState(false)

  // Reset label state when the selected message changes
  useEffect(() => {
    setAppliedLabels(new Set(message.gmailLabelIds ?? []))
    setLabelPickerOpen(false)
  }, [message.messageId, message.gmailLabelIds])

  const handleToggleLabel = useCallback(
    async (label: { id: string; name: string }) => {
      if (!onLabelMessage || labelBusy) return
      if (!message.accountId) {
        toast.error('Sync this message to your inbox before modifying labels')
        return
      }
      const isApplied = appliedLabels.has(label.id)

      setLabelBusy(true)
      try {
        if (isApplied) {
          await onLabelMessage(message.messageId, undefined, [label.name])
          setAppliedLabels((prev) => {
            const next = new Set(prev)
            next.delete(label.id)
            return next
          })
        } else {
          await onLabelMessage(message.messageId, [label.name], undefined)
          setAppliedLabels((prev) => new Set(prev).add(label.id))
        }
      } catch (err) {
        console.error('Failed to toggle label:', err)
      } finally {
        setLabelBusy(false)
      }
    },
    [onLabelMessage, appliedLabels, message.messageId, message.accountId, labelBusy]
  )

  const triageCategory = message.triageCategoryOverride || message.triageCategory

  return (
    <div className="mailbox-detail">
      {/* 1. Sticky TipTap toolbar */}
      {editor && (
        <div className="mailbox-detail__toolbar">
          <TipTapMenuBar editor={editor} />
        </div>
      )}

      {/* 2. Message metadata */}
      <div className="mailbox-detail__header">
        <div className="mailbox-detail__header-top">
          <div className={`mailbox-detail__source mailbox-detail__source--${message.source}`}>
            <span className="mailbox-detail__source-icon">{SOURCE_ICONS[message.source]}</span>
            <span className="mailbox-detail__source-label">{SOURCE_LABELS[message.source]}</span>
          </div>
          {triageCategory && (
            <span className={`triage-badge triage-badge--${triageCategory}`}>
              {TRIAGE_LABELS[triageCategory]}
            </span>
          )}
          {message.importanceScore != null && (
            <span className="mailbox-detail__score">Score: {message.importanceScore}</span>
          )}
        </div>

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

      {/* 3. AI Summary — collapsible */}
      <details className="mailbox-detail__collapsible">
        <summary className="mailbox-detail__collapsible-header">
          <span>AI Summary</span>
        </summary>
        <div className="mailbox-detail__collapsible-body">
          <p className="mailbox-detail__ai-summary">{message.aiSummary}</p>
          {message.requiresFollowUp && message.followUpReason && (
            <div className="mailbox-detail__followup">
              <span className="mailbox-detail__followup-label">Follow-up needed:</span>
              <span className="mailbox-detail__followup-reason">{message.followUpReason}</span>
            </div>
          )}
        </div>
      </details>

      {/* 4. Thread / Message body — collapsible per message */}
      {(() => {
        const threadMsgs =
          threadMessages && threadMessages.length > 1
            ? [...threadMessages].sort((a, b) => a.receivedAtMs - b.receivedAtMs)
            : null

        if (threadMsgs) {
          return (
            <div className="mailbox-detail__thread">
              {threadMsgs.map((msg) => (
                <details
                  key={msg.messageId}
                  className="mailbox-detail__collapsible"
                  open={msg.messageId === message.messageId}
                >
                  <summary className="mailbox-detail__collapsible-header">
                    <span className="mailbox-detail__thread-sender">{msg.sender}</span>
                    <span className="mailbox-detail__body-snippet">
                      {(msg.snippet || '').slice(0, 120)}
                      {(msg.snippet || '').length > 120 ? '...' : ''}
                    </span>
                  </summary>
                  <div className="mailbox-detail__collapsible-body">
                    {msg.messageId === message.messageId ? (
                      <>
                        {bodyLoading && (
                          <p className="mailbox-detail__body-loading">Loading full message...</p>
                        )}
                        {bodyError && !bodyLoading && (
                          <div className="mailbox-detail__body-error">
                            <p className="mailbox-detail__snippet">{msg.snippet}</p>
                            <button
                              type="button"
                              className="ghost-button small"
                              onClick={retryBody}
                            >
                              Load full message
                            </button>
                          </div>
                        )}
                        {!bodyLoading && !bodyError && fullBody ? (
                          <pre className="mailbox-detail__full-body">{fullBody}</pre>
                        ) : (
                          !bodyLoading &&
                          !bodyError && <p className="mailbox-detail__snippet">{msg.snippet}</p>
                        )}
                      </>
                    ) : (
                      <p className="mailbox-detail__snippet">{msg.snippet}</p>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )
        }

        // Single message (no thread)
        return (
          <details className="mailbox-detail__collapsible">
            <summary className="mailbox-detail__collapsible-header">
              <span className="mailbox-detail__thread-sender">{message.sender}</span>
              <span className="mailbox-detail__body-snippet">
                {(message.snippet || '').slice(0, 120)}
                {(message.snippet || '').length > 120 ? '...' : ''}
              </span>
            </summary>
            <div className="mailbox-detail__collapsible-body">
              {bodyLoading && (
                <p className="mailbox-detail__body-loading">Loading full message...</p>
              )}
              {bodyError && !bodyLoading && (
                <div className="mailbox-detail__body-error">
                  <p className="mailbox-detail__snippet">{message.snippet}</p>
                  <button type="button" className="ghost-button small" onClick={retryBody}>
                    Load full message
                  </button>
                </div>
              )}
              {!bodyLoading && !bodyError && fullBody ? (
                <pre className="mailbox-detail__full-body">{fullBody}</pre>
              ) : (
                !bodyLoading &&
                !bodyError && <p className="mailbox-detail__snippet">{message.snippet}</p>
              )}
            </div>
          </details>
        )
      })()}

      {/* 5. Reply mode toggle + editable recipients */}
      {isEmail && hasMultipleRecipients && (
        <div className="mailbox-detail__reply-mode">
          <button
            type="button"
            className={`mailbox-detail__reply-mode-btn ${!replyAll ? 'mailbox-detail__reply-mode-btn--active' : ''}`}
            onClick={() => setReplyAll(false)}
          >
            Reply
          </button>
          <button
            type="button"
            className={`mailbox-detail__reply-mode-btn ${replyAll ? 'mailbox-detail__reply-mode-btn--active' : ''}`}
            onClick={() => setReplyAll(true)}
          >
            Reply All
          </button>
        </div>
      )}

      {/* Editable recipient chips for reply — progressive disclosure */}
      <details
        ref={recipientDetailsRef}
        className="mailbox-detail__collapsible"
        open={recipientsInitialOpen || undefined}
      >
        <summary className="mailbox-detail__collapsible-header">
          <span>TO: {recipientSummaryText}</span>
        </summary>
        <div className="mailbox-detail__collapsible-body">
          <div className="mailbox-detail__reply-recipient-row">
            <span className="mailbox-detail__reply-recipient-label">To</span>
            <RecipientChipInput
              recipients={composer.state.toRecipients}
              onChange={composer.setToRecipients}
              channel={message.source}
              placeholder="Add recipients..."
            />
          </div>
          {isEmail && (
            <>
              <div className="mailbox-detail__reply-recipient-row">
                <span className="mailbox-detail__reply-recipient-label">CC</span>
                <RecipientChipInput
                  recipients={composer.state.ccRecipients}
                  onChange={composer.setCcRecipients}
                  channel={message.source}
                  placeholder="Add CC recipients..."
                />
              </div>
              <div className="mailbox-detail__reply-recipient-row">
                <span className="mailbox-detail__reply-recipient-label">BCC</span>
                <RecipientChipInput
                  recipients={composer.state.bccRecipients}
                  onChange={composer.setBccRecipients}
                  channel={message.source}
                  placeholder="Add BCC recipients..."
                />
              </div>
            </>
          )}
        </div>
      </details>

      {/* 6. Inline reply area */}
      <div className="mailbox-detail__reply-area">
        {editor && (
          <div className="mailbox-detail__editor-wrapper">
            <EditorContent editor={editor} />
          </div>
        )}

        <div className="draft-reply-actions">
          <SegmentedControl
            value={selectedTone}
            onChange={(v) => setSelectedTone(v as DraftReplyTone)}
            options={[
              { value: 'professional', label: 'Professional' },
              { value: 'friendly', label: 'Friendly' },
              { value: 'brief', label: 'Brief' },
            ]}
          />

          <button
            type="button"
            className="primary-button small"
            onClick={() => void handleGenerateDraft()}
            disabled={generating}
          >
            {generating ? 'Drafting...' : 'Draft Reply'}
          </button>
        </div>

        {draftError && !generating && <span className="draft-reply-error">{draftError}</span>}

        {composer.error && <div className="mailbox-detail__composer-error">{composer.error}</div>}
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
          <button type="button" className="ghost-button small" onClick={handleExtractActions}>
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

      {/* 7. Action buttons */}
      <div className="mailbox-detail__actions">
        <button
          type="button"
          className="primary-button small"
          onClick={() => void handleSend()}
          disabled={composer.isSending || !composer.state.body.trim()}
        >
          {composer.isSending ? 'Sending...' : replyAll ? 'Send Reply All' : 'Send Reply'}
        </button>
        <button
          type="button"
          className="ghost-button small"
          onClick={() => void composer.saveDraft()}
          disabled={composer.isSaving}
        >
          {composer.isSaving ? 'Saving...' : 'Save Draft'}
        </button>
        {message.originalUrl && (
          <a
            href={message.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mailbox-detail__action-link ghost-button small"
          >
            Open Original
          </a>
        )}
        <button
          type="button"
          className="ghost-button small"
          onClick={handleExtractActions}
          disabled={extracting}
        >
          {extracting ? 'Extracting...' : 'Extract Actions'}
        </button>
        {/* Label picker dropdown (Gmail only) */}
        {message.source === 'gmail' && gmailLabels && onLabelMessage && (
          <div className="mailbox-detail__label-picker-wrapper">
            <button
              type="button"
              className="ghost-button small"
              onClick={() => setLabelPickerOpen(!labelPickerOpen)}
            >
              Label
            </button>
            {labelPickerOpen && (
              <div className="mailbox-detail__label-dropdown">
                {gmailLabels.map((label) => (
                  <button
                    key={label.id}
                    type="button"
                    className={`mailbox-detail__label-option ${appliedLabels.has(label.id) ? 'mailbox-detail__label-option--active' : ''}`}
                    onClick={() => void handleToggleLabel(label)}
                    disabled={labelBusy}
                  >
                    <span className="mailbox-detail__label-check">
                      {appliedLabels.has(label.id) ? '\u2713' : ''}
                    </span>
                    {label.name}
                  </button>
                ))}
                {gmailLabels.length === 0 && (
                  <span className="mailbox-detail__label-empty">No labels</span>
                )}
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          className="ghost-button small"
          onClick={() => {
            if (!message.accountId) {
              toast.error('Sync this message to your inbox before archiving')
              return
            }
            if (onArchiveMessage) {
              void onArchiveMessage(message.messageId)
            } else {
              void onDismiss(message.messageId)
            }
          }}
        >
          Archive
        </button>
      </div>
    </div>
  )
}
