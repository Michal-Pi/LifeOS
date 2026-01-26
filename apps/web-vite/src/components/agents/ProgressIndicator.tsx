import { useEffect, useState } from 'react'
import type { ExpertCouncilTurn } from '@lifeos/agents'

interface ProgressIndicatorProps {
  turn: ExpertCouncilTurn
}

const formatElapsed = (ms: number) => {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

export function ProgressIndicator({ turn }: ProgressIndicatorProps) {
  const [elapsedMs, setElapsedMs] = useState(0)
  const stage1Responses = turn.stage1.responses ?? []
  const completedCount = stage1Responses.filter(
    (response) => response.status === 'completed'
  ).length
  const failedCount = stage1Responses.filter((response) => response.status === 'failed').length
  const totalCount = stage1Responses.length
  const progressPercent = totalCount > 0 ? ((completedCount + failedCount) / totalCount) * 100 : 0

  useEffect(() => {
    const updateElapsed = () => {
      setElapsedMs(Date.now() - turn.createdAtMs)
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)
    return () => clearInterval(interval)
  }, [turn.createdAtMs])

  return (
    <div className="progress-indicator">
      <div className="stage-progress">
        <div className="stage-header">
          <div className="stage-title">Stage 1: Gathering Council Opinions</div>
          <div className="stage-status">
            {completedCount + failedCount} / {totalCount} complete
          </div>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="model-list">
          {stage1Responses.map((response) => {
            const statusClass =
              response.status === 'completed'
                ? 'complete'
                : response.status === 'failed'
                  ? 'failed'
                  : 'pending'
            return (
              <div key={response.modelId} className="model-item">
                <div className={`model-status ${statusClass}`} />
                <span>{response.modelName}</span>
                <span className="token-counter">
                  {response.tokensUsed ? `${response.tokensUsed} tokens` : 'in progress'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="elapsed-time">Elapsed: {formatElapsed(elapsedMs)}</div>
    </div>
  )
}
