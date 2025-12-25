import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import { calculatePriorityScore } from '@/lib/priority'
import { calculateWeightedProgress } from '@/lib/progress'

export function WeeklyReviewPage() {
  const { user } = useAuth()
  const userId = user?.uid ?? ''
  const { tasks, projects, loading, loadData } = useTodoOperations({ userId })
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (userId) {
      void loadData()
    }
  }, [userId, loadData])

  const completedThisWeek = useMemo(() => {
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
    return tasks.filter(t => t.completed && t.completedAt && new Date(t.completedAt) > oneWeekAgo)
  }, [tasks])

  const pendingHighPriority = useMemo(() => {
    return tasks.filter(t => !t.completed && calculatePriorityScore(t) > 50)
  }, [tasks])

  const steps = [
    {
      title: 'Review Completed Tasks',
      content: (
        <div className="review-step">
          <p>You completed {completedThisWeek.length} tasks this week. Great job!</p>
          <ul className="review-list">
            {completedThisWeek.map(t => (
              <li key={t.id} className="review-item completed">
                <span className="check">✓</span> {t.title}
              </li>
            ))}
          </ul>
        </div>
      )
    },
    {
      title: 'Check Pending Priorities',
      content: (
        <div className="review-step">
          <p>These high-priority tasks are still pending. Should they be scheduled for next week?</p>
          <ul className="review-list">
            {pendingHighPriority.map(t => (
              <li key={t.id} className="review-item pending">
                <span className="priority-badge">{calculatePriorityScore(t)}</span> {t.title}
              </li>
            ))}
          </ul>
        </div>
      )
    },
    {
      title: 'Project Progress',
      content: (
        <div className="review-step">
          <p>Review your active projects.</p>
          <div className="project-review-grid">
            {projects.map(p => {
              const { progress } = calculateWeightedProgress(tasks.filter(t => t.projectId === p.id))
              
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
      )
    }
  ]

  if (loading) return <div className="loading-screen">Loading review data...</div>

  return (
    <div className="weekly-review-page">
      <header className="review-header">
        <h1>Weekly Review</h1>
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
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Previous
        </button>
        
        {step < steps.length - 1 ? (
          <button 
            className="primary-button" 
            onClick={() => setStep(s => s + 1)}
          >
            Next
          </button>
        ) : (
          <button 
            className="primary-button success" 
            onClick={() => alert('Review Complete!')}
          >
            Finish Review
          </button>
        )}
      </footer>
    </div>
  )
}
