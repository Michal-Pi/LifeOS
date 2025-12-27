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
 * - Todo system integration
 * - Personalization options
 * - Weather integration
 * - Focus time suggestions
 */

import { isDeleted, listEvents } from '@lifeos/calendar'
import type { CanonicalCalendarEvent } from '@lifeos/calendar'
import type { Quote } from '@lifeos/core'
import { getDefaultQuotes, getQuoteForDate } from '@lifeos/core'
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { createLogger } from '@lifeos/core'

const logger = createLogger('TodayPage')

import { createFirestoreCalendarEventRepository } from '@/adapters/firestoreCalendarEventRepository'
import { createFirestoreQuoteRepository } from '@/adapters/firestoreQuoteRepository'
import { useAuth } from '@/hooks/useAuth'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import { useAutoSync } from '@/hooks/useAutoSync'
import { calculatePriorityScore } from '@/lib/priority'
import { HabitCheckInCard } from '@/components/habits/HabitCheckInCard'
import { MindInterventionModal } from '@/components/mind/MindInterventionModal'
import { IncantationDisplay } from '@/components/habits/IncantationDisplay'
import { WorkoutSessionCard } from '@/components/training/WorkoutSessionCard'

const quoteRepository = createFirestoreQuoteRepository()
const calendarRepository = createFirestoreCalendarEventRepository()

const formatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})
const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: 'numeric',
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

  // Load tasks
  const { tasks, loadData: loadTasks } = useTodoOperations({ userId })

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

  // Convert events to display format
  const displayEvents = useMemo(
    () =>
      events.map((event) => ({
        title: event.title || 'Untitled event',
        start: new Date(event.startMs),
        end: new Date(event.endMs),
        guests: event.attendees?.filter((a) => a.email).map((a) => a.email!) || [],
      })),
    [events]
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

  return (
    <div className="today-shell-refined">
      {/* Inspiration Card - Now with daily quotes */}
      <section className="inspiration-card">
        <div className="inspiration-header">
          <div>
            <p className="today-label">Today · {formatter.format(today)}</p>
            <p className="today-location">Today in {timezone}</p>
          </div>
          <div className="today-time">
            <span>{timeFormat.format(today)}</span>
            <span className="today-time-zone">{timezone}</span>
          </div>
        </div>
        <div className="inspiration-content">
          {loading ? (
            <p className="inspiration-loading">Loading quote...</p>
          ) : quote ? (
            <>
              <blockquote className="inspiration-quote">&ldquo;{quote.text}&rdquo;</blockquote>
              <p className="inspiration-author">— {quote.author}</p>
            </>
          ) : (
            <p className="inspiration-loading">No quote available</p>
          )}
        </div>
      </section>

      {/* Daily Incantations */}
      <IncantationDisplay />

      {/* Two-column layout for calendar and todos */}
      <div className="today-preview-refined">
        {/* Calendar Preview */}
        <section className="calendar-preview-card">
          <p className="section-label">Calendar Preview</p>
          <div className="calendar-events-list">
            {displayEvents.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state-text">No events today</p>
              </div>
            ) : (
              displayEvents.map((evt, index) => (
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
              ))
            )}
          </div>
        </section>

        {/* Top Priority Todos */}
        {/* Replaced static component with real data */}
        <section className="task-list-card">
          <div
            className="task-list-header"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <p className="section-label">Top Priority To-dos</p>
            <button className="ghost-button small" onClick={() => navigate('/review')}>
              Weekly Review
            </button>
          </div>
          {frogTask && (
            <div className="frog-highlight" style={{ marginBottom: '1rem' }}>
              <p className="section-label">The Frog</p>
              <div
                className="task-item"
                style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}
              >
                <span style={{ fontWeight: 600 }}>{frogTask.title}</span>
                <span className="priority-score" style={{ float: 'right', fontSize: '0.8em' }}>
                  {calculatePriorityScore(frogTask)}
                </span>
              </div>
            </div>
          )}
          <div className="task-items">
            {todayTasks.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state-text">No urgent tasks for today</p>
              </div>
            ) : (
              todayTasks.map((task) => (
                <div
                  key={task.id}
                  className="task-item"
                  style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}
                >
                  <span style={{ fontWeight: 500 }}>{task.title}</span>
                  <span className="priority-score" style={{ float: 'right', fontSize: '0.8em' }}>
                    {calculatePriorityScore(task)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Habits Check-In */}
      <HabitCheckInCard userId={userId} dateKey={todayKey} />

      {/* Workout Session Tracker */}
      <WorkoutSessionCard dateKey={todayKey} />

      {/* Mind Engine - "I'm Activated" Button */}
      <section className="mind-intervention-card">
        <div className="mind-intervention-header">
          <p className="section-label">Feeling Activated?</p>
          <p className="section-hint">Take a moment to regulate and refocus</p>
        </div>
        <button
          type="button"
          onClick={() => setIsMindModalOpen(true)}
          className="btn-primary mind-intervention-trigger"
        >
          I'm Activated
        </button>
      </section>

      {/* Mind Intervention Modal */}
      <MindInterventionModal
        isOpen={isMindModalOpen}
        onClose={() => setIsMindModalOpen(false)}
        dateKey={todayKey}
        trigger="today_prompt"
      />

      {/* Stats Grid */}
      <section className="today-stats-refined">
        <div className="stats-grid-refined">
          <div className="stat-card">
            <p className="stat-label">Meetings</p>
            <p className="stat-value">{meetingHours.toFixed(1)}h</p>
            <p className="stat-description">Hours with guests today</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Free Time</p>
            <p className="stat-value">{freeHours.toFixed(1)}h</p>
            <p className="stat-description">Available for focused work</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Utilization</p>
            <p className="stat-value">{Math.round((busyHours / 24) * 100)}%</p>
            <p className="stat-description">Calendar usage today</p>
          </div>
        </div>
      </section>
    </div>
  )
}
