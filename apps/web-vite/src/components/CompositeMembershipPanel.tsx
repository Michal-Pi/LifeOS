'use client'

import type { CompositeEvent } from '@lifeos/calendar'

interface CompositeMembershipPanelProps {
  composite: CompositeEvent
  onViewMember?: (canonicalEventId: string) => void
}

/**
 * Display composite membership (auditable)
 * Shows which canonical events are unified into this composite
 */
export function CompositeMembershipPanel({ composite, onViewMember }: CompositeMembershipPanelProps) {
  const memberCount = composite.members?.length ?? 0

  if (memberCount <= 1) {
    return null
  }

  const dedupeReasonLabel = getDedupeReasonLabel(composite.dedupeReason)

  return (
    <div className="composite-membership-panel">
      <div className="composite-header">
        <span className="composite-icon">🔗</span>
        <span className="composite-title">
          Unified from {memberCount} sources
        </span>
      </div>

      <div className="dedupe-reason">
        <span className="dedupe-label">Matched by:</span>
        <span className="dedupe-value">{dedupeReasonLabel}</span>
      </div>

      <div className="member-list">
        {composite.members?.map((member) => (
          <div
            key={member.canonicalEventId}
            className={`member-item ${member.canonicalEventId === composite.primaryMemberId ? 'primary' : ''}`}
          >
            <div className="member-info">
              <span className="member-provider">{getProviderIcon(member.provider)}</span>
              <span className="member-account">{member.accountId}</span>
              {member.canonicalEventId === composite.primaryMemberId && (
                <span className="primary-badge">Primary</span>
              )}
            </div>
            <div className="member-meta">
              <span className="member-calendar">{member.providerCalendarId}</span>
              {member.status && (
                <span className={`member-status status-${member.status}`}>
                  {member.status}
                </span>
              )}
            </div>
            {onViewMember && (
              <button
                className="view-member-btn"
                onClick={() => onViewMember(member.canonicalEventId)}
                title="View canonical event"
              >
                →
              </button>
            )}
          </div>
        ))}
      </div>

      {composite.iCalUID && (
        <div className="icaluid-info">
          <span className="icaluid-label">iCalUID:</span>
          <code className="icaluid-value">{composite.iCalUID}</code>
        </div>
      )}
    </div>
  )
}

function getDedupeReasonLabel(reason: string): string {
  switch (reason) {
    case 'icaluid_match':
      return 'iCalUID (calendar invite)'
    case 'provider_event_id_match':
      return 'Provider ID'
    case 'fuzzy_time_title':
      return 'Time & title similarity'
    case 'manual_link':
      return 'Manually linked'
    case 'manual_unlink':
      return 'Manually unlinked'
    default:
      return reason || 'Unknown'
  }
}

function getProviderIcon(provider: string): string {
  switch (provider) {
    case 'google':
      return '📅'
    case 'microsoft':
      return '📆'
    case 'icloud':
      return '🍎'
    default:
      return '📌'
  }
}

