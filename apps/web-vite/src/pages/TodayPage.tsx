/**
 * Today Dashboard Page - Daily Overview and Inspirational Quotes
 *
 * This page provides a daily dashboard showing:
 * - Current date, time, and location
 * - Daily inspirational quote (deterministic selection)
 * - Calendar preview with today's events
 * - Calendar statistics (meetings vs free time)
 *
 * Current Implementation Status:
 * ✅ Daily inspirational quotes with Firestore integration
 * ✅ Deterministic quote selection algorithm
 * ✅ Responsive design and real-time clock
 * ✅ Real calendar events from user's account
 * ✅ Dynamic statistics from actual calendar
 *
 * Future Enhancements:
 * - Personalization options
 * - Weather integration
 * - Focus time suggestions
 */

import { isDeleted, listEvents } from '@lifeos/calendar'
import type { CanonicalCalendarEvent } from '@lifeos/calendar'
import { createLogger, getDefaultQuotes, getQuoteForDate } from '@lifeos/core'
import type { Quote } from '@lifeos/core'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createFirestoreCalendarEventRepository } from '@/adapters/firestoreCalendarEventRepository'
import { createFirestoreQuoteRepository } from '@/adapters/firestoreQuoteRepository'
import { HabitCheckInCard } from '@/components/habits/HabitCheckInCard'
import { IncantationDisplay } from '@/components/habits/IncantationDisplay'
import { MindInterventionModal } from '@/components/mind/MindInterventionModal'
import { TodayWorkout } from '@/components/training/TodayWorkout'
import { WorkoutSessionCard } from '@/components/training/WorkoutSessionCard'
import { StatusBar } from '@/components/StatusBar'
import { StatusDot } from '@/components/StatusDot'
import { TelemetryBar } from '@/components/TelemetryBar'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useAutoSync } from '@/hooks/useAutoSync'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import { calculatePriorityScore } from '@/lib/priority'

const logger = createLogger('TodayPage')

const quoteRepository = createFirestoreQuoteRepository()
const calendarRepository = createFirestoreCalendarEventRepository()

const formatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})
const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const timeWithSeconds = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
})
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

export function TodayPage() {
  const { user } = useAuth()
  const userId = user?.uid ?? ''
  const navigate = useNavigate()
  useAutoSync(userId, 'primary')

  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<CanonicalCalendarEvent[]>([])
  const [, setEventsLoading] = useState(true)
  const [isMindModalOpen, setIsMindModalOpen] = useState(false)
  const [energyLevel, setEnergyLevel] = useState<'low' | 'med' | 'high'>('med')
  const [quickTaskTitle, setQuickTaskTitle] = useState('')
  const [quickEventTitle, setQuickEventTitle] = useState('')

  // Load tasks
  const { tasks, loadData: loadTasks, createTask } = useTodoOperations({ userId })

  const activeTasks = useMemo(() => {
    return tasks.filter((t) => !t.completed && !t.archived)
  }, [tasks])

  // Filter for today's high priority tasks
  const todayTasks = useMemo(() => {
    return activeTasks
      .filter((t) => t.urgency === 'today' || calculatePriorityScore(t) >= 50)
      .slice(0, 5)
  }, [activeTasks])

  const frogTask = useMemo(() => {
    if (activeTasks.length === 0) return null
    return [...activeTasks].sort((a, b) => calculatePriorityScore(b) - calculatePriorityScore(a))[0]
  }, [activeTasks])
  const todayTasksWithoutFrog = useMemo(() => {
    if (!frogTask) return todayTasks
    return todayTasks.filter((task) => task.id !== frogTask.id)
  }, [frogTask, todayTasks])
  const showTasksEmptyState = !frogTask && todayTasksWithoutFrog.length === 0

  const today = useMemo(() => new Date(), [])
  const todayKey = today.toISOString().split('T')[0]

  useEffect(() => {
    if (!userId) return

    const loadData = async () => {
      try {
        setLoading(true)
        setEventsLoading(true)

        // Load quotes
        const userQuotes = await quoteRepository.getQuotes(userId)
        const quotesToUse = userQuotes.length > 0 ? userQuotes : getDefaultQuotes()
        const dailyQuote = getQuoteForDate(quotesToUse, todayKey)
        setQuote(dailyQuote)

        // Load real calendar events
        const canonicalEvents = await listEvents(
          { repository: calendarRepository },
          { userId, dayKeys: [todayKey] }
        )
        const filteredEvents = canonicalEvents.filter((e) => !isDeleted(e))
        setEvents(filteredEvents)

        // Load tasks
        void loadTasks()
      } catch (error) {
        logger.error('Failed to load data:', error)
        // Fallback to first default quote
        const defaults = getDefaultQuotes()
        setQuote(defaults[0])
      } finally {
        setLoading(false)
        setEventsLoading(false)
      }
    }

    void loadData()
  }, [userId, todayKey, loadTasks])

  // Convert events to display format and sort chronologically
  const displayEvents = useMemo(
    () =>
      events
        .map((event) => ({
          title: event.title || 'Untitled event',
          start: new Date(event.startMs),
          end: new Date(event.endMs),
          guests: event.attendees?.filter((a) => a.email).map((a) => a.email!) || [],
        }))
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [events]
  )
  const hasCalendarEvents = displayEvents.length > 0

  const meetingHours = useMemo(
    () =>
      displayEvents
        .filter((evt) => evt.guests.length > 0)
        .reduce((sum, evt) => sum + (evt.end.getTime() - evt.start.getTime()) / 36e5, 0),
    [displayEvents]
  )

  const busyHours = useMemo(
    () =>
      displayEvents.reduce((sum, evt) => sum + (evt.end.getTime() - evt.start.getTime()) / 36e5, 0),
    [displayEvents]
  )

  const freeHours = Math.max(24 - busyHours, 0)

  return (
    <div className="page-container today-shell-refined">
      <StatusBar>
        <span className="today-status-label">System Time</span>
        <span className="today-status-time">
          {timeWithSeconds.format(today)} <span className="today-status-cursor">█</span>
        </span>
        <StatusDot status="online" label="Online" />
      </StatusBar>

      <div className="today-layout">
        <div className="today-primary">
          {/* Top Priority Tasks */}
          <section className="task-list-card today-card">
            <div className="today-card-header">
              <div>
                <p className="section-label">Top Priority To-Dos</p>
                <p className="section-hint">Focus on what moves today forward.</p>
              </div>
            </div>
            {frogTask && (
              <div className="frog-highlight">
                <p className="section-label">The Frog</p>
                <div className="task-item task-item--row">
                  <span className="task-item-title">{frogTask.title}</span>
                  <span className="priority-score">{calculatePriorityScore(frogTask)}</span>
                </div>
              </div>
            )}
            <div className="task-items">
              {showTasksEmptyState ? (
                <div className="today-empty-row">
                  <div>
                    <p className="today-empty-title">Inbox is clear</p>
                    <p className="today-empty-text">Add a task to map your next move.</p>
                  </div>
                </div>
              ) : (
                todayTasksWithoutFrog.map((task) => (
                  <div key={task.id} className="task-item task-item--row">
                    <span className="task-item-title">{task.title}</span>
                    <span className="priority-score">{calculatePriorityScore(task)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="inline-input-row">
              <span className="inline-input-prefix">+</span>
              <input
                type="text"
                value={quickTaskTitle}
                onChange={(e) => setQuickTaskTitle(e.target.value)}
                placeholder="Input new task…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && quickTaskTitle.trim()) {
                    void createTask({
                      title: quickTaskTitle.trim(),
                      domain: 'work',
                      importance: 4,
                      status: 'inbox',
                      completed: false,
                      archived: false,
                    })
                    setQuickTaskTitle('')
                  }
                }}
              />
              <button
                type="button"
                className="ghost-button small"
                onClick={() => {
                  if (!quickTaskTitle.trim()) return
                  void createTask({
                    title: quickTaskTitle.trim(),
                    domain: 'work',
                    importance: 4,
                    status: 'inbox',
                    completed: false,
                    archived: false,
                  })
                  setQuickTaskTitle('')
                }}
              >
                Add
              </button>
            </div>
          </section>

          {/* Calendar Preview */}
          {hasCalendarEvents && (
            <section className="calendar-preview-card today-card">
              <div className="today-card-header">
                <div>
                  <p className="section-label">Calendar Preview</p>
                  <p className="section-hint">Your time blocks for today.</p>
                </div>
              </div>
              <div className="calendar-events-list">
                {displayEvents.map((evt, index) => (
                  <div key={`${evt.title}-${index}`} className="calendar-event-item">
                    <div className="calendar-event-time">
                      {timeFormat.format(evt.start)} - {timeFormat.format(evt.end)}
                    </div>
                    <div className="calendar-event-info">
                      <div className="calendar-event-title">{evt.title}</div>
                      {evt.guests.length > 0 && (
                        <div className="calendar-event-meta">
                          {evt.guests.length} {evt.guests.length === 1 ? 'guest' : 'guests'}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {!hasCalendarEvents && (
            <section className="calendar-preview-card calendar-preview-card--empty today-card">
              <div className="today-card-header">
                <div>
                  <p className="section-label">Calendar Preview</p>
                  <p className="section-hint">Keep a clear window for deep work.</p>
                </div>
              </div>
              <div className="today-empty-row">
                <div>
                  <p className="today-empty-title">Calendar is open</p>
                  <p className="today-empty-text">Block focus time or schedule a meeting.</p>
                </div>
              </div>
              <div className="inline-input-row">
                <span className="inline-input-prefix">+</span>
                <input
                  type="text"
                  value={quickEventTitle}
                  onChange={(e) => setQuickEventTitle(e.target.value)}
                  placeholder="Input new event…"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && quickEventTitle.trim()) {
                      navigate('/calendar')
                      setQuickEventTitle('')
                    }
                  }}
                />
                <button
                  type="button"
                  className="ghost-button small"
                  onClick={() => {
                    if (!quickEventTitle.trim()) return
                    navigate('/calendar')
                    setQuickEventTitle('')
                  }}
                >
                  Add
                </button>
              </div>
            </section>
          )}
        </div>

        <div className="today-secondary">
          <section className="today-card daily-state-card">
            <div className="today-card-header">
              <div>
                <p className="section-label">Daily State</p>
                <p className="section-hint">Signals that set your focus and tone.</p>
              </div>
              <Button variant="ghost" className="small" onClick={() => navigate('/review')}>
                Review week
              </Button>
            </div>
            <div className="daily-state-header">
              <div>
                <p className="today-label">Today · {formatter.format(today)}</p>
                <p className="today-location">Today in {timezone}</p>
              </div>
              <div className="today-time">
                <span>{timeFormat.format(today)}</span>
                <span className="today-time-zone">{timezone}</span>
              </div>
            </div>
            <div className="daily-state-quote">
              {loading ? (
                <p className="inspiration-loading">Loading quote...</p>
              ) : quote ? (
                <>
                  <blockquote className="inspiration-quote">&ldquo;{quote.text}&rdquo;</blockquote>
                  <p className="inspiration-author">— {quote.author}</p>
                </>
              ) : (
                <p className="inspiration-loading">Quote unavailable</p>
              )}
            </div>
            <div className="today-subsection">
              <div className="today-subsection-header">
                <p className="section-label">Energy Level</p>
                <p className="section-hint">Select your current level.</p>
              </div>
              <div
                className="view-toggles today-energy-toggle"
                role="group"
                aria-label="Energy level"
              >
                {(['low', 'med', 'high'] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={`view-toggle ${energyLevel === level ? 'active' : ''}`}
                    aria-pressed={energyLevel === level}
                    onClick={() => setEnergyLevel(level)}
                  >
                    {level === 'med' ? 'Medium' : level.charAt(0).toUpperCase() + level.slice(1)}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                type="button"
                onClick={() => setIsMindModalOpen(true)}
                className="small"
              >
                Adjust focus
              </Button>
            </div>
            <IncantationDisplay variant="embedded" />
          </section>

          <section className="today-card daily-momentum-card">
            <div className="today-card-header">
              <div>
                <p className="section-label">Daily Momentum</p>
                <p className="section-hint">Habits and training in one place.</p>
              </div>
            </div>
            <div className="today-card-body">
              <HabitCheckInCard userId={userId} dateKey={todayKey} variant="embedded" />
              <TodayWorkout userId={userId} dateKey={todayKey} variant="embedded" />
              <WorkoutSessionCard dateKey={todayKey} variant="embedded" />
            </div>
          </section>
        </div>
      </div>

      {/* Mind Intervention Modal */}
      <MindInterventionModal
        isOpen={isMindModalOpen}
        onClose={() => setIsMindModalOpen(false)}
        dateKey={todayKey}
        trigger="today_prompt"
      />

      {/* Stats Grid */}
      <section className="today-card today-telemetry">
        <div className="today-card-header">
          <div>
            <p className="section-label">Daily Metrics</p>
            <p className="section-hint">Meeting load and available space.</p>
          </div>
        </div>
        <TelemetryBar
          items={[
            { label: 'MTG', value: `${meetingHours.toFixed(1)}h` },
            { label: 'FREE', value: `${freeHours.toFixed(1)}h` },
            { label: 'UTIL', value: `${Math.round((busyHours / 24) * 100)}%` },
          ]}
        />
      </section>
    </div>
  )
}
