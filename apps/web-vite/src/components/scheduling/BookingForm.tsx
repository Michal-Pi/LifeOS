/**
 * @fileoverview Guest details form shown in the booking confirmation step.
 */

import { useState } from 'react'

interface TimeSlot {
  startMs: number
  endMs: number
}

interface BookingFormProps {
  slot: TimeSlot
  duration: number
  timezone: string
  linkTitle: string
  onBack: () => void
  onSubmit: (data: { guestName: string; guestEmail: string; guestNotes: string }) => Promise<void>
}

function formatDateTime(ms: number, timezone: string): string {
  return new Date(ms).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  })
}

export function BookingForm({
  slot,
  duration,
  timezone,
  linkTitle,
  onBack,
  onSubmit,
}: BookingFormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Valid email is required')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({
        guestName: name.trim(),
        guestEmail: email.trim(),
        guestNotes: notes.trim(),
      })
    } catch (err) {
      setError((err as Error).message || 'Failed to create booking')
      setSubmitting(false)
    }
  }

  return (
    <div className="booking-form">
      <div className="booking-form__summary">
        <strong>{linkTitle}</strong>
        <br />
        {formatDateTime(slot.startMs, timezone)}
        <br />
        {duration} minutes
      </div>

      <div className="booking-form__fields">
        <input
          placeholder="Your name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
        <input
          placeholder="Your email *"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <textarea
          placeholder="Anything you'd like to share? (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      {error && (
        <p
          style={{ color: 'var(--error)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}
        >
          {error}
        </p>
      )}

      <div className="booking-form__actions">
        <button type="button" className="ghost-button" onClick={onBack} disabled={submitting}>
          Back
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={handleSubmit}
          disabled={submitting || !name.trim() || !email.trim()}
        >
          {submitting ? 'Booking...' : 'Confirm Booking'}
        </button>
      </div>
    </div>
  )
}
