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
import { useNoteOperations } from '@/hooks/useNoteOperations'
import { useAuth } from '@/hooks/useAuth'
import { ToolCallTimeline } from './ToolCallTimeline'
import { ExpertCouncilInspector } from './ExpertCouncilInspector'
import { ProjectManagerChat } from './ProjectManagerChat'
import { InteractiveWorkflowGraph } from './InteractiveWorkflowGraph'
import { WorkflowNodeModal } from './WorkflowNodeModal'
import { RunStatusIndicator } from './RunStatusIndicator'
import { AgentQuestionPanel } from './AgentQuestionPanel'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type {
  DeepResearchRequest,
  Run,
  RunStatus,
  Workspace,
  WorkspaceId,
  WorkflowStep,
  WorkflowGraphNode,
} from '@lifeos/agents'

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
  onRunAgain?: (runId: string) => void
  onStop?: (runId: string) => Promise<void>
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
  onRunAgain,
  onStop,
}: RunCardProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { createNote } = useNoteOperations()
  const [isSubmittingInput, setIsSubmittingInput] = useState(false)
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [selectedNode, setSelectedNode] = useState<{
    node: WorkflowGraphNode | null
    step?: WorkflowStep
  } | null>(null)

  // Lazy load data only when sections are expanded
  const [workflowExpanded, setWorkflowExpanded] = useState(false)
  const [messagesExpanded, setMessagesExpanded] = useState(false)
  const [expertCouncilExpanded, setExpertCouncilExpanded] = useState(false)
  const [projectManagerExpanded, setProjectManagerExpanded] = useState(false)

  // Only fetch when running or when explicitly expanded
  const shouldLoadToolCalls = run.status === 'running' || workflowExpanded || messagesExpanded
  const shouldLoadMessages = run.status === 'running' || messagesExpanded || workflowExpanded
  const shouldLoadEvents = run.status === 'running'
  const shouldLoadWorkflowSteps = run.status === 'running' || workflowExpanded
  const shouldLoadExpertCouncil = run.status === 'running' || expertCouncilExpanded
  const shouldLoadProjectManager = projectManagerExpanded && showProjectManager

  const { toolCalls } = useToolCallOperations(shouldLoadToolCalls ? run.runId : '')
  const { messages, hasMore, isLoadingMore, loadMore } = useRunMessages(
    shouldLoadMessages ? run.runId : ''
  )
  const { events } = useRunEvents(shouldLoadEvents ? run.runId : '')
  const { steps: workflowSteps } = useWorkflowSteps(shouldLoadWorkflowSteps ? run.runId : '')
  const { latestTurn } = useExpertCouncilTurns(shouldLoadExpertCouncil ? run.runId : '')
  const {
    context: projectManagerContext,
    startConversation,
    addTurn,
    recordInteraction,
    profile,
  } = useProjectManager(
    shouldLoadProjectManager ? workspaceId : ('' as WorkspaceId),
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
        return 'badge-waiting'
      default:
        return 'badge'
    }
  }

  const getAgentNameFromMessages = () => {
    // Get the last assistant message to find the agent asking the question
    const lastAssistantMessage = [...messages].reverse().find((msg) => msg.role === 'assistant')

    // Try to extract agent name from agentId if available
    if (lastAssistantMessage && 'agentId' in lastAssistantMessage) {
      const agentId = lastAssistantMessage.agentId as string
      const agent = workspace.agentIds?.find((id) => id === agentId)
      if (agent) {
        // Extract agent name from ID (format: "agent:uuid")
        return agentId.split(':')[0] || 'Agent'
      }
    }

    return 'Project Manager'
  }

  const handleSaveAsNote = async () => {
    if (!displayOutput || !user) return

    setIsSavingNote(true)
    try {
      // Extract title from first line or use goal
      const firstLine = displayOutput.split('\n')[0]
      const title = firstLine.length > 100 ? `Run: ${run.goal}` : firstLine || run.goal

      // Create note with output content
      const note = await createNote({
        title,
        content: displayOutput,
        context: {
          source: 'workspace-run',
          workspaceId: workspace.workspaceId,
          workspaceName: workspace.name,
          runId: run.runId,
          goal: run.goal,
        },
      })

      toast.success('Note created!', {
        description: 'Click to view note',
        action: {
          label: 'View',
          onClick: () => navigate(`/notes?noteId=${note.noteId}`),
        },
      })
    } catch (error) {
      toast.error('Failed to create note', {
        description: (error as Error).message,
      })
    } finally {
      setIsSavingNote(false)
    }
  }

  const handleNodeClick = (nodeId: string, step?: WorkflowStep) => {
    // Find the node definition from the workflow graph
    const node = workspace.workflowGraph?.nodes.find((n) => n.id === nodeId)
    if (node) {
      setSelectedNode({ node, step })
    }
  }

  const handleStop = async () => {
    if (!onStop) return
    try {
      await onStop(run.runId)
      toast.success('Run stopped')
    } catch (error) {
      toast.error('Failed to stop run', {
        description: (error as Error).message,
      })
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

      {/* Live Status Indicator for Running Runs */}
      {run.status === 'running' && (
        <RunStatusIndicator
          run={run}
          events={events}
          workflowGraph={workspace.workflowGraph}
          onStop={onStop ? handleStop : undefined}
        />
      )}

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
          <div className="run-output-header">
            <strong>{run.status === 'running' ? 'Live Output:' : 'Output:'}</strong>
            {run.status === 'completed' && (
              <Button variant="ghost" size="sm" onClick={handleSaveAsNote} disabled={isSavingNote}>
                {isSavingNote ? 'Saving...' : '📝 Save as Note'}
              </Button>
            )}
          </div>
          <p>{displayOutput}</p>
        </div>
      )}

      {run.error && (
        <div className="run-error">
          <strong>Error:</strong>
          <p>{run.error}</p>
        </div>
      )}

      {run.status === 'waiting_for_input' && run.pendingInput && onProvideInput && (
        <AgentQuestionPanel
          pendingInput={run.pendingInput}
          agentName={getAgentNameFromMessages()}
          onSubmit={async (response) => {
            try {
              setIsSubmittingInput(true)
              await onProvideInput(run.runId, run.pendingInput!.nodeId, response)
            } finally {
              setIsSubmittingInput(false)
            }
          }}
          isSubmitting={isSubmittingInput}
        />
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

      {workspace.workflowGraph && (
        <details
          className="run-context"
          onToggle={(e) => setWorkflowExpanded((e.target as HTMLDetailsElement).open)}
        >
          <summary>
            Workflow Execution {workflowSteps.length > 0 ? `(${workflowSteps.length} steps)` : ''}
          </summary>
          {workflowExpanded && workflowSteps.length > 0 && (
            <>
              <div className="workflow-graph-container">
                <InteractiveWorkflowGraph
                  graph={workspace.workflowGraph}
                  workflowSteps={workflowSteps}
                  messages={messages}
                  onNodeClick={handleNodeClick}
                />
              </div>
              <p className="workflow-hint">💡 Click on a node to view its execution details</p>
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

      <details
        className="run-messages"
        onToggle={(e) => setMessagesExpanded((e.target as HTMLDetailsElement).open)}
      >
        <summary>
          Messages {messages.length > 0 ? `(${messages.length}${hasMore ? '+' : ''})` : ''}
        </summary>
        {messagesExpanded && messages.length > 0 && (
          <>
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
          </>
        )}
        {messagesExpanded && messages.length === 0 && <p className="no-data">No messages yet</p>}
      </details>

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
        {onRunAgain && (run.status === 'completed' || run.status === 'failed') && (
          <Button variant="ghost" onClick={() => onRunAgain(run.runId)}>
            🔄 Run Again
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
    </div>
  )
}
