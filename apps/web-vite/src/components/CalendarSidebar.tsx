import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  CalendarAccountStatus,
  CanonicalAlert,
  CanonicalCalendarEvent,
  CanonicalResponseStatus,
  SyncState,
} from '@lifeos/calendar'
import {
  canEditEvent,
  canDeleteEvent,
  canRespond,
  describeRecurrence,
  getEventRole,
  getPrimaryAlert,
} from '@lifeos/calendar'
import { CIRCLE_LABELS } from '@lifeos/agents'
import type { Contact, DunbarCircle } from '@lifeos/agents'
import type { CanonicalTask } from '@/types/todo'
import { AlertSelector } from '@/components/AlertSelector'
import { AttendeeList } from '@/components/AttendeeList'
import type { CalendarsById } from '@lifeos/calendar'
import { EmptyState } from '@/components/EmptyState'
import { MeetingBriefingModal } from '@/components/contacts/MeetingBriefingModal'

interface CalendarSidebarProps {
  selectedEvent: CanonicalCalendarEvent | null
  isOnline: boolean
  accountStatus: CalendarAccountStatus | null
  calendarsById: CalendarsById
  contacts?: Contact[]
  tasks?: CanonicalTask[]
  selectedDayKey?: string
  onRSVP: (eventId: string, status: CanonicalResponseStatus) => void
  onAlertChange: (alert: CanonicalAlert | null) => void
  onRetryWriteback: () => void
  onConnectGoogle: () => void
  onEdit: () => void
  onDelete: () => void
}

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: 'numeric',
})

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function getSyncStateDisplay(syncState?: SyncState): {
  label: string
  className: string
  icon: string
} {
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

function RSVPButtons({
  currentStatus,
  canRespond,
  isOffline,
  isPending,
  onRSVP,
}: RSVPButtonsProps) {
  if (!canRespond) return null

  const isActive = (status: CanonicalResponseStatus) => currentStatus === status

  return (
    <div className="rsvp-buttons" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
      <button
        className={`ghost-button small ${isActive('accepted') ? 'active' : ''}`}
        onClick={() => onRSVP('accepted')}
        disabled={isOffline || isPending}
        aria-pressed={isActive('accepted')}
      >
        Yes
      </button>
      <button
        className={`ghost-button small ${isActive('declined') ? 'active' : ''}`}
        onClick={() => onRSVP('declined')}
        disabled={isOffline || isPending}
        aria-pressed={isActive('declined')}
      >
        No
      </button>
      <button
        className={`ghost-button small ${isActive('tentative') ? 'active' : ''}`}
        onClick={() => onRSVP('tentative')}
        disabled={isOffline || isPending}
        aria-pressed={isActive('tentative')}
      >
        Maybe
      </button>
    </div>
  )
}

export function CalendarSidebar({
  selectedEvent,
  isOnline,
  accountStatus,
  calendarsById,
  contacts = [],
  tasks = [],
  selectedDayKey,
  onRSVP,
  onAlertChange,
  onRetryWriteback,
  onConnectGoogle,
  onEdit,
  onDelete,
}: CalendarSidebarProps) {
  const [showBriefing, setShowBriefing] = useState(false)

  // Match attendee emails against contacts
  const attendees = selectedEvent?.attendees
  const linkedContacts = useMemo(() => {
    if (!attendees?.length || contacts.length === 0) return []

    const attendeeEmails = new Set(
      attendees.map((a) => a.email?.toLowerCase()).filter((e): e is string => Boolean(e))
    )

    return contacts.filter((contact) =>
      contact.identifiers.emails.some((email) => attendeeEmails.has(email.toLowerCase()))
    )
  }, [attendees, contacts])

  // Find tasks linked to this event via calendarEventIds
  const eventId = selectedEvent?.canonicalEventId
  const eventTitle = selectedEvent?.title
  const relatedTasks = useMemo(() => {
    if (!eventId || tasks.length === 0) return []

    return tasks.filter(
      (task) =>
        task.calendarEventIds?.includes(eventId) ||
        (!task.completed &&
          task.title &&
          eventTitle &&
          task.title.toLowerCase() === eventTitle.toLowerCase())
    )
  }, [eventId, eventTitle, tasks])

  // Find tasks due on the selected calendar day
  const dayDueTasks = useMemo(() => {
    if (!selectedDayKey || tasks.length === 0) return []

    // Get IDs already shown in relatedTasks to avoid duplicates
    const relatedIds = new Set(relatedTasks.map((t) => t.id))

    return tasks.filter(
      (task) => !task.archived && task.dueDate === selectedDayKey && !relatedIds.has(task.id)
    )
  }, [selectedDayKey, tasks, relatedTasks])

  const hasLinkedContacts = linkedContacts.length > 0

  if (!selectedEvent) {
    return (
      <aside className="calendar-detail">
        <EmptyState
          label="Event Details"
          title="No event selected"
          description="Select an event from the timeline to inspect details and take action."
          hint="Unlocks: RSVP controls, alerts, and edit history."
        />

        {dayDueTasks.length > 0 && (
          <div className="calendar-detail__tasks">
            <p className="section-label">Tasks Due {selectedDayKey}</p>
            {dayDueTasks.map((task) => (
              <Link
                key={task.id}
                to={`/planner?taskId=${task.id}`}
                className="calendar-detail__task-link"
              >
                <span
                  className={`calendar-detail__task-status ${task.completed ? 'completed' : ''}`}
                >
                  {task.completed ? '\u2713' : '\u25CB'}
                </span>
                <span>{task.title}</span>
              </Link>
            ))}
          </div>
        )}
      </aside>
    )
  }
  const selectedIsRecurring = Boolean(
    selectedEvent.recurrence?.recurrenceRules?.length || selectedEvent.providerRef?.recurringEventId
  )
  const selectedSyncState = getSyncStateDisplay(selectedEvent.syncState)
  const selectedEventCanEdit = canEditEvent(selectedEvent, calendarsById)
  const selectedEventCanDelete = canDeleteEvent(selectedEvent, calendarsById)

  return (
    <aside className="calendar-detail">
      <p className="section-label">Event details</p>
      <h2>
        {selectedEvent.title}
        {selectedIsRecurring && (
          <span className="recurrence-indicator" title="Recurring event">
            ↻
          </span>
        )}
        <span
          className={`sync-indicator ${selectedSyncState.className}`}
          title={selectedSyncState.label}
        >
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
            {selectedEvent.recurrenceV2
              ? describeRecurrence(selectedEvent.recurrenceV2)
              : 'Recurring series'}
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

      {/* Linked Contacts Section */}
      {linkedContacts.length > 0 && (
        <div className="calendar-detail__contacts">
          <p className="section-label">Linked Contacts</p>
          {linkedContacts.map((contact) => (
            <Link
              key={contact.contactId}
              to={`/people?contactId=${contact.contactId}`}
              className="calendar-detail__contact-link"
            >
              <span className="calendar-detail__contact-avatar">
                {getInitials(contact.displayName)}
              </span>
              <span className="calendar-detail__contact-name">{contact.displayName}</span>
              <span className="calendar-detail__contact-circle">
                {CIRCLE_LABELS[contact.circle as DunbarCircle]}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Related Tasks Section */}
      {relatedTasks.length > 0 && (
        <div className="calendar-detail__tasks">
          <p className="section-label">Related Tasks</p>
          {relatedTasks.map((task) => (
            <Link
              key={task.id}
              to={`/planner?taskId=${task.id}`}
              className="calendar-detail__task-link"
            >
              <span className={`calendar-detail__task-status ${task.completed ? 'completed' : ''}`}>
                {task.completed ? '✓' : '○'}
              </span>
              <span>{task.title}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Tasks Due on Selected Day */}
      {dayDueTasks.length > 0 && (
        <div className="calendar-detail__tasks">
          <p className="section-label">Tasks Due {selectedDayKey}</p>
          {dayDueTasks.map((task) => (
            <Link
              key={task.id}
              to={`/planner?taskId=${task.id}`}
              className="calendar-detail__task-link"
            >
              <span className={`calendar-detail__task-status ${task.completed ? 'completed' : ''}`}>
                {task.completed ? '\u2713' : '\u25CB'}
              </span>
              <span>{task.title}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Meeting Prep Button */}
      {hasLinkedContacts && (
        <button
          className="primary-button calendar-detail__prep-btn"
          type="button"
          onClick={() => setShowBriefing(true)}
        >
          Prepare for Meeting
        </button>
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
        {selectedEvent.writebackError && (
          <p className="writeback-error">{selectedEvent.writebackError.message}</p>
        )}
        {selectedEvent.lastWritebackAtMs && (
          <p className="calendar-meta">
            Last synced: {new Date(selectedEvent.lastWritebackAtMs).toLocaleString()}
          </p>
        )}
        {(selectedEvent.syncState === 'error' || selectedEvent.syncState === 'conflict') && (
          <button
            className="ghost-button retry-button"
            type="button"
            onClick={onRetryWriteback}
            disabled={!isOnline}
          >
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
        <button
          className="ghost-button"
          type="button"
          onClick={onEdit}
          disabled={!selectedEventCanEdit}
          title={selectedEventCanEdit ? undefined : 'You do not have permission to edit this event'}
        >
          Edit
        </button>
        <button
          className="ghost-button danger"
          type="button"
          onClick={onDelete}
          disabled={!selectedEventCanDelete}
          title={
            selectedEventCanDelete ? undefined : 'You do not have permission to delete this event'
          }
        >
          Delete
        </button>
      </div>

      {!selectedEventCanEdit && (
        <p className="read-only-indicator">👁 View only - you cannot edit this event</p>
      )}

      {/* Meeting Briefing Modal */}
      {showBriefing && (
        <MeetingBriefingModal
          isOpen={showBriefing}
          onClose={() => setShowBriefing(false)}
          eventId={selectedEvent.canonicalEventId}
          eventTitle={selectedEvent.title ?? 'Untitled event'}
          eventTime={
            selectedEvent.allDay
              ? 'All day'
              : `${timeFormatter.format(new Date(selectedEvent.startIso))} – ${timeFormatter.format(new Date(selectedEvent.endIso))}`
          }
        />
      )}
    </aside>
  )
}
