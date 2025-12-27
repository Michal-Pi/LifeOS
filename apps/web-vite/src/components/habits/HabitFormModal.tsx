/**
 * Habit Form Modal Component
 *
 * Modal for creating and editing habits.
 * Supports configuring anchors, schedules, and safety nets.
 */

import { useState, useEffect } from 'react'
import type { CanonicalHabit, HabitDomain, HabitAnchor } from '@lifeos/habits'

interface HabitFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (habit: Partial<CanonicalHabit>) => Promise<void>
  existingHabit?: CanonicalHabit | null
}

const HABIT_DOMAINS: { value: HabitDomain; label: string }[] = [
  { value: 'sleep', label: 'Sleep' },
  { value: 'exercise', label: 'Exercise' },
  { value: 'meditation', label: 'Meditation' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'work_focus', label: 'Work Focus' },
  { value: 'social', label: 'Social' },
  { value: 'learning', label: 'Learning' },
  { value: 'creativity', label: 'Creativity' },
  { value: 'custom', label: 'Custom' },
]

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

export function HabitFormModal({ isOpen, onClose, onSave, existingHabit }: HabitFormModalProps) {
  const [title, setTitle] = useState('')
  const [domain, setDomain] = useState<HabitDomain>('custom')
  const [tinyVersion, setTinyVersion] = useState('')
  const [standardVersion, setStandardVersion] = useState('')
  const [anchorType, setAnchorType] = useState<'time_window' | 'after_event'>('time_window')
  const [startTime, setStartTime] = useState('06:00')
  const [endTime, setEndTime] = useState('08:00')
  const [afterEvent, setAfterEvent] = useState('')
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]) // Mon-Fri default
  const [tinyCountsAsSuccess, setTinyCountsAsSuccess] = useState(true)
  const [allowRecovery, setAllowRecovery] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (existingHabit) {
      setTitle(existingHabit.title)
      setDomain(existingHabit.domain)
      setTinyVersion(existingHabit.recipe.tiny || '')
      setStandardVersion(existingHabit.recipe.standard)
      setSelectedDays(existingHabit.schedule.daysOfWeek)
      setTinyCountsAsSuccess(existingHabit.safetyNet.tinyCountsAsSuccess)
      setAllowRecovery(existingHabit.safetyNet.allowRecovery)

      if (existingHabit.anchor.type === 'time_window') {
        setAnchorType('time_window')
        setStartTime(existingHabit.anchor.startTimeHHMM)
        setEndTime(existingHabit.anchor.endTimeHHMM)
      } else {
        setAnchorType('after_event')
        setAfterEvent(existingHabit.anchor.eventDescription)
      }
    }
  }, [existingHabit])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      const anchor: HabitAnchor =
        anchorType === 'time_window'
          ? {
              type: 'time_window',
              startTimeHHMM: startTime,
              endTimeHHMM: endTime,
            }
          : {
              type: 'after_event',
              eventDescription: afterEvent,
            }

      const habitData: Partial<CanonicalHabit> = {
        title,
        domain,
        status: 'active',
        anchor,
        recipe: {
          tiny: tinyVersion || undefined,
          standard: standardVersion,
        },
        schedule: {
          daysOfWeek: selectedDays,
        },
        safetyNet: {
          tinyCountsAsSuccess,
          allowRecovery,
        },
      }

      await onSave(habitData)
      handleClose()
    } catch (error) {
      console.error('Failed to save habit:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    // Reset form
    setTitle('')
    setDomain('custom')
    setTinyVersion('')
    setStandardVersion('')
    setAnchorType('time_window')
    setStartTime('06:00')
    setEndTime('08:00')
    setAfterEvent('')
    setSelectedDays([1, 2, 3, 4, 5])
    setTinyCountsAsSuccess(true)
    setAllowRecovery(true)
    onClose()
  }

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    )
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content habit-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{existingHabit ? 'Edit Habit' : 'Create New Habit'}</h2>
          <button className="modal-close" onClick={handleClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <label className="form-label">
              Habit Title *
              <input
                type="text"
                className="form-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Morning Meditation"
                required
              />
            </label>

            <label className="form-label">
              Category
              <select
                className="form-select"
                value={domain}
                onChange={(e) => setDomain(e.target.value as HabitDomain)}
              >
                {HABIT_DOMAINS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Habit Recipe</h3>
            <p className="form-hint">Define the tiny and standard versions of your habit</p>

            <label className="form-label">
              Tiny Version
              <input
                type="text"
                className="form-input"
                value={tinyVersion}
                onChange={(e) => setTinyVersion(e.target.value)}
                placeholder="e.g., 1 deep breath"
              />
              <span className="form-help">The easiest version when you're struggling</span>
            </label>

            <label className="form-label">
              Standard Version *
              <input
                type="text"
                className="form-input"
                value={standardVersion}
                onChange={(e) => setStandardVersion(e.target.value)}
                placeholder="e.g., 10 minutes meditation"
                required
              />
              <span className="form-help">Your ideal target</span>
            </label>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">When to do it (Anchor)</h3>

            <div className="form-radio-group">
              <label className="form-radio">
                <input
                  type="radio"
                  name="anchorType"
                  checked={anchorType === 'time_window'}
                  onChange={() => setAnchorType('time_window')}
                />
                Time Window
              </label>
              <label className="form-radio">
                <input
                  type="radio"
                  name="anchorType"
                  checked={anchorType === 'after_event'}
                  onChange={() => setAnchorType('after_event')}
                />
                After Event
              </label>
            </div>

            {anchorType === 'time_window' ? (
              <div className="form-inline">
                <label className="form-label">
                  Start Time
                  <input
                    type="time"
                    className="form-input"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </label>
                <label className="form-label">
                  End Time
                  <input
                    type="time"
                    className="form-input"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </label>
              </div>
            ) : (
              <label className="form-label">
                After what event?
                <input
                  type="text"
                  className="form-input"
                  value={afterEvent}
                  onChange={(e) => setAfterEvent(e.target.value)}
                  placeholder="e.g., Wake up, Lunch, End workday"
                />
              </label>
            )}
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Schedule</h3>
            <p className="form-hint">Select the days you want to do this habit</p>

            <div className="days-selector">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  className={`day-button ${selectedDays.includes(day.value) ? 'active' : ''}`}
                  onClick={() => toggleDay(day.value)}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Safety Net</h3>

            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={tinyCountsAsSuccess}
                onChange={(e) => setTinyCountsAsSuccess(e.target.checked)}
              />
              Tiny version counts as success
            </label>

            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={allowRecovery}
                onChange={(e) => setAllowRecovery(e.target.checked)}
              />
              Allow recovery (can still mark as done later)
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="button-secondary" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="button-primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : existingHabit ? 'Update Habit' : 'Create Habit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
