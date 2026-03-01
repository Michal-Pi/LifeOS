/**
 * @fileoverview Modal form for creating/editing a scheduling link.
 */

import { useState, useEffect, useCallback } from 'react'
import { Modal } from '@/components/ui/Modal'
import { FormField } from '@/components/ui/FormField'
import { Input } from '@/components/ui/Input'
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

  const modalFooter = (
    <>
      <button type="button" className="ghost-button" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="primary-button" onClick={handleSubmit} disabled={saving}>
        {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Link'}
      </button>
    </>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEditing ? 'Edit Scheduling Link' : 'New Scheduling Link'}
      footer={modalFooter}
    >
      <div className="scheduling-link-form">
        {/* Title & Slug */}
        <div className="form-section">
          <FormField label="Title" htmlFor="sl-title" required>
            <Input
              id="sl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 30-Minute Chat"
            />
          </FormField>
          <FormField label="Slug" htmlFor="sl-slug">
            <div className="scheduling-link-form__slug-preview">
              <span className="scheduling-link-form__slug-prefix">
                {window.location.origin}/schedule/
              </span>
              <Input
                id="sl-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(slugify(e.target.value))
                  setSlugManual(true)
                }}
                placeholder="my-meeting"
              />
            </div>
          </FormField>
          <FormField label="Description" htmlFor="sl-desc">
            <textarea
              id="sl-desc"
              className="ui-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this meeting about?"
              rows={2}
            />
          </FormField>
        </div>

        {/* Duration Selection */}
        <div className="form-section">
          <span className="section-label">Durations</span>
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
            <FormField label="Default duration" htmlFor="sl-default-duration">
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
            </FormField>
          )}
        </div>

        {/* Calendar & Timezone */}
        <div className="form-section">
          <FormField label="Calendar" htmlFor="sl-calendar" required>
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
          </FormField>
          <FormField label="Timezone" htmlFor="sl-timezone">
            <Input
              id="sl-timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/New_York"
            />
          </FormField>
        </div>

        {/* Availability */}
        <div className="form-section">
          <span className="section-label">Availability</span>
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
                          className="ui-input"
                          value={w.start}
                          onChange={(e) => updateWindow(key, i, 'start', e.target.value)}
                        />
                        <span>to</span>
                        <input
                          type="time"
                          className="ui-input"
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
            <FormField label="Buffer (minutes)" htmlFor="sl-buffer">
              <Input
                id="sl-buffer"
                type="number"
                min={0}
                max={120}
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(Number(e.target.value))}
              />
            </FormField>
            <FormField label="Max days ahead" htmlFor="sl-max-days">
              <Input
                id="sl-max-days"
                type="number"
                min={1}
                max={365}
                value={maxDaysAhead}
                onChange={(e) => setMaxDaysAhead(Number(e.target.value))}
              />
            </FormField>
          </div>
          <FormField label="Location" htmlFor="sl-location">
            <Input
              id="sl-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Google Meet, Zoom link, office address..."
            />
          </FormField>
          <div className="form-group form-checkbox">
            <input
              id="sl-conferencing"
              type="checkbox"
              checked={addConferencing}
              onChange={(e) => setAddConferencing(e.target.checked)}
            />
            <label htmlFor="sl-conferencing">Auto-add Google Meet</label>
          </div>
        </div>

        {/* Branding */}
        <div className="form-section">
          <span className="section-label">Branding (optional)</span>
          <FormField label="Accent color" htmlFor="sl-accent">
            <div className="scheduling-link-form__color-input">
              <input
                id="sl-accent"
                type="color"
                value={accentColor || '#0313a6'}
                onChange={(e) => setAccentColor(e.target.value)}
              />
              <Input
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                placeholder="#0313a6"
              />
            </div>
          </FormField>
          <FormField label="Welcome message" htmlFor="sl-welcome">
            <textarea
              id="sl-welcome"
              className="ui-textarea"
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder="Displayed on the booking page"
              rows={2}
            />
          </FormField>
        </div>
      </div>
    </Modal>
  )
}
