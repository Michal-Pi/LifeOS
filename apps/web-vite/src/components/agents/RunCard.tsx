/**
 * RunCard Component
 *
 * Compact summary card for a single run. Opens RunDetailModal for
 * full message carousel, final output, and Save as Note.
 */

import '@/styles/components/RunCard.css'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToolCallOperations } from '@/hooks/useToolCallOperations'
import { useRunMessages } from '@/hooks/useRunMessages'
import { useWorkflowSteps } from '@/hooks/useWorkflowSteps'
import { useExpertCouncilTurns } from '@/hooks/useExpertCouncilTurns'
import { useProjectManager } from '@/hooks/useProjectManager'
import { useDialecticalState, isDialecticalWorkflow } from '@/hooks/useDialecticalState'
import { useRunEvents } from '@/hooks/useRunEvents'
import { ToolCallTimeline } from './ToolCallTimeline'
import { ExpertCouncilInspector } from './ExpertCouncilInspector'
import { ProjectManagerChat } from './ProjectManagerChat'
import { InteractiveWorkflowGraph } from './InteractiveWorkflowGraph'
import { ExecutionReplayControls } from './ExecutionReplayControls'
import { useExecutionReplay } from '@/hooks/useExecutionReplay'
import { WorkflowNodeModal } from './WorkflowNodeModal'
import { RunDetailModal } from './RunDetailModal'
import { DialecticalCycleVisualization } from './DialecticalCycleVisualization'
import { DeepResearchViewer } from './DeepResearchViewer'
import { Button } from '@/components/ui/button'
import type {
  DeepResearchRequest,
  Run,
  RunStatus,
  Workflow,
  WorkflowId,
  WorkflowStep,
  WorkflowGraphNode,
} from '@lifeos/agents'

interface RunCardProps {
  run: Run
  workflow: Workflow
  workflowId: WorkflowId
  researchRequests: DeepResearchRequest[]
  currentTime: number
  showProjectManager: boolean
  onDelete: (runId: string) => void
  onResume?: (runId: string) => void
  onProvideInput?: (runId: string, nodeId: string, response: string) => Promise<void>
  onConstraintResponse?: (
    runId: string,
    action: 'increase' | 'stop',
    newLimit?: number
  ) => Promise<void>
  onRunAgain?: (runId: string) => void
  onContinue?: (runId: string) => void
  onStop?: (runId: string) => Promise<void>
}

export function RunCard({
  run,
  workflow,
  workflowId,
  researchRequests,
  currentTime,
  showProjectManager,
  onDelete,
  onResume,
  onProvideInput,
  onConstraintResponse,
  onRunAgain,
  onContinue,
  onStop,
}: RunCardProps) {
  const navigate = useNavigate()
  const [selectedNode, setSelectedNode] = useState<{
    node: WorkflowGraphNode | null
    step?: WorkflowStep
  } | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showResearchViewer, setShowResearchViewer] = useState(false)

  // Auto-open detail modal when run transitions to waiting_for_input (human gate)
  const [prevStatus, setPrevStatus] = useState(run.status)
  if (run.status !== prevStatus) {
    setPrevStatus(run.status)
    if (run.status === 'waiting_for_input' && run.pendingInput && !showDetailModal) {
      setShowDetailModal(true)
    }
  }

  // Lazy load data only when sections are expanded
  const [workflowExpanded, setWorkflowExpanded] = useState(false)
  const [expertCouncilExpanded, setExpertCouncilExpanded] = useState(false)
  const [projectManagerExpanded, setProjectManagerExpanded] = useState(false)
  const [dialecticalExpanded, setDialecticalExpanded] = useState(false)

  // Dialectical workflow state — subscribe to events for live visualization
  const isDialectical = isDialecticalWorkflow(workflow.workflowType)
  // Load events when: running (for live state), expanded, or workflowState.dialectical is missing (event-based fallback)
  const hasPersistedDialectical = isDialectical && !!run.workflowState?.dialectical
  const shouldLoadDialecticalEvents =
    isDialectical &&
    (run.status === 'running' ||
      run.status === 'waiting_for_input' ||
      dialecticalExpanded ||
      !hasPersistedDialectical)
  const { events: dialecticalEvents } = useRunEvents(
    shouldLoadDialecticalEvents ? (run.runId as import('@lifeos/agents').RunId) : null
  )
  const dialecticalState = useDialecticalState(isDialectical ? run : null, dialecticalEvents)

  // Only fetch when running or when explicitly expanded
  const shouldLoadToolCalls = run.status === 'running' || workflowExpanded
  const shouldLoadMessages = run.status === 'running' || workflowExpanded
  const shouldLoadWorkflowSteps = run.status === 'running' || workflowExpanded
  const shouldLoadExpertCouncil = run.status === 'running' || expertCouncilExpanded
  const shouldLoadProjectManager = projectManagerExpanded && showProjectManager

  const { toolCalls } = useToolCallOperations(shouldLoadToolCalls ? run.runId : '')
  const { messages } = useRunMessages(shouldLoadMessages ? run.runId : '')
  const { steps: workflowSteps } = useWorkflowSteps(shouldLoadWorkflowSteps ? run.runId : '')
  const replay = useExecutionReplay(workflowSteps)
  const { latestTurn } = useExpertCouncilTurns(shouldLoadExpertCouncil ? run.runId : '')
  const {
    context: projectManagerContext,
    startConversation,
    addTurn,
    recordInteraction,
    profile,
  } = useProjectManager(
    shouldLoadProjectManager ? workflowId : ('' as WorkflowId),
    shouldLoadProjectManager ? run.runId : ''
  )
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

  // Deep research budget from workflowState
  const drWorkflowState = run.workflowState as
    | {
        budget?: { spentUsd: number; maxBudgetUsd: number; phase: string }
        sources?: unknown[]
        extractedClaims?: unknown[]
        kgSnapshots?: unknown[]
        gapIterationsUsed?: number
      }
    | undefined
  const drBudget = drWorkflowState?.budget
  const isDeepResearchWorkflow = workflow.workflowType === 'deep_research'

  // Compact output preview
  const displayOutput = run.output

  const runResearchRequests = useMemo(
    () => researchRequests.filter((request) => request.runId === run.runId),
    [researchRequests, run.runId]
  )
  const pendingResearch = runResearchRequests.filter((request) => request.status === 'pending')

  const projectManagerEnabled = Boolean(workflow.projectManagerConfig?.enabled)
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
        return 'badge badge-success'
      case 'failed':
        return 'badge badge-error'
      case 'queued':
        return 'badge badge-queued'
      case 'running':
        return 'badge badge-info'
      case 'paused':
        return 'badge badge-warning'
      case 'waiting_for_input':
        return 'badge badge-waiting'
      default:
        return 'badge'
    }
  }

  const getStatusLabel = (status: RunStatus) => {
    switch (status) {
      case 'completed':
        return 'Completed'
      case 'failed':
        return 'Failed'
      case 'queued':
        return 'Queued'
      case 'running':
        return 'Running'
      case 'paused':
        return 'Paused'
      case 'waiting_for_input':
        return 'Waiting for Input'
      case 'pending':
        return 'Pending'
      default:
        return String(status).replace(/_/g, ' ')
    }
  }

  const handleNodeClick = (nodeId: string, step?: WorkflowStep) => {
    const node = workflow.workflowGraph?.nodes.find((n) => n.id === nodeId)
    if (node) {
      setSelectedNode({ node, step })
    }
  }

  const isRunning = run.status === 'running' || run.status === 'waiting_for_input'

  return (
    <div className="run-card">
      <div className="run-header">
        <div>
          <h4>{run.goal}</h4>
          <span className={getStatusBadgeClass(run.status)}>{getStatusLabel(run.status)}</span>
          {latestTurn ? (
            <span className="badge">Expert Council</span>
          ) : (
            <span className="badge">Workflow</span>
          )}
          {pendingResearch.length > 0 && (
            <button
              type="button"
              className="run-research-indicator"
              onClick={() => navigate(`/workflows/${workflowId}?runId=${run.runId}`)}
            >
              {pendingResearch.length} pending
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

      {run.status === 'queued' && run.queueInfo && (
        <div className="run-output">
          <strong>Queue Status:</strong>
          <p>
            Waiting for shared capacity. Retry #{run.queueInfo.retryCount} at{' '}
            {new Date(run.queueInfo.nextRetryAtMs).toLocaleTimeString()}.
          </p>
        </div>
      )}

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

      {/* Deep Research Budget Progress */}
      {isDeepResearchWorkflow && drBudget && (
        <button
          type="button"
          className="dr-budget-progress"
          onClick={() => setShowResearchViewer(true)}
          title="Click to open Deep Research Viewer"
        >
          <div className="dr-budget-header">
            <strong>Budget:</strong>
            <span>
              ${drBudget.spentUsd.toFixed(2)} / ${drBudget.maxBudgetUsd.toFixed(2)}
            </span>
            <span className={`dr-phase-badge dr-phase-${drBudget.phase}`}>{drBudget.phase}</span>
          </div>
          <div className="dr-budget-bar">
            <div
              className={`dr-budget-fill dr-phase-${drBudget.phase}`}
              style={{
                width: `${Math.min(100, (drBudget.spentUsd / drBudget.maxBudgetUsd) * 100)}%`,
              }}
            />
          </div>
          <div className="dr-budget-stats">
            {drWorkflowState.sources && (
              <span>Sources: {(drWorkflowState.sources as unknown[]).length}</span>
            )}
            {drWorkflowState.extractedClaims && (
              <span>Claims: {(drWorkflowState.extractedClaims as unknown[]).length}</span>
            )}
            {drWorkflowState.gapIterationsUsed !== undefined && (
              <span>Iterations: {drWorkflowState.gapIterationsUsed}</span>
            )}
          </div>
        </button>
      )}

      {/* Deep Research Viewer (expanded) */}
      {showResearchViewer && isDeepResearchWorkflow && (
        <details className="run-context" open>
          <summary onClick={() => setShowResearchViewer(false)}>Deep Research Viewer</summary>
          <DeepResearchViewer run={run} workflow={workflow} />
        </details>
      )}

      {/* Compact output preview */}
      {displayOutput && !isRunning && (
        <div className="run-output-preview">
          <span className="run-output-preview-text">
            {displayOutput.slice(0, 200)}
            {displayOutput.length > 200 ? '...' : ''}
          </span>
        </div>
      )}

      {run.error && (
        <div className="run-error">
          <strong>Error:</strong>
          <p>{run.error}</p>
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

      {workflow.workflowGraph && (
        <details
          className="run-context"
          onToggle={(e) => setWorkflowExpanded((e.target as HTMLDetailsElement).open)}
        >
          <summary>
            Workflow Execution {workflowSteps.length > 0 ? `(${workflowSteps.length} steps)` : ''}
          </summary>
          {workflowExpanded && workflowSteps.length > 0 && (
            <>
              <div className="workflow-graph-container" style={{ position: 'relative' }}>
                <InteractiveWorkflowGraph
                  graph={workflow.workflowGraph}
                  workflowSteps={workflowSteps}
                  messages={messages}
                  onNodeClick={handleNodeClick}
                  replayStepIndex={replay.currentStepIndex}
                />
                {workflowSteps.length > 1 && run.status !== 'running' && (
                  <ExecutionReplayControls
                    steps={workflowSteps}
                    currentStepIndex={replay.currentStepIndex}
                    isReplaying={replay.isReplaying}
                    onStepChange={replay.goToStep}
                    onToggleReplay={replay.toggleReplay}
                    speed={replay.speed}
                    onSpeedChange={replay.setSpeed}
                    onStepForward={replay.stepForward}
                    onStepBack={replay.stepBack}
                  />
                )}
              </div>
              <p className="workflow-hint">
                Click on a node to view details
                {workflowSteps.length > 1 && run.status !== 'running'
                  ? ' · Use replay controls to time-travel'
                  : ''}
              </p>
            </>
          )}
          {workflowExpanded && workflowSteps.length === 0 && (
            <p className="no-data">No workflow steps yet</p>
          )}
        </details>
      )}

      {(latestTurn || expertCouncilExpanded) && (
        <details
          className="run-context"
          onToggle={(e) => setExpertCouncilExpanded((e.target as HTMLDetailsElement).open)}
        >
          <summary>Expert Council Inspector</summary>
          {expertCouncilExpanded && latestTurn && <ExpertCouncilInspector turn={latestTurn} />}
          {expertCouncilExpanded && !latestTurn && (
            <p className="no-data">No expert council data yet</p>
          )}
        </details>
      )}

      {/* Dialectical Workflow Visualization */}
      {isDialectical && (
        <details
          className="run-context"
          open={run.status === 'running'}
          onToggle={(e) => setDialecticalExpanded((e.target as HTMLDetailsElement).open)}
        >
          <summary>
            Dialectical Cycle
            {dialecticalState && (
              <span className="badge">
                Cycle {dialecticalState.cycleNumber} - {dialecticalState.phase.replace(/_/g, ' ')}
              </span>
            )}
          </summary>
          {(dialecticalExpanded || run.status === 'running') && dialecticalState && (
            <DialecticalCycleVisualization
              state={dialecticalState}
              velocityThreshold={0.2}
              onTerminate={onStop ? () => onStop(run.runId) : undefined}
              onPause={onStop ? () => onStop(run.runId) : undefined}
              onResume={onResume ? () => onResume(run.runId) : undefined}
            />
          )}
          {(dialecticalExpanded || run.status === 'running') && !dialecticalState && (
            <p className="no-data">No dialectical state data yet</p>
          )}
        </details>
      )}

      {projectManagerVisible && (
        <details
          className="run-context"
          onToggle={(e) => setProjectManagerExpanded((e.target as HTMLDetailsElement).open)}
        >
          <summary>Project Manager</summary>
          {projectManagerExpanded && (
            <ProjectManagerChat
              key={projectManagerKey}
              contextSummary={projectManagerContext?.summary}
              clarificationQuestions={clarificationQuestions}
              decisionOptions={decisionOptions}
              conflicts={projectManagerContext?.conflicts ?? []}
              profile={profile}
              onAnswerQuestion={(questionId, answer) => {
                const question = clarificationQuestions.find(
                  (item) => item.questionId === questionId
                )
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
        <Button variant="ghost" size="sm" onClick={() => setShowDetailModal(true)}>
          {run.status === 'waiting_for_input' && run.pendingInput ? (
            <>
              <span
                className="live-dot"
                style={{ backgroundColor: 'var(--color-warning, #f59e0b)' }}
              />{' '}
              Respond to Agent
            </>
          ) : isRunning ? (
            <>
              <span className="live-dot" /> Live View
            </>
          ) : (
            'View Details'
          )}
        </Button>
        {onRunAgain && (run.status === 'completed' || run.status === 'failed') && (
          <Button variant="ghost" onClick={() => onRunAgain(run.runId)}>
            Run Again
          </Button>
        )}
        {onResume && run.status === 'failed' && (
          <Button variant="ghost" onClick={() => onResume(run.runId)}>
            Resume
          </Button>
        )}
        {onContinue && (run.status === 'completed' || run.status === 'failed') && (
          <Button variant="ghost" onClick={() => onContinue(run.runId)}>
            Continue
          </Button>
        )}
        <Button variant="ghost" className="danger" onClick={() => onDelete(run.runId)}>
          Delete
        </Button>
      </div>

      {/* Workflow Node Details Modal */}
      <WorkflowNodeModal
        node={selectedNode?.node ?? null}
        step={selectedNode?.step}
        messages={messages}
        toolCalls={toolCalls}
        isOpen={!!selectedNode}
        onClose={() => setSelectedNode(null)}
      />

      {/* Run Detail Modal */}
      <RunDetailModal
        run={run}
        workflow={workflow}
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        onProvideInput={onProvideInput}
        onConstraintResponse={onConstraintResponse}
        onStop={onStop}
      />
    </div>
  )
}
