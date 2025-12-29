/**
 * RunCard Component
 *
 * Displays details for a single run including tool calls.
 */

import { useToolCallOperations } from '@/hooks/useToolCallOperations'
import { useRunMessages } from '@/hooks/useRunMessages'
import { ToolCallTimeline } from './ToolCallTimeline'
import type { Run, RunStatus } from '@lifeos/agents'

interface RunCardProps {
  run: Run
  currentTime: number
  onDelete: (runId: string) => void
}

export function RunCard({ run, currentTime, onDelete }: RunCardProps) {
  const { toolCalls } = useToolCallOperations(run.runId)
  const { messages } = useRunMessages(run.runId)

  const formatDate = (timestampMs: number) => {
    return new Date(timestampMs).toLocaleString()
  }

  const formatDuration = (startMs: number, endMs?: number) => {
    const durationMs = (endMs ?? currentTime) - startMs
    const seconds = Math.floor(durationMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  const getStatusBadgeClass = (status: RunStatus) => {
    switch (status) {
      case 'completed':
        return 'badge-success'
      case 'failed':
        return 'badge-error'
      case 'running':
        return 'badge-info'
      case 'paused':
        return 'badge-warning'
      default:
        return 'badge'
    }
  }

  return (
    <div className="run-card">
      <div className="run-header">
        <div>
          <h4>{run.goal}</h4>
          <span className={getStatusBadgeClass(run.status)}>{run.status}</span>
        </div>
        <div className="run-meta">
          <small>Started: {formatDate(run.startedAtMs)}</small>
          {run.completedAtMs && <small>Completed: {formatDate(run.completedAtMs)}</small>}
          <small>Duration: {formatDuration(run.startedAtMs, run.completedAtMs)}</small>
        </div>
      </div>

      <div className="run-progress">
        <strong>Progress:</strong> Step {run.currentStep}
        {run.totalSteps && ` of ${run.totalSteps}`}
      </div>

      {run.output && (
        <div className="run-output">
          <strong>Output:</strong>
          <p>{run.output}</p>
        </div>
      )}

      {run.error && (
        <div className="run-error">
          <strong>Error:</strong>
          <p>{run.error}</p>
        </div>
      )}

      {run.context && Object.keys(run.context).length > 0 && (
        <details className="run-context">
          <summary>Context</summary>
          <pre>{JSON.stringify(run.context, null, 2)}</pre>
        </details>
      )}

      {messages.length > 0 && (
        <details className="run-messages">
          <summary>Messages ({messages.length})</summary>
          <div className="run-messages-list">
            {messages.map((message) => (
              <div key={message.messageId} className={`run-message run-message--${message.role}`}>
                <div className="run-message-meta">
                  <span className="run-message-role">{message.role}</span>
                  <span className="run-message-time">
                    {new Date(message.timestampMs).toLocaleTimeString()}
                  </span>
                </div>
                <div className="run-message-content">{message.content}</div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Tool Call Timeline */}
      {toolCalls.length > 0 && (
        <div className="run-tool-calls">
          <ToolCallTimeline toolCalls={toolCalls} />
        </div>
      )}

      <div className="run-stats">
        {run.tokensUsed !== undefined && (
          <div>
            <strong>Tokens:</strong> {run.tokensUsed.toLocaleString()}
          </div>
        )}
        {run.estimatedCost !== undefined && (
          <div>
            <strong>Cost:</strong> ${run.estimatedCost.toFixed(4)}
          </div>
        )}
      </div>

      <div className="run-actions">
        <button onClick={() => onDelete(run.runId)} className="btn-danger">
          Delete
        </button>
      </div>
    </div>
  )
}
