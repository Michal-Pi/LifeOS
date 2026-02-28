/**
 * @fileoverview Modal form for creating/editing a scheduling link.
 */

import { useState, useEffect, useCallback } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useCalendars } from '@/hooks/useCalendars'
import { useAuth } from '@/hooks/useAuth'
import type { SchedulingLink, WeeklyAvailability, TimeWindow } from '@/hooks/useSchedulingLinks'

interface SchedulingLinkModalProps {
  open: boolean
  link: SchedulingLink | null
  onClose: () => void
  onSave: (link: SchedulingLink) => Promise<void>
  onError: (message: string) => void
}

const AVAILABLE_DURATIONS = [15, 30, 45, 60, 90, 120]
const DAY_LABELS: { key: keyof WeeklyAvailability; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function SchedulingLinkModal({
  open,
  link,
  onClose,
  onSave,
  onError,
}: SchedulingLinkModalProps) {
  const { user } = useAuth()
  const { calendars } = useCalendars(user?.uid ?? '')

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [durations, setDurations] = useState<number[]>([30])
  const [defaultDuration, setDefaultDuration] = useState(30)
  const [calendarId, setCalendarId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [availability, setAvailability] = useState<WeeklyAvailability>({
    mon: [{ start: '09:00', end: '17:00' }],
    tue: [{ start: '09:00', end: '17:00' }],
    wed: [{ start: '09:00', end: '17:00' }],
    thu: [{ start: '09:00', end: '17:00' }],
    fri: [{ start: '09:00', end: '17:00' }],
    sat: [],
    sun: [],
  })
  const [bufferMinutes, setBufferMinutes] = useState(0)
  const [maxDaysAhead, setMaxDaysAhead] = useState(30)
  const [location, setLocation] = useState('')
  const [addConferencing, setAddConferencing] = useState(true)
  const [accentColor, setAccentColor] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [slugManual, setSlugManual] = useState(false)
  const [saving, setSaving] = useState(false)

  // Populate form when editing
  useEffect(() => {
    if (!open || !link) return
    setTitle(link.title)
    setSlug(link.slug)
    setDescription(link.description ?? '')
    setDurations(link.durations)
    setDefaultDuration(link.defaultDuration)
    setCalendarId(link.calendarId)
    setAccountId(link.accountId)
    setTimezone(link.timezone)
    setAvailability(link.availability)
    setBufferMinutes(link.bufferMinutes)
    setMaxDaysAhead(link.maxDaysAhead)
    setLocation(link.location ?? '')
    setAddConferencing(link.addConferencing)
    setAccentColor(link.branding?.accentColor ?? '')
    setWelcomeMessage(link.branding?.welcomeMessage ?? '')
    setSlugManual(!!link.slug)
  }, [open, link])

  // Auto-generate slug from title if not manually set
  useEffect(() => {
    if (!slugManual && title) {
      setSlug(slugify(title))
    }
  }, [title, slugManual])

  // Auto-select first writable calendar if none selected
  useEffect(() => {
    if (!calendarId && calendars.length > 0) {
      const writable =
        calendars.find((c) => c.canWrite && c.isPrimary) ?? calendars.find((c) => c.canWrite)
      if (writable) {
        setCalendarId(writable.providerMeta?.providerCalendarId ?? writable.calendarId)
        setAccountId(writable.providerMeta?.accountId ?? '')
      }
    }
  }, [calendarId, calendars])

  const toggleDuration = useCallback((d: number) => {
    setDurations((prev) => {
      if (prev.includes(d)) {
        const next = prev.filter((x) => x !== d)
        return next.length > 0 ? next : prev
      }
      return [...prev, d].sort((a, b) => a - b)
    })
  }, [])

  const updateWindow = useCallback(
    (day: keyof WeeklyAvailability, index: number, field: keyof TimeWindow, value: string) => {
      setAvailability((prev) => {
        const windows = [...prev[day]]
        windows[index] = { ...windows[index], [field]: value }
        return { ...prev, [day]: windows }
      })
    },
    []
  )

  const addWindow = useCallback((day: keyof WeeklyAvailability) => {
    setAvailability((prev) => ({
      ...prev,
      [day]: [...prev[day], { start: '09:00', end: '17:00' }],
    }))
  }, [])

  const removeWindow = useCallback((day: keyof WeeklyAvailability, index: number) => {
    setAvailability((prev) => ({
      ...prev,
      [day]: prev[day].filter((_, i) => i !== index),
    }))
  }, [])

  const handleSubmit = async () => {
    if (!link) return

    if (!title.trim()) {
      onError('Title is required')
      return
    }
    if (!slug.trim()) {
      onError('Slug is required')
      return
    }
    if (!calendarId) {
      onError('Please select a calendar')
      return
    }

    setSaving(true)
    try {
      const updated: SchedulingLink = {
        ...link,
        title: title.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
        durations,
        defaultDuration: durations.includes(defaultDuration) ? defaultDuration : durations[0],
        calendarId,
        accountId,
        timezone,
        availability,
        bufferMinutes,
        maxDaysAhead,
        location: location.trim() || undefined,
        addConferencing,
        branding:
          accentColor || welcomeMessage
            ? { accentColor: accentColor || undefined, welcomeMessage: welcomeMessage || undefined }
            : undefined,
        updatedAt: new Date().toISOString(),
      }
      await onSave(updated)
    } catch {
      onError('Failed to save scheduling link')
    } finally {
      setSaving(false)
    }
  }

  const writableCalendars = calendars.filter((c) => c.canWrite)
  const isEditing = link?.createdAt !== link?.updatedAt || !!link?.slug

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEditing ? 'Edit Scheduling Link' : 'New Scheduling Link'}
    >
      <div className="scheduling-link-form">
        {/* Title & Slug */}
        <div className="form-section">
          <div className="form-group">
            <label htmlFor="sl-title">Title</label>
            <input
              id="sl-title"
              className="ui-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 30-Minute Chat"
            />
          </div>
          <div className="form-group">
            <label htmlFor="sl-slug">Slug</label>
            <div className="scheduling-link-form__slug-preview">
              <span className="scheduling-link-form__slug-prefix">
                {window.location.origin}/schedule/
              </span>
              <input
                id="sl-slug"
                className="ui-input"
                value={slug}
                onChange={(e) => {
                  setSlug(slugify(e.target.value))
                  setSlugManual(true)
                }}
                placeholder="my-meeting"
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="sl-desc">Description</label>
            <textarea
              id="sl-desc"
              className="ui-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this meeting about?"
              rows={2}
            />
          </div>
        </div>

        {/* Duration Selection */}
        <div className="form-section">
          <label>Durations</label>
          <div className="scheduling-link-form__durations">
            {AVAILABLE_DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`duration-chip${durations.includes(d) ? ' duration-chip--active' : ''}`}
                onClick={() => toggleDuration(d)}
              >
                {d} min
              </button>
            ))}
          </div>
          {durations.length > 1 && (
            <div className="form-group" style={{ marginTop: '8px' }}>
              <label htmlFor="sl-default-duration">Default duration</label>
              <select
                id="sl-default-duration"
                className="ui-input"
                value={defaultDuration}
                onChange={(e) => setDefaultDuration(Number(e.target.value))}
              >
                {durations.map((d) => (
                  <option key={d} value={d}>
                    {d} minutes
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Calendar & Timezone */}
        <div className="form-section">
          <div className="form-group">
            <label htmlFor="sl-calendar">Calendar</label>
            <select
              id="sl-calendar"
              className="ui-input"
              value={calendarId}
              onChange={(e) => {
                const cal = writableCalendars.find(
                  (c) => (c.providerMeta?.providerCalendarId ?? c.calendarId) === e.target.value
                )
                setCalendarId(e.target.value)
                setAccountId(cal?.providerMeta?.accountId ?? '')
              }}
            >
              <option value="">Select a calendar</option>
              {writableCalendars.map((cal) => (
                <option
                  key={cal.calendarId}
                  value={cal.providerMeta?.providerCalendarId ?? cal.calendarId}
                >
                  {cal.name}
                  {cal.isPrimary ? ' (Primary)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="sl-timezone">Timezone</label>
            <input
              id="sl-timezone"
              className="ui-input"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/New_York"
            />
          </div>
        </div>

        {/* Availability */}
        <div className="form-section">
          <label>Availability</label>
          <div className="availability-editor">
            {DAY_LABELS.map(({ key, label }) => (
              <div key={key} className="availability-row">
                <span className="availability-row__day">{label}</span>
                <div className="availability-row__windows">
                  {availability[key].length === 0 ? (
                    <span className="availability-row__unavailable">Unavailable</span>
                  ) : (
                    availability[key].map((w, i) => (
                      <div key={i} className="time-window-input">
                        <input
                          type="time"
                          value={w.start}
                          onChange={(e) => updateWindow(key, i, 'start', e.target.value)}
                        />
                        <span>to</span>
                        <input
                          type="time"
                          value={w.end}
                          onChange={(e) => updateWindow(key, i, 'end', e.target.value)}
                        />
                        <button
                          type="button"
                          className="ghost-button small"
                          onClick={() => removeWindow(key, i)}
                          aria-label={`Remove time window for ${label}`}
                        >
                          &times;
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  className="ghost-button small"
                  onClick={() => addWindow(key)}
                  aria-label={`Add time window for ${label}`}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Buffer, Max Days, Location, Conferencing */}
        <div className="form-section">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="sl-buffer">Buffer (minutes)</label>
              <input
                id="sl-buffer"
                type="number"
                className="ui-input"
                min={0}
                max={120}
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sl-max-days">Max days ahead</label>
              <input
                id="sl-max-days"
                type="number"
                className="ui-input"
                min={1}
                max={365}
                value={maxDaysAhead}
                onChange={(e) => setMaxDaysAhead(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="sl-location">Location</label>
            <input
              id="sl-location"
              className="ui-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Google Meet, Zoom link, office address..."
            />
          </div>
          <label className="scheduling-link-form__checkbox">
            <input
              type="checkbox"
              checked={addConferencing}
              onChange={(e) => setAddConferencing(e.target.checked)}
            />
            <span>Auto-add Google Meet</span>
          </label>
        </div>

        {/* Branding */}
        <div className="form-section">
          <label>Branding (optional)</label>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="sl-accent">Accent color</label>
              <div className="scheduling-link-form__color-input">
                <input
                  id="sl-accent"
                  type="color"
                  value={accentColor || '#0313a6'}
                  onChange={(e) => setAccentColor(e.target.value)}
                />
                <input
                  className="ui-input"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  placeholder="#0313a6"
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="sl-welcome">Welcome message</label>
            <textarea
              id="sl-welcome"
              className="ui-input"
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder="Displayed on the booking page"
              rows={2}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="scheduling-link-form__actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-button" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Link'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
