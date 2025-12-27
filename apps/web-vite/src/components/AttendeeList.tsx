'use client'

import React from 'react'
import type {
  CanonicalAttendee,
  CanonicalOrganizer,
  CanonicalResponseStatus,
  CanonicalEventRole,
} from '@lifeos/calendar'

interface AttendeeListProps {
  organizer?: CanonicalOrganizer
  attendees?: CanonicalAttendee[]
  role?: CanonicalEventRole
  showRSVPStatus?: boolean
}

/**
 * Get the display color for a response status
 */
function getStatusColor(status: CanonicalResponseStatus): string {
  switch (status) {
    case 'accepted':
      return 'var(--status-accepted)'
    case 'tentative':
      return 'var(--status-tentative)'
    case 'declined':
      return 'var(--status-declined)'
    case 'needsAction':
      return 'var(--status-pending)'
    default:
      return 'var(--muted-foreground)'
  }
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

/**
 * Get the status icon
 */
function getStatusIcon(status: CanonicalResponseStatus): string {
  switch (status) {
    case 'accepted':
      return '✓'
    case 'tentative':
      return '?'
    case 'declined':
      return '✗'
    case 'needsAction':
      return '○'
    default:
      return '•'
  }
}

export const AttendeeList = React.memo(function AttendeeList({
  organizer,
  attendees,
  showRSVPStatus = true,
}: AttendeeListProps) {
  // Filter out the organizer from attendees list (they're shown separately)
  const guestAttendees = attendees?.filter((a) => !a.organizer) ?? []
  const hasAttendees = organizer || guestAttendees.length > 0

  if (!hasAttendees) {
    return (
      <div className="attendee-list empty">
        <p className="no-attendees">No attendees</p>
      </div>
    )
  }

  return (
    <div className="attendee-list">
      <h4 className="attendee-section-title">People</h4>

      {/* Organizer */}
      {organizer && (
        <div className="attendee-section">
          <span className="attendee-label">Organizer</span>
          <div className="attendee-item organizer">
            <div className="attendee-avatar">
              {organizer.displayName?.[0]?.toUpperCase() ||
                organizer.email?.[0]?.toUpperCase() ||
                'O'}
            </div>
            <div className="attendee-info">
              <span className="attendee-name">
                {organizer.displayName || organizer.email || 'Unknown organizer'}
                {organizer.self && <span className="you-badge">You</span>}
              </span>
              {organizer.displayName && organizer.email && (
                <span className="attendee-email">{organizer.email}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Guests */}
      {guestAttendees.length > 0 && (
        <div className="attendee-section">
          <span className="attendee-label">Guests ({guestAttendees.length})</span>
          <div className="attendee-items">
            {guestAttendees.map((attendee, index) => (
              <AttendeeItem
                key={attendee.email || index}
                attendee={attendee}
                showRSVPStatus={showRSVPStatus}
              />
            ))}
          </div>
        </div>
      )}

      {/* Response summary */}
      {showRSVPStatus && guestAttendees.length > 0 && (
        <ResponseSummary attendees={guestAttendees} />
      )}
    </div>
  )
})

interface AttendeeItemProps {
  attendee: CanonicalAttendee
  showRSVPStatus?: boolean
}

function AttendeeItem({ attendee, showRSVPStatus = true }: AttendeeItemProps) {
  const statusLabel = getStatusLabel(attendee.responseStatus)
  const statusIcon = getStatusIcon(attendee.responseStatus)
  const statusColor = getStatusColor(attendee.responseStatus)

  return (
    <div className={`attendee-item ${attendee.resource ? 'resource' : ''}`}>
      <div className="attendee-avatar" style={{ borderColor: statusColor }}>
        {attendee.resource
          ? '🏢'
          : attendee.displayName?.[0]?.toUpperCase() || attendee.email?.[0]?.toUpperCase() || '?'}
      </div>
      <div className="attendee-info">
        <span className="attendee-name">
          {attendee.displayName || attendee.email || 'Unknown'}
          {attendee.self && <span className="you-badge">You</span>}
          {attendee.optional && <span className="optional-badge">Optional</span>}
        </span>
        {attendee.displayName && attendee.email && (
          <span className="attendee-email">{attendee.email}</span>
        )}
        {attendee.comment && (
          <span className="attendee-comment">&quot;{attendee.comment}&quot;</span>
        )}
      </div>
      {showRSVPStatus && (
        <div
          className={`attendee-status status-${attendee.responseStatus}`}
          title={statusLabel}
          style={{ color: statusColor }}
        >
          <span className="status-icon">{statusIcon}</span>
          <span className="status-label">{statusLabel}</span>
        </div>
      )}
    </div>
  )
}

interface ResponseSummaryProps {
  attendees: CanonicalAttendee[]
}

function ResponseSummary({ attendees }: ResponseSummaryProps) {
  const counts = {
    accepted: attendees.filter((a) => a.responseStatus === 'accepted').length,
    tentative: attendees.filter((a) => a.responseStatus === 'tentative').length,
    declined: attendees.filter((a) => a.responseStatus === 'declined').length,
    pending: attendees.filter(
      (a) => a.responseStatus === 'needsAction' || a.responseStatus === 'unknown'
    ).length,
  }

  return (
    <div className="response-summary">
      {counts.accepted > 0 && (
        <span className="summary-item accepted">
          <span className="summary-icon">✓</span>
          {counts.accepted} accepted
        </span>
      )}
      {counts.tentative > 0 && (
        <span className="summary-item tentative">
          <span className="summary-icon">?</span>
          {counts.tentative} maybe
        </span>
      )}
      {counts.declined > 0 && (
        <span className="summary-item declined">
          <span className="summary-icon">✗</span>
          {counts.declined} declined
        </span>
      )}
      {counts.pending > 0 && (
        <span className="summary-item pending">
          <span className="summary-icon">○</span>
          {counts.pending} pending
        </span>
      )}
    </div>
  )
}
