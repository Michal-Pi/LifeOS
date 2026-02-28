/**
 * ContactDetail — right panel showing full contact profile, interactions,
 * and conversation history across all channels.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  type Unsubscribe,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { useAuth } from '@/hooks/useAuth'
import { useContactDetail } from '@/hooks/useContactDetail'
import { CircleSuggestionBadge } from './CircleSuggestionBadge'
import { InteractionTimeline } from './InteractionTimeline'
import type {
  ContactId,
  DunbarCircle,
  UpdateContactInput,
  MessageSource,
  PrioritizedMessage,
} from '@lifeos/agents'
import { CIRCLE_LABELS, getFollowUpStatus, DEFAULT_FOLLOW_UP_DAYS } from '@lifeos/agents'
import '@/styles/components/ContactDetail.css'

interface ContactDetailProps {
  contactId: ContactId
  onEdit: () => void
  onDelete: () => void
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatRelativeDate(ms: number | undefined): string {
  if (!ms) return 'Never'
  const days = Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

function formatFollowUpCountdown(ms: number): string {
  const days = Math.round((ms - Date.now()) / (24 * 60 * 60 * 1000))
  if (days < -1) return `${Math.abs(days)} days overdue`
  if (days === -1) return 'Yesterday'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 30) return `in ${days} days`
  return `in ${Math.floor(days / 30)} months`
}

function formatRelative(ms: number): string {
  const days = Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

const CIRCLES: DunbarCircle[] = [0, 1, 2, 3, 4]

export function ContactDetail({ contactId, onEdit, onDelete }: ContactDetailProps) {
  const { user } = useAuth()
  const { contact, interactions, loading, updateContact } = useContactDetail({
    contactId,
    interactionLimit: 50,
  })
  const [activeTab, setActiveTab] = useState<'interactions' | 'conversations' | 'info'>(
    'interactions'
  )
  const [convSearch, setConvSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<MessageSource | 'all'>('all')

  // Fetch messages linked to this contact via Firestore query
  const [contactMessages, setContactMessages] = useState<PrioritizedMessage[]>([])

  useEffect(() => {
    if (!user?.uid || !contactId) return

    let unsubscribe: Unsubscribe | undefined

    const setup = async () => {
      try {
        const db = await getDb()
        const messagesCol = collection(db, `users/${user.uid}/mailboxMessages`)
        const q = query(
          messagesCol,
          where('contactId', '==', contactId),
          orderBy('receivedAtMs', 'desc'),
          firestoreLimit(100)
        )

        unsubscribe = onSnapshot(q, (snapshot) => {
          const msgs = snapshot.docs.map((d) => d.data() as PrioritizedMessage)
          setContactMessages(msgs)
        })
      } catch (err) {
        console.error('Error loading contact messages:', err)
      }
    }

    void setup()
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [user?.uid, contactId])

  // Filtered conversation messages
  const filteredConvMessages = useMemo(() => {
    let filtered = contactMessages

    if (channelFilter !== 'all') {
      filtered = filtered.filter((m) => m.source === channelFilter)
    }

    if (convSearch.trim()) {
      const search = convSearch.toLowerCase()
      filtered = filtered.filter(
        (m) =>
          m.subject?.toLowerCase().includes(search) ||
          m.snippet?.toLowerCase().includes(search) ||
          m.sender?.toLowerCase().includes(search)
      )
    }

    return filtered
  }, [contactMessages, channelFilter, convSearch])

  const handleCircleChange = useCallback(
    async (circle: DunbarCircle) => {
      if (!contact || contact.circle === circle) return
      const updates: UpdateContactInput = { circle }
      await updateContact(updates)
    },
    [contact, updateContact]
  )

  const handleToggleStar = useCallback(async () => {
    if (!contact) return
    await updateContact({ starred: !contact.starred })
  }, [contact, updateContact])

  if (loading) {
    return <div className="contact-detail">Loading...</div>
  }

  if (!contact) {
    return <div className="contact-detail">Contact not found</div>
  }

  const followUpStatus = getFollowUpStatus(contact)
  const titleCompany = [contact.title, contact.company].filter(Boolean).join(' at ')
  const cadenceDays = contact.followUpCadenceDays ?? DEFAULT_FOLLOW_UP_DAYS[contact.circle]

  return (
    <div className="contact-detail">
      {/* Header */}
      <div className="contact-detail__header">
        <div className="contact-detail__avatar">
          {contact.avatarUrl ? (
            <img src={contact.avatarUrl} alt={contact.displayName} />
          ) : (
            getInitials(contact.displayName)
          )}
        </div>
        <div className="contact-detail__header-info">
          <h2 className="contact-detail__name">{contact.displayName}</h2>
          {titleCompany && <div className="contact-detail__title-company">{titleCompany}</div>}
          {contact.relationship && (
            <div className="contact-detail__relationship">{contact.relationship}</div>
          )}
        </div>
        <div className="contact-detail__header-actions">
          <button
            className="contact-detail__icon-btn"
            onClick={handleToggleStar}
            title={contact.starred ? 'Unstar' : 'Star'}
          >
            {contact.starred ? '\u2605' : '\u2606'}
          </button>
          <button className="contact-detail__icon-btn" onClick={onEdit} title="Edit">
            \u270E
          </button>
          <button className="contact-detail__icon-btn" onClick={onDelete} title="Delete">
            \u2715
          </button>
        </div>
      </div>

      {/* Follow-up banner */}
      {contact.nextFollowUpMs && (
        <div
          className={`contact-detail__followup-banner contact-detail__followup-banner--${getFollowUpStatus(contact)}`}
        >
          <span className="contact-detail__followup-label">
            {followUpStatus === 'overdue'
              ? 'Follow-up overdue'
              : followUpStatus === 'due'
                ? 'Follow-up due'
                : 'Next follow-up'}
          </span>
          <span className="contact-detail__followup-countdown">
            {formatFollowUpCountdown(contact.nextFollowUpMs)}
          </span>
        </div>
      )}

      {/* Circle selector */}
      <div className="contact-detail__circle">
        <span className="contact-detail__section-label">Circle</span>
        <div className="contact-detail__circle-selector">
          {CIRCLES.map((c) => (
            <button
              key={c}
              className={`contact-detail__circle-btn${contact.circle === c ? ' contact-detail__circle-btn--active' : ''}`}
              onClick={() => handleCircleChange(c)}
            >
              {CIRCLE_LABELS[c]}
            </button>
          ))}
        </div>
        <CircleSuggestionBadge
          contactId={contact.contactId}
          currentCircle={contact.circle}
          onAccept={handleCircleChange}
        />
      </div>

      {/* Follow-up status */}
      <div className="contact-detail__followup">
        <span className="contact-detail__section-label">Follow-up</span>
        <div className="contact-detail__followup-info">
          <span
            className={`contact-detail__followup-status contact-detail__followup-status--${followUpStatus}`}
          >
            {followUpStatus === 'ok'
              ? 'On track'
              : followUpStatus.charAt(0).toUpperCase() + followUpStatus.slice(1)}
          </span>
          <span>Last contact: {formatRelativeDate(contact.lastInteractionMs)}</span>
          {cadenceDays > 0 && <span>({cadenceDays}d cadence)</span>}
        </div>
      </div>

      {/* Identifiers */}
      {(contact.identifiers.emails.length > 0 ||
        contact.identifiers.phones.length > 0 ||
        contact.identifiers.linkedinSlug) && (
        <div className="contact-detail__identifiers">
          <span className="contact-detail__section-label">Channels</span>
          {contact.identifiers.emails.map((email) => (
            <div key={email} className="contact-detail__identifier">
              <span className="contact-detail__identifier-icon">{'\u2709'}</span>
              {email}
            </div>
          ))}
          {contact.identifiers.phones.map((phone) => (
            <div key={phone} className="contact-detail__identifier">
              <span className="contact-detail__identifier-icon">{'\uD83D\uDCF1'}</span>
              {phone}
            </div>
          ))}
          {contact.identifiers.linkedinSlug && (
            <div className="contact-detail__identifier">
              <span className="contact-detail__identifier-icon">in</span>
              {contact.identifiers.linkedinSlug}
            </div>
          )}
          {contact.identifiers.telegramUsername && (
            <div className="contact-detail__identifier">
              <span className="contact-detail__identifier-icon">{'\u2708'}</span>@
              {contact.identifiers.telegramUsername}
            </div>
          )}
        </div>
      )}

      {/* Tags */}
      {contact.tags.length > 0 && (
        <div>
          <span className="contact-detail__section-label">Tags</span>
          <div className="contact-detail__tags">
            {contact.tags.map((tag) => (
              <span key={tag} className="contact-detail__tag">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs: Interactions / Conversations / Notes */}
      <div className="contact-detail__tabs">
        <button
          className={`contact-detail__tab${activeTab === 'interactions' ? ' contact-detail__tab--active' : ''}`}
          onClick={() => setActiveTab('interactions')}
        >
          Interactions ({interactions.length})
        </button>
        <button
          className={`contact-detail__tab${activeTab === 'conversations' ? ' contact-detail__tab--active' : ''}`}
          onClick={() => setActiveTab('conversations')}
        >
          Conversations ({contactMessages.length})
        </button>
        <button
          className={`contact-detail__tab${activeTab === 'info' ? ' contact-detail__tab--active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          Notes
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'interactions' && <InteractionTimeline interactions={interactions} />}

      {activeTab === 'conversations' && (
        <div className="contact-conversations">
          <div className="contact-conversations__filters">
            <input
              type="text"
              placeholder="Search conversations..."
              value={convSearch}
              onChange={(e) => setConvSearch(e.target.value)}
              className="contact-conversations__search"
            />
            <div className="contact-conversations__channel-filter">
              {(['all', 'gmail', 'slack', 'linkedin'] as const).map((ch) => (
                <button
                  key={ch}
                  className={`filter-chip ${channelFilter === ch ? 'filter-chip--active' : ''}`}
                  onClick={() => setChannelFilter(ch)}
                >
                  {ch === 'all' ? 'All' : ch.charAt(0).toUpperCase() + ch.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {filteredConvMessages.length === 0 ? (
            <div className="empty-state">
              <p>No conversations with this contact yet.</p>
            </div>
          ) : (
            <div className="contact-conversations__list">
              {filteredConvMessages.map((msg) => (
                <div key={msg.messageId} className="conversation-entry">
                  <span
                    className={`conversation-entry__source conversation-entry__source--${msg.source}`}
                  >
                    {msg.source}
                  </span>
                  <div className="conversation-entry__content">
                    <span className="conversation-entry__subject">
                      {msg.subject || msg.sender}
                    </span>
                    <p className="conversation-entry__snippet">{msg.snippet}</p>
                  </div>
                  <span className="conversation-entry__date">
                    {formatRelative(msg.receivedAtMs)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'info' && contact.notes && (
        <div className="contact-detail__notes">{contact.notes}</div>
      )}
      {activeTab === 'info' && !contact.notes && (
        <div className="contact-detail__notes" style={{ opacity: 0.5, fontStyle: 'italic' }}>
          No notes yet. Click edit to add notes.
        </div>
      )}
    </div>
  )
}
