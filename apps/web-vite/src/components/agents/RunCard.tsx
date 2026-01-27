/**
 * RunCard Component
 *
 * Displays details for a single run including tool calls.
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToolCallOperations } from '@/hooks/useToolCallOperations'
import { useRunEvents } from '@/hooks/useRunEvents'
import { useRunMessages } from '@/hooks/useRunMessages'
import { useWorkflowSteps } from '@/hooks/useWorkflowSteps'
import { useExpertCouncilTurns } from '@/hooks/useExpertCouncilTurns'
import { useProjectManager } from '@/hooks/useProjectManager'
import { ToolCallTimeline } from './ToolCallTimeline'
import { ExpertCouncilInspector } from './ExpertCouncilInspector'
import { ProjectManagerChat } from './ProjectManagerChat'
import { Button } from '@/components/ui/button'
import type { DeepResearchRequest, Run, RunStatus, Workspace, WorkspaceId } from '@lifeos/agents'

interface RunCardProps {
  run: Run
  workspace: Workspace
  workspaceId: WorkspaceId
  researchRequests: DeepResearchRequest[]
  currentTime: number
  showProjectManager: boolean
  onDelete: (runId: string) => void
  onResume?: (runId: string) => void
  onProvideInput?: (runId: string, nodeId: string, response: string) => Promise<void>
}

export function RunCard({
  run,
  workspace,
  workspaceId,
  researchRequests,
  currentTime,
  showProjectManager,
  onDelete,
  onResume,
  onProvideInput,
}: RunCardProps) {
  const navigate = useNavigate()
  const { toolCalls } = useToolCallOperations(run.runId)
  const { messages, hasMore, isLoadingMore, loadMore } = useRunMessages(run.runId)
  const { events } = useRunEvents(run.runId)
  const { steps: workflowSteps } = useWorkflowSteps(run.runId)
  const { latestTurn } = useExpertCouncilTurns(run.runId)
  const {
    context: projectManagerContext,
    startConversation,
    addTurn,
    recordInteraction,
    profile,
  } = useProjectManager(workspaceId, run.runId)
  const [inputResponse, setInputResponse] = useState('')
  const [isSubmittingInput, setIsSubmittingInput] = useState(false)
  const deepResearch =
    run.context && typeof run.context === 'object'
      ? ((run.context as Record<string, unknown>).deepResearch as
          | {
              requestId?: string
              status?: string
              synthesizedFindings?: string
              integratedAtMs?: number
            }
          | undefined)
      : undefined

  const streamingOutput = events
    .filter((event) => event.type === 'token')
    .map((event) => event.delta ?? '')
    .join('')
  const finalEvent = [...events].reverse().find((event) => event.type === 'final')
  const displayOutput = run.output ?? finalEvent?.output ?? streamingOutput

  const runResearchRequests = useMemo(
    () => researchRequests.filter((request) => request.runId === run.runId),
    [researchRequests, run.runId]
  )
  const pendingResearch = runResearchRequests.filter((request) => request.status === 'pending')

  const projectManagerEnabled = Boolean(workspace.projectManagerConfig?.enabled)
  const projectManagerVisible = projectManagerEnabled && showProjectManager
  const pendingDecisions = projectManagerContext?.decisions?.filter(
    (decision) => decision.status === 'pending'
  )
  const clarificationQuestions =
    pendingDecisions?.map((decision) => ({
      questionId: decision.decisionId,
      text: decision.question,
    })) ?? []
  const decisionOptions =
    pendingDecisions?.flatMap((decision) =>
      (decision.options ?? []).map((option) => ({
        optionId: `${decision.decisionId}::${option}`,
        label: option,
        description: decision.question,
      }))
    ) ?? []

  useEffect(() => {
    if (!projectManagerVisible) return
    if (!projectManagerContext) {
      void startConversation()
    }
  }, [projectManagerContext, projectManagerVisible, startConversation])

  const projectManagerKey = projectManagerContext?.contextId
    ? `${run.runId}:${projectManagerContext.contextId}`
    : `${run.runId}:${clarificationQuestions.length}:${decisionOptions.length}`

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
          {latestTurn ? (
            <span className="badge">Expert Council</span>
          ) : (
            <span className="badge">Workflow</span>
          )}
          {pendingResearch.length > 0 && (
            <button
              type="button"
              className="run-research-indicator"
              onClick={() =>
                navigate(`/agents/research?workspaceId=${workspaceId}&runId=${run.runId}`)
              }
            >
              🔬 {pendingResearch.length} pending
            </button>
          )}
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

      {deepResearch && (
        <div className="run-output">
          <strong>Research Status:</strong>
          <p>
            {deepResearch.status ?? 'pending'}
            {deepResearch.requestId ? ` - ${deepResearch.requestId}` : ''}
          </p>
          {deepResearch.synthesizedFindings && (
            <details className="run-context">
              <summary>Synthesized Findings</summary>
              <pre>{deepResearch.synthesizedFindings}</pre>
            </details>
          )}
        </div>
      )}

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
              <Button
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
              </Button>
            </div>
          )}
        </div>
      )}

      {run.status === 'paused' && pendingResearch.length > 0 && (
        <div className="run-output">
          <strong>This run is waiting for research results.</strong>
          <p>Click the research indicator above to upload findings.</p>
        </div>
      )}

      {run.promptResolutionErrors && run.promptResolutionErrors.length > 0 && (
        <div className="run-error">
          <strong>Warning:</strong>
          <p>Some custom prompts failed to load. Default prompts were used instead.</p>
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

      {latestTurn && (
        <details className="run-context">
          <summary>Expert Council Inspector</summary>
          <ExpertCouncilInspector turn={latestTurn} />
        </details>
      )}

      {projectManagerVisible && (
        <details className="run-context">
          <summary>Project Manager</summary>
          <ProjectManagerChat
            key={projectManagerKey}
            contextSummary={projectManagerContext?.summary}
            clarificationQuestions={clarificationQuestions}
            decisionOptions={decisionOptions}
            conflicts={projectManagerContext?.conflicts ?? []}
            profile={profile}
            onAnswerQuestion={(questionId, answer) => {
              const question = clarificationQuestions.find((item) => item.questionId === questionId)
              const questionText = question?.text ?? 'Clarification question'
              void addTurn(answer, `Answered: ${questionText}`)
            }}
            onSelectDecision={(optionId) => {
              const [decisionId, option] = optionId.split('::')
              const decision = pendingDecisions?.find((item) => item.decisionId === decisionId)
              const prompt = decision?.question ?? 'Decision'
              void addTurn(`Selected option: ${option}`, `Decision made: ${prompt}`)
            }}
            onResolveConflict={(conflict) => {
              void addTurn(`Resolved conflict: ${conflict.description}`, 'Conflict resolved.')
            }}
            onRequestExpertCouncil={() =>
              void addTurn('Request Expert Council', 'Expert Council requested.')
            }
            onRecordInteraction={(interaction) => void recordInteraction(interaction)}
          />
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
              <Button variant="ghost" type="button" onClick={loadMore} disabled={isLoadingMore}>
                {isLoadingMore ? 'Loading...' : 'Load older messages'}
              </Button>
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
            <Button variant="ghost" onClick={() => onResume(run.runId)}>
              Resume
            </Button>
          )}
        <Button variant="ghost" className="danger" onClick={() => onDelete(run.runId)}>
          Delete
        </Button>
      </div>
    </div>
  )
}
