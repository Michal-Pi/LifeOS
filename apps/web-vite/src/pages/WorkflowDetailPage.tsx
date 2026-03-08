/**
 * WorkflowDetailPage Component
 *
 * Detailed view of a single workflow with run history.
 * Features:
 * - View workflow configuration
 * - List all runs for this workflow
 * - Start new runs
 * - View run details
 * - Filter runs by status
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firebase'
import { useWorkflowOperations } from '@/hooks/useWorkflowOperations'
import { useDeepResearch } from '@/hooks/useDeepResearch'
import { useAgentOperations } from '@/hooks/useAgentOperations'
import { useProjectManager } from '@/hooks/useProjectManager'
import { useAuth } from '@/hooks/useAuth'
import { RunWorkflowModal } from '@/components/agents/RunWorkflowModal'
import { RunCard } from '@/components/agents/RunCard'
import { WorkflowGraphView } from '@/components/agents/WorkflowGraphView'
import { CustomWorkflowBuilder } from '@/components/agents/CustomWorkflowBuilder'
import { ResearchQueue } from '@/components/agents/ResearchQueue'
import { Button } from '@/components/ui/button'
import { Select, type SelectOption } from '@/components/Select'
import type { WorkflowId, RunStatus, Run, RunId } from '@lifeos/agents'
import { useDialog } from '@/contexts/useDialog'
import { logger } from '@/lib/logger'
import { toast } from 'sonner'

export function WorkflowDetailPage() {
  const { confirm } = useDialog()
  const { user } = useAuth()
  const { workflowId } = useParams<{ workflowId: string }>()
  const navigate = useNavigate()
  const { workflow, getWorkflow, deleteRun, updateRun, updateWorkflow } = useWorkflowOperations()
  const { agents, loadAgents } = useAgentOperations()
  const { requests: researchRequests } = useDeepResearch(workflowId as WorkflowId)
  const { profile: projectManagerProfile } = useProjectManager(workflowId as WorkflowId)

  const [showRunModal, setShowRunModal] = useState(false)
  const [resumeSeed, setResumeSeed] = useState<{
    goal?: string
    context?: Record<string, unknown>
  } | null>(null)
  const [statusFilter, setStatusFilter] = useState<RunStatus | 'all'>('all')
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [showProjectManager, setShowProjectManager] = useState(true)
  const [showFullGraphPreview, setShowFullGraphPreview] = useState(false)
  const [showGraphEditor, setShowGraphEditor] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [runs, setRuns] = useState<Run[]>([])
  const [pageLoading, setPageLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Refs for stable callbacks in effects (avoids re-triggering on identity changes)
  const getWorkflowRef = useRef(getWorkflow)
  getWorkflowRef.current = getWorkflow
  const loadAgentsRef = useRef(loadAgents)
  loadAgentsRef.current = loadAgents

  // Load workflow + agents when workflowId or user changes
  useEffect(() => {
    const uid = user?.uid
    if (!workflowId || !uid) return

    let cancelled = false
    setPageLoading(true)
    setLoadError(null)

    const load = async () => {
      try {
        const [ws] = await Promise.all([
          getWorkflowRef.current(workflowId as WorkflowId),
          loadAgentsRef.current(),
        ])
        if (cancelled) return
        if (!ws) {
          setLoadError('Workflow not found')
        }
      } catch (err) {
        if (cancelled) return
        console.error('[WorkflowDetailPage] Failed to load workflow:', err)
        setLoadError((err as Error).message || 'Failed to load workflow')
      } finally {
        if (!cancelled) {
          setPageLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [workflowId, user?.uid])

  // Real-time subscription to runs for this workflow
  useEffect(() => {
    if (!user || !workflowId) {
      return
    }

    let db
    try {
      db = getFirestoreClient()
    } catch (err) {
      console.error('[WorkflowDetailPage] Firestore not ready:', err)
      return
    }
    const runsRef = collection(db, `users/${user.uid}/workflows/${workflowId}/runs`)
    const q = query(runsRef, orderBy('startedAtMs', 'desc'), limit(50))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const updatedRuns = snapshot.docs.map((doc) => doc.data() as Run)
        logger.debug(`[WorkflowDetailPage] Received ${updatedRuns.length} runs from Firestore`)
        setRuns(updatedRuns)
      },
      (err) => {
        console.error('[WorkflowDetailPage] Error subscribing to runs:', err)
        toast.error('Failed to load runs')
      }
    )

    return () => unsubscribe()
  }, [user, workflowId])

  // Update current time every second for running task durations
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleStartRun = () => {
    setResumeSeed(null)
    setShowRunModal(true)
  }

  const handleRunCreated = () => {
    // Real-time subscription will automatically update the runs list
    toast.success('Run started')
  }

  const handleDeleteRun = async (runId: string) => {
    const confirmed = await confirm({
      title: 'Delete run',
      description: 'Are you sure you want to delete this run? This cannot be undone.',
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
    })
    if (!confirmed) return

    try {
      await deleteRun(runId as RunId)
      // Real-time subscription will automatically update the runs list
      toast.success('Run deleted')
    } catch (err) {
      console.error('Failed to delete run:', err)
      toast.error('Failed to delete run')
    }
  }

  const handleResumeRun = async (runId: string) => {
    try {
      // Resume by changing status from paused/failed to pending
      // This will trigger the Cloud Function to continue execution
      await updateRun(runId as RunId, {
        status: 'pending',
      })
      toast.success('Run resumed')
    } catch (err) {
      console.error('Failed to resume run:', err)
      toast.error('Failed to resume run')
    }
  }

  const handleRunAgain = (runId: string) => {
    const runToRerun = runs.find((run) => run.runId === runId)
    if (!runToRerun) return
    setResumeSeed({
      goal: runToRerun.goal,
      context: runToRerun.context,
    })
    setShowRunModal(true)
  }

  const handleContinue = (runId: string) => {
    const runToContinue = runs.find((run) => run.runId === runId)
    if (!runToContinue) return
    setResumeSeed({
      goal: runToContinue.goal,
      context: {
        ...(runToContinue.context ?? {}),
        resumeRunId: runToContinue.runId,
      },
    })
    setShowRunModal(true)
  }

  const handleProvideInput = async (runId: string, nodeId: string, response: string) => {
    const run = runs.find((item) => item.runId === runId)
    if (!run) return
    const context = {
      ...(run.context ?? {}),
      humanApproval: { nodeId, response },
    }
    await updateRun(runId as RunId, {
      status: 'pending',
      pendingInput: null,
      context,
    })
  }

  const handleConstraintResponse = async (
    runId: string,
    action: 'increase' | 'stop',
    newLimit?: number
  ) => {
    const run = runs.find((item) => item.runId === runId)
    if (!run) return

    if (action === 'stop') {
      const constraintType = run.constraintPause?.constraintType
      const shouldFinalizeWithCurrentFindings =
        constraintType === 'budget' ||
        constraintType === 'max_gap_iterations' ||
        constraintType === 'max_dialectical_cycles'

      if (shouldFinalizeWithCurrentFindings) {
        const context = {
          ...(run.context ?? {}),
          constraintOverride: {
            type: constraintType,
            action: 'finalize',
          },
        }
        await updateRun(runId as RunId, {
          status: 'pending',
          constraintPause: undefined,
          pendingInput: undefined,
          context,
        })
        return
      }

      await updateRun(runId as RunId, {
        status: 'completed',
        constraintPause: undefined,
        pendingInput: undefined,
      })
      return
    }

    // User chose to increase the limit
    const constraintType = run.constraintPause?.constraintType
    const context = {
      ...(run.context ?? {}),
      constraintOverride: {
        type: constraintType,
        newLimit: newLimit ?? run.constraintPause?.suggestedIncrease,
      },
    }
    await updateRun(runId as RunId, {
      status: 'pending',
      constraintPause: undefined,
      pendingInput: undefined,
      context,
    })
  }

  const handleStopRun = async (runId: string) => {
    try {
      await updateRun(runId as RunId, {
        status: 'paused',
      })
      // Real-time subscription will automatically update the runs list
      toast.success('Run stopped')
    } catch (err) {
      console.error('Failed to stop run:', err)
      toast.error('Failed to stop run')
      throw err
    }
  }

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a) => a.agentId === agentId)
    return agent?.name ?? 'Unknown Agent'
  }

  // Status filter options
  const statusOptions: SelectOption[] = useMemo(
    () => [
      { value: 'all', label: 'All' },
      { value: 'pending', label: 'Pending' },
      { value: 'queued', label: 'Queued' },
      { value: 'running', label: 'Running' },
      { value: 'completed', label: 'Completed' },
      { value: 'failed', label: 'Failed' },
      { value: 'paused', label: 'Paused' },
      { value: 'waiting_for_input', label: 'Waiting for Input' },
    ],
    []
  )

  // Filter runs by status
  const filteredRuns = runs.filter((run) => {
    if (statusFilter !== 'all' && run.status !== statusFilter) return false
    return true
  })

  if (pageLoading) {
    return <div className="loading">Loading workflow...</div>
  }

  if (loadError || !workflow) {
    return (
      <div className="page-container">
        <div className="error-state">
          <p>{loadError || 'Workflow not found'}</p>
          <Button variant="ghost" onClick={() => navigate('/workflows')}>
            Back to Workflows
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <Button variant="ghost" onClick={() => navigate('/workflows')} className="back-button">
            ← Back
          </Button>
          <h1>{workflow.name}</h1>
          {workflow.description && <p>{workflow.description}</p>}
        </div>
        <Button onClick={handleStartRun}>+ Start Run</Button>
      </header>

      {/* Configuration section */}
      <details
        className="workflow-section"
        open={configOpen}
        onToggle={(e) => setConfigOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="workflow-section__header">
          <h3>Configuration</h3>
          <span className="workflow-section__summary">
            {workflow.workflowType} · {workflow.agentIds.length} agents
          </span>
        </summary>
        <div className="workflow-section__body">
          <div className="workflow-info">
            <div className="info-card">
              <div className="info-row">
                <strong>Workflow Type:</strong>{' '}
                <span className="badge">{workflow.workflowType}</span>
              </div>
              <div className="info-row">
                <strong>Max Iterations:</strong> {workflow.maxIterations ?? 10}
              </div>
              <div className="info-row">
                <strong>Message Window:</strong>{' '}
                {workflow.memoryMessageLimit
                  ? `${workflow.memoryMessageLimit} msgs`
                  : 'Global default'}
              </div>
              <div className="info-row">
                <strong>Agents:</strong> {workflow.agentIds.length}
              </div>
            </div>

            {workflow.workflowGraph && (
              <div className="info-card">
                <h3>Workflow Graph</h3>
                <div className="info-row">
                  <strong>Start Node:</strong> {workflow.workflowGraph.startNodeId}
                </div>
                {configOpen && <WorkflowGraphView graph={workflow.workflowGraph} />}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <Button variant="secondary" onClick={() => setShowFullGraphPreview(true)}>
                    View Full Workflow
                  </Button>
                  <Button variant="secondary" onClick={() => setShowGraphEditor(true)}>
                    Edit in Visual Builder
                  </Button>
                </div>
                <details className="run-context">
                  <summary>Nodes ({workflow.workflowGraph.nodes.length})</summary>
                  <pre>{JSON.stringify(workflow.workflowGraph.nodes, null, 2)}</pre>
                </details>
                <details className="run-context">
                  <summary>Edges ({workflow.workflowGraph.edges.length})</summary>
                  <pre>{JSON.stringify(workflow.workflowGraph.edges, null, 2)}</pre>
                </details>
              </div>
            )}

            <div className="info-card">
              <h3>Team</h3>
              <ul className="agent-team-list">
                {workflow.agentIds.map((agentId) => (
                  <li key={agentId}>
                    {getAgentName(agentId)}
                    {workflow.defaultAgentId === agentId && (
                      <span className="badge-small">default</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </details>

      {/* Project Manager section */}
      {workflow.projectManagerConfig?.enabled && (
        <details className="workflow-section">
          <summary className="workflow-section__header">
            <h3>Project Manager</h3>
            <span className="workflow-section__summary">
              {projectManagerProfile?.expertiseLevel ?? 'Enabled'}
            </span>
          </summary>
          <div className="workflow-section__body">
            <div className="info-row">
              <strong>Status:</strong> <span className="badge">Enabled</span>
            </div>
            <div className="info-row">
              <label>
                <input
                  type="checkbox"
                  checked={showProjectManager}
                  onChange={(event) => setShowProjectManager(event.target.checked)}
                />
                <span>Show Project Manager interface</span>
              </label>
            </div>
            {projectManagerProfile && (
              <div className="info-row">
                <strong>Expertise:</strong> {projectManagerProfile.expertiseLevel}
              </div>
            )}
          </div>
        </details>
      )}

      {/* Research section */}
      {researchRequests.length > 0 && (
        <details className="workflow-section">
          <summary className="workflow-section__header">
            <h3>Research</h3>
            <span className="workflow-section__summary">
              {researchRequests.filter((r) => r.status === 'pending').length} pending
            </span>
          </summary>
          <div className="workflow-section__body">
            <ResearchQueue workflowId={workflowId as WorkflowId} />
          </div>
        </details>
      )}

      {/* Runs section - open by default */}
      <details className="workflow-section" open>
        <summary className="workflow-section__header">
          <h3>Runs</h3>
          <span className="workflow-section__summary">{runs.length} runs</span>
        </summary>
        <div className="workflow-section__body">
          <div className="section-header">
            <div className="filters">
              <label htmlFor="statusFilter">Status:</label>
              <Select
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as RunStatus | 'all')}
                options={statusOptions}
                placeholder="Filter by status..."
              />
            </div>
          </div>

          {filteredRuns.length === 0 ? (
            <div className="empty-state">
              <p>System idle. No runs yet.</p>
              <Button onClick={handleStartRun}>Start your first run</Button>
            </div>
          ) : (
            <div className="runs-list">
              {filteredRuns.map((run) => (
                <RunCard
                  key={run.runId}
                  run={run}
                  workflow={workflow}
                  workflowId={workflowId as WorkflowId}
                  researchRequests={researchRequests}
                  currentTime={currentTime}
                  showProjectManager={showProjectManager}
                  onDelete={handleDeleteRun}
                  onResume={handleResumeRun}
                  onProvideInput={handleProvideInput}
                  onConstraintResponse={handleConstraintResponse}
                  onRunAgain={handleRunAgain}
                  onContinue={handleContinue}
                  onStop={handleStopRun}
                />
              ))}
            </div>
          )}
        </div>
      </details>

      <RunWorkflowModal
        workflow={workflow}
        agents={agents}
        isOpen={showRunModal}
        onClose={() => {
          setShowRunModal(false)
          setResumeSeed(null)
        }}
        onRunCreated={handleRunCreated}
        initialGoal={resumeSeed?.goal}
        initialContext={resumeSeed?.context}
      />

      {showFullGraphPreview && workflow.workflowGraph && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1100 }}
          onClick={() => setShowFullGraphPreview(false)}
        >
          <div
            className="modal-content"
            style={{ width: '90vw', maxWidth: 1100, height: '75vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <h3 style={{ margin: 0 }}>Workflow Preview</h3>
              <Button variant="secondary" onClick={() => setShowFullGraphPreview(false)}>
                Close
              </Button>
            </div>
            <div style={{ flex: 1, height: 'calc(100% - 52px)' }}>
              <WorkflowGraphView graph={workflow.workflowGraph} />
            </div>
          </div>
        </div>
      )}

      {workflow.workflowGraph && (
        <CustomWorkflowBuilder
          isOpen={showGraphEditor}
          onClose={() => setShowGraphEditor(false)}
          initialGraph={workflow.workflowGraph}
          agents={agents}
          onSave={async (graph) => {
            await updateWorkflow(workflow.workflowId, { workflowGraph: graph })
            setShowGraphEditor(false)
            void getWorkflow(workflow.workflowId)
            toast.success('Workflow graph updated')
          }}
        />
      )}
    </div>
  )
}
