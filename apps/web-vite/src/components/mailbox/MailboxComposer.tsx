/**
 * MailboxComposer Component
 *
 * Modal composer for drafting messages. Uses the design-system Modal for
 * portal rendering, focus trap, Escape key, and aria-modal. Supports
 * channel selector, multi-recipient chip input (To, CC, BCC), subject
 * line (email only), and rich/plain text editing via TipTap.
 * Drafts auto-save periodically.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useMailboxComposer } from '@/hooks/useMailboxComposer'
import type { PrioritizedMessage, MessageSource } from '@lifeos/agents'
import type { JSONContent } from '@tiptap/core'
import { TipTapEditor } from '@/components/editor/TipTapEditor'
import { extractTextFromJSON } from '@/lib/tiptapUtils'
import { RecipientChipInput } from '@/components/mailbox/RecipientChipInput'
import { formatRecipientSummary } from '@/components/mailbox/recipientUtils'
import { Modal } from '@/components/ui/Modal'
import '@/styles/components/MailboxComposer.css'

interface MailboxComposerProps {
  open: boolean
  replyTo?: PrioritizedMessage | null
  replyAll?: boolean
  /** Pre-fill body with an AI-generated draft */
  initialBody?: string
  onClose: () => void
}

const CHANNEL_OPTIONS: Array<{ value: MessageSource; label: string }> = [
  { value: 'gmail', label: 'Gmail' },
  { value: 'slack', label: 'Slack' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
]

export function MailboxComposer({
  open,
  replyTo,
  replyAll = false,
  initialBody,
  onClose,
}: MailboxComposerProps) {
  const [mode, setMode] = useState<'rich' | 'plain'>('rich')

  const {
    state,
    isSaving,
    isSending,
    error,
    lastSavedMs,
    setSource,
    setToRecipients,
    setCcRecipients,
    setBccRecipients,
    setSubject,
    setBody,
    setRichContent,
    saveDraft,
    discardDraft,
    send,
  } = useMailboxComposer({ replyTo, replyAll })

  // Pre-fill body from AI draft when provided
  useEffect(() => {
    if (initialBody && !state.body) {
      setBody(initialBody)
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isEmail = state.source === 'gmail' || state.source === 'linkedin'

  // Progressive disclosure for recipients
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const [recipientsInitialOpen] = useState(
    () =>
      !replyTo ||
      state.toRecipients.length === 0 ||
      state.ccRecipients.length > 0 ||
      state.bccRecipients.length > 0
  )

  // Force-open when CC/BCC become populated (e.g. Reply All auto-fill)
  useEffect(() => {
    if (
      (state.ccRecipients.length > 0 || state.bccRecipients.length > 0) &&
      detailsRef.current &&
      !detailsRef.current.open
    ) {
      detailsRef.current.open = true
    }
  }, [state.ccRecipients.length, state.bccRecipients.length])

  const recipientSummaryText = formatRecipientSummary(state.toRecipients)

  const handleSend = useCallback(async () => {
    const success = await send()
    if (success) onClose()
  }, [send, onClose])

  const handleDiscard = useCallback(async () => {
    await discardDraft()
    onClose()
  }, [discardDraft, onClose])

  const handleEditorChange = useCallback(
    (content: JSONContent) => {
      setRichContent(content)
      const text = extractTextFromJSON(content)
      setBody(text)
    },
    [setRichContent, setBody]
  )

  // Tick a "now" timestamp every minute so relative-time label stays current
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])

  const savedLabel = useMemo(() => {
    if (!lastSavedMs) return null
    const diff = Math.round((now - lastSavedMs) / 60000)
    if (diff < 1) return 'Saved just now'
    return `Saved ${diff}m ago`
  }, [lastSavedMs, now])

  const title = replyTo
    ? replyAll
      ? `Reply All to ${replyTo.sender}`
      : `Reply to ${replyTo.sender}`
    : 'New Message'

  const footer = (
    <div className="mailbox-composer__footer">
      <div className="mailbox-composer__footer-left">
        {savedLabel && <span className="mailbox-composer__saved-status">{savedLabel}</span>}
        {isSaving && <span className="mailbox-composer__saved-status">Saving...</span>}
      </div>
      <div className="mailbox-composer__footer-actions">
        <button
          type="button"
          className="ghost-button small"
          onClick={() => void saveDraft()}
          disabled={isSaving || isSending}
        >
          Save Draft
        </button>
        <button
          type="button"
          className="ghost-button small"
          onClick={() => void handleDiscard()}
          disabled={isSending}
        >
          Discard
        </button>
        <button
          type="button"
          className="primary-button small"
          onClick={() => void handleSend()}
          disabled={isSending || state.toRecipients.length === 0 || !state.body.trim()}
        >
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
      footer={footer}
      className="mailbox-composer-modal"
    >
      <div className="mailbox-composer__form">
        {/* Channel selector */}
        <div className="mailbox-composer__field">
          <label className="mailbox-composer__label" htmlFor="composer-channel">
            Channel
          </label>
          <select
            id="composer-channel"
            className="mailbox-composer__select"
            value={state.source}
            onChange={(e) => setSource(e.target.value as MessageSource)}
            disabled={!!replyTo}
          >
            {CHANNEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Recipients — progressive disclosure */}
        <details
          ref={detailsRef}
          className="mailbox-detail__collapsible"
          open={recipientsInitialOpen || undefined}
        >
          <summary className="mailbox-detail__collapsible-header">
            <span>TO: {recipientSummaryText}</span>
          </summary>
          <div className="mailbox-detail__collapsible-body">
            <div className="mailbox-composer__field">
              <label className="mailbox-composer__label" htmlFor="composer-to">
                To
              </label>
              <RecipientChipInput
                id="composer-to"
                recipients={state.toRecipients}
                onChange={setToRecipients}
                channel={state.source}
                placeholder="Type a name or email..."
              />
            </div>
            {isEmail && (
              <>
                <div className="mailbox-composer__field">
                  <label className="mailbox-composer__label" htmlFor="composer-cc">
                    CC
                  </label>
                  <RecipientChipInput
                    id="composer-cc"
                    recipients={state.ccRecipients}
                    onChange={setCcRecipients}
                    channel={state.source}
                    placeholder="Add CC recipients..."
                  />
                </div>
                <div className="mailbox-composer__field">
                  <label className="mailbox-composer__label" htmlFor="composer-bcc">
                    BCC
                  </label>
                  <RecipientChipInput
                    id="composer-bcc"
                    recipients={state.bccRecipients}
                    onChange={setBccRecipients}
                    channel={state.source}
                    placeholder="Add BCC recipients..."
                  />
                </div>
              </>
            )}
          </div>
        </details>

        {/* Subject (email channels only) */}
        {isEmail && (
          <div className="mailbox-composer__field">
            <label className="mailbox-composer__label" htmlFor="composer-subject">
              Subject
            </label>
            <input
              id="composer-subject"
              type="text"
              className="mailbox-composer__input"
              value={state.subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
            />
          </div>
        )}

        {/* Mode toggle */}
        <div className="mailbox-composer__mode-toggle">
          <button
            type="button"
            className={`mailbox-composer__mode-btn ${mode === 'rich' ? 'mailbox-composer__mode-btn--active' : ''}`}
            onClick={() => setMode('rich')}
          >
            Rich Text
          </button>
          <button
            type="button"
            className={`mailbox-composer__mode-btn ${mode === 'plain' ? 'mailbox-composer__mode-btn--active' : ''}`}
            onClick={() => setMode('plain')}
          >
            Plain Text
          </button>
        </div>

        {/* Body */}
        <div className="mailbox-composer__body">
          {mode === 'rich' ? (
            <TipTapEditor
              content={state.richContent ?? undefined}
              placeholder="Write your message..."
              onChange={handleEditorChange}
              className="mailbox-composer__editor"
            />
          ) : (
            <textarea
              className="mailbox-composer__textarea"
              value={state.body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message..."
              rows={10}
            />
          )}
        </div>
      </div>

      {/* Error */}
      {error && <div className="mailbox-composer__error">{error}</div>}
    </Modal>
  )
}
