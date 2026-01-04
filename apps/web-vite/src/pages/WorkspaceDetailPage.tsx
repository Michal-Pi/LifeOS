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

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useWorkspaceOperations } from '@/hooks/useWorkspaceOperations'
import { useAgentOperations } from '@/hooks/useAgentOperations'
import { RunWorkspaceModal } from '@/components/agents/RunWorkspaceModal'
import { RunCard } from '@/components/agents/RunCard'
import { WorkflowGraphView } from '@/components/agents/WorkflowGraphView'
import type { WorkspaceId, RunStatus } from '@lifeos/agents'

export function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { workspace, runs, isLoading, getWorkspace, loadRuns, deleteRun, updateRun } =
    useWorkspaceOperations()
  const { agents, loadAgents } = useAgentOperations()

  const [showRunModal, setShowRunModal] = useState(false)
  const [resumeSeed, setResumeSeed] = useState<{
    goal?: string
    context?: Record<string, unknown>
  } | null>(null)
  const [statusFilter, setStatusFilter] = useState<RunStatus | 'all'>('all')
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  useEffect(() => {
    if (workspaceId) {
      void getWorkspace(workspaceId as WorkspaceId)
      void loadRuns({ workspaceId: workspaceId as WorkspaceId })
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
      void loadRuns({ workspaceId: workspaceId as WorkspaceId })
    }
  }

  const handleDeleteRun = async (runId: string) => {
    if (!window.confirm('Are you sure you want to delete this run? This cannot be undone.')) {
      return
    }

    try {
      await deleteRun(runId)
      if (workspaceId) {
        void loadRuns({ workspaceId: workspaceId as WorkspaceId })
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

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a) => a.agentId === agentId)
    return agent?.name ?? 'Unknown Agent'
  }

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
          <button onClick={() => navigate('/workspaces')} className="ghost-button">
            Back to Workspaces
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <button onClick={() => navigate('/workspaces')} className="back-button">
            ← Back
          </button>
          <h1>{workspace.name}</h1>
          {workspace.description && <p>{workspace.description}</p>}
        </div>
        <button onClick={handleStartRun} className="primary-button">
          + Start Run
        </button>
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
          <h2>Run History</h2>
          <div className="filters">
            <label htmlFor="statusFilter">Status:</label>
            <select
              id="statusFilter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RunStatus | 'all')}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="paused">Paused</option>
              <option value="waiting_for_input">Waiting for Input</option>
            </select>
          </div>
        </div>

        {filteredRuns.length === 0 ? (
          <div className="empty-state">
            <p>System idle. No runs yet.</p>
            <button onClick={handleStartRun} className="primary-button">
              Start your first run
            </button>
          </div>
        ) : (
          <div className="runs-list">
            {filteredRuns.map((run) => (
              <RunCard
                key={run.runId}
                run={run}
                currentTime={currentTime}
                onDelete={handleDeleteRun}
                onResume={handleResumeRun}
                onProvideInput={handleProvideInput}
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
