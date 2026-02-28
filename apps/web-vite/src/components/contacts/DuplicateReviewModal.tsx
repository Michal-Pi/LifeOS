/**
 * DuplicateReviewModal — review and merge duplicate contacts.
 *
 * Full-screen overlay showing candidate duplicate pairs.
 * Auto-scans on open, then lets the user confirm or dismiss each pair.
 */

import { useState, useCallback, useEffect } from 'react'
import { useContactDedup } from '@/hooks/useContactDedup'
import {
  CIRCLE_LABELS,
  type Contact,
  type ContactId,
  type DuplicateCandidate,
} from '@lifeos/agents'
import '@/styles/components/DuplicateReviewModal.css'

interface DuplicateReviewModalProps {
  contacts: Contact[]
  onClose: () => void
  onMergeComplete?: () => void
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

function scoreColor(score: number): string {
  if (score >= 90) return 'var(--success, #22c55e)'
  if (score >= 70) return 'var(--warning, #eab308)'
  return 'var(--orange, #f97316)'
}

function reasonLabel(reason: DuplicateCandidate['reasons'][number]): string {
  switch (reason.type) {
    case 'email_exact':
      return `Email: ${reason.email}`
    case 'phone_exact':
      return `Phone: ${reason.phone}`
    case 'name_similar':
      return `Name ${Math.round(reason.similarity * 100)}% similar`
    case 'name_and_company':
      return `Name+Company: ${reason.company}`
    case 'linkedin_match':
      return `LinkedIn: ${reason.slug}`
    case 'telegram_match':
      return `Telegram: @${reason.username}`
    default:
      return 'Match'
  }
}

export function DuplicateReviewModal({
  contacts,
  onClose,
  onMergeComplete,
}: DuplicateReviewModalProps) {
  const {
    candidates,
    totalScanned,
    scanDurationMs,
    scanning,
    scanError,
    scan,
    merging,
    mergeError,
    merge,
    dismissCandidate,
  } = useContactDedup()

  const [confirmingPair, setConfirmingPair] = useState<string | null>(null)
  const [primarySelections, setPrimarySelections] = useState<Record<string, ContactId>>({})

  // Auto-scan on mount
  useEffect(() => {
    void scan()
  }, [scan])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const pairKey = (a: ContactId, b: ContactId) => [a, b].sort().join('|')

  const getContact = useCallback(
    (id: ContactId) => contacts.find((c) => c.contactId === id),
    [contacts]
  )

  const handleSelectPrimary = useCallback((candidate: DuplicateCandidate, primaryId: ContactId) => {
    setPrimarySelections((prev) => ({
      ...prev,
      [pairKey(candidate.contactIdA, candidate.contactIdB)]: primaryId,
    }))
  }, [])

  const handleMerge = useCallback(
    async (candidate: DuplicateCandidate) => {
      const key = pairKey(candidate.contactIdA, candidate.contactIdB)
      const primaryId = primarySelections[key] ?? candidate.contactIdA
      const secondaryId =
        primaryId === candidate.contactIdA ? candidate.contactIdB : candidate.contactIdA

      try {
        await merge(primaryId, [secondaryId])
        setConfirmingPair(null)
        onMergeComplete?.()
      } catch {
        // mergeError is set by the hook
      }
    },
    [primarySelections, merge, onMergeComplete]
  )

  const handleDismiss = useCallback(
    (candidate: DuplicateCandidate) => {
      dismissCandidate(candidate.contactIdA, candidate.contactIdB)
    },
    [dismissCandidate]
  )

  const renderContactCard = (contact: Contact | undefined, name: string) => {
    if (!contact) {
      return (
        <div className="duplicate-pair__contact">
          <div className="duplicate-pair__avatar">{getInitials(name)}</div>
          <div className="duplicate-pair__name">{name}</div>
        </div>
      )
    }
    const titleCompany = [contact.title, contact.company].filter(Boolean).join(' at ')
    return (
      <div className="duplicate-pair__contact">
        <div className="duplicate-pair__avatar">
          {contact.avatarUrl ? (
            <img src={contact.avatarUrl} alt={contact.displayName} />
          ) : (
            getInitials(contact.displayName)
          )}
        </div>
        <div className="duplicate-pair__info">
          <div className="duplicate-pair__name">{contact.displayName}</div>
          {titleCompany && <div className="duplicate-pair__title">{titleCompany}</div>}
          <div className="duplicate-pair__meta">
            <span className="duplicate-pair__circle">{CIRCLE_LABELS[contact.circle]}</span>
            {contact.identifiers.emails.length > 0 && (
              <span>
                {contact.identifiers.emails.length} email
                {contact.identifiers.emails.length > 1 ? 's' : ''}
              </span>
            )}
            {contact.identifiers.phones.length > 0 && (
              <span>
                {contact.identifiers.phones.length} phone
                {contact.identifiers.phones.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="duplicate-review-overlay" onClick={onClose}>
      <div className="duplicate-review" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="duplicate-review__header">
          <h2 className="duplicate-review__title">Review Duplicates</h2>
          <button className="duplicate-review__close" onClick={onClose}>
            {'\u2715'}
          </button>
        </div>

        {/* Scan stats */}
        {!scanning && totalScanned > 0 && (
          <div className="duplicate-review__stats">
            Scanned {totalScanned} contacts in {scanDurationMs}ms &mdash;{' '}
            {candidates.length > 0
              ? `${candidates.length} potential duplicate${candidates.length > 1 ? 's' : ''}`
              : 'no duplicates found'}
          </div>
        )}

        {/* Loading state */}
        {scanning && (
          <div className="duplicate-review__loading">Scanning contacts for duplicates...</div>
        )}

        {/* Error state */}
        {scanError && (
          <div className="duplicate-review__error">
            <p>{scanError}</p>
            <button className="ghost-button small" onClick={() => void scan()}>
              Retry
            </button>
          </div>
        )}

        {mergeError && (
          <div className="duplicate-review__error">
            <p>Merge failed: {mergeError}</p>
          </div>
        )}

        {/* Empty state */}
        {!scanning && !scanError && candidates.length === 0 && totalScanned > 0 && (
          <div className="duplicate-review__empty">
            <div className="duplicate-review__empty-icon">{'\u2705'}</div>
            <div>No duplicates found — your contacts are clean!</div>
          </div>
        )}

        {/* Candidate list */}
        <div className="duplicate-review__list">
          {candidates.map((candidate) => {
            const key = pairKey(candidate.contactIdA, candidate.contactIdB)
            const contactA = getContact(candidate.contactIdA)
            const contactB = getContact(candidate.contactIdB)
            const primaryId = primarySelections[key] ?? candidate.contactIdA
            const isConfirming = confirmingPair === key

            return (
              <div key={key} className="duplicate-pair">
                {/* Score badge */}
                <div
                  className="duplicate-pair__score"
                  style={{ backgroundColor: scoreColor(candidate.score) }}
                >
                  {candidate.score}%
                </div>

                {/* Contact cards with primary selection */}
                <div className="duplicate-pair__contacts">
                  <label className="duplicate-pair__contact-wrapper">
                    <input
                      type="radio"
                      name={`primary-${key}`}
                      checked={primaryId === candidate.contactIdA}
                      onChange={() => handleSelectPrimary(candidate, candidate.contactIdA)}
                    />
                    <span className="duplicate-pair__primary-label">
                      {primaryId === candidate.contactIdA ? 'Primary' : 'Merge into'}
                    </span>
                    {renderContactCard(contactA, candidate.displayNameA)}
                  </label>
                  <label className="duplicate-pair__contact-wrapper">
                    <input
                      type="radio"
                      name={`primary-${key}`}
                      checked={primaryId === candidate.contactIdB}
                      onChange={() => handleSelectPrimary(candidate, candidate.contactIdB)}
                    />
                    <span className="duplicate-pair__primary-label">
                      {primaryId === candidate.contactIdB ? 'Primary' : 'Merge into'}
                    </span>
                    {renderContactCard(contactB, candidate.displayNameB)}
                  </label>
                </div>

                {/* Match reasons */}
                <div className="duplicate-pair__reasons">
                  {candidate.reasons.map((reason, i) => (
                    <span key={i} className="duplicate-pair__reason">
                      {reasonLabel(reason)}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="duplicate-pair__actions">
                  {isConfirming ? (
                    <div className="duplicate-pair__confirm">
                      <p className="duplicate-pair__confirm-text">
                        Merge{' '}
                        <strong>
                          {primaryId === candidate.contactIdA
                            ? candidate.displayNameB
                            : candidate.displayNameA}
                        </strong>{' '}
                        into{' '}
                        <strong>
                          {primaryId === candidate.contactIdA
                            ? candidate.displayNameA
                            : candidate.displayNameB}
                        </strong>
                        ? This cannot be undone.
                      </p>
                      <div className="duplicate-pair__confirm-buttons">
                        <button
                          className="primary-button small"
                          onClick={() => void handleMerge(candidate)}
                          disabled={merging}
                        >
                          {merging ? 'Merging...' : 'Confirm Merge'}
                        </button>
                        <button
                          className="ghost-button small"
                          onClick={() => setConfirmingPair(null)}
                          disabled={merging}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        className="primary-button small"
                        onClick={() => setConfirmingPair(key)}
                      >
                        Merge
                      </button>
                      <button
                        className="ghost-button small"
                        onClick={() => handleDismiss(candidate)}
                      >
                        Not duplicates
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
