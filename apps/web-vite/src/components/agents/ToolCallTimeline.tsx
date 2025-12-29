/**
 * ToolCallTimeline Component
 *
 * Displays a timeline of tool calls for a run with collapsible details.
 * Shows status, parameters, results, and execution timing.
 */

import { useState } from 'react'
import type { ToolCallRecord } from '@lifeos/agents'

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
        return 'bg-green-100 text-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      case 'running':
        return 'bg-blue-100 text-blue-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
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
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-900">Tool Calls ({toolCalls.length})</h3>
      <div className="space-y-2">
        {toolCalls.map((toolCall) => {
          const isExpanded = expandedCalls.has(toolCall.toolCallRecordId)

          return (
            <div
              key={toolCall.toolCallRecordId}
              className="border border-gray-200 rounded-lg bg-white shadow-sm"
            >
              {/* Header - Always Visible */}
              <button
                onClick={() => toggleExpanded(toolCall.toolCallRecordId)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1">
                  {/* Tool Name */}
                  <span className="font-mono text-sm font-medium text-gray-900">
                    {toolCall.toolName}
                  </span>

                  {/* Status Badge */}
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(toolCall.status)}`}
                  >
                    {toolCall.status}
                  </span>

                  {/* Duration */}
                  <span className="text-sm text-gray-500">
                    {formatDuration(toolCall.durationMs)}
                  </span>

                  {/* Iteration */}
                  <span className="text-xs text-gray-400">Iteration {toolCall.iteration}</span>
                </div>

                {/* Expand/Collapse Icon */}
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
                <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 space-y-3">
                  {/* Timing Info */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Started:</span>{' '}
                      <span className="text-gray-900">{formatTimestamp(toolCall.startedAtMs)}</span>
                    </div>
                    {toolCall.completedAtMs && (
                      <div>
                        <span className="text-gray-500">Completed:</span>{' '}
                        <span className="text-gray-900">
                          {formatTimestamp(toolCall.completedAtMs)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Provider Info */}
                  <div className="text-sm">
                    <span className="text-gray-500">Provider:</span>{' '}
                    <span className="text-gray-900 capitalize">{toolCall.provider}</span>
                    <span className="text-gray-400 ml-2">({toolCall.modelName})</span>
                  </div>

                  {/* Parameters */}
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">Parameters:</div>
                    <pre className="bg-white border border-gray-200 rounded p-2 text-xs overflow-x-auto">
                      {JSON.stringify(toolCall.parameters, null, 2)}
                    </pre>
                  </div>

                  {/* Result */}
                  {toolCall.result && (
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-1">Result:</div>
                      <pre className="bg-white border border-gray-200 rounded p-2 text-xs overflow-x-auto max-h-64 overflow-y-auto">
                        {JSON.stringify(toolCall.result, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Error */}
                  {toolCall.error && (
                    <div>
                      <div className="text-sm font-medium text-red-700 mb-1">Error:</div>
                      <pre className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-900">
                        {toolCall.error}
                      </pre>
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
