'use client'

import type { CanonicalResponseStatus } from '@lifeos/calendar'

interface RSVPButtonsProps {
  currentStatus?: CanonicalResponseStatus
  canRespond: boolean
  isOffline?: boolean
  isPending?: boolean
  onRSVP: (status: CanonicalResponseStatus) => void
}

/**
 * Get the display label for a response status
 */
function getStatusLabel(status: CanonicalResponseStatus): string {
  switch (status) {
    case 'needsAction':
      return 'Pending'
    case 'accepted':
      return 'Accepted'
    case 'tentative':
      return 'Maybe'
    case 'declined':
      return 'Declined'
    case 'unknown':
    default:
      return 'Unknown'
  }
}

export function RSVPButtons({
  currentStatus,
  canRespond,
  isOffline = false,
  isPending = false,
  onRSVP,
}: RSVPButtonsProps) {
  if (!canRespond) {
    return null
  }

  const handleRSVP = (status: CanonicalResponseStatus) => {
    if (status !== currentStatus) {
      onRSVP(status)
    }
  }

  return (
    <div className="rsvp-section">
      <span className="section-label">Your Response</span>

      {/* Current status display */}
      {currentStatus && currentStatus !== 'needsAction' && currentStatus !== 'unknown' && (
        <div className="your-rsvp">
          <span className="your-rsvp-label">You responded:</span>
          <span className={`your-rsvp-status ${currentStatus}`}>
            {getStatusLabel(currentStatus)}
          </span>
          {isPending && <span className="sync-indicator pending">⟳</span>}
        </div>
      )}

      <div className="rsvp-buttons">
        <button
          type="button"
          className={`rsvp-button accept ${currentStatus === 'accepted' ? 'selected' : ''}`}
          onClick={() => handleRSVP('accepted')}
          disabled={isPending}
          title={isOffline ? 'Will sync when online' : undefined}
        >
          <span>✓</span>
          Accept
        </button>
        <button
          type="button"
          className={`rsvp-button maybe ${currentStatus === 'tentative' ? 'selected' : ''}`}
          onClick={() => handleRSVP('tentative')}
          disabled={isPending}
          title={isOffline ? 'Will sync when online' : undefined}
        >
          <span>?</span>
          Maybe
        </button>
        <button
          type="button"
          className={`rsvp-button decline ${currentStatus === 'declined' ? 'selected' : ''}`}
          onClick={() => handleRSVP('declined')}
          disabled={isPending}
          title={isOffline ? 'Will sync when online' : undefined}
        >
          <span>✗</span>
          Decline
        </button>
      </div>

      {isOffline && (
        <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: '0.5rem' }}>
          Response will be sent when you&apos;re back online
        </p>
      )}
    </div>
  )
}

/**
 * Display-only component for showing your RSVP status
 */
export function YourRSVPStatus({
  status,
  isPending = false,
}: {
  status?: CanonicalResponseStatus
  isPending?: boolean
}) {
  if (!status || status === 'unknown') {
    return null
  }

  return (
    <div className="your-rsvp">
      <span className="your-rsvp-label">Your response:</span>
      <span className={`your-rsvp-status ${status}`}>{getStatusLabel(status)}</span>
      {isPending && <span className="sync-indicator pending">⟳</span>}
    </div>
  )
}
