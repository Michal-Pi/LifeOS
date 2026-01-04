/**
 * WorkoutSessionCard Component
 *
 * Displays today's workout session status and allows quick logging.
 * Phase 2: Added session detail editing modal.
 */

import { useState, useEffect } from 'react'
import { useWorkoutOperations } from '@/hooks/useWorkoutOperations'
import { SessionDetailModal } from './SessionDetailModal'
import type { WorkoutSession, WorkoutContext } from '@lifeos/training'

interface WorkoutSessionCardProps {
  dateKey: string
  variant?: 'card' | 'embedded'
}

export function WorkoutSessionCard({ dateKey, variant = 'card' }: WorkoutSessionCardProps) {
  const { isLoading, getSessionByDate, createSession } = useWorkoutOperations()
  const [todaySessions, setTodaySessions] = useState<WorkoutSession[]>([])
  const [showQuickLog, setShowQuickLog] = useState(false)
  const [selectedContext, setSelectedContext] = useState<WorkoutContext>('gym')
  const [selectedSession, setSelectedSession] = useState<WorkoutSession | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const sessions = await getSessionByDate(dateKey)
        setTodaySessions(sessions)
      } catch (error) {
        console.error('Failed to load workout sessions:', error)
      }
    }

    loadSessions()
  }, [dateKey, getSessionByDate])

  const handleQuickLog = async () => {
    try {
      await createSession({
        dateKey,
        context: selectedContext,
        status: 'completed',
        completedAtMs: Date.now(),
        items: [],
      })
      setShowQuickLog(false)
      // Reload sessions
      const sessions = await getSessionByDate(dateKey)
      setTodaySessions(sessions)
    } catch (error) {
      console.error('Failed to create workout session:', error)
    }
  }

  const handleOpenSessionDetail = (session: WorkoutSession) => {
    setSelectedSession(session)
    setShowDetailModal(true)
  }

  const handleCloseSessionDetail = () => {
    setShowDetailModal(false)
    setSelectedSession(null)
  }

  const handleSaveSessionDetail = async () => {
    // Reload sessions after save
    const sessions = await getSessionByDate(dateKey)
    setTodaySessions(sessions)
  }

  const completedSessions = todaySessions.filter((s) => s.status === 'completed')
  const plannedSessions = todaySessions.filter((s) => s.status === 'planned')
  const actionClass = variant === 'embedded' ? 'ghost-button small' : 'training-quick-log-button'

  return (
    <div
      className={`training-session-card ${variant === 'embedded' ? 'today-subsection training-session-card--embedded' : ''}`}
    >
      <div className="training-session-header">
        <div className="training-session-title">
          {variant === 'embedded' ? (
            <p className="section-label">Workout Log</p>
          ) : (
            <span className="training-icon">💪</span>
          )}
          {variant === 'embedded' ? null : <h3>Workout</h3>}
        </div>
        <button
          className={actionClass}
          onClick={() => setShowQuickLog(!showQuickLog)}
          disabled={isLoading}
        >
          {showQuickLog ? 'Cancel' : 'Quick log'}
        </button>
      </div>

      {showQuickLog && (
        <div className="training-quick-log-panel">
          <div className="training-context-selector">
            <label>Where did you train?</label>
            <div className="training-context-buttons">
              <button
                className={`context-button ${selectedContext === 'gym' ? 'active' : ''}`}
                onClick={() => setSelectedContext('gym')}
              >
                🏋️ Gym
              </button>
              <button
                className={`context-button ${selectedContext === 'home' ? 'active' : ''}`}
                onClick={() => setSelectedContext('home')}
              >
                🏠 Home
              </button>
              <button
                className={`context-button ${selectedContext === 'road' ? 'active' : ''}`}
                onClick={() => setSelectedContext('road')}
              >
                🏃 Road
              </button>
            </div>
          </div>
          <button className="training-submit-button" onClick={handleQuickLog}>
            Log workout
          </button>
        </div>
      )}

      <div className="training-session-status">
        {completedSessions.length > 0 ? (
          <div
            className="training-completed"
            onClick={() => handleOpenSessionDetail(completedSessions[0])}
          >
            <span className="training-status-icon">✅</span>
            <div className="training-status-text">
              <div className="training-status-label">Completed</div>
              <div className="training-status-detail">
                {completedSessions.map((s, i) => (
                  <span key={s.sessionId}>
                    {i > 0 && ', '}
                    {s.context === 'gym' && '🏋️ Gym'}
                    {s.context === 'home' && '🏠 Home'}
                    {s.context === 'road' && '🏃 Road'}
                  </span>
                ))}
                <span className="click-to-edit"> • Click to edit</span>
              </div>
            </div>
          </div>
        ) : plannedSessions.length > 0 ? (
          <div
            className="training-planned"
            onClick={() => handleOpenSessionDetail(plannedSessions[0])}
          >
            <span className="training-status-icon">📅</span>
            <div className="training-status-text">
              <div className="training-status-label">Planned</div>
              <div className="training-status-detail">
                {plannedSessions[0].context === 'gym' && '🏋️ Gym'}
                {plannedSessions[0].context === 'home' && '🏠 Home'}
                {plannedSessions[0].context === 'road' && '🏃 Road'}
                {plannedSessions[0].title && ` - ${plannedSessions[0].title}`}
                <span className="click-to-edit"> • Click to start</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="training-rest">
            <span className="training-status-icon">😌</span>
            <div className="training-status-text">
              <div className="training-status-label">Rest day</div>
              <div className="training-status-detail">No session logged yet</div>
            </div>
          </div>
        )}
      </div>

      {/* Session Detail Modal */}
      <SessionDetailModal
        session={selectedSession}
        isOpen={showDetailModal}
        onClose={handleCloseSessionDetail}
        onSave={handleSaveSessionDetail}
      />
    </div>
  )
}
