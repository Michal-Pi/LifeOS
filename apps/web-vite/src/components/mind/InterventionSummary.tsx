/**
 * Intervention Summary Component
 *
 * Shows summary of mind interventions used during a time period.
 * Displays count, most common feeling, and breakdown by intervention type.
 */

import type { CanonicalInterventionSession, FeelingState } from '@lifeos/mind'

interface InterventionSummaryProps {
  sessions: CanonicalInterventionSession[]
  weekStart: Date
  weekEnd: Date
}

const FEELING_EMOJIS: Record<FeelingState, string> = {
  anxious: '😰',
  overwhelmed: '😵',
  angry: '😤',
  avoidant: '😶',
  restless: '😣',
  tired: '😴',
  neutral: '😌',
}

export function InterventionSummary({ sessions, weekStart, weekEnd }: InterventionSummaryProps) {
  // Filter sessions for this week
  const weekSessions = sessions.filter((session) => {
    const sessionDate = new Date(session.startedAtMs)
    return sessionDate >= weekStart && sessionDate <= weekEnd
  })

  if (weekSessions.length === 0) {
    return (
      <div className="intervention-summary-empty">
        <p>No interventions used this week.</p>
        <p className="hint">Try the "I'm Activated" button when you feel stressed!</p>
      </div>
    )
  }

  // Calculate stats
  const totalInterventions = weekSessions.length
  const completedInterventions = weekSessions.filter((s) => s.completedAtMs).length

  // Most common feeling
  const feelings = weekSessions.map((s) => s.feelingBefore).filter(Boolean) as FeelingState[]
  const feelingCounts = feelings.reduce(
    (acc, feeling) => {
      acc[feeling] = (acc[feeling] || 0) + 1
      return acc
    },
    {} as Record<FeelingState, number>
  )

  const mostCommonFeeling =
    feelings.length > 0
      ? (Object.entries(feelingCounts).sort(([, a], [, b]) => b - a)[0]?.[0] as
          | FeelingState
          | undefined)
      : undefined

  // Average duration (for completed sessions)
  const completedWithDuration = weekSessions.filter((s) => s.durationSec)
  const avgDuration =
    completedWithDuration.length > 0
      ? Math.round(
          completedWithDuration.reduce((sum, s) => sum + (s.durationSec || 0), 0) /
            completedWithDuration.length
        )
      : 0

  return (
    <div className="intervention-summary">
      <div className="summary-stats">
        <div className="stat-card">
          <span className="stat-number">{totalInterventions}</span>
          <span className="stat-label">
            Intervention{totalInterventions !== 1 ? 's' : ''} started
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-number">{completedInterventions}</span>
          <span className="stat-label">Completed</span>
        </div>

        {avgDuration > 0 && (
          <div className="stat-card">
            <span className="stat-number">{avgDuration}s</span>
            <span className="stat-label">Avg duration</span>
          </div>
        )}

        {mostCommonFeeling && (
          <div className="stat-card">
            <span className="stat-emoji">{FEELING_EMOJIS[mostCommonFeeling]}</span>
            <span className="stat-label">Most common: {mostCommonFeeling}</span>
          </div>
        )}
      </div>

      <div className="feeling-breakdown">
        <h4>Feelings tracked:</h4>
        <div className="feeling-list">
          {Object.entries(feelingCounts)
            .sort(([, a], [, b]) => b - a)
            .map(([feeling, count]) => (
              <div key={feeling} className="feeling-item">
                <span className="feeling-emoji">{FEELING_EMOJIS[feeling as FeelingState]}</span>
                <span className="feeling-name">{feeling}</span>
                <span className="feeling-count">×{count}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
