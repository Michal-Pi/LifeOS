import type {
  CalendarAccountStatus,
  CanonicalAlert,
  CanonicalCalendarEvent,
  CanonicalResponseStatus,
  SyncState
} from '@lifeos/calendar'
import {
  canEditEvent,
  canDeleteEvent,
  canRespond,
  describeRecurrence,
  getEventRole,
  getPrimaryAlert
} from '@lifeos/calendar'
import { AlertSelector } from '@/components/AlertSelector'
import { AttendeeList } from '@/components/AttendeeList'
import type { CalendarsById } from '@lifeos/calendar'

interface CalendarSidebarProps {
  selectedEvent: CanonicalCalendarEvent | null
  isOnline: boolean
  accountStatus: CalendarAccountStatus | null
  calendarsById: CalendarsById
  onRSVP: (eventId: string, status: CanonicalResponseStatus) => void
  onAlertChange: (alert: CanonicalAlert | null) => void
  onRetryWriteback: () => void
  onConnectGoogle: () => void
  onEdit: () => void
  onDelete: () => void
}

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: 'numeric'
})

function getSyncStateDisplay(syncState?: SyncState): { label: string; className: string; icon: string } {
  switch (syncState) {
    case 'synced':
      return { label: 'Synced', className: 'synced', icon: '✓' }
    case 'pending_writeback':
      return { label: 'Syncing to Google…', className: 'pending', icon: '↻' }
    case 'error':
      return { label: 'Sync failed', className: 'error', icon: '!' }
    case 'conflict':
      return { label: 'Conflict', className: 'conflict', icon: '⚠' }
    case 'read_only_provider':
      return { label: 'Read-only', className: 'readonly', icon: '◎' }
    default:
      return { label: 'Local', className: 'local', icon: '○' }
  }
}

interface RSVPButtonsProps {
  currentStatus?: string
  canRespond: boolean
  isOffline: boolean
  isPending: boolean
  onRSVP: (status: CanonicalResponseStatus) => void
}

function RSVPButtons({ currentStatus, canRespond, isOffline, isPending, onRSVP }: RSVPButtonsProps) {
  if (!canRespond) return null

  const isActive = (status: CanonicalResponseStatus) => currentStatus === status

  return (
    <div className="rsvp-buttons" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
      <button
        className={`ghost-button small ${isActive('accepted') ? 'active' : ''}`}
        onClick={() => onRSVP('accepted')}
        disabled={isOffline || isPending}
        aria-pressed={isActive('accepted')}
      >Yes</button>
      <button
        className={`ghost-button small ${isActive('declined') ? 'active' : ''}`}
        onClick={() => onRSVP('declined')}
        disabled={isOffline || isPending}
        aria-pressed={isActive('declined')}
      >No</button>
      <button
        className={`ghost-button small ${isActive('tentative') ? 'active' : ''}`}
        onClick={() => onRSVP('tentative')}
        disabled={isOffline || isPending}
        aria-pressed={isActive('tentative')}
      >Maybe</button>
    </div>
  )
}

export function CalendarSidebar({
  selectedEvent,
  isOnline,
  accountStatus,
  calendarsById,
  onRSVP,
  onAlertChange,
  onRetryWriteback,
  onConnectGoogle,
  onEdit,
  onDelete
}: CalendarSidebarProps) {
  if (!selectedEvent) {
    return (
      <aside className="calendar-detail">
        <p className="section-label">Event details</p>
        <p>Select an event to see more details.</p>
      </aside>
    )
  }
  const selectedIsRecurring = Boolean(
    selectedEvent.recurrence?.recurrenceRules?.length ||
    selectedEvent.providerRef?.recurringEventId
  )
  const selectedSyncState = getSyncStateDisplay(selectedEvent.syncState)
  const selectedEventCanEdit = canEditEvent(selectedEvent, calendarsById)
  const selectedEventCanDelete = canDeleteEvent(selectedEvent, calendarsById)

  return (
    <aside className="calendar-detail">
      <p className="section-label">Event details</p>
      <h2>
        {selectedEvent.title}
        {selectedIsRecurring && <span className="recurrence-indicator" title="Recurring event">↻</span>}
        <span className={`sync-indicator ${selectedSyncState.className}`} title={selectedSyncState.label}>
          {selectedSyncState.icon}
        </span>
      </h2>
      <p className="calendar-meta">
        {selectedEvent.allDay
          ? 'All day'
          : `${timeFormatter.format(new Date(selectedEvent.startIso))} – ${timeFormatter.format(new Date(selectedEvent.endIso))}`}
      </p>

      {selectedIsRecurring && (
        <div className="recurrence-info">
          <p className="recurrence-badge">
            <span className="recurrence-icon">↻</span>
            {selectedEvent.recurrenceV2 ? describeRecurrence(selectedEvent.recurrenceV2) : 'Recurring series'}
          </p>
        </div>
      )}

      <p>{selectedEvent.description ?? 'No description provided.'}</p>
      <p className="calendar-meta">Hosted in {selectedEvent.location ?? 'Private meeting space'}</p>

      <AttendeeList
        organizer={selectedEvent.organizer}
        attendees={selectedEvent.attendees}
        role={getEventRole(selectedEvent)}
        showRSVPStatus={true}
      />

      {getEventRole(selectedEvent) === 'attendee' && (
        <RSVPButtons
          currentStatus={selectedEvent.selfAttendee?.responseStatus}
          canRespond={canRespond(selectedEvent)}
          isOffline={!isOnline}
          isPending={selectedEvent.syncState === 'pending_writeback'}
          onRSVP={(status) => onRSVP(selectedEvent.canonicalEventId, status)}
        />
      )}

      <AlertSelector
        currentAlert={getPrimaryAlert(selectedEvent)}
        onAlertChange={onAlertChange}
        disabled={selectedEvent.syncState === 'pending_writeback'}
        isAllDay={selectedEvent.allDay}
      />

      <div className="sync-status-section">
        <p className="section-label">Sync Status</p>
        <span className={`sync-state-badge ${selectedSyncState.className}`}>
          {selectedSyncState.icon} {selectedSyncState.label}
        </span>
        {selectedEvent.writebackError && <p className="writeback-error">{selectedEvent.writebackError.message}</p>}
        {selectedEvent.lastWritebackAtMs && (
          <p className="calendar-meta">Last synced: {new Date(selectedEvent.lastWritebackAtMs).toLocaleString()}</p>
        )}
        {(selectedEvent.syncState === 'error' || selectedEvent.syncState === 'conflict') && (
          <button className="ghost-button retry-button" type="button" onClick={onRetryWriteback} disabled={!isOnline}>
            Retry sync
          </button>
        )}
        {accountStatus?.status === 'needs_attention' && (
          <button className="ghost-button warning" type="button" onClick={onConnectGoogle}>
            Reconnect Google
          </button>
        )}
      </div>

      <div className="detail-actions">
        <button className="ghost-button" type="button" onClick={onEdit} disabled={!selectedEventCanEdit} title={selectedEventCanEdit ? undefined : 'You do not have permission to edit this event'}>Edit</button>
        <button className="ghost-button danger" type="button" onClick={onDelete} disabled={!selectedEventCanDelete} title={selectedEventCanDelete ? undefined : 'You do not have permission to delete this event'}>Delete</button>
      </div>

      {!selectedEventCanEdit && <p className="read-only-indicator">👁 View only - you cannot edit this event</p>}
    </aside>
  )
}