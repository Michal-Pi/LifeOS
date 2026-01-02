import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import { useWorkoutOperations } from '@/hooks/useWorkoutOperations'
import { calculatePriorityScore } from '@/lib/priority'
import { calculateWeightedProgress } from '@/lib/progress'
import { HabitsAndMindStep } from '@/components/weeklyReview/HabitsAndMindStep'
import { WorkoutStats } from '@/components/training/WorkoutStats'
import { startOfWeek, endOfWeek, format } from 'date-fns'

export function WeeklyReviewPage() {
  const { user } = useAuth()
  const userId = user?.uid ?? ''
  const { tasks, projects, loading, loadData } = useTodoOperations({ userId })
  const { sessions, listSessions } = useWorkoutOperations()
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (userId) {
      void loadData()
    }
  }, [userId, loadData])

  // Load workout sessions for the week
  useEffect(() => {
    if (!userId) return

    const loadWeekSessions = async () => {
      const today = new Date()
      const weekStart = startOfWeek(today, { weekStartsOn: 1 })
      const weekEnd = endOfWeek(today, { weekStartsOn: 1 })

      // Generate date keys for the week
      const dateKeys: string[] = []
      for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
        dateKeys.push(format(d, 'yyyy-MM-dd'))
      }

      // Load sessions for each day
      await Promise.all(dateKeys.map((dateKey) => listSessions(dateKey)))
    }

    void loadWeekSessions()
  }, [userId, listSessions])

  const completedThisWeek = useMemo(() => {
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
    return tasks.filter((t) => t.completed && t.completedAt && new Date(t.completedAt) > oneWeekAgo)
  }, [tasks])

  const pendingHighPriority = useMemo(() => {
    return tasks.filter((t) => !t.completed && calculatePriorityScore(t) > 50)
  }, [tasks])

  // Calculate week boundaries for habits review
  const today = useMemo(() => new Date(), [])
  const weekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today]) // Monday
  const weekEnd = useMemo(() => endOfWeek(today, { weekStartsOn: 1 }), [today]) // Sunday

  const steps = [
    {
      title: 'Review Completed Tasks',
      content: (
        <div className="review-step">
          <p>You completed {completedThisWeek.length} tasks this week. Great job!</p>
          <ul className="review-list">
            {completedThisWeek.map((t) => (
              <li key={t.id} className="review-item completed">
                <span className="check">✓</span> {t.title}
              </li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      title: 'Check Pending Priorities',
      content: (
        <div className="review-step">
          <p>
            These high-priority tasks are still pending. Should they be scheduled for next week?
          </p>
          <ul className="review-list">
            {pendingHighPriority.map((t) => (
              <li key={t.id} className="review-item pending">
                <span className="priority-badge">{calculatePriorityScore(t)}</span> {t.title}
              </li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      title: 'Project Progress',
      content: (
        <div className="review-step">
          <p>Review your active projects.</p>
          <div className="project-review-grid">
            {projects.map((p) => {
              const { progress } = calculateWeightedProgress(
                tasks.filter((t) => t.projectId === p.id)
              )

              return (
                <div key={p.id} className="project-review-card">
                  <h4>{p.title}</h4>
                  <div className="progress-bar-container">
                    <div className="progress-bar" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="progress-text">{progress}% complete</span>
                </div>
              )
            })}
          </div>
        </div>
      ),
    },
    {
      title: 'Habits & Mind Review',
      content: (
        <HabitsAndMindStep
          userId={userId}
          weekStartDate={weekStart}
          weekEndDate={weekEnd}
          onNext={() => setStep((s) => s + 1)}
        />
      ),
    },
    {
      title: 'Training Progress',
      content: (
        <div className="review-step">
          <p>Review your workout performance this week.</p>
          <WorkoutStats sessions={sessions} weekStartDate={weekStart} weekEndDate={weekEnd} />
        </div>
      ),
    },
  ]

  if (loading) return <div className="loading-screen">Loading review data...</div>

  return (
    <div className="page-container weekly-review-page">
      <header className="review-header">
        <p className="section-label">Weekly Review</p>
        <h1>Weekly Review</h1>
        <p className="review-subtitle">Reflect, triage, and set the next week in motion.</p>
        <div className="step-indicator">
          Step {step + 1} of {steps.length}
        </div>
      </header>

      <div className="review-content">
        <h2>{steps[step].title}</h2>
        {steps[step].content}
      </div>

      <footer className="review-footer">
        <button
          className="ghost-button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Previous
        </button>

        {step < steps.length - 1 ? (
          <button className="primary-button" onClick={() => setStep((s) => s + 1)}>
            Next
          </button>
        ) : (
          <button className="primary-button success" onClick={() => alert('Review Complete!')}>
            Finish Review
          </button>
        )}
      </footer>
    </div>
  )
}
