/**
 * RunCard Component
 *
 * Displays details for a single run including tool calls.
 */

import { useState } from 'react'
import { useToolCallOperations } from '@/hooks/useToolCallOperations'
import { useRunEvents } from '@/hooks/useRunEvents'
import { useRunMessages } from '@/hooks/useRunMessages'
import { useWorkflowSteps } from '@/hooks/useWorkflowSteps'
import { ToolCallTimeline } from './ToolCallTimeline'
import type { Run, RunStatus } from '@lifeos/agents'

interface RunCardProps {
  run: Run
  currentTime: number
  onDelete: (runId: string) => void
  onResume?: (runId: string) => void
  onProvideInput?: (runId: string, nodeId: string, response: string) => Promise<void>
}

export function RunCard({ run, currentTime, onDelete, onResume, onProvideInput }: RunCardProps) {
  const { toolCalls } = useToolCallOperations(run.runId)
  const { messages, hasMore, isLoadingMore, loadMore } = useRunMessages(run.runId)
  const { events } = useRunEvents(run.runId)
  const { steps: workflowSteps } = useWorkflowSteps(run.runId)
  const [inputResponse, setInputResponse] = useState('')
  const [isSubmittingInput, setIsSubmittingInput] = useState(false)

  const streamingOutput = events
    .filter((event) => event.type === 'token')
    .map((event) => event.delta ?? '')
    .join('')
  const finalEvent = [...events].reverse().find((event) => event.type === 'final')
  const displayOutput = run.output ?? finalEvent?.output ?? streamingOutput

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
      case 'waiting_for_input':
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

      {displayOutput && (
        <div className="run-output">
          <strong>{run.status === 'running' ? 'Live Output:' : 'Output:'}</strong>
          <p>{displayOutput}</p>
        </div>
      )}

      {run.error && (
        <div className="run-error">
          <strong>Error:</strong>
          <p>{run.error}</p>
        </div>
      )}

      {run.status === 'waiting_for_input' && run.pendingInput && (
        <div className="run-output">
          <strong>Input Needed:</strong>
          <p>{run.pendingInput.prompt}</p>
          {onProvideInput && (
            <div className="run-input-actions">
              <textarea
                value={inputResponse}
                onChange={(e) => setInputResponse(e.target.value)}
                rows={3}
                placeholder="Type your response..."
              />
              <button
                className="btn-primary"
                disabled={!inputResponse.trim() || isSubmittingInput}
                onClick={async () => {
                  if (!onProvideInput) return
                  try {
                    setIsSubmittingInput(true)
                    await onProvideInput(run.runId, run.pendingInput.nodeId, inputResponse.trim())
                    setInputResponse('')
                  } finally {
                    setIsSubmittingInput(false)
                  }
                }}
              >
                {isSubmittingInput ? 'Submitting...' : 'Submit Response'}
              </button>
            </div>
          )}
        </div>
      )}

      {run.context && Object.keys(run.context).length > 0 && (
        <details className="run-context">
          <summary>Context</summary>
          <pre>{JSON.stringify(run.context, null, 2)}</pre>
        </details>
      )}

      {workflowSteps.length > 0 && (
        <details className="run-context">
          <summary>Workflow Steps ({workflowSteps.length})</summary>
          <div className="run-messages-list">
            {workflowSteps.map((step) => (
              <div key={step.workflowStepId} className="run-message">
                <div className="run-message-meta">
                  <span className="run-message-role">{step.nodeType}</span>
                  <span className="run-message-time">
                    {new Date(step.startedAtMs).toLocaleTimeString()}
                  </span>
                </div>
                <div className="run-message-content">
                  <strong>Node:</strong> {step.nodeId}
                  {step.output !== undefined && <pre>{JSON.stringify(step.output, null, 2)}</pre>}
                  {step.error && (
                    <p className="run-error">
                      <strong>Error:</strong> {step.error}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {messages.length > 0 && (
        <details className="run-messages">
          <summary>
            Messages ({messages.length}
            {hasMore ? '+' : ''})
          </summary>
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
          {hasMore && (
            <div className="run-messages-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={loadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? 'Loading...' : 'Load older messages'}
              </button>
            </div>
          )}
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
        {onResume &&
          run.status !== 'running' &&
          run.status !== 'pending' &&
          run.status !== 'waiting_for_input' && (
            <button onClick={() => onResume(run.runId)} className="btn-secondary">
              Resume
            </button>
          )}
        <button onClick={() => onDelete(run.runId)} className="btn-danger">
          Delete
        </button>
      </div>
    </div>
  )
}
