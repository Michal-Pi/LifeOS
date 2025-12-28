/**
 * WorkspacesPage Component
 *
 * Main page for managing AI agent workspaces.
 * Features:
 * - List all workspaces
 * - Create, edit, delete workspaces
 * - View workspace details
 * - Navigate to workspace detail page
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspaceOperations } from '@/hooks/useWorkspaceOperations'
import { useAgentOperations } from '@/hooks/useAgentOperations'
import { WorkspaceFormModal } from '@/components/agents/WorkspaceFormModal'
import type { Workspace } from '@lifeos/agents'

export function WorkspacesPage() {
  const navigate = useNavigate()
  const { workspaces, isLoading, loadWorkspaces, deleteWorkspace } = useWorkspaceOperations()
  const { agents, loadAgents } = useAgentOperations()
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    void loadWorkspaces()
    void loadAgents()
  }, [loadWorkspaces, loadAgents])

  const handleNew = () => {
    setSelectedWorkspace(null)
    setShowModal(true)
  }

  const handleEdit = (workspace: Workspace) => {
    setSelectedWorkspace(workspace)
    setShowModal(true)
  }

  const handleDelete = async (workspace: Workspace) => {
    if (
      !window.confirm(
        `Are you sure you want to delete workspace "${workspace.name}"? This cannot be undone.`
      )
    ) {
      return
    }

    try {
      await deleteWorkspace(workspace.workspaceId)
    } catch (err) {
      console.error('Failed to delete workspace:', err)
    }
  }

  const handleModalClose = () => {
    setShowModal(false)
    setSelectedWorkspace(null)
  }

  const handleModalSave = () => {
    void loadWorkspaces()
  }

  const handleViewWorkspace = (workspaceId: string) => {
    navigate(`/workspaces/${workspaceId}`)
  }

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a) => a.agentId === agentId)
    return agent?.name ?? 'Unknown Agent'
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1>Workspaces</h1>
          <p>Orchestrate multiple agents to work together</p>
        </div>
        <button onClick={handleNew} className="btn-primary">
          + New Workspace
        </button>
      </header>

      {isLoading ? (
        <div className="loading">Loading workspaces...</div>
      ) : workspaces.length === 0 ? (
        <div className="empty-state">
          <p>No workspaces found</p>
          <p>Create a workspace to combine multiple agents and execute complex tasks.</p>
          <button onClick={handleNew}>Create your first workspace</button>
        </div>
      ) : (
        <div className="workspaces-grid">
          {workspaces.map((workspace) => (
            <div key={workspace.workspaceId} className="workspace-card">
              <div className="card-header">
                <h3>{workspace.name}</h3>
                <span className="badge">{workspace.workflowType}</span>
              </div>

              {workspace.description && <p className="description">{workspace.description}</p>}

              <div className="card-meta">
                <div>
                  <strong>Agents:</strong> {workspace.agentIds.length}
                </div>
                {workspace.maxIterations && (
                  <div>
                    <strong>Max Iterations:</strong> {workspace.maxIterations}
                  </div>
                )}
              </div>

              <div className="agent-list">
                <strong>Team:</strong>
                <ul>
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

              <div className="card-actions">
                <button onClick={() => handleViewWorkspace(workspace.workspaceId)}>
                  View Details
                </button>
                <button onClick={() => handleEdit(workspace)}>Edit</button>
                <button onClick={() => handleDelete(workspace)} className="btn-danger">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <WorkspaceFormModal
        workspace={selectedWorkspace}
        isOpen={showModal}
        onClose={handleModalClose}
        onSave={handleModalSave}
      />
    </div>
  )
}
