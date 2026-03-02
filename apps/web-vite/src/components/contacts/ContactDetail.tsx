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
  WorkHistoryEntry,
} from '@lifeos/agents'
import {
  CIRCLE_LABELS,
  getFollowUpStatus,
  DEFAULT_FOLLOW_UP_DAYS,
  RELATIONSHIP_LABELS,
} from '@lifeos/agents'
import { DropdownMenu } from '@/components/ui/DropdownMenu'
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

  // Enrich state
  const [enrichLoading, setEnrichLoading] = useState<'linkedin' | 'search' | 'deep' | null>(null)
  const [enrichReview, setEnrichReview] = useState<Record<string, unknown> | null>(null)
  const [enrichSources, setEnrichSources] = useState<
    Array<{ title: string; url: string; snippet: string }>
  >([])
  const [enrichError, setEnrichError] = useState<string | null>(null)

  // Fetch calendar events linked to this contact
  const [contactMeetings, setContactMeetings] = useState<
    Array<{ id: string; title: string; startMs: number; endMs: number; location?: string }>
  >([])

  useEffect(() => {
    if (!user?.uid || !contactId) return

    let unsubscribe: Unsubscribe | undefined

    const setup = async () => {
      try {
        const db = await getDb()
        const eventsCol = collection(db, `users/${user.uid}/calendarEvents`)
        const q = query(
          eventsCol,
          where('linkedContactIds', 'array-contains', contactId),
          firestoreLimit(50)
        )

        unsubscribe = onSnapshot(q, (snapshot) => {
          const meetings = snapshot.docs.map((d) => {
            const data = d.data()
            return {
              id: d.id,
              title: (data.title as string) ?? 'Untitled',
              startMs: (data.startMs as number) ?? 0,
              endMs: (data.endMs as number) ?? 0,
              location: (data.location as string) ?? undefined,
            }
          })
          setContactMeetings(meetings.sort((a, b) => b.startMs - a.startMs))
        })
      } catch (err) {
        console.error('Error loading contact meetings:', err)
      }
    }

    void setup()
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [user?.uid, contactId])

  // Split meetings into past and upcoming
  const [now] = useState(() => Date.now())
  const pastMeetings = useMemo(
    () => contactMeetings.filter((m) => m.startMs < now),
    [contactMeetings, now]
  )
  const upcomingMeetings = useMemo(
    () => contactMeetings.filter((m) => m.startMs >= now).sort((a, b) => a.startMs - b.startMs),
    [contactMeetings, now]
  )

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

  const handleEnrichLinkedIn = useCallback(async () => {
    if (!contact || !user) return
    setEnrichLoading('linkedin')
    setEnrichError(null)

    try {
      const token = await user.getIdToken()
      const slug = contact.identifiers.linkedinSlug

      if (!slug) {
        setEnrichError('No LinkedIn profile linked. Add a LinkedIn slug first or use Web Search.')
        setEnrichLoading(null)
        return
      }

      const res = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL}/linkedinProfileSearch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid: user.uid, publicIdentifier: slug }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'LinkedIn enrichment failed')

      const profile = data.profile as Record<string, unknown>
      const updates: UpdateContactInput = {}

      if (profile.firstName && profile.lastName) {
        updates.firstName = profile.firstName as string
        updates.lastName = profile.lastName as string
      }
      if (profile.headline) updates.bio = profile.headline as string
      if (profile.profilePicture) updates.avatarUrl = profile.profilePicture as string

      // Extract work history
      const positions = profile.positions as
        | Array<{
            title: string
            companyName: string
            startDate?: { month?: number; year?: number }
            endDate?: { month?: number; year?: number }
            current?: boolean
          }>
        | undefined

      if (positions && positions.length > 0) {
        const workHistory: WorkHistoryEntry[] = positions.map((p) => ({
          company: p.companyName,
          title: p.title,
          startDate: p.startDate?.year
            ? `${p.startDate.year}-${String(p.startDate.month ?? 1).padStart(2, '0')}-01`
            : undefined,
          endDate:
            p.current || !p.endDate?.year
              ? undefined
              : `${p.endDate.year}-${String(p.endDate.month ?? 1).padStart(2, '0')}-01`,
          current: p.current ?? false,
        }))
        updates.workHistory = workHistory

        const current = positions.find((p) => p.current)
        if (current) {
          updates.title = current.title
          updates.company = current.companyName
        }
      }

      if (Object.keys(updates).length > 0) {
        await updateContact(updates)
      }
    } catch (err) {
      setEnrichError((err as Error).message)
    } finally {
      setEnrichLoading(null)
    }
  }, [contact, user, updateContact])

  const handleEnrichSearch = useCallback(async () => {
    if (!contact || !user) return
    setEnrichLoading('search')
    setEnrichError(null)
    setEnrichReview(null)

    try {
      const token = await user.getIdToken()
      const res = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL}/contactSearchEnrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          uid: user.uid,
          name: contact.displayName,
          company: contact.company,
          email: contact.identifiers.emails[0],
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search enrichment failed')

      if (data.enrichedFields && Object.keys(data.enrichedFields).length > 0) {
        setEnrichReview(data.enrichedFields)
        setEnrichSources(data.sources ?? [])
      } else {
        setEnrichError('No information found for this person.')
      }
    } catch (err) {
      setEnrichError((err as Error).message)
    } finally {
      setEnrichLoading(null)
    }
  }, [contact, user])

  const handleDeepEnrich = useCallback(async () => {
    if (!contact || !user) return
    setEnrichLoading('deep')
    setEnrichError(null)
    setEnrichReview(null)

    try {
      const token = await user.getIdToken()
      const res = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL}/contactSearchEnrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          uid: user.uid,
          name: contact.displayName,
          company: contact.company,
          email: contact.identifiers.emails[0],
          mode: 'deep',
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Deep enrichment failed')

      if (data.enrichedFields && Object.keys(data.enrichedFields).length > 0) {
        setEnrichReview(data.enrichedFields)
        setEnrichSources(data.sources ?? [])
      } else {
        setEnrichError('No information found for this person.')
      }
    } catch (err) {
      setEnrichError((err as Error).message)
    } finally {
      setEnrichLoading(null)
    }
  }, [contact, user])

  const enrichMenuItems = useMemo(
    () => [
      { id: 'linkedin', label: 'LinkedIn', onClick: handleEnrichLinkedIn },
      { id: 'search', label: 'Web Search', onClick: handleEnrichSearch },
      { id: 'deep', label: 'Deep Search', onClick: handleDeepEnrich },
    ],
    [handleEnrichLinkedIn, handleEnrichSearch, handleDeepEnrich]
  )

  const handleApplyEnrichment = useCallback(async () => {
    if (!enrichReview) return

    const updates: UpdateContactInput = {}
    const fields = enrichReview

    if (fields.title) updates.title = fields.title as string
    if (fields.company) updates.company = fields.company as string
    if (fields.bio) updates.bio = fields.bio as string
    if (fields.linkedinSlug) {
      updates.identifiers = {
        ...contact!.identifiers,
        linkedinSlug: fields.linkedinSlug as string,
      }
    }
    if (fields.interests) updates.interests = fields.interests as string[]
    if (fields.goals) updates.goals = fields.goals as string
    if (fields.challenges) updates.challenges = fields.challenges as string
    if (fields.strategicPriorities)
      updates.strategicPriorities = fields.strategicPriorities as string
    if (fields.workHistory) updates.workHistory = fields.workHistory as WorkHistoryEntry[]
    if (fields.familyNotes) updates.familyNotes = fields.familyNotes as string
    if (fields.personalityStyle) updates.personalityStyle = fields.personalityStyle as string
    if (fields.preferences) updates.preferences = fields.preferences as string

    await updateContact(updates)
    setEnrichReview(null)
    setEnrichSources([])
  }, [enrichReview, contact, updateContact])

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
            <div className="contact-detail__relationship">
              {RELATIONSHIP_LABELS[contact.relationship] ?? contact.relationship}
            </div>
          )}
        </div>
        <div className="contact-detail__header-actions">
          <DropdownMenu
            trigger={
              <button className="ghost-button small" disabled={enrichLoading !== null}>
                {enrichLoading === 'deep'
                  ? 'Deep Enriching...'
                  : enrichLoading
                    ? 'Enriching...'
                    : 'Enrich'}
              </button>
            }
            items={enrichMenuItems}
          />
          <button className="ghost-button small" onClick={handleToggleStar}>
            {contact.starred ? '\u2605' : '\u2606'} {contact.starred ? 'Unstar' : 'Star'}
          </button>
          <button className="ghost-button small" onClick={onEdit}>
            Edit
          </button>
          <button className="ghost-button small danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      {/* Enrichment error */}
      {enrichError && (
        <div className="contact-detail__enrich-error">
          {enrichError}
          <button className="ghost-button small" onClick={() => setEnrichError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Deep enrich progress */}
      {enrichLoading === 'deep' && (
        <div className="contact-detail__enrich-progress">
          <div className="contact-detail__enrich-progress-spinner" />
          <span>Running deep enrichment...</span>
          <span className="contact-detail__enrich-progress-note">
            This may take 30-60s and uses more API tokens.
          </span>
        </div>
      )}

      {/* Enrichment review panel */}
      {enrichReview && (
        <div className="contact-detail__enrich-review">
          <div className="contact-detail__enrich-review-header">
            <span className="contact-detail__section-label">Review Enriched Data</span>
            <div className="contact-detail__enrich-review-actions">
              <button className="ghost-button small" onClick={handleApplyEnrichment}>
                Apply
              </button>
              <button
                className="ghost-button small"
                onClick={() => {
                  setEnrichReview(null)
                  setEnrichSources([])
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
          <div className="contact-detail__enrich-review-fields">
            {Object.entries(enrichReview).map(([key, value]) => (
              <div key={key} className="contact-detail__enrich-review-field">
                <span className="contact-detail__enrich-review-key">{key}</span>
                <span className="contact-detail__enrich-review-value">
                  {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                </span>
              </div>
            ))}
          </div>
          {enrichSources.length > 0 && (
            <div className="contact-detail__enrich-review-sources">
              <span className="contact-detail__enrich-review-key">Sources</span>
              {enrichSources.map((s, i) => (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="contact-detail__enrich-source-link"
                >
                  {s.title}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* How we met */}
      {contact.howWeMet && (
        <div className="contact-detail__context-field">
          <span className="contact-detail__section-label">How We Met</span>
          <span className="contact-detail__context-value">{contact.howWeMet}</span>
        </div>
      )}

      {/* Date of Birth */}
      {contact.dateOfBirth && (
        <div className="contact-detail__dob">
          <span className="contact-detail__section-label">Birthday</span>
          <span className="contact-detail__dob-value">
            {new Date(contact.dateOfBirth + 'T00:00:00').toLocaleDateString(undefined, {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>
      )}

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
              className={`contact-detail__circle-btn contact-detail__circle-btn--${c}${contact.circle === c ? ' contact-detail__circle-btn--active' : ''}`}
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

      {/* Meetings with this contact */}
      {(pastMeetings.length > 0 || upcomingMeetings.length > 0) && (
        <div className="contact-detail__meetings">
          <span className="contact-detail__section-label">Meetings</span>
          <div className="contact-detail__meetings-grid">
            {upcomingMeetings.length > 0 && (
              <div className="contact-detail__meeting-card contact-detail__meeting-card--upcoming">
                <div className="contact-detail__meeting-card-label">Next Meeting</div>
                <div className="contact-detail__meeting-card-title">
                  {upcomingMeetings[0].title}
                </div>
                <div className="contact-detail__meeting-card-date">
                  {new Date(upcomingMeetings[0].startMs).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  at{' '}
                  {new Date(upcomingMeetings[0].startMs).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>
                {upcomingMeetings[0].location && (
                  <div className="contact-detail__meeting-card-location">
                    {upcomingMeetings[0].location}
                  </div>
                )}
                {upcomingMeetings.length > 1 && (
                  <div className="contact-detail__meeting-card-more">
                    +{upcomingMeetings.length - 1} more upcoming
                  </div>
                )}
              </div>
            )}
            {pastMeetings.length > 0 && (
              <div className="contact-detail__meeting-card contact-detail__meeting-card--past">
                <div className="contact-detail__meeting-card-label">Last Meeting</div>
                <div className="contact-detail__meeting-card-title">{pastMeetings[0].title}</div>
                <div className="contact-detail__meeting-card-date">
                  {formatRelativeDate(pastMeetings[0].startMs)}
                  {' \u2014 '}
                  {new Date(pastMeetings[0].startMs).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
                {pastMeetings.length > 1 && (
                  <div className="contact-detail__meeting-card-more">
                    {pastMeetings.length} total past meetings
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* Work History */}
      {contact.workHistory && contact.workHistory.length > 0 && (
        <div className="contact-detail__work-history">
          <span className="contact-detail__section-label">Work History</span>
          <div className="contact-detail__work-history-list">
            {[...contact.workHistory]
              .sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0))
              .map((entry, i) => (
                <div
                  key={i}
                  className={`contact-detail__work-entry${entry.current ? ' contact-detail__work-entry--current' : ''}`}
                >
                  <div className="contact-detail__work-entry-title">{entry.title}</div>
                  <div className="contact-detail__work-entry-company">{entry.company}</div>
                  {(entry.startDate || entry.endDate) && (
                    <div className="contact-detail__work-entry-dates">
                      {entry.startDate ?? '?'} —{' '}
                      {entry.current ? 'Present' : (entry.endDate ?? '?')}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Personal Context */}
      {(contact.interests?.length ||
        contact.familyNotes ||
        contact.personalityStyle ||
        contact.preferences) && (
        <div className="contact-detail__personal-context">
          <span className="contact-detail__section-label">Personal Context</span>
          {contact.interests && contact.interests.length > 0 && (
            <div className="contact-detail__context-field">
              <span className="contact-detail__context-field-label">Interests</span>
              <div className="contact-detail__tags">
                {contact.interests.map((interest) => (
                  <span key={interest} className="contact-detail__tag">
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          )}
          {contact.familyNotes && (
            <div className="contact-detail__context-field">
              <span className="contact-detail__context-field-label">Family</span>
              <span className="contact-detail__context-value">{contact.familyNotes}</span>
            </div>
          )}
          {contact.personalityStyle && (
            <div className="contact-detail__context-field">
              <span className="contact-detail__context-field-label">Personality / Style</span>
              <span className="contact-detail__context-value">{contact.personalityStyle}</span>
            </div>
          )}
          {contact.preferences && (
            <div className="contact-detail__context-field">
              <span className="contact-detail__context-field-label">Preferences</span>
              <span className="contact-detail__context-value">{contact.preferences}</span>
            </div>
          )}
        </div>
      )}

      {/* Professional Context */}
      {(contact.goals || contact.challenges || contact.strategicPriorities) && (
        <div className="contact-detail__professional-context">
          <span className="contact-detail__section-label">Professional Context</span>
          {contact.goals && (
            <div className="contact-detail__context-field">
              <span className="contact-detail__context-field-label">Goals / Priorities</span>
              <span className="contact-detail__context-value">{contact.goals}</span>
            </div>
          )}
          {contact.challenges && (
            <div className="contact-detail__context-field">
              <span className="contact-detail__context-field-label">Current Challenges</span>
              <span className="contact-detail__context-value">{contact.challenges}</span>
            </div>
          )}
          {contact.strategicPriorities && (
            <div className="contact-detail__context-field">
              <span className="contact-detail__context-field-label">Strategic Priorities</span>
              <span className="contact-detail__context-value">{contact.strategicPriorities}</span>
            </div>
          )}
        </div>
      )}

      {/* Pipeline */}
      {contact.pipeline && contact.pipeline.length > 0 && (
        <div className="contact-detail__pipeline">
          <span className="contact-detail__section-label">Pipeline</span>
          <div className="contact-detail__pipeline-list">
            {contact.pipeline.map((entry, i) => (
              <div key={i} className="contact-detail__pipeline-entry">
                <div className="contact-detail__pipeline-entry-name">{entry.projectName}</div>
                <div className="contact-detail__pipeline-entry-meta">
                  {entry.type && (
                    <span className="contact-detail__pipeline-entry-type">{entry.type}</span>
                  )}
                  {entry.stage && (
                    <span className="contact-detail__pipeline-entry-stage">{entry.stage}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tasks & Follow-ups */}
      {contact.contactTasks && contact.contactTasks.length > 0 && (
        <div className="contact-detail__tasks">
          <span className="contact-detail__section-label">Tasks & Follow-ups</span>
          <div className="contact-detail__tasks-list">
            {contact.contactTasks.map((task, i) => (
              <div
                key={i}
                className={`contact-detail__task-entry contact-detail__task-entry--${task.status}`}
              >
                <div className="contact-detail__task-entry-header">
                  <span className="contact-detail__task-entry-action">{task.action}</span>
                  <div className="contact-detail__task-entry-badges">
                    {task.priority && (
                      <span
                        className={`contact-detail__task-badge contact-detail__task-badge--${task.priority}`}
                      >
                        {task.priority}
                      </span>
                    )}
                    <span
                      className={`contact-detail__task-badge contact-detail__task-badge--${task.status}`}
                    >
                      {task.status === 'in_progress'
                        ? 'In Progress'
                        : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                    </span>
                  </div>
                </div>
                <div className="contact-detail__task-entry-meta">
                  {task.dueDate && <span>Due: {task.dueDate}</span>}
                  {task.reason && <span>{task.reason}</span>}
                </div>
              </div>
            ))}
          </div>
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
                    <span className="conversation-entry__subject">{msg.subject || msg.sender}</span>
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
