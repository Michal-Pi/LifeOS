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

import { useState, useEffect, useRef } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspaceOperations } from '@/hooks/useWorkspaceOperations'
import { useWorkspaceTemplateOperations } from '@/hooks/useWorkspaceTemplateOperations'
import { useAgentOperations } from '@/hooks/useAgentOperations'
import { WorkspaceFormModal } from '@/components/agents/WorkspaceFormModal'
import { TemplateSaveModal } from '@/components/agents/TemplateSaveModal'
import { workspaceTemplatePresets } from '@/agents/templatePresets'
import type { Workspace, WorkspaceTemplate } from '@lifeos/agents'
import { EmptyState } from '@/components/EmptyState'

type WorkspaceTemplateExport = {
  version: number
  type: 'workspaceTemplates'
  templates: Array<{
    name: string
    description?: string
    workspaceConfig: WorkspaceTemplate['workspaceConfig']
  }>
}

const downloadJson = (filename: string, data: unknown) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

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
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState<'workspaces' | 'templates'>('workspaces')

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

  const handleAddPresets = async () => {
    const existingNames = new Set(workspaceTemplates.map((template) => template.name.toLowerCase()))
    let createdCount = 0
    for (const preset of workspaceTemplatePresets) {
      if (existingNames.has(preset.name.toLowerCase())) {
        continue
      }
      try {
        await createTemplate({
          name: preset.name,
          description: preset.description,
          workspaceConfig: preset.workspaceConfig,
        })
        createdCount += 1
      } catch {
        // Errors are surfaced by the hook; continue with remaining presets.
      }
    }
    if (createdCount === 0) {
      window.alert('All presets already exist.')
    }
  }

  const handleExportTemplates = () => {
    const payload: WorkspaceTemplateExport = {
      version: 1,
      type: 'workspaceTemplates',
      templates: workspaceTemplates.map((template) => ({
        name: template.name,
        description: template.description,
        workspaceConfig: template.workspaceConfig,
      })),
    }
    downloadJson('workspace-templates.json', payload)
  }

  const handleImportTemplates = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw)
      const templates = Array.isArray(parsed) ? parsed : parsed.templates
      if (!Array.isArray(templates)) {
        window.alert('Invalid template file. Expected a list of templates.')
        return
      }
      const existingNames = new Set(
        workspaceTemplates.map((template) => template.name.toLowerCase())
      )
      let importedCount = 0
      let skippedCount = 0
      for (const entry of templates) {
        if (!entry?.name || !entry?.workspaceConfig) {
          skippedCount += 1
          continue
        }
        const normalizedName = String(entry.name).toLowerCase()
        if (existingNames.has(normalizedName)) {
          skippedCount += 1
          continue
        }
        try {
          await createTemplate({
            name: String(entry.name),
            description: entry.description ? String(entry.description) : undefined,
            workspaceConfig: entry.workspaceConfig,
          })
          existingNames.add(normalizedName)
          importedCount += 1
        } catch {
          skippedCount += 1
        }
      }
      window.alert(`Imported ${importedCount} templates. Skipped ${skippedCount}.`)
    } catch (error) {
      console.error('Failed to import workspace templates', error)
      window.alert('Import failed. Please check the JSON format.')
    }
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
        <button onClick={handleNew} className="primary-button">
          + New Workspace
        </button>
      </header>

      <div className="section-tabs">
        <button
          type="button"
          className={`section-tab ${activeTab === 'workspaces' ? 'active' : ''}`}
          onClick={() => setActiveTab('workspaces')}
        >
          Workspaces
        </button>
        <button
          type="button"
          className={`section-tab ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          Templates
        </button>
      </div>

      {activeTab === 'workspaces' && (
        <>
          {isLoading ? (
            <div className="loading">Loading workspaces...</div>
          ) : workspaces.length === 0 ? (
            <EmptyState
              label="Workspaces"
              title="System idle"
              description="Workspaces orchestrate multiple agents to deliver complex outcomes."
              hint="Capability unlocked: multi-agent orchestration + shared memory."
              actionLabel="Create Workspace"
              onAction={handleNew}
            >
              <div className="ghost-card-grid">
                <div className="ghost-card" />
                <div className="ghost-card" />
                <div className="ghost-card" />
              </div>
            </EmptyState>
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
                    <button
                      onClick={() => handleViewWorkspace(workspace.workspaceId)}
                      className="ghost-button"
                    >
                      View Details
                    </button>
                    <button onClick={() => handleEdit(workspace)} className="ghost-button">
                      Edit
                    </button>
                    <button onClick={() => handleSaveTemplate(workspace)} className="ghost-button">
                      Save Template
                    </button>
                    <button onClick={() => handleDelete(workspace)} className="ghost-button danger">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'templates' && (
        <section className="settings-panel">
          <header className="settings-panel__header">
            <div>
              <p className="section-label">Templates</p>
              <h2>Workspace Templates</h2>
              <p className="settings-panel__meta">Reuse workspace setups for repeated workflows.</p>
              <div className="settings-panel__actions">
                <button onClick={handleAddPresets} className="ghost-button" type="button">
                  Add Presets
                </button>
                <button onClick={handleExportTemplates} className="ghost-button" type="button">
                  Export
                </button>
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="ghost-button"
                  type="button"
                >
                  Import
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json"
                  onChange={handleImportTemplates}
                  hidden
                />
              </div>
            </div>
          </header>

          {templatesLoading ? (
            <div className="loading">Loading templates...</div>
          ) : workspaceTemplates.length === 0 ? (
            <EmptyState
              label="Templates"
              title="System idle"
              description="Save a template from an existing workspace to reuse later."
            />
          ) : (
            <div className="workspaces-grid">
              {workspaceTemplates.map((template) => (
                <div key={template.templateId} className="workspace-card">
                  <div className="template-thumb" aria-hidden="true" />
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
                    <button onClick={() => handleUseTemplate(template)} className="ghost-button">
                      Use Template
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete template "${template.name}"?`)) {
                          void deleteTemplate(template.templateId)
                        }
                      }}
                      className="ghost-button danger"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

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
