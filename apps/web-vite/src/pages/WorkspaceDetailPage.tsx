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
import type { WorkspaceId, RunStatus } from '@lifeos/agents'

export function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { workspace, runs, isLoading, getWorkspace, loadRuns, deleteRun } = useWorkspaceOperations()
  const { agents, loadAgents } = useAgentOperations()

  const [showRunModal, setShowRunModal] = useState(false)
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

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a) => a.agentId === agentId)
    return agent?.name ?? 'Unknown Agent'
  }

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
      default:
        return 'badge'
    }
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
          <button onClick={() => navigate('/workspaces')}>Back to Workspaces</button>
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
        <button onClick={handleStartRun} className="btn-primary">
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
            <strong>Agents:</strong> {workspace.agentIds.length}
          </div>
        </div>

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
            </select>
          </div>
        </div>

        {filteredRuns.length === 0 ? (
          <div className="empty-state">
            <p>No runs found</p>
            <button onClick={handleStartRun}>Start your first run</button>
          </div>
        ) : (
          <div className="runs-list">
            {filteredRuns.map((run) => (
              <div key={run.runId} className="run-card">
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

                {run.output && (
                  <div className="run-output">
                    <strong>Output:</strong>
                    <p>{run.output}</p>
                  </div>
                )}

                {run.error && (
                  <div className="run-error">
                    <strong>Error:</strong>
                    <p>{run.error}</p>
                  </div>
                )}

                {run.context && Object.keys(run.context).length > 0 && (
                  <details className="run-context">
                    <summary>Context</summary>
                    <pre>{JSON.stringify(run.context, null, 2)}</pre>
                  </details>
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
                  <button onClick={() => handleDeleteRun(run.runId)} className="btn-danger">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <RunWorkspaceModal
        workspace={workspace}
        isOpen={showRunModal}
        onClose={() => setShowRunModal(false)}
        onRunCreated={handleRunCreated}
      />
    </div>
  )
}
