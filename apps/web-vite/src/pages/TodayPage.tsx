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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNow } from '@/hooks/useNow'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useRepositories } from '@/contexts/RepositoryContext'
import { useTodayQuote } from '@/hooks/useTodayQuote'
import { useTodayCalendarPreview } from '@/hooks/useTodayCalendarPreview'

import { CheckInCard } from '@/components/mind/CheckInCard'
import { FollowUpWidget } from '@/components/contacts/FollowUpWidget'
import { MeetingBriefingModal } from '@/components/contacts/MeetingBriefingModal'
import { MessageMailbox } from '@/components/mailbox/MessageMailbox'
import { useAuth } from '@/hooks/useAuth'
import { useAutoSync } from '@/hooks/useAutoSync'
import { useCalendarAccountStatus } from '@/hooks/useCalendarAccountStatus'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import { useTrainingToday } from '@/hooks/useTrainingToday'
import { calculatePriorityScore } from '@/lib/priority'
import type { ImportanceLevel } from '@/types/todo'
import { seedDemoTrainingData } from '@/utils/seedDemoTraining'

const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const shortDateFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
})

export function TodayPage() {
  const { user } = useAuth()
  const { quoteRepository, calendarRepository } = useRepositories()
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

  const [briefingEvent, setBriefingEvent] = useState<{
    id: string
    title: string
    time: string
  } | null>(null)
  const [quickTaskTitle, setQuickTaskTitle] = useState('')
  const [quickEventTitle, setQuickEventTitle] = useState('')
  const [quickTaskImportance, setQuickTaskImportance] = useState<ImportanceLevel>(4)

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
    if (!frogTask) return todayTasks.slice(0, 4)
    return todayTasks.filter((task) => task.id !== frogTask.id).slice(0, 4)
  }, [frogTask, todayTasks])
  const showTasksEmptyState = !frogTask && todayTasksWithoutFrog.length === 0

  const now = useNow(60_000)
  const todayKey = now.toISOString().split('T')[0]

  // Compute upcoming day keys for calendar lookahead
  const upcomingDayKeys = useMemo(() => {
    const keys: string[] = []
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() + i)
      keys.push(d.toISOString().split('T')[0])
    }
    return keys
  }, [now])
  const allDayKeys = useMemo(() => [todayKey, ...upcomingDayKeys], [todayKey, upcomingDayKeys])

  const { quote, loading } = useTodayQuote({
    userId,
    todayKey,
    quoteRepository,
  })
  const { events, eventsLoading } = useTodayCalendarPreview({
    userId,
    dayKeys: allDayKeys,
    calendarRepository,
  })

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
  const allDisplayEvents = useMemo(
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

  // Split into today's events and upcoming events
  const todayStart = useMemo(() => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }, [now])
  const todayEnd = todayStart + 86_400_000

  const displayEvents = useMemo(
    () => allDisplayEvents.filter((evt) => evt.start.getTime() < todayEnd),
    [allDisplayEvents, todayEnd]
  )

  const upcomingEvents = useMemo(
    () => allDisplayEvents.filter((evt) => evt.start.getTime() >= todayEnd),
    [allDisplayEvents, todayEnd]
  )

  // Show all today events, then fill with upcoming if today has < 7
  const MAX_CALENDAR_ROWS = 12
  const todayPreview = displayEvents
  const upcomingSlots = Math.max(0, MAX_CALENDAR_ROWS - todayPreview.length)
  const upcomingPreview = upcomingEvents.slice(0, upcomingSlots)
  const remainingUpcomingCount = upcomingEvents.length - upcomingPreview.length

  const currentEventIndex = useMemo(() => {
    const nowMs = now.getTime()
    const idx = todayPreview.findIndex((evt) => evt.end.getTime() > nowMs)
    return idx
  }, [todayPreview, now])
  const hasCalendarEvents = displayEvents.length > 0 || upcomingPreview.length > 0

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
  const calendarSummary =
    upcomingPreview.length > 0
      ? `${displayEvents.length} today \u00b7 ${upcomingPreview.length} upcoming`
      : `${displayEvents.length} event${displayEvents.length !== 1 ? 's' : ''}`

  return (
    <div className="page-container today-shell-refined">
      {needsReconnect && (
        <div className="today-reconnect-banner" role="alert">
          <span>Google Calendar connection expired.</span>
          <button type="button" onClick={() => navigate('/calendar')}>
            Reconnect Google
          </button>
        </div>
      )}

      {/* Quote strip — below nav */}
      {!loading && quote && (
        <div className="today-quote-strip">
          <blockquote className="today-quote-strip__text">&ldquo;{quote.text}&rdquo;</blockquote>
          <span className="today-quote-strip__author">&mdash; {quote.author}</span>
        </div>
      )}

      {/* Telemetry pill bar — top metrics */}
      <div className="today-telemetry-bar" data-testid="today-telemetry">
        <button className="today-telemetry-bar__pill" onClick={() => navigate('/calendar')}>
          MTG {meetingHours.toFixed(1)}h
        </button>
        <button className="today-telemetry-bar__pill" onClick={() => navigate('/calendar')}>
          FREE {freeHours.toFixed(1)}h
        </button>
        <button className="today-telemetry-bar__pill" onClick={() => navigate('/planner')}>
          UTIL {Math.round((busyHours / 10) * 100)}%
        </button>
        <button className="today-telemetry-bar__pill" onClick={() => navigate('/plan')}>
          EXERCISE {exerciseMinutes} min
        </button>
      </div>

      <div className="today-layout">
        {/* Row 1, Col 1: Message Mailbox (left) */}
        <MessageMailbox maxMessages={8} />

        {/* Row 1, Col 2: Calendar Preview (right) */}
        <section className="calendar-preview-card today-card today-grid-calendar">
          <details className="today-card-collapse" open>
            <summary className="today-collapse-header">
              <h3 className="section-label">Calendar Preview</h3>
              <span className="today-collapse-summary">{calendarSummary}</span>
            </summary>
            <div className="today-collapse-body">
              {eventsLoading && events.length === 0 ? (
                <div className="today-calendar-loading">
                  <div className="today-skeleton-row" />
                  <div className="today-skeleton-row" />
                  <div className="today-skeleton-row" />
                </div>
              ) : hasCalendarEvents ? (
                <>
                  {todayPreview.length > 0 ? (
                    todayPreview.map((evt, index) => (
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
                    ))
                  ) : (
                    <div className="today-empty-row" style={{ marginTop: 0 }}>
                      <div>
                        <p className="today-empty-title">No events today</p>
                        <p className="today-empty-text">Your day is open.</p>
                      </div>
                    </div>
                  )}
                  {upcomingPreview.length > 0 && (
                    <>
                      <div className="today-event-separator">
                        <span>Later</span>
                      </div>
                      {upcomingPreview.map((evt, index) => (
                        <div
                          key={`upcoming-${evt.canonicalEventId}-${index}`}
                          className="today-event-row today-event-row--upcoming"
                        >
                          <span className="today-event-date">
                            {shortDateFormat.format(evt.start)}
                          </span>
                          <span className="today-event-time">{timeFormat.format(evt.start)}</span>
                          <span className="today-event-title">{evt.title}</span>
                          {evt.guests.length > 0 && (
                            <span className="today-event-guests">{evt.guests.length}</span>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                  <Link to="/calendar" className="today-see-more">
                    {remainingUpcomingCount > 0
                      ? `+${remainingUpcomingCount} more upcoming \u2192 See full calendar`
                      : 'See full calendar \u2192'}
                  </Link>
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
                          navigate('/calendar', { state: { eventTitle: quickEventTitle.trim() } })
                          setQuickEventTitle('')
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="ghost-button small"
                      onClick={() => {
                        if (!quickEventTitle.trim()) return
                        navigate('/calendar', { state: { eventTitle: quickEventTitle.trim() } })
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
                      aria-label={`Complete ${frogTask.title}`}
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
                        aria-label={`Snooze ${frogTask.title} to tomorrow`}
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
                      <button
                        className="today-task-checkbox"
                        onClick={() => completeTask(task.id)}
                        aria-label={`Complete ${task.title}`}
                      >
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
                          aria-label={`Snooze ${task.title} to tomorrow`}
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
                  placeholder="+ Create task..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && quickTaskTitle.trim()) {
                      void createTask({
                        title: quickTaskTitle.trim(),
                        domain: 'work',
                        importance: quickTaskImportance,
                        status: 'inbox',
                        completed: false,
                        archived: false,
                      })
                      setQuickTaskTitle('')
                      setQuickTaskImportance(4)
                    }
                  }}
                />
                {quickTaskTitle.trim() && (
                  <div className="today-quick-add__importance">
                    {([1, 2, 4, 7, 10] as const).map((level) => (
                      <button
                        key={level}
                        type="button"
                        className={`today-quick-add__importance-btn${quickTaskImportance === level ? ' active' : ''}`}
                        onClick={() => setQuickTaskImportance(level)}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </details>
        </section>

        {/* Row 2, Col 2: Follow-Up Reminders (right) */}
        <FollowUpWidget maxContacts={8} />

        {/* Row 3: Emotion Check-In (spans both columns) */}
        <CheckInCard userId={userId} dateKey={todayKey} />
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
    </div>
  )
}
