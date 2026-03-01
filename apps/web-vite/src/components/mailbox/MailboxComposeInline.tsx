/**
 * MailboxComposeInline Component
 *
 * Inline compose view for the Mailbox detail panel (new messages + editing drafts).
 * Follows the same layout as MailboxMessageDetail (reply mode):
 * 1. TipTap toolbar (sticky)
 * 2. Compose fields — channel, recipient chips (To, CC, BCC), subject
 * 3. TipTap editor
 * 4. Action buttons — Send, Save Draft, Discard
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { EditorContent } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import type { MessageSource, DraftMessage, Recipient } from '@lifeos/agents'
import { TipTapMenuBar } from '@/components/editor/TipTapMenuBar'
import { useMailboxReplyEditor } from '@/hooks/useMailboxReplyEditor'
import { useMailboxComposer } from '@/hooks/useMailboxComposer'
import { RecipientChipInput } from '@/components/mailbox/RecipientChipInput'
import '@/styles/components/MailboxMessageDetail.css'

const CHANNEL_OPTIONS: Array<{ value: MessageSource; label: string }> = [
  { value: 'gmail', label: 'Gmail' },
  { value: 'slack', label: 'Slack' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
]

interface MailboxComposeInlineProps {
  draft?: DraftMessage | null
  onSent?: () => void
  onDiscard?: () => void
}

export function MailboxComposeInline({ draft, onSent, onDiscard }: MailboxComposeInlineProps) {
  const composer = useMailboxComposer()
  const [showCcBcc, setShowCcBcc] = useState(
    () =>
      (draft?.ccRecipients && draft.ccRecipients.length > 0) ||
      (draft?.bccRecipients && draft.bccRecipients.length > 0) ||
      false
  )

  const handleEditorChange = useCallback(
    (_json: JSONContent, text: string) => {
      composer.setBody(text)
    },
    [composer]
  )

  const { editor, setContent, clearContent } = useMailboxReplyEditor({
    placeholder: 'Write your message...',
    onChange: handleEditorChange,
  })

  const [source, setSource] = useState<MessageSource>(draft?.source ?? 'gmail')
  const isEmail = source === 'gmail' || source === 'linkedin'

  // Pre-fill from draft on mount
  const didInit = useRef(false)
  useEffect(() => {
    if (!draft || didInit.current) return
    didInit.current = true
    composer.setSource(draft.source)

    // Restore recipients from draft
    if (draft.toRecipients && draft.toRecipients.length > 0) {
      const toRecips: Recipient[] = draft.toRecipients.map((r) => ({
        id: r.id,
        name: r.name ?? r.id,
        email: r.email,
        channel: draft.source,
      }))
      composer.setToRecipients(toRecips)
    } else if (draft.recipientId) {
      // Backward compat: single recipient
      composer.setToRecipients([
        {
          id: draft.recipientId,
          name: draft.recipientName ?? draft.recipientId,
          email: draft.recipientId.includes('@') ? draft.recipientId : undefined,
          channel: draft.source,
        },
      ])
    }

    if (draft.ccRecipients && draft.ccRecipients.length > 0) {
      const ccRecips: Recipient[] = draft.ccRecipients.map((r) => ({
        id: r.id,
        name: r.name ?? r.id,
        email: r.email,
        channel: draft.source,
      }))
      composer.setCcRecipients(ccRecips)
    }

    if (draft.bccRecipients && draft.bccRecipients.length > 0) {
      const bccRecips: Recipient[] = draft.bccRecipients.map((r) => ({
        id: r.id,
        name: r.name ?? r.id,
        email: r.email,
        channel: draft.source,
      }))
      composer.setBccRecipients(bccRecips)
    }

    if (draft.subject) composer.setSubject(draft.subject)
    if (draft.body) {
      composer.setBody(draft.body)
      setContent(draft.body)
    }
  }, [draft, composer, setContent])

  const handleSourceChange = useCallback(
    (newSource: MessageSource) => {
      setSource(newSource)
      composer.setSource(newSource)
    },
    [composer]
  )

  const handleSend = useCallback(async () => {
    const success = await composer.send()
    if (success) {
      clearContent()
      onSent?.()
    }
  }, [composer, clearContent, onSent])

  const handleDiscard = useCallback(async () => {
    await composer.discardDraft()
    clearContent()
    onDiscard?.()
  }, [composer, clearContent, onDiscard])

  return (
    <div className="mailbox-detail">
      {/* 1. Sticky TipTap toolbar */}
      {editor && (
        <div className="mailbox-detail__toolbar">
          <TipTapMenuBar editor={editor} />
        </div>
      )}

      {/* 2. Compose fields */}
      <div className="mailbox-detail__header">
        <h2 className="mailbox-detail__subject">
          {draft ? 'Edit Draft' : 'New Message'}
        </h2>

        <div className="mailbox-detail__compose-field">
          <label className="mailbox-detail__compose-label" htmlFor="compose-channel">
            Channel
          </label>
          <select
            id="compose-channel"
            className="mailbox-detail__compose-select"
            value={source}
            onChange={(e) => handleSourceChange(e.target.value as MessageSource)}
          >
            {CHANNEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mailbox-detail__compose-field">
          <label className="mailbox-detail__compose-label" htmlFor="compose-to">
            To
          </label>
          <div className="mailbox-detail__compose-field-body">
            <RecipientChipInput
              id="compose-to"
              recipients={composer.state.toRecipients}
              onChange={composer.setToRecipients}
              channel={source}
              placeholder="Type a name or email..."
            />
            {!showCcBcc && isEmail && (
              <button
                type="button"
                className="mailbox-composer__cc-toggle"
                onClick={() => setShowCcBcc(true)}
              >
                CC / BCC
              </button>
            )}
          </div>
        </div>

        {showCcBcc && isEmail && (
          <div className="mailbox-detail__compose-field">
            <label className="mailbox-detail__compose-label" htmlFor="compose-cc">
              CC
            </label>
            <RecipientChipInput
              id="compose-cc"
              recipients={composer.state.ccRecipients}
              onChange={composer.setCcRecipients}
              channel={source}
              placeholder="Add CC recipients..."
            />
          </div>
        )}

        {showCcBcc && isEmail && (
          <div className="mailbox-detail__compose-field">
            <label className="mailbox-detail__compose-label" htmlFor="compose-bcc">
              BCC
            </label>
            <RecipientChipInput
              id="compose-bcc"
              recipients={composer.state.bccRecipients}
              onChange={composer.setBccRecipients}
              channel={source}
              placeholder="Add BCC recipients..."
            />
          </div>
        )}

        {isEmail && (
          <div className="mailbox-detail__compose-field">
            <label className="mailbox-detail__compose-label" htmlFor="compose-subject">
              Subject
            </label>
            <input
              id="compose-subject"
              type="text"
              className="mailbox-detail__compose-input"
              value={composer.state.subject}
              onChange={(e) => composer.setSubject(e.target.value)}
              placeholder="Subject line"
            />
          </div>
        )}
      </div>

      {/* 3. Inline editor */}
      <div className="mailbox-detail__reply-area">
        {editor && (
          <div className="mailbox-detail__editor-wrapper">
            <EditorContent editor={editor} />
          </div>
        )}

        {composer.error && (
          <div className="mailbox-detail__composer-error">{composer.error}</div>
        )}
      </div>

      {/* 4. Action buttons */}
      <div className="mailbox-detail__actions">
        <button
          type="button"
          className="primary-button small"
          onClick={() => void handleSend()}
          disabled={
            composer.isSending ||
            composer.state.toRecipients.length === 0 ||
            !composer.state.body.trim()
          }
        >
          {composer.isSending ? 'Sending...' : 'Send'}
        </button>
        <button
          type="button"
          className="ghost-button small"
          onClick={() => void composer.saveDraft()}
          disabled={composer.isSaving}
        >
          {composer.isSaving ? 'Saving...' : 'Save Draft'}
        </button>
        <button
          type="button"
          className="ghost-button small"
          onClick={() => void handleDiscard()}
          disabled={composer.isSending}
        >
          Discard
        </button>
      </div>
    </div>
  )
}
