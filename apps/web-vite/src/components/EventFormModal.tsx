'use client'

import type { CanonicalCalendarEvent, RecurrenceFrequency, Weekday } from '@lifeos/calendar'

import React, { useEffect, useState, useMemo } from 'react'
import {
  isValidDateString,
  isValidTimeString,
  parseDateTimeToMs,
  isEndAfterStart,
  isValidEmail,
} from '@/lib/validation'

interface EventFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: EventFormData) => void
  initialEvent?: CanonicalCalendarEvent | null
  initialFormData?: Partial<EventFormData>
  defaultDurationMinutes?: number
  mode: 'create' | 'edit'
  isRecurrenceInstance?: boolean // If editing an instance, show scope picker
  onScopeSelect?: (scope: 'this' | 'this_and_future' | 'all') => void
}

export type RecurrenceEndType = 'never' | 'until' | 'count'

export interface RecurrenceFormData {
  frequency: RecurrenceFrequency | 'none'
  interval: number
  weekdays?: Weekday[]
  monthDay?: number
  endType: RecurrenceEndType
  untilDate?: string
  count?: number
}

export interface EventFormData {
  title: string
  description?: string
  location?: string
  attendees?: string[]
  allDay: boolean
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  timezone: string
  recurrence?: RecurrenceFormData
}

function toLocalDateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

function toLocalTimeString(date: Date): string {
  return date.toTimeString().slice(0, 5)
}

function getDefaultTimes(durationMinutes = 60) {
  const now = new Date()
  const end = new Date(now.getTime() + durationMinutes * 60 * 1000)
  return {
    startDate: toLocalDateString(now),
    startTime: toLocalTimeString(now),
    endDate: toLocalDateString(end),
    endTime: toLocalTimeString(end),
  }
}

const WEEKDAY_OPTIONS: { value: Weekday; label: string }[] = [
  { value: 'MO', label: 'Mon' },
  { value: 'TU', label: 'Tue' },
  { value: 'WE', label: 'Wed' },
  { value: 'TH', label: 'Thu' },
  { value: 'FR', label: 'Fri' },
  { value: 'SA', label: 'Sat' },
  { value: 'SU', label: 'Sun' },
]

export const EventFormModal = React.memo(function EventFormModal({
  isOpen,
  onClose,
  onSave,
  initialEvent,
  initialFormData,
  defaultDurationMinutes,
  mode,
  isRecurrenceInstance,
  onScopeSelect,
}: EventFormModalProps) {
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [attendeesInput, setAttendeesInput] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Recurrence state
  const [repeatFrequency, setRepeatFrequency] = useState<RecurrenceFrequency | 'none'>('none')
  const [repeatInterval, setRepeatInterval] = useState(1)
  const [repeatWeekdays, setRepeatWeekdays] = useState<Weekday[]>([])
  const [repeatMonthDay, setRepeatMonthDay] = useState(1)
  const [repeatEndType, setRepeatEndType] = useState<RecurrenceEndType>('never')
  const [repeatUntilDate, setRepeatUntilDate] = useState('')
  const [repeatCount, setRepeatCount] = useState(10)

  // Edit scope state (for recurring instance editing)
  const [showScopePicker, setShowScopePicker] = useState(false)
  const [selectedScope, setSelectedScope] = useState<'this' | 'this_and_future' | 'all' | null>(
    null
  )

  useEffect(() => {
    if (!isOpen) return

    if (initialEvent && mode === 'edit') {
      setTitle(initialEvent.title ?? '')
      setDescription(initialEvent.description ?? '')
      setLocation(initialEvent.location ?? '')
      const attendeeEmails = (initialEvent.attendees ?? [])
        .map((attendee) => attendee.email)
        .filter((email): email is string => Boolean(email))
      setAttendeesInput(attendeeEmails.join(', '))
      setAllDay(initialEvent.allDay ?? false)
      const startDt = new Date(initialEvent.startIso)
      const endDt = new Date(initialEvent.endIso)
      setStartDate(toLocalDateString(startDt))
      setStartTime(toLocalTimeString(startDt))
      setEndDate(toLocalDateString(endDt))
      setEndTime(toLocalTimeString(endDt))

      // Load recurrence if present
      if (initialEvent.recurrenceV2?.rule) {
        const rule = initialEvent.recurrenceV2.rule
        setRepeatFrequency(rule.freq)
        setRepeatInterval(rule.interval ?? 1)
        setRepeatWeekdays(rule.byWeekday ?? [])
        setRepeatMonthDay(rule.byMonthDay?.[0] ?? 1)
        if (rule.count) {
          setRepeatEndType('count')
          setRepeatCount(rule.count)
        } else if (rule.untilMs) {
          setRepeatEndType('until')
          setRepeatUntilDate(toLocalDateString(new Date(rule.untilMs)))
        } else {
          setRepeatEndType('never')
        }
      } else {
        setRepeatFrequency('none')
      }

      // If editing a recurring instance, show scope picker
      if (isRecurrenceInstance) {
        setShowScopePicker(true)
      }
    } else if (mode === 'create') {
      const defaults = getDefaultTimes(defaultDurationMinutes)
      const baseData: EventFormData = {
        title: '',
        allDay: false,
        startDate: defaults.startDate,
        startTime: defaults.startTime,
        endDate: defaults.endDate,
        endTime: defaults.endTime,
        timezone,
        description: '',
        location: '',
        attendees: [],
      }
      const merged = { ...baseData, ...initialFormData }
      setTitle(merged.title)
      setDescription(merged.description ?? '')
      setLocation(merged.location ?? '')
      setAttendeesInput((merged.attendees ?? []).join(', '))
      setAllDay(merged.allDay)
      setStartDate(merged.startDate)
      setStartTime(merged.startTime)
      setEndDate(merged.endDate)
      setEndTime(merged.endTime)
      setRepeatFrequency('none')
      setRepeatInterval(1)
      setRepeatWeekdays([])
      setRepeatEndType('never')
      setShowScopePicker(false)
      setSelectedScope(null)
    }
    setError(null)
  }, [
    defaultDurationMinutes,
    initialEvent,
    initialFormData,
    isOpen,
    isRecurrenceInstance,
    mode,
    timezone,
  ])

  const toggleWeekday = (day: Weekday) => {
    setRepeatWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Title is required')
      return
    }

    // For recurring instance edits, require scope selection
    if (isRecurrenceInstance && mode === 'edit' && !selectedScope) {
      setError('Please select which events to update')
      return
    }

    // Validate date format
    if (!isValidDateString(startDate)) {
      setError('Invalid start date format. Please use YYYY-MM-DD')
      return
    }

    if (!isValidDateString(endDate)) {
      setError('Invalid end date format. Please use YYYY-MM-DD')
      return
    }

    // Validate time format for non-all-day events
    if (!allDay) {
      if (!isValidTimeString(startTime)) {
        setError('Invalid start time format. Please use HH:MM')
        return
      }

      if (!isValidTimeString(endTime)) {
        setError('Invalid end time format. Please use HH:MM')
        return
      }
    }

    // Parse dates with validation
    const startMs = parseDateTimeToMs(startDate, startTime, allDay)
    if (startMs === null) {
      setError('Invalid start date/time')
      return
    }

    const endMs = allDay
      ? parseDateTimeToMs(endDate, '23:59:59', false)
      : parseDateTimeToMs(endDate, endTime, false)

    if (endMs === null) {
      setError('Invalid end date/time')
      return
    }

    // Validate end is after start
    if (!isEndAfterStart(startMs, endMs)) {
      setError(
        allDay ? 'End date must be on or after start date' : 'End time must be after start time'
      )
      return
    }

    // Build recurrence data
    let recurrence: RecurrenceFormData | undefined
    if (repeatFrequency !== 'none') {
      recurrence = {
        frequency: repeatFrequency,
        interval: repeatInterval,
        weekdays: repeatFrequency === 'WEEKLY' ? repeatWeekdays : undefined,
        monthDay: repeatFrequency === 'MONTHLY' ? repeatMonthDay : undefined,
        endType: repeatEndType,
        untilDate: repeatEndType === 'until' ? repeatUntilDate : undefined,
        count: repeatEndType === 'count' ? repeatCount : undefined,
      }
    }

    // Validate attendee emails
    const attendeeEmails = attendeesInput
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean)

    if (attendeeEmails.length > 0) {
      const invalidEmails = attendeeEmails.filter((email) => !isValidEmail(email))
      if (invalidEmails.length > 0) {
        setError(`Invalid email address(es): ${invalidEmails.join(', ')}`)
        return
      }
    }

    // Notify scope selection if editing recurring instance
    if (isRecurrenceInstance && mode === 'edit' && selectedScope && onScopeSelect) {
      onScopeSelect(selectedScope)
    }

    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      attendees: attendeeEmails,
      allDay,
      startDate,
      startTime,
      endDate,
      endTime,
      timezone,
      recurrence,
    })
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'create' ? 'New Event' : 'Edit Event'}</h2>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="event-form">
          <div className="form-group">
            <label htmlFor="title">Title *</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              autoFocus
            />
          </div>

          <div className="form-group form-checkbox">
            <input
              id="allDay"
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            <label htmlFor="allDay">All-day event</label>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="startDate">Start date</label>
              <input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            {!allDay && (
              <div className="form-group">
                <label htmlFor="startTime">Start time</label>
                <input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="endDate">End date</label>
              <input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            {!allDay && (
              <div className="form-group">
                <label htmlFor="endTime">End time</label>
                <input
                  id="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="location">Location</label>
            <input
              id="location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location"
            />
          </div>

          <div className="form-group">
            <label htmlFor="attendees">Guests</label>
            <input
              id="attendees"
              type="text"
              value={attendeesInput}
              onChange={(e) => setAttendeesInput(e.target.value)}
              placeholder="Add guest emails, separated by commas"
            />
            <p className="calendar-meta">These guests will receive an invite when synced.</p>
          </div>

          <div className="form-group">
            <label htmlFor="description">Notes</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add notes"
              rows={3}
            />
          </div>

          {/* Recurrence Options - only for create mode or editing series master */}
          {(mode === 'create' || (initialEvent?.isRecurringSeries && !isRecurrenceInstance)) && (
            <div className="recurrence-section">
              <p className="section-label">Repeat</p>

              <div className="form-group">
                <label htmlFor="repeatFrequency">Frequency</label>
                <select
                  id="repeatFrequency"
                  value={repeatFrequency}
                  onChange={(e) =>
                    setRepeatFrequency(e.target.value as RecurrenceFrequency | 'none')
                  }
                >
                  <option value="none">Does not repeat</option>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>

              {repeatFrequency !== 'none' && (
                <>
                  <div className="form-group">
                    <label htmlFor="repeatInterval">Every</label>
                    <div className="form-row">
                      <input
                        id="repeatInterval"
                        type="number"
                        min="1"
                        max="99"
                        value={repeatInterval}
                        onChange={(e) => setRepeatInterval(parseInt(e.target.value, 10) || 1)}
                        style={{ width: '80px' }}
                      />
                      <span>
                        {repeatFrequency === 'DAILY' && (repeatInterval === 1 ? 'day' : 'days')}
                        {repeatFrequency === 'WEEKLY' && (repeatInterval === 1 ? 'week' : 'weeks')}
                        {repeatFrequency === 'MONTHLY' &&
                          (repeatInterval === 1 ? 'month' : 'months')}
                        {repeatFrequency === 'YEARLY' && (repeatInterval === 1 ? 'year' : 'years')}
                      </span>
                    </div>
                  </div>

                  {repeatFrequency === 'WEEKLY' && (
                    <div className="form-group">
                      <label>On days</label>
                      <div className="weekday-picker">
                        {WEEKDAY_OPTIONS.map((day) => (
                          <button
                            key={day.value}
                            type="button"
                            className={`weekday-button ${repeatWeekdays.includes(day.value) ? 'selected' : ''}`}
                            onClick={() => toggleWeekday(day.value)}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {repeatFrequency === 'MONTHLY' && (
                    <div className="form-group">
                      <label htmlFor="repeatMonthDay">On day</label>
                      <input
                        id="repeatMonthDay"
                        type="number"
                        min="1"
                        max="31"
                        value={repeatMonthDay}
                        onChange={(e) => setRepeatMonthDay(parseInt(e.target.value, 10) || 1)}
                        style={{ width: '80px' }}
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="repeatEndType">Ends</label>
                    <select
                      id="repeatEndType"
                      value={repeatEndType}
                      onChange={(e) => setRepeatEndType(e.target.value as RecurrenceEndType)}
                    >
                      <option value="never">Never</option>
                      <option value="until">On date</option>
                      <option value="count">After occurrences</option>
                    </select>
                  </div>

                  {repeatEndType === 'until' && (
                    <div className="form-group">
                      <label htmlFor="repeatUntilDate">End date</label>
                      <input
                        id="repeatUntilDate"
                        type="date"
                        value={repeatUntilDate}
                        onChange={(e) => setRepeatUntilDate(e.target.value)}
                      />
                    </div>
                  )}

                  {repeatEndType === 'count' && (
                    <div className="form-group">
                      <label htmlFor="repeatCount">After</label>
                      <div className="form-row">
                        <input
                          id="repeatCount"
                          type="number"
                          min="1"
                          max="999"
                          value={repeatCount}
                          onChange={(e) => setRepeatCount(parseInt(e.target.value, 10) || 10)}
                          style={{ width: '80px' }}
                        />
                        <span>occurrences</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Edit Scope Picker - for editing recurring instances */}
          {showScopePicker && (
            <div className="scope-picker-section">
              <p className="section-label">Edit scope</p>
              <p className="scope-description">
                This event is part of a recurring series. Which events do you want to change?
              </p>
              <div className="scope-options">
                <label className={`scope-option ${selectedScope === 'this' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="editScope"
                    value="this"
                    checked={selectedScope === 'this'}
                    onChange={() => setSelectedScope('this')}
                  />
                  <span className="scope-label">This event only</span>
                  <span className="scope-hint">Change only this occurrence</span>
                </label>
                <label
                  className={`scope-option ${selectedScope === 'this_and_future' ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="editScope"
                    value="this_and_future"
                    checked={selectedScope === 'this_and_future'}
                    onChange={() => setSelectedScope('this_and_future')}
                  />
                  <span className="scope-label">This and future events</span>
                  <span className="scope-hint">Change this and all following occurrences</span>
                </label>
                <label className={`scope-option ${selectedScope === 'all' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="editScope"
                    value="all"
                    checked={selectedScope === 'all'}
                    onChange={() => setSelectedScope('all')}
                  />
                  <span className="scope-label">All events</span>
                  <span className="scope-hint">Change all occurrences in the series</span>
                </label>
              </div>
            </div>
          )}

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button">
              {mode === 'create' ? 'Create Event' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
})
