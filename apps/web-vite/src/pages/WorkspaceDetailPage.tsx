/**
 * WorkspaceDetailPage Component
 *
 * Detailed view of a single workspace with run history.
 * Features:
 * - View workspace configuration
 * - List all runs for this workspace
 * - Start new runs
 * - View run details
 * - Filter runs by status
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useWorkspaceOperations } from '@/hooks/useWorkspaceOperations'
import { useDeepResearch } from '@/hooks/useDeepResearch'
import { useAgentOperations } from '@/hooks/useAgentOperations'
import { useProjectManager } from '@/hooks/useProjectManager'
import { RunWorkspaceModal } from '@/components/agents/RunWorkspaceModal'
import { RunCard } from '@/components/agents/RunCard'
import { WorkflowGraphView } from '@/components/agents/WorkflowGraphView'
import { ResearchQueue } from '@/components/agents/ResearchQueue'
import { Button } from '@/components/ui/button'
import { Select, type SelectOption } from '@/components/Select'
import type { WorkspaceId, RunStatus } from '@lifeos/agents'
import { useDialog } from '@/contexts/useDialog'

export function WorkspaceDetailPage() {
  const { confirm } = useDialog()
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { workspace, runs, isLoading, getWorkspace, loadRuns, deleteRun, updateRun } =
    useWorkspaceOperations()
  const { agents, loadAgents } = useAgentOperations()
  const { requests: researchRequests } = useDeepResearch(workspaceId as WorkspaceId)
  const { profile: projectManagerProfile } = useProjectManager(workspaceId as WorkspaceId)

  const [showRunModal, setShowRunModal] = useState(false)
  const [resumeSeed, setResumeSeed] = useState<{
    goal?: string
    context?: Record<string, unknown>
  } | null>(null)
  const [statusFilter, setStatusFilter] = useState<RunStatus | 'all'>('all')
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [showProjectManager, setShowProjectManager] = useState(true)

  useEffect(() => {
    if (workspaceId) {
      void getWorkspace(workspaceId as WorkspaceId)
      void loadRuns(workspaceId as WorkspaceId)
      void loadAgents()
    }
  }, [workspaceId, getWorkspace, loadRuns, loadAgents])

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
    if (workspaceId) {
      void loadRuns(workspaceId as WorkspaceId)
    }
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
      await deleteRun(runId)
      if (workspaceId) {
        void loadRuns(workspaceId as WorkspaceId)
      }
    } catch (err) {
      console.error('Failed to delete run:', err)
    }
  }

  const handleResumeRun = (runId: string) => {
    const runToResume = runs.find((run) => run.runId === runId)
    if (!runToResume) return
    setResumeSeed({
      goal: `Continue: ${runToResume.goal}`,
      context: { resumeRunId: runToResume.runId },
    })
    setShowRunModal(true)
  }

  const handleRunAgain = (runId: string) => {
    const runToRerun = runs.find((run) => run.runId === runId)
    if (!runToRerun) return
    // Pre-fill with same workspace settings, but clear goal for new prompt
    setResumeSeed({
      goal: '', // Empty goal field ready for new prompt
      context: runToRerun.context, // Keep the same context structure
    })
    setShowRunModal(true)
  }

  const handleProvideInput = async (runId: string, nodeId: string, response: string) => {
    const run = runs.find((item) => item.runId === runId)
    if (!run) return
    const context = {
      ...(run.context ?? {}),
      humanInput: { nodeId, response },
    }
    await updateRun(runId, {
      status: 'pending',
      pendingInput: null,
      context,
    })
  }

  const handleStopRun = async (runId: string) => {
    try {
      await updateRun(runId, {
        status: 'paused',
      })
      if (workspaceId) {
        void loadRuns(workspaceId as WorkspaceId)
      }
    } catch (err) {
      console.error('Failed to stop run:', err)
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

  if (isLoading) {
    return <div className="loading">Loading workspace...</div>
  }

  if (!workspace) {
    return (
      <div className="page-container">
        <div className="error-state">
          <p>Workspace not found</p>
          <Button variant="ghost" onClick={() => navigate('/workspaces')}>
            Back to Workspaces
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <Button variant="ghost" onClick={() => navigate('/workspaces')} className="back-button">
            ← Back
          </Button>
          <h1>{workspace.name}</h1>
          {workspace.description && <p>{workspace.description}</p>}
        </div>
        <Button onClick={handleStartRun}>+ Start Run</Button>
      </header>

      <div className="workspace-info">
        <div className="info-card">
          <h3>Configuration</h3>
          <div className="info-row">
            <strong>Workflow Type:</strong> <span className="badge">{workspace.workflowType}</span>
          </div>
          <div className="info-row">
            <strong>Max Iterations:</strong> {workspace.maxIterations ?? 10}
          </div>
          <div className="info-row">
            <strong>Message Window:</strong>{' '}
            {workspace.memoryMessageLimit
              ? `${workspace.memoryMessageLimit} msgs`
              : 'Global default'}
          </div>
          <div className="info-row">
            <strong>Agents:</strong> {workspace.agentIds.length}
          </div>
        </div>

        {workspace.projectManagerConfig?.enabled && (
          <div className="info-card">
            <h3>Project Manager</h3>
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
        )}

        {workspace.workflowGraph && (
          <div className="info-card">
            <h3>Workflow Graph</h3>
            <div className="info-row">
              <strong>Start Node:</strong> {workspace.workflowGraph.startNodeId}
            </div>
            <WorkflowGraphView graph={workspace.workflowGraph} />
            <details className="run-context">
              <summary>Nodes ({workspace.workflowGraph.nodes.length})</summary>
              <pre>{JSON.stringify(workspace.workflowGraph.nodes, null, 2)}</pre>
            </details>
            <details className="run-context">
              <summary>Edges ({workspace.workflowGraph.edges.length})</summary>
              <pre>{JSON.stringify(workspace.workflowGraph.edges, null, 2)}</pre>
            </details>
          </div>
        )}

        <div className="info-card">
          <h3>Team</h3>
          <ul className="agent-team-list">
            {workspace.agentIds.map((agentId) => (
              <li key={agentId}>
                {getAgentName(agentId)}
                {workspace.defaultAgentId === agentId && (
                  <span className="badge-small">default</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="runs-section">
        <div className="section-header">
          <h2>Research Queue</h2>
        </div>
        <ResearchQueue workspaceId={workspaceId as WorkspaceId} />
      </div>

      <div className="runs-section">
        <div className="section-header">
          <h2>Run History</h2>
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
                workspace={workspace}
                workspaceId={workspaceId as WorkspaceId}
                researchRequests={researchRequests}
                currentTime={currentTime}
                showProjectManager={showProjectManager}
                onDelete={handleDeleteRun}
                onResume={handleResumeRun}
                onProvideInput={handleProvideInput}
                onRunAgain={handleRunAgain}
                onStop={handleStopRun}
              />
            ))}
          </div>
        )}
      </div>

      <RunWorkspaceModal
        workspace={workspace}
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
    </div>
  )
}
