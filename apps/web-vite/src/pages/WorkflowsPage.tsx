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
import { useToolOperations } from '@/hooks/useToolOperations'
import { usePromptLibrary } from '@/hooks/usePromptLibrary'
import { useAuth } from '@/hooks/useAuth'
import { WorkspaceFormModal } from '@/components/agents/WorkspaceFormModal'
import { TemplateSaveModal } from '@/components/agents/TemplateSaveModal'
import { TemplateSelector } from '@/components/agents/TemplateSelector'
import { PromptEditor } from '@/components/agents/PromptEditor'
import { workspaceTemplatePresets } from '@/agents/templatePresets'
import { contentTypePresets } from '@/agents/contentTypePresets'
import { builtinTools } from '@/agents/builtinTools'
import { instantiateTemplate } from '@/services/templateInstantiation'
import type { Workspace, WorkspaceTemplate, PromptTemplate } from '@lifeos/agents'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useDialog } from '@/contexts/useDialog'

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
  const { confirm, alert: showAlert } = useDialog()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { workspaces, isLoading, loadWorkspaces, deleteWorkspace, createWorkspace } =
    useWorkspaceOperations()
  const {
    templates: workspaceTemplates,
    isLoading: templatesLoading,
    loadTemplates,
    createTemplate,
    deleteTemplate,
  } = useWorkspaceTemplateOperations()
  const { agents, loadAgents, createAgent } = useAgentOperations()
  const { tools, loadTools } = useToolOperations()
  const {
    templates: promptTemplates,
    loading: promptLoading,
    createTemplate: createPromptTemplate,
  } = usePromptLibrary()
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [prefillWorkspace, setPrefillWorkspace] = useState<Partial<Workspace> | null>(null)
  const [templateSourceWorkspace, setTemplateSourceWorkspace] = useState<Workspace | null>(null)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templateModalKey, setTemplateModalKey] = useState(0)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState<'workspaces' | 'templates'>('workspaces')
  const [isTemplateInstantiating, setIsTemplateInstantiating] = useState(false)
  const [promptEditorTemplate, setPromptEditorTemplate] = useState<PromptTemplate | null>(null)

  useEffect(() => {
    void loadWorkspaces()
    void loadAgents()
    void loadTools()
  }, [loadWorkspaces, loadAgents, loadTools])

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
    const confirmed = await confirm({
      title: 'Delete workspace',
      description: `Are you sure you want to delete workspace "${workspace.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
    })
    if (!confirmed) return

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
    if (
      template.workspaceConfig.workflowType === 'graph' &&
      template.workspaceConfig.workflowGraph?.nodes.some(
        (node) => node.type === 'agent' && !node.agentId
      )
    ) {
      void showAlert({
        title: 'Template needs agents',
        description:
          'This template uses a graph workflow without agent bindings. Use a preset blueprint to create it instead.',
      })
      return
    }
    setSelectedWorkspace(null)
    setPrefillWorkspace(template.workspaceConfig)
    setShowModal(true)
  }

  const handleInstantiatePreset = async (
    preset: (typeof workspaceTemplatePresets)[number],
    options?: { contentType?: string }
  ) => {
    if (isTemplateInstantiating) return
    setIsTemplateInstantiating(true)
    try {
      const availableTools = [
        ...builtinTools,
        ...tools.map((tool) => ({
          toolId: tool.toolId,
          name: tool.name,
          description: tool.description ?? '',
        })),
      ]
      const { workspace } = await instantiateTemplate({
        preset,
        customization: { contentType: options?.contentType },
        createAgent,
        createWorkspace,
        availableTools,
      })
      await loadWorkspaces()
      navigate(`/workspaces/${workspace.workspaceId}`)
    } catch (error) {
      console.error('Failed to instantiate template', error)
      await showAlert({
        title: 'Template failed',
        description: 'Unable to create workspace from template. Check logs for details.',
      })
    } finally {
      setIsTemplateInstantiating(false)
    }
  }

  const handleAddPresets = async () => {
    const existingNames = new Set(workspaceTemplates.map((template) => template.name.toLowerCase()))
    let createdCount = 0
    let skippedCount = 0
    for (const preset of workspaceTemplatePresets) {
      if (existingNames.has(preset.name.toLowerCase())) {
        continue
      }
      if (preset.workflowGraphTemplate) {
        skippedCount += 1
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
    if (createdCount === 0 && skippedCount === 0) {
      await showAlert({
        title: 'Presets already added',
        description: 'All presets already exist.',
      })
      return
    }
    if (skippedCount > 0) {
      await showAlert({
        title: 'Presets added',
        description: `Added ${createdCount} presets. ${skippedCount} blueprint presets are available via the template selector.`,
      })
    }
  }

  const handleCreatePrompt = async () => {
    if (!user) return
    const template = await createPromptTemplate({
      name: 'New Prompt',
      description: 'Describe this prompt',
      type: 'agent',
      category: 'general',
      tags: [],
      content: 'Describe the prompt here.',
    })
    if (template) {
      setPromptEditorTemplate(template)
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
        await showAlert({
          title: 'Import failed',
          description: 'Invalid template file. Expected a list of templates.',
        })
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
      await showAlert({
        title: 'Import complete',
        description: `Imported ${importedCount} templates. Skipped ${skippedCount}.`,
      })
    } catch (error) {
      console.error('Failed to import workspace templates', error)
      await showAlert({
        title: 'Import failed',
        description: 'Import failed. Please check the JSON format.',
      })
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
        <Button onClick={handleNew}>+ New Workspace</Button>
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
                    <Button
                      variant="ghost"
                      onClick={() => handleViewWorkspace(workspace.workspaceId)}
                    >
                      View Details
                    </Button>
                    <Button variant="ghost" onClick={() => handleEdit(workspace)}>
                      Edit
                    </Button>
                    <Button variant="ghost" onClick={() => handleSaveTemplate(workspace)}>
                      Save Template
                    </Button>
                    <Button
                      variant="ghost"
                      className="danger"
                      onClick={() => handleDelete(workspace)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'templates' && (
        <>
          <TemplateSelector
            templates={workspaceTemplatePresets}
            contentTypes={contentTypePresets}
            onUseTemplate={handleInstantiatePreset}
            isBusy={isTemplateInstantiating}
          />
          <div className="template-selector__notice">
            Graph-based blueprints are only available through the selector so we can bind agent IDs
            before creating the workspace.
          </div>

          <section className="settings-panel">
            <header className="settings-panel__header">
              <div>
                <p className="section-label">Prompt Library</p>
                <h2>Shared Prompts</h2>
                <p className="settings-panel__meta">
                  Manage reusable prompts with version history across workspaces.
                </p>
                <div className="settings-panel__actions">
                  <Button variant="ghost" onClick={handleCreatePrompt} type="button">
                    New Prompt
                  </Button>
                </div>
              </div>
            </header>

            {promptLoading ? (
              <div className="loading">Loading prompts...</div>
            ) : promptTemplates.length === 0 ? (
              <EmptyState
                label="Prompts"
                title="Prompt library empty"
                description="Create a prompt to start sharing across workspaces."
              />
            ) : (
              <div className="workspaces-grid">
                {promptTemplates.map((template) => (
                  <div key={template.templateId} className="workspace-card">
                    <div className="card-header">
                      <h3>{template.name}</h3>
                      <span className="badge">{template.type}</span>
                    </div>
                    <p className="description">{template.description}</p>
                    <div className="card-meta">
                      <div>
                        <strong>Category:</strong> {template.category}
                      </div>
                      <div>
                        <strong>Version:</strong> v{template.version}
                      </div>
                    </div>
                    <div className="card-actions">
                      <Button variant="ghost" onClick={() => setPromptEditorTemplate(template)}>
                        Edit
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="settings-panel">
            <header className="settings-panel__header">
              <div>
                <p className="section-label">Templates</p>
                <h2>Workspace Templates</h2>
                <p className="settings-panel__meta">
                  Reuse workspace setups for repeated workflows.
                </p>
                <div className="settings-panel__actions">
                  <Button variant="ghost" onClick={handleAddPresets} type="button">
                    Add Presets
                  </Button>
                  <Button variant="ghost" onClick={handleExportTemplates} type="button">
                    Export
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => importInputRef.current?.click()}
                    type="button"
                  >
                    Import
                  </Button>
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
                      <Button variant="ghost" onClick={() => handleUseTemplate(template)}>
                        Use Template
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          const confirmed = await confirm({
                            title: 'Delete template',
                            description: `Delete template "${template.name}"?`,
                            confirmLabel: 'Delete',
                            confirmVariant: 'danger',
                          })
                          if (confirmed) {
                            void deleteTemplate(template.templateId)
                          }
                        }}
                        className="danger"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
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

      {promptEditorTemplate && user?.uid && (
        <div className="modal-overlay" onClick={() => setPromptEditorTemplate(null)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <PromptEditor
              userId={user.uid}
              templateId={promptEditorTemplate.templateId}
              onClose={() => setPromptEditorTemplate(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
