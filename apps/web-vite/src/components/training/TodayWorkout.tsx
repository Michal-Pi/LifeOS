/**
 * TodayWorkout Component
 *
 * Displays today's workout from the active plan on TodayPage.
 * Shows template assignment based on current day of week with context variants.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useWorkoutPlan } from '@/hooks/useWorkoutPlan'
import { useWorkoutTemplates } from '@/hooks/useWorkoutTemplates'
import { useWorkoutOperations } from '@/hooks/useWorkoutOperations'
import type { WorkoutTemplate, WorkoutContext, SessionStatus } from '@lifeos/training'

interface TodayWorkoutProps {
  dateKey: string
  userId: string
  variant?: 'card' | 'embedded'
}

const CONTEXT_ICONS: Record<WorkoutContext, string> = {
  gym: '🏋️',
  home: '🏠',
  road: '🏃',
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function TodayWorkout({ dateKey, userId, variant = 'card' }: TodayWorkoutProps) {
  const { activePlan, getActivePlan } = useWorkoutPlan()
  const { templates, listTemplates } = useWorkoutTemplates()
  const { sessions, listSessions, createSession, updateSession } = useWorkoutOperations()

  const [selectedContext, setSelectedContext] = useState<WorkoutContext>('gym')
  const [isStarting, setIsStarting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Load plan and templates
  useEffect(() => {
    const load = async () => {
      if (!userId) return
      try {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/2bddec7c-aa7e-4f19-a8ce-8da88e49811f', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'TodayWorkout.tsx:42',
            message: 'Loading workout data',
            data: { userId },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'workout-debug',
            hypothesisId: 'C',
          }),
        }).catch(() => {})
        // #endregion

        await Promise.all([getActivePlan(), listTemplates()])

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/2bddec7c-aa7e-4f19-a8ce-8da88e49811f', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'TodayWorkout.tsx:46',
            message: 'Workout data loaded successfully',
            data: {},
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'workout-debug',
            hypothesisId: 'C',
          }),
        }).catch(() => {})
        // #endregion

        setLoadError(null)
      } catch (err) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/2bddec7c-aa7e-4f19-a8ce-8da88e49811f', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'TodayWorkout.tsx:50',
            message: 'Workout data load error',
            data: {
              errorName: (err as Error).name,
              errorMessage: (err as Error).message,
              errorCode: (err as Error & { code?: string }).code,
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'workout-debug',
            hypothesisId: 'C',
          }),
        }).catch(() => {})
        // #endregion

        console.error('Failed to load workout data:', err)
        setLoadError((err as Error).message)
      }
    }
    void load()
  }, [userId, getActivePlan, listTemplates])

  // Load today's sessions
  useEffect(() => {
    if (!userId) return
    const loadSessions = async () => {
      try {
        await listSessions(dateKey)
        setLoadError(null)
      } catch (err) {
        console.error('Failed to load workout sessions:', err)
        setLoadError((err as Error).message)
      }
    }
    void loadSessions()
  }, [userId, dateKey, listSessions])

  // Get today's day of week (0-6)
  const dayOfWeek = useMemo(() => {
    const date = new Date(dateKey + 'T00:00:00')
    return date.getDay()
  }, [dateKey])

  // Get today's schedule from active plan
  const todaySchedule = useMemo(() => {
    if (!activePlan) return null
    return activePlan.schedule.find((s) => s.dayOfWeek === dayOfWeek)
  }, [activePlan, dayOfWeek])

  // Get available templates for today
  const availableTemplates = useMemo(() => {
    if (!todaySchedule) return []

    const result: Array<{ context: WorkoutContext; template: WorkoutTemplate }> = []

    const gymTemplateId = todaySchedule.variants.gymTemplateId
    const homeTemplateId = todaySchedule.variants.homeTemplateId
    const roadTemplateId = todaySchedule.variants.roadTemplateId

    if (gymTemplateId) {
      const template = templates.find((t) => t.templateId === gymTemplateId)
      if (template) result.push({ context: 'gym', template })
    }
    if (homeTemplateId) {
      const template = templates.find((t) => t.templateId === homeTemplateId)
      if (template) result.push({ context: 'home', template })
    }
    if (roadTemplateId) {
      const template = templates.find((t) => t.templateId === roadTemplateId)
      if (template) result.push({ context: 'road', template })
    }

    return result
  }, [todaySchedule, templates])

  // Get selected template
  const selectedTemplate = useMemo(() => {
    return availableTemplates.find((t) => t.context === selectedContext)?.template || null
  }, [availableTemplates, selectedContext])

  // Get today's session
  const todaySession = useMemo(() => {
    return sessions.find((s) => s.dateKey === dateKey)
  }, [sessions, dateKey])

  // Auto-select first available context
  useEffect(() => {
    if (
      availableTemplates.length > 0 &&
      !availableTemplates.find((t) => t.context === selectedContext)
    ) {
      setSelectedContext(availableTemplates[0].context)
    }
  }, [availableTemplates, selectedContext])

  const handleStartWorkout = useCallback(async () => {
    if (!selectedTemplate || !userId) return

    setIsStarting(true)
    try {
      if (todaySession) {
        // Resume existing session
        await updateSession(todaySession.sessionId, { status: 'in_progress' })
      } else {
        // Create new session from template
        await createSession({
          userId,
          dateKey,
          context: selectedContext,
          templateId: selectedTemplate.templateId,
          title: selectedTemplate.title,
          status: 'in_progress',
          items: selectedTemplate.items.map((item) => ({
            exerciseId: item.exerciseId,
            displayName: item.displayName,
            sets: [],
            notes: '',
          })),
        })
      }

      // Refresh sessions
      await listSessions(dateKey)
    } catch (err) {
      console.error('Failed to start workout:', err)
    } finally {
      setIsStarting(false)
    }
  }, [
    selectedTemplate,
    userId,
    todaySession,
    dateKey,
    selectedContext,
    createSession,
    updateSession,
    listSessions,
  ])

  // If no active plan
  if (!activePlan) {
    return (
      <section
        className={`today-workout-card ${variant === 'embedded' ? 'today-subsection today-workout-card--embedded' : ''}`}
      >
        <div className="today-workout-header">
          <p className="section-label">Training</p>
        </div>
        {loadError && (
          <div className="empty-state">
            <p className="empty-state-text">Workout data unavailable</p>
            <p className="empty-state-hint">{loadError}</p>
          </div>
        )}
        <div className="empty-state">
          <p className="empty-state-text">No active plan yet</p>
          <p className="empty-state-hint">Set one up to schedule workouts for the week.</p>
        </div>
      </section>
    )
  }

  // If rest day
  if (todaySchedule?.restDay) {
    return (
      <section
        className={`today-workout-card ${variant === 'embedded' ? 'today-subsection today-workout-card--embedded' : ''}`}
      >
        <div className="today-workout-header">
          <p className="section-label">Today's Workout · {DAY_NAMES[dayOfWeek]}</p>
        </div>
        <div className="rest-day-message">
          <span className="rest-day-icon">😌</span>
          <p className="rest-day-text">Recovery day</p>
          <p className="rest-day-hint">Protect the reset and come back stronger.</p>
        </div>
      </section>
    )
  }

  // If no templates assigned
  if (availableTemplates.length === 0) {
    return (
      <section
        className={`today-workout-card ${variant === 'embedded' ? 'today-subsection today-workout-card--embedded' : ''}`}
      >
        <div className="today-workout-header">
          <p className="section-label">Today's Workout · {DAY_NAMES[dayOfWeek]}</p>
        </div>
        <div className="empty-state">
          <p className="empty-state-text">No workout assigned</p>
          <p className="empty-state-hint">Add a template to your plan for today.</p>
        </div>
      </section>
    )
  }

  // Get session status
  const sessionStatus: SessionStatus = todaySession?.status || 'planned'
  const isCompleted = sessionStatus === 'completed'
  const isInProgress = sessionStatus === 'in_progress'

  return (
    <section
      className={`today-workout-card ${variant === 'embedded' ? 'today-subsection today-workout-card--embedded' : ''}`}
    >
      <div className="today-workout-header">
        <div>
          <p className="section-label">Today's Workout · {DAY_NAMES[dayOfWeek]}</p>
          {isCompleted && <span className="workout-status-badge completed">Completed</span>}
          {isInProgress && <span className="workout-status-badge in-progress">In Progress</span>}
        </div>
      </div>

      {/* Context Selector */}
      {availableTemplates.length > 1 && (
        <div className="workout-context-selector">
          {availableTemplates.map(({ context }) => (
            <button
              key={context}
              className={`context-selector-button ${selectedContext === context ? 'active' : ''}`}
              onClick={() => setSelectedContext(context)}
            >
              <span className="context-icon">{CONTEXT_ICONS[context]}</span>
              <span className="context-label">{context}</span>
            </button>
          ))}
        </div>
      )}

      {/* Selected Template */}
      {selectedTemplate && (
        <div className="today-workout-content">
          <div className="workout-template-info">
            <div className="workout-template-header">
              <h3 className="workout-template-title">{selectedTemplate.title}</h3>
              <span className="workout-context-badge">
                {CONTEXT_ICONS[selectedContext]} {selectedContext}
              </span>
            </div>

            <div className="workout-exercises-summary">
              <span className="exercises-count">{selectedTemplate.items.length} exercises</span>
              <ul className="exercises-preview">
                {selectedTemplate.items.slice(0, 3).map((item, index) => (
                  <li key={index} className="exercise-preview-item">
                    {item.displayName}
                    {item.target.type === 'sets_reps' && (
                      <span className="exercise-target">
                        {' '}
                        · {item.target.sets}x
                        {typeof item.target.reps === 'number'
                          ? item.target.reps
                          : `${item.target.reps.min}-${item.target.reps.max}`}
                      </span>
                    )}
                  </li>
                ))}
                {selectedTemplate.items.length > 3 && (
                  <li className="exercise-preview-more">
                    +{selectedTemplate.items.length - 3} more
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* Action Button */}
          {!isCompleted && (
            <button
              className="primary-button workout-start-button"
              onClick={handleStartWorkout}
              disabled={isStarting}
            >
              {isStarting ? 'Starting...' : isInProgress ? 'Continue Workout' : 'Start Workout'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
