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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { createFirestoreCalendarEventRepository } from '@/adapters/firestoreCalendarEventRepository'
import { createFirestoreQuoteRepository } from '@/adapters/firestoreQuoteRepository'
import { listEventsByDayKeysLocally, bulkSaveEventsLocally } from '@/calendar/offlineStore'
import { getQuotesLocally, saveQuotesLocally } from '@/quotes/offlineStore'
import { HabitCheckInCard } from '@/components/habits/HabitCheckInCard'
import { IncantationDisplay } from '@/components/habits/IncantationDisplay'
import { CheckInCard } from '@/components/mind/CheckInCard'
import { MindInterventionModal } from '@/components/mind/MindInterventionModal'
import { TodayWorkout } from '@/components/training/TodayWorkout'
import { WorkoutSessionCard } from '@/components/training/WorkoutSessionCard'
import { FollowUpWidget } from '@/components/contacts/FollowUpWidget'
import { MeetingBriefingModal } from '@/components/contacts/MeetingBriefingModal'
import { MessageMailbox } from '@/components/mailbox/MessageMailbox'
import { StatusBar } from '@/components/StatusBar'
import { StatusDot } from '@/components/StatusDot'
import { useAuth } from '@/hooks/useAuth'
import { useAutoSync } from '@/hooks/useAutoSync'
import { useCalendarAccountStatus } from '@/hooks/useCalendarAccountStatus'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import { useTrainingToday } from '@/hooks/useTrainingToday'
import { calculatePriorityScore } from '@/lib/priority'
import { seedDemoTrainingData } from '@/utils/seedDemoTraining'

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
  const [searchParams] = useSearchParams()
  useAutoSync(userId, 'primary')
  const { accountStatus } = useCalendarAccountStatus(userId)
  const needsReconnect = accountStatus?.status === 'needs_attention'

  // Seed demo training data when ?demo=true is in URL
  useEffect(() => {
    if (!userId || searchParams.get('demo') !== 'true') return
    void seedDemoTrainingData(userId, new Date().toISOString().split('T')[0])
  }, [userId, searchParams])

  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<CanonicalCalendarEvent[]>([])
  const [, setEventsLoading] = useState(true)
  const [isMindModalOpen, setIsMindModalOpen] = useState(false)
  const [briefingEvent, setBriefingEvent] = useState<{
    id: string
    title: string
    time: string
  } | null>(null)
  const [quickTaskTitle, setQuickTaskTitle] = useState('')
  const [quickEventTitle, setQuickEventTitle] = useState('')

  // Load tasks
  const { tasks, loadData: loadTasks, createTask, updateTask } = useTodoOperations({ userId })

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

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  const todayKey = now.toISOString().split('T')[0]

  // Load quotes independently (local-first)
  useEffect(() => {
    if (!userId) return

    // 1. Read from IndexedDB first for instant display
    getQuotesLocally(userId)
      .then((localQuotes) => {
        if (localQuotes.length > 0) {
          setQuote(getQuoteForDate(localQuotes, todayKey))
          setLoading(false)
        }
      })
      .catch(() => {
        /* ignore local read failure */
      })

    // 2. Fetch from Firestore in background and cache
    quoteRepository
      .getQuotes(userId)
      .then((userQuotes) => {
        const quotesToUse = userQuotes.length > 0 ? userQuotes : getDefaultQuotes()
        setQuote(getQuoteForDate(quotesToUse, todayKey))
        if (userQuotes.length > 0) {
          void saveQuotesLocally(userId, userQuotes)
        }
      })
      .catch((error) => {
        logger.error('Failed to load quotes from Firestore:', error)
        // Only fall back to defaults if we don't already have a quote displayed
        setQuote((prev) => prev ?? getDefaultQuotes()[0])
      })
      .finally(() => setLoading(false))
  }, [userId, todayKey])

  // Load calendar events independently (local-first)
  useEffect(() => {
    if (!userId) return

    // 1. Read from IndexedDB first for instant display
    listEventsByDayKeysLocally(userId, [todayKey])
      .then((localEvents) => {
        if (localEvents.length > 0) {
          setEvents(localEvents.filter((e) => !isDeleted(e)))
          setEventsLoading(false)
        }
      })
      .catch(() => {
        /* ignore local read failure */
      })

    // 2. Fetch from Firestore in background and cache
    listEvents({ repository: calendarRepository }, { userId, dayKeys: [todayKey] })
      .then((canonicalEvents) => {
        const freshEvents = canonicalEvents.filter((e) => !isDeleted(e))
        setEvents(freshEvents)
        void bulkSaveEventsLocally(canonicalEvents)
      })
      .catch((error) => {
        logger.error('Failed to load calendar events from Firestore:', error)
        // Keep local data if we already have it
        setEvents((prev) => (prev.length > 0 ? prev : []))
      })
      .finally(() => setEventsLoading(false))
  }, [userId, todayKey])

  // Load tasks independently (already offline-first via useTodoOperations)
  useEffect(() => {
    if (!userId) return
    void loadTasks()
  }, [userId, loadTasks])

  // Load today's training data for exercise time metric
  const { variants: trainingVariants } = useTrainingToday(todayKey)

  // Calculate total exercise time from completed sessions
  const exerciseMinutes = useMemo(() => {
    return trainingVariants
      .filter((v) => v.session?.status === 'completed' && v.session?.durationSec)
      .reduce((sum, v) => sum + Math.round((v.session?.durationSec ?? 0) / 60), 0)
  }, [trainingVariants])

  // Convert events to display format and sort chronologically
  const displayEvents = useMemo(
    () =>
      events
        .map((event) => ({
          canonicalEventId: event.canonicalEventId,
          title: event.title || 'Untitled event',
          start: new Date(event.startMs),
          end: new Date(event.endMs),
          guests: event.attendees?.filter((a) => a.email).map((a) => a.email!) || [],
          linkedContactIds: event.linkedContactIds ?? [],
        }))
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [events]
  )
  // Calendar preview: limit to 5 events, track current/next
  const previewEvents = displayEvents.slice(0, 5)
  const remainingCount = displayEvents.length - previewEvents.length
  const currentEventIndex = useMemo(() => {
    const nowMs = now.getTime()
    // Find the first event that hasn't ended yet
    const idx = previewEvents.findIndex((evt) => evt.end.getTime() > nowMs)
    return idx
  }, [previewEvents, now])
  const hasCalendarEvents = displayEvents.length > 0

  // Task quick actions
  const completeTask = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return
      void updateTask({ ...task, completed: true })
    },
    [tasks, updateTask]
  )

  const snoozeTask = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      void updateTask({
        ...task,
        urgency: 'this_week' as const,
        dueDate: tomorrow.toISOString().split('T')[0],
      })
    },
    [tasks, updateTask]
  )

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

  const taskSummary = `${todayTasksWithoutFrog.length + (frogTask ? 1 : 0)} tasks${frogTask ? ' \u00b7 1 frog' : ''}`
  const calendarSummary = `${displayEvents.length} event${displayEvents.length !== 1 ? 's' : ''}`

  return (
    <div className="page-container today-shell-refined">
      <StatusBar>
        <span className="today-status-label">System Time</span>
        <span className="today-status-time">
          {timeWithSeconds.format(now)} <span className="today-status-cursor">█</span>
        </span>
        <StatusDot status="online" label="Online" />
      </StatusBar>

      {needsReconnect && (
        <div className="today-reconnect-banner" role="alert">
          <span>Google Calendar connection expired.</span>
          <button type="button" onClick={() => navigate('/calendar')}>
            Reconnect Google
          </button>
        </div>
      )}

      {/* Telemetry pill bar — above the grid */}
      <div className="today-telemetry-bar" data-testid="today-telemetry">
        <button className="today-telemetry-bar__pill" onClick={() => navigate('/calendar')}>
          MTG {meetingHours.toFixed(1)}h
        </button>
        <button className="today-telemetry-bar__pill" onClick={() => navigate('/calendar')}>
          FREE {freeHours.toFixed(1)}h
        </button>
        <button className="today-telemetry-bar__pill" onClick={() => navigate('/planner')}>
          UTIL {Math.round((busyHours / 24) * 100)}%
        </button>
        <button className="today-telemetry-bar__pill" onClick={() => navigate('/plan')}>
          EXERCISE {exerciseMinutes} min
        </button>
      </div>

      <div className="today-layout">
        {/* Row 1, Col 1: Morning Check-In (left) */}
        <div className="today-grid-checkin">
          <CheckInCard userId={userId} dateKey={todayKey} />
        </div>

        {/* Row 1, Col 2: Daily State — compact card (right) */}
        <section className="today-card daily-state-card today-grid-state">
          <details className="today-card-collapse" open>
            <summary className="today-collapse-header">
              <h3 className="section-label">Daily State</h3>
              <span className="today-collapse-summary">{formatter.format(now)}</span>
            </summary>
            <div className="today-collapse-body">
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-secondary)',
                  margin: 0,
                }}
              >
                {timeFormat.format(now)} {timezone}
              </p>
              <div className="daily-state-quote">
                {loading ? (
                  <p className="inspiration-loading">Loading quote...</p>
                ) : quote ? (
                  <>
                    <blockquote className="inspiration-quote">
                      &ldquo;{quote.text}&rdquo;
                    </blockquote>
                    <p className="inspiration-author">— {quote.author}</p>
                  </>
                ) : (
                  <p className="inspiration-loading">Quote unavailable</p>
                )}
              </div>
              <IncantationDisplay variant="embedded" />
            </div>
          </details>
        </section>

        {/* Row 2, Col 1: Top Priority Tasks (left) */}
        <section className="task-list-card today-card today-grid-tasks">
          <details className="today-card-collapse" open>
            <summary className="today-collapse-header">
              <h3 className="section-label">Top Priorities</h3>
              <span className="today-collapse-summary">{taskSummary}</span>
            </summary>
            <div className="today-collapse-body">
              {frogTask && (
                <div className="today-frog-task" data-testid="today-frog-task">
                  <p className="today-frog-label">Eat the Frog</p>
                  <div className="today-task-row">
                    <button
                      className="today-task-checkbox"
                      onClick={() => completeTask(frogTask.id)}
                    >
                      ○
                    </button>
                    <div className="today-task-info">
                      <span className="today-task-title">{frogTask.title}</span>
                    </div>
                    <div className="today-task-actions">
                      <button
                        className="today-task-action"
                        title="Snooze to tomorrow"
                        onClick={() => snoozeTask(frogTask.id)}
                      >
                        ⏭
                      </button>
                    </div>
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
                    <div key={task.id} className="today-task-row">
                      <button className="today-task-checkbox" onClick={() => completeTask(task.id)}>
                        ○
                      </button>
                      <div className="today-task-info">
                        <span className="today-task-title">{task.title}</span>
                        <span className="priority-score">{calculatePriorityScore(task)}</span>
                      </div>
                      <div className="today-task-actions">
                        <button
                          className="today-task-action"
                          title="Snooze to tomorrow"
                          onClick={() => snoozeTask(task.id)}
                        >
                          ⏭
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="today-quick-add">
                <input
                  type="text"
                  className="today-quick-add__input"
                  value={quickTaskTitle}
                  onChange={(e) => setQuickTaskTitle(e.target.value)}
                  placeholder="+ Add a task for today..."
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
              </div>
            </div>
          </details>
        </section>

        {/* Row 2, Col 2: Calendar Preview — compact (right) */}
        <section className="calendar-preview-card today-card today-grid-calendar">
          <details className="today-card-collapse" open>
            <summary className="today-collapse-header">
              <h3 className="section-label">Calendar Preview</h3>
              <span className="today-collapse-summary">{calendarSummary}</span>
            </summary>
            <div className="today-collapse-body">
              {hasCalendarEvents ? (
                <>
                  {previewEvents.map((evt, index) => (
                    <div
                      key={`${evt.canonicalEventId}-${index}`}
                      className={`today-event-row${index === currentEventIndex ? ' today-event-row--current' : ''}`}
                    >
                      <span className="today-event-time">{timeFormat.format(evt.start)}</span>
                      <span className="today-event-title">{evt.title}</span>
                      {evt.guests.length > 0 && (
                        <span className="today-event-guests">{evt.guests.length}</span>
                      )}
                      {evt.linkedContactIds.length > 0 && (
                        <button
                          className="today-event-prep"
                          onClick={(e) => {
                            e.stopPropagation()
                            setBriefingEvent({
                              id: evt.canonicalEventId,
                              title: evt.title,
                              time: `${timeFormat.format(evt.start)} - ${timeFormat.format(evt.end)}`,
                            })
                          }}
                        >
                          Prep
                        </button>
                      )}
                    </div>
                  ))}
                  {remainingCount > 0 && (
                    <Link to="/calendar" className="today-see-more">
                      +{remainingCount} more events &rarr; See full calendar
                    </Link>
                  )}
                  {remainingCount === 0 && (
                    <Link to="/calendar" className="today-see-more">
                      See full calendar &rarr;
                    </Link>
                  )}
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          </details>
        </section>

        {/* Row 3, Col 1: Message Inbox (left) */}
        <MessageMailbox maxMessages={10} />

        {/* Row 3, Col 2: Daily Momentum (right) */}
        <section className="today-card daily-momentum-card today-grid-momentum">
          <details className="today-card-collapse" open>
            <summary className="today-collapse-header">
              <h3 className="section-label">Daily Momentum</h3>
              <span className="today-collapse-summary">Habits + Training</span>
            </summary>
            <div className="today-collapse-body">
              <HabitCheckInCard userId={userId} dateKey={todayKey} variant="embedded" />
              <TodayWorkout userId={userId} dateKey={todayKey} variant="embedded" />
              <WorkoutSessionCard dateKey={todayKey} variant="embedded" />
            </div>
          </details>
        </section>

        {/* Row 4: Follow-Up Reminders (full width) */}
        <FollowUpWidget maxContacts={8} />
      </div>

      {/* Meeting Briefing Modal */}
      {briefingEvent && (
        <MeetingBriefingModal
          isOpen={true}
          onClose={() => setBriefingEvent(null)}
          eventId={briefingEvent.id}
          eventTitle={briefingEvent.title}
          eventTime={briefingEvent.time}
        />
      )}

      {/* Mind Intervention Modal */}
      <MindInterventionModal
        isOpen={isMindModalOpen}
        onClose={() => setIsMindModalOpen(false)}
        dateKey={todayKey}
        trigger="today_prompt"
      />
    </div>
  )
}
