/**
 * TraceViewer Component
 *
 * Displays step-by-step execution traces for workflow runs.
 * Shows decisions, tool calls, state changes, and timing for debugging.
 */

import { useMemo, useState, useCallback } from 'react'
import type {
  RunId,
  ComponentTelemetry,
  StepTelemetry,
  RouterDecision,
  ToolExecution,
  MemoryOperation,
} from '@lifeos/agents'
import './TraceViewer.css'

// ----- Types -----

export interface TraceStep {
  stepIndex: number
  agentId: string
  agentName: string
  startedAtMs: number
  completedAtMs: number
  durationMs: number
  tokensUsed: number
  estimatedCost: number
  outputLength: number
  status: 'success' | 'error' | 'pending'
  errorMessage?: string
  toolCalls: ToolExecution[]
  routerDecisions: RouterDecision[]
  memoryOperations: MemoryOperation[]
  output?: string
}

export interface TraceViewerProps {
  runId: RunId
  workflowType: string
  steps: StepTelemetry[]
  componentTelemetry: ComponentTelemetry[]
  totalDurationMs: number
  totalTokens: number
  estimatedCost: number
  status: 'running' | 'completed' | 'failed'
  onStepClick?: (stepIndex: number) => void
  onExportTrace?: () => void
}

// ----- Helper Functions -----

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

function getStatusColor(status: TraceStep['status']): string {
  switch (status) {
    case 'success':
      return 'var(--success)'
    case 'error':
      return 'var(--error)'
    case 'pending':
      return 'var(--warning)'
    default:
      return 'var(--muted-foreground)'
  }
}

// ----- Main Component -----

export function TraceViewer({
  runId,
  workflowType,
  steps,
  componentTelemetry,
  totalDurationMs,
  totalTokens,
  estimatedCost,
  status,
  onStepClick,
  onExportTrace,
}: TraceViewerProps) {
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null)
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState<'all' | 'errors' | 'tools' | 'decisions'>('all')

  // Build trace steps by combining step telemetry with component telemetry
  const traceSteps = useMemo((): TraceStep[] => {
    return steps.map((step, index) => {
      // Find component telemetry for this step
      const stepComponents = componentTelemetry.filter((c) => c.stepIndex === index)

      const toolCalls = stepComponents
        .filter((c) => c.componentType === 'tool' && c.toolExecution)
        .map((c) => c.toolExecution!)

      const routerDecisions = stepComponents
        .filter((c) => c.componentType === 'router' && c.routerDecision)
        .map((c) => c.routerDecision!)

      const memoryOperations = stepComponents
        .filter((c) => c.componentType === 'memory' && c.memoryOperation)
        .map((c) => c.memoryOperation!)

      // Determine step status: if workflow failed and this is the last step, mark as error
      const isLastStep = index === steps.length - 1
      const stepStatus: TraceStep['status'] =
        status === 'failed' && isLastStep ? 'error' : 'success'

      return {
        stepIndex: index,
        agentId: step.agentId,
        agentName: step.agentName,
        startedAtMs: step.startedAtMs,
        completedAtMs: step.completedAtMs,
        durationMs: step.durationMs,
        tokensUsed: step.tokensUsed,
        estimatedCost: step.estimatedCost,
        outputLength: step.outputLength,
        status: stepStatus,
        toolCalls,
        routerDecisions,
        memoryOperations,
      }
    })
  }, [steps, componentTelemetry])

  // Filter trace steps
  const filteredSteps = useMemo(() => {
    return traceSteps.filter((step) => {
      if (filter === 'all') return true
      if (filter === 'errors') return step.status === 'error'
      if (filter === 'tools') return step.toolCalls.length > 0
      if (filter === 'decisions') return step.routerDecisions.length > 0
      return true
    })
  }, [traceSteps, filter])

  // Handle step click
  const handleStepClick = useCallback(
    (stepIndex: number) => {
      setSelectedStepIndex(stepIndex)
      if (onStepClick) {
        onStepClick(stepIndex)
      }
    },
    [onStepClick]
  )

  // Toggle step expansion
  const toggleStepExpansion = useCallback((stepIndex: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(stepIndex)) {
        next.delete(stepIndex)
      } else {
        next.add(stepIndex)
      }
      return next
    })
  }, [])

  return (
    <div className="trace-viewer" role="region" aria-label="Execution trace viewer">
      {/* Header */}
      <header className="trace-header">
        <div className="trace-title">
          <h3>Execution Trace</h3>
          <span className={`trace-status ${status}`}>{status.toUpperCase()}</span>
        </div>
        <div className="trace-meta">
          <span className="meta-item">
            <span className="meta-label">Run:</span>
            <code>{runId.slice(0, 8)}</code>
          </span>
          <span className="meta-item">
            <span className="meta-label">Type:</span>
            <span>{workflowType}</span>
          </span>
        </div>
      </header>

      {/* Summary Stats */}
      <div className="trace-stats" role="group" aria-label="Trace statistics">
        <div className="stat-card">
          <span className="stat-value">{steps.length}</span>
          <span className="stat-label">Steps</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{formatDuration(totalDurationMs)}</span>
          <span className="stat-label">Duration</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{totalTokens.toLocaleString()}</span>
          <span className="stat-label">Tokens</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{formatCost(estimatedCost)}</span>
          <span className="stat-label">Cost</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="trace-filters" role="toolbar" aria-label="Trace filters">
        <div className="filter-buttons">
          {(['all', 'errors', 'tools', 'decisions'] as const).map((f) => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
            >
              {f === 'all' && 'All'}
              {f === 'errors' &&
                `Errors (${traceSteps.filter((s) => s.status === 'error').length})`}
              {f === 'tools' &&
                `Tools (${traceSteps.reduce((sum, s) => sum + s.toolCalls.length, 0)})`}
              {f === 'decisions' &&
                `Decisions (${traceSteps.reduce((sum, s) => sum + s.routerDecisions.length, 0)})`}
            </button>
          ))}
        </div>
        {onExportTrace && (
          <button className="export-btn" onClick={onExportTrace}>
            Export Trace
          </button>
        )}
      </div>

      {/* Timeline */}
      <div className="trace-timeline">
        <div className="timeline-track" aria-hidden="true">
          {traceSteps.map((step, idx) => (
            <div
              key={idx}
              className="timeline-segment"
              style={{
                width: `${(step.durationMs / totalDurationMs) * 100}%`,
                backgroundColor: getStatusColor(step.status),
              }}
              title={`Step ${idx + 1}: ${step.agentName} (${formatDuration(step.durationMs)})`}
            />
          ))}
        </div>
      </div>

      {/* Steps List */}
      <div className="trace-steps" role="list" aria-label="Trace steps">
        {filteredSteps.map((step) => (
          <TraceStepCard
            key={step.stepIndex}
            step={step}
            isSelected={selectedStepIndex === step.stepIndex}
            isExpanded={expandedSteps.has(step.stepIndex)}
            onClick={() => handleStepClick(step.stepIndex)}
            onToggleExpand={() => toggleStepExpansion(step.stepIndex)}
          />
        ))}
      </div>

      {/* Detail Panel */}
      {selectedStepIndex !== null && traceSteps[selectedStepIndex] && (
        <StepDetailPanel
          step={traceSteps[selectedStepIndex]}
          onClose={() => setSelectedStepIndex(null)}
        />
      )}
    </div>
  )
}

// ----- Step Card Component -----

interface TraceStepCardProps {
  step: TraceStep
  isSelected: boolean
  isExpanded: boolean
  onClick: () => void
  onToggleExpand: () => void
}

function TraceStepCard({
  step,
  isSelected,
  isExpanded,
  onClick,
  onToggleExpand,
}: TraceStepCardProps) {
  const hasDetails =
    step.toolCalls.length > 0 || step.routerDecisions.length > 0 || step.memoryOperations.length > 0

  return (
    <article
      className={`trace-step-card ${isSelected ? 'selected' : ''} ${step.status}`}
      role="listitem"
      onClick={onClick}
    >
      <div className="step-header">
        <div className="step-index" aria-label={`Step ${step.stepIndex + 1}`}>
          {step.stepIndex + 1}
        </div>
        <div className="step-info">
          <div className="step-agent">
            <span className="agent-name">{step.agentName}</span>
            <span className="agent-id">{step.agentId}</span>
          </div>
          <div className="step-metrics">
            <span className="metric" title="Duration">
              {formatDuration(step.durationMs)}
            </span>
            <span className="metric" title="Tokens">
              {step.tokensUsed.toLocaleString()} tokens
            </span>
            <span className="metric" title="Output length">
              {step.outputLength} chars
            </span>
          </div>
        </div>
        <div
          className="step-status"
          style={{ backgroundColor: getStatusColor(step.status) }}
          title={step.status}
        />
        {hasDetails && (
          <button
            className="expand-btn"
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand()
            }}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
          >
            {isExpanded ? '−' : '+'}
          </button>
        )}
      </div>

      {/* Error Message */}
      {step.status === 'error' && step.errorMessage && (
        <div className="step-error" role="alert">
          {step.errorMessage}
        </div>
      )}

      {/* Expanded Details */}
      {isExpanded && hasDetails && (
        <div className="step-details">
          {/* Tool Calls */}
          {step.toolCalls.length > 0 && (
            <div className="detail-section">
              <h5>Tool Calls ({step.toolCalls.length})</h5>
              <div className="tool-list">
                {step.toolCalls.map((tool, idx) => (
                  <div key={idx} className={`tool-item ${tool.success ? 'success' : 'failed'}`}>
                    <span className="tool-name">{tool.toolName}</span>
                    <span className="tool-duration">{tool.latencyMs}ms</span>
                    {tool.retryCount > 0 && (
                      <span className="tool-retries">{tool.retryCount} retries</span>
                    )}
                    {!tool.success && tool.errorMessage && (
                      <span className="tool-error">{tool.errorMessage}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Router Decisions */}
          {step.routerDecisions.length > 0 && (
            <div className="detail-section">
              <h5>Routing Decisions ({step.routerDecisions.length})</h5>
              <div className="decision-list">
                {step.routerDecisions.map((decision, idx) => (
                  <div key={idx} className="decision-item">
                    <span className="decision-path">{decision.chosenPath}</span>
                    {decision.confidence !== undefined && (
                      <span className="decision-confidence">
                        {(decision.confidence * 100).toFixed(0)}% confidence
                      </span>
                    )}
                    <span className="decision-options">
                      from: {decision.availableOptions.join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Memory Operations */}
          {step.memoryOperations.length > 0 && (
            <div className="detail-section">
              <h5>Memory Operations ({step.memoryOperations.length})</h5>
              <div className="memory-list">
                {step.memoryOperations.map((op, idx) => (
                  <div key={idx} className="memory-item">
                    <span className={`memory-type ${op.operationType}`}>{op.operationType}</span>
                    {op.query && <span className="memory-query">"{op.query}"</span>}
                    {op.relevanceScore !== undefined && (
                      <span className="memory-relevance">
                        {(op.relevanceScore * 100).toFixed(0)}% relevant
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick badges */}
      <div className="step-badges">
        {step.toolCalls.length > 0 && (
          <span className="badge tool-badge">{step.toolCalls.length} tools</span>
        )}
        {step.routerDecisions.length > 0 && (
          <span className="badge decision-badge">{step.routerDecisions.length} decisions</span>
        )}
        {step.memoryOperations.length > 0 && (
          <span className="badge memory-badge">{step.memoryOperations.length} memory ops</span>
        )}
      </div>
    </article>
  )
}

// ----- Step Detail Panel -----

interface StepDetailPanelProps {
  step: TraceStep
  onClose: () => void
}

function StepDetailPanel({ step, onClose }: StepDetailPanelProps) {
  return (
    <aside className="step-detail-panel" role="complementary" aria-label="Step details">
      <header className="panel-header">
        <h4>Step {step.stepIndex + 1} Details</h4>
        <button className="close-btn" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </header>

      <div className="panel-body">
        <div className="detail-row">
          <label>Agent</label>
          <span>{step.agentName}</span>
        </div>
        <div className="detail-row">
          <label>Agent ID</label>
          <code>{step.agentId}</code>
        </div>
        <div className="detail-row">
          <label>Started</label>
          <span>{new Date(step.startedAtMs).toLocaleTimeString()}</span>
        </div>
        <div className="detail-row">
          <label>Duration</label>
          <span>{formatDuration(step.durationMs)}</span>
        </div>
        <div className="detail-row">
          <label>Tokens</label>
          <span>{step.tokensUsed.toLocaleString()}</span>
        </div>
        <div className="detail-row">
          <label>Cost</label>
          <span>{formatCost(step.estimatedCost)}</span>
        </div>
        <div className="detail-row">
          <label>Status</label>
          <span className={`status-badge ${step.status}`}>{step.status}</span>
        </div>

        {step.output && (
          <div className="output-section">
            <label>Output</label>
            <pre className="output-content">{step.output}</pre>
          </div>
        )}

        {step.errorMessage && (
          <div className="error-section">
            <label>Error</label>
            <pre className="error-content">{step.errorMessage}</pre>
          </div>
        )}
      </div>
    </aside>
  )
}

export default TraceViewer
