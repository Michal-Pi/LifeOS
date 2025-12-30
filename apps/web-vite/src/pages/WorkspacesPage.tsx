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
import { useWorkspaceTemplateOperations } from '@/hooks/useWorkspaceTemplateOperations'
import { useAgentOperations } from '@/hooks/useAgentOperations'
import { WorkspaceFormModal } from '@/components/agents/WorkspaceFormModal'
import { TemplateSaveModal } from '@/components/agents/TemplateSaveModal'
import type { Workspace, WorkspaceTemplate } from '@lifeos/agents'

export function WorkspacesPage() {
  const navigate = useNavigate()
  const { workspaces, isLoading, loadWorkspaces, deleteWorkspace } = useWorkspaceOperations()
  const {
    templates: workspaceTemplates,
    isLoading: templatesLoading,
    loadTemplates,
    createTemplate,
    deleteTemplate,
  } = useWorkspaceTemplateOperations()
  const { agents, loadAgents } = useAgentOperations()
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [prefillWorkspace, setPrefillWorkspace] = useState<Partial<Workspace> | null>(null)
  const [templateSourceWorkspace, setTemplateSourceWorkspace] = useState<Workspace | null>(null)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templateModalKey, setTemplateModalKey] = useState(0)

  useEffect(() => {
    void loadWorkspaces()
    void loadAgents()
  }, [loadWorkspaces, loadAgents])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const handleNew = () => {
    setSelectedWorkspace(null)
    setPrefillWorkspace(null)
    setShowModal(true)
  }

  const handleEdit = (workspace: Workspace) => {
    setSelectedWorkspace(workspace)
    setPrefillWorkspace(null)
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
    setPrefillWorkspace(null)
  }

  const handleModalSave = () => {
    void loadWorkspaces()
  }

  const handleSaveTemplate = (workspace: Workspace) => {
    setTemplateSourceWorkspace(workspace)
    setTemplateModalKey((prev) => prev + 1)
    setShowTemplateModal(true)
  }

  const handleTemplateClose = () => {
    setShowTemplateModal(false)
    setTemplateSourceWorkspace(null)
  }

  const handleTemplateSave = async (name: string, description?: string) => {
    if (!templateSourceWorkspace) return
    const workspaceConfig = {
      name: templateSourceWorkspace.name,
      description: templateSourceWorkspace.description,
      agentIds: templateSourceWorkspace.agentIds,
      defaultAgentId: templateSourceWorkspace.defaultAgentId,
      workflowType: templateSourceWorkspace.workflowType,
      maxIterations: templateSourceWorkspace.maxIterations,
      memoryMessageLimit: templateSourceWorkspace.memoryMessageLimit,
    }
    try {
      await createTemplate({ name, description, workspaceConfig })
    } catch {
      return
    }
    setShowTemplateModal(false)
    setTemplateSourceWorkspace(null)
  }

  const handleUseTemplate = (template: WorkspaceTemplate) => {
    setSelectedWorkspace(null)
    setPrefillWorkspace(template.workspaceConfig)
    setShowModal(true)
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
                <button onClick={() => handleSaveTemplate(workspace)}>Save Template</button>
                <button onClick={() => handleDelete(workspace)} className="btn-danger">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="settings-panel">
        <header className="settings-panel__header">
          <div>
            <p className="section-label">Templates</p>
            <h2>Workspace Templates</h2>
            <p className="settings-panel__meta">Reuse workspace setups for repeated workflows.</p>
          </div>
        </header>

        {templatesLoading ? (
          <div className="loading">Loading templates...</div>
        ) : workspaceTemplates.length === 0 ? (
          <div className="empty-state">
            <p>No templates yet</p>
            <p>Save a template from an existing workspace to reuse later.</p>
          </div>
        ) : (
          <div className="workspaces-grid">
            {workspaceTemplates.map((template) => (
              <div key={template.templateId} className="workspace-card">
                <div className="card-header">
                  <h3>{template.name}</h3>
                  <span className="badge">{template.workspaceConfig.workflowType}</span>
                </div>
                {template.description && <p className="description">{template.description}</p>}
                <div className="card-meta">
                  <div>
                    <strong>Agents:</strong> {template.workspaceConfig.agentIds.length}
                  </div>
                  {template.workspaceConfig.maxIterations && (
                    <div>
                      <strong>Max Iterations:</strong> {template.workspaceConfig.maxIterations}
                    </div>
                  )}
                </div>
                <div className="card-actions">
                  <button onClick={() => handleUseTemplate(template)}>Use Template</button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete template "${template.name}"?`)) {
                        void deleteTemplate(template.templateId)
                      }
                    }}
                    className="btn-danger"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <WorkspaceFormModal
        workspace={selectedWorkspace}
        isOpen={showModal}
        onClose={handleModalClose}
        onSave={handleModalSave}
        prefill={prefillWorkspace ?? undefined}
      />

      <TemplateSaveModal
        key={templateModalKey}
        isOpen={showTemplateModal}
        title="Save Workspace Template"
        initialName={templateSourceWorkspace?.name ?? ''}
        initialDescription={templateSourceWorkspace?.description}
        onClose={handleTemplateClose}
        onSave={handleTemplateSave}
      />
    </div>
  )
}
