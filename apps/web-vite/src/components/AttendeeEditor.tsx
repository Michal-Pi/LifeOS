'use client'

import type { CanonicalAttendee } from '@lifeos/calendar'
import { useState } from 'react'

interface AttendeeEditorProps {
  attendees: CanonicalAttendee[]
  onAttendeesChange: (attendees: CanonicalAttendee[]) => void
  sendUpdates: boolean
  onSendUpdatesChange: (value: boolean) => void
  isDisabled?: boolean
}

/**
 * Email validation regex - simple but effective
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function AttendeeEditor({
  attendees,
  onAttendeesChange,
  sendUpdates,
  onSendUpdatesChange,
  isDisabled = false,
}: AttendeeEditorProps) {
  const [newEmail, setNewEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)

  // Filter out organizer from the editable list
  const editableAttendees = attendees.filter((a) => !a.organizer)

  const handleAddAttendee = () => {
    const email = newEmail.trim().toLowerCase()

    if (!email) {
      setEmailError('Please enter an email address')
      return
    }

    if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email address')
      return
    }

    // Check if already exists
    if (attendees.some((a) => a.email?.toLowerCase() === email)) {
      setEmailError('This person is already invited')
      return
    }

    // Add new attendee
    const newAttendee: CanonicalAttendee = {
      email,
      responseStatus: 'needsAction',
    }

    onAttendeesChange([...attendees, newAttendee])
    setNewEmail('')
    setEmailError(null)
  }

  const handleRemoveAttendee = (email: string) => {
    onAttendeesChange(attendees.filter((a) => a.email?.toLowerCase() !== email.toLowerCase()))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddAttendee()
    }
  }

  return (
    <div className="attendee-edit-section">
      <span className="section-label">Manage Attendees</span>

      {/* Add attendee input */}
      <div className="attendee-input-row">
        <input
          type="email"
          className="attendee-input"
          placeholder="Add email address..."
          value={newEmail}
          onChange={(e) => {
            setNewEmail(e.target.value)
            setEmailError(null)
          }}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
        />
        <button
          type="button"
          className="add-attendee-button"
          onClick={handleAddAttendee}
          disabled={isDisabled || !newEmail.trim()}
        >
          Add
        </button>
      </div>

      {emailError && (
        <p className="form-error" style={{ marginTop: '-0.5rem', marginBottom: '0.5rem' }}>
          {emailError}
        </p>
      )}

      {/* Current attendees list (editable) */}
      {editableAttendees.length > 0 && (
        <div className="attendee-items" style={{ marginTop: '0.5rem' }}>
          {editableAttendees.map((attendee) => (
            <div key={attendee.email} className="attendee-item">
              <div className="attendee-avatar">
                {attendee.displayName?.[0]?.toUpperCase() ||
                  attendee.email?.[0]?.toUpperCase() ||
                  '?'}
              </div>
              <div className="attendee-info">
                <span className="attendee-name">
                  {attendee.displayName || attendee.email}
                  {attendee.self && <span className="you-badge">You</span>}
                </span>
                {attendee.displayName && attendee.email && (
                  <span className="attendee-email">{attendee.email}</span>
                )}
              </div>
              <button
                type="button"
                className="remove-attendee-button"
                onClick={() => handleRemoveAttendee(attendee.email!)}
                disabled={isDisabled}
                title="Remove attendee"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {editableAttendees.length === 0 && (
        <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', margin: '0.5rem 0 0' }}>
          No guests yet. Add email addresses above.
        </p>
      )}

      {/* Send updates toggle */}
      <div className="send-updates-toggle">
        <input
          type="checkbox"
          id="send-updates"
          checked={sendUpdates}
          onChange={(e) => onSendUpdatesChange(e.target.checked)}
          disabled={isDisabled}
        />
        <label htmlFor="send-updates">Send update emails to guests</label>
      </div>
    </div>
  )
}
