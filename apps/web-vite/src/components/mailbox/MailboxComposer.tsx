/**
 * MailboxComposer Component
 *
 * Modal composer for drafting messages. Supports channel selector,
 * recipient input, subject line (email only), and rich/plain text
 * editing via TipTap. Drafts auto-save periodically.
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useMailboxComposer } from '@/hooks/useMailboxComposer'
import type { PrioritizedMessage, MessageSource } from '@lifeos/agents'
import type { JSONContent } from '@tiptap/core'
import { TipTapEditor } from '@/components/editor/TipTapEditor'
import { RecipientAutocomplete } from '@/components/mailbox/RecipientAutocomplete'
import '@/styles/components/MailboxComposer.css'

interface MailboxComposerProps {
  replyTo?: PrioritizedMessage | null
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

export function MailboxComposer({ replyTo, initialBody, onClose }: MailboxComposerProps) {
  const [mode, setMode] = useState<'rich' | 'plain'>('rich')

  const {
    state,
    isSaving,
    isSending,
    error,
    lastSavedMs,
    setSource,
    setRecipientId,
    setRecipientName,
    setSubject,
    setBody,
    setRichContent,
    saveDraft,
    discardDraft,
    send,
  } = useMailboxComposer({ replyTo })

  // Pre-fill body from AI draft when provided
  useEffect(() => {
    if (initialBody && !state.body) {
      setBody(initialBody)
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isEmail = state.source === 'gmail' || state.source === 'linkedin'

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
      // Extract plain text from TipTap JSON for the body field
      const text = extractTextFromJSON(content)
      setBody(text)
    },
    [setRichContent, setBody]
  )

  // Tick a "now" timestamp every minute so relative-time label stays pure
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

  return (
    <div className="mailbox-composer__overlay" onClick={onClose}>
      <div className="mailbox-composer" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="mailbox-composer__header">
          <h3 className="mailbox-composer__title">
            {replyTo ? `Reply to ${replyTo.sender}` : 'New Message'}
          </h3>
          <button
            type="button"
            className="mailbox-composer__close"
            onClick={onClose}
            aria-label="Close composer"
          >
            ×
          </button>
        </div>

        {/* Form */}
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

          {/* Recipient */}
          <div className="mailbox-composer__field">
            <label className="mailbox-composer__label" htmlFor="composer-to">
              To
            </label>
            {replyTo ? (
              <input
                id="composer-to"
                type="text"
                className="mailbox-composer__input"
                value={state.recipientId}
                disabled
              />
            ) : (
              <RecipientAutocomplete
                id="composer-to"
                value={state.recipientId}
                onChange={(value) => {
                  setRecipientId(value)
                  setRecipientName(value)
                }}
                onSelect={(suggestion) => {
                  setRecipientId(suggestion.email ?? suggestion.name)
                  setRecipientName(suggestion.name)
                }}
              />
            )}
          </div>

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

        {/* Footer */}
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
              disabled={isSending || !state.recipientId.trim() || !state.body.trim()}
            >
              {isSending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Extract plain text from a TipTap JSONContent tree
 */
function extractTextFromJSON(content: JSONContent): string {
  if (!content) return ''
  if (content.type === 'text') return content.text ?? ''
  if (!content.content) return ''
  return content.content
    .map((node) => {
      const text = extractTextFromJSON(node)
      // Add newlines for block-level nodes
      if (node.type === 'paragraph' || node.type === 'heading') {
        return text + '\n'
      }
      if (node.type === 'bulletList' || node.type === 'orderedList') {
        return text + '\n'
      }
      if (node.type === 'listItem') {
        return '- ' + text
      }
      return text
    })
    .join('')
    .trim()
}
