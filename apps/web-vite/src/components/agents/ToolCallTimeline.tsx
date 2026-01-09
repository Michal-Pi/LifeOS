/**
 * ToolCallTimeline Component
 *
 * Displays a timeline of tool calls for a run with collapsible details.
 * Shows status, parameters, results, and execution timing.
 */

import { useState } from 'react'
import type { ToolCallRecord } from '@lifeos/agents'
import './ToolCallTimeline.css'

interface ToolCallTimelineProps {
  toolCalls: ToolCallRecord[]
}

export function ToolCallTimeline({ toolCalls }: ToolCallTimelineProps) {
  const [expandedCalls, setExpandedCalls] = useState<Set<string>>(new Set())

  if (toolCalls.length === 0) {
    return null
  }

  const toggleExpanded = (toolCallId: string) => {
    setExpandedCalls((prev) => {
      const next = new Set(prev)
      if (next.has(toolCallId)) {
        next.delete(toolCallId)
      } else {
        next.add(toolCallId)
      }
      return next
    })
  }

  const getStatusBadgeClass = (status: ToolCallRecord['status']) => {
    switch (status) {
      case 'completed':
        return 'tool-call-badge tool-call-badge--completed'
      case 'failed':
        return 'tool-call-badge tool-call-badge--failed'
      case 'running':
        return 'tool-call-badge tool-call-badge--running'
      case 'pending':
        return 'tool-call-badge tool-call-badge--pending'
      default:
        return 'tool-call-badge tool-call-badge--unknown'
    }
  }

  const formatDuration = (durationMs?: number) => {
    if (!durationMs) return 'N/A'
    if (durationMs < 1000) return `${durationMs}ms`
    return `${(durationMs / 1000).toFixed(2)}s`
  }

  const formatTimestamp = (timestampMs: number) => {
    return new Date(timestampMs).toLocaleTimeString()
  }

  return (
    <div className="tool-call-timeline">
      <h3 className="tool-call-timeline__title">Tool Calls ({toolCalls.length})</h3>
      <div className="tool-call-list">
        {toolCalls.map((toolCall) => {
          const isExpanded = expandedCalls.has(toolCall.toolCallRecordId)

          return (
            <div key={toolCall.toolCallRecordId} className="tool-call-card">
              {/* Header - Always Visible */}
              <button
                onClick={() => toggleExpanded(toolCall.toolCallRecordId)}
                className="tool-call-header"
              >
                <div className="tool-call-header__meta">
                  {/* Tool Name */}
                  <span className="tool-call-name">{toolCall.toolName}</span>

                  {/* Status Badge */}
                  <span className={getStatusBadgeClass(toolCall.status)}>{toolCall.status}</span>

                  {/* Duration */}
                  <span className="tool-call-duration">{formatDuration(toolCall.durationMs)}</span>

                  {/* Iteration */}
                  <span className="tool-call-iteration">Iteration {toolCall.iteration}</span>
                </div>

                {/* Expand/Collapse Icon */}
                <svg
                  className={`tool-call-chevron ${isExpanded ? 'is-expanded' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Details - Collapsible */}
              {isExpanded && (
                <div className="tool-call-details">
                  {/* Timing Info */}
                  <div className="tool-call-grid">
                    <div>
                      <span className="tool-call-label">Started:</span>
                      <span>{formatTimestamp(toolCall.startedAtMs)}</span>
                    </div>
                    {toolCall.completedAtMs && (
                      <div>
                        <span className="tool-call-label">Completed:</span>
                        <span>{formatTimestamp(toolCall.completedAtMs)}</span>
                      </div>
                    )}
                  </div>

                  {/* Provider Info */}
                  <div>
                    <span className="tool-call-label">Provider:</span>
                    <span className="tool-call-provider">{toolCall.provider}</span>
                    <span className="tool-call-model">({toolCall.modelName})</span>
                  </div>

                  {/* Parameters */}
                  <div>
                    <div className="tool-call-section-title">Parameters:</div>
                    <pre className="tool-call-pre">
                      {JSON.stringify(toolCall.parameters, null, 2)}
                    </pre>
                  </div>

                  {/* Result */}
                  {toolCall.result && (
                    <div>
                      <div className="tool-call-section-title">Result:</div>
                      <pre className="tool-call-pre">
                        {JSON.stringify(toolCall.result, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Error */}
                  {toolCall.error && (
                    <div>
                      <div className="tool-call-section-title">Error:</div>
                      <pre className="tool-call-pre tool-call-error">{toolCall.error}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
