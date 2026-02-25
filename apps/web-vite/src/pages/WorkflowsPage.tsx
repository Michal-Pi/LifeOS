/**
 * WorkflowsPage Component
 *
 * Main page for managing AI agent workflows.
 * Features:
 * - List all workflows
 * - Create, edit, delete workflows
 * - View workflow details
 * - Navigate to workflow detail page
 */

import { useState, useEffect, useRef } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkflowOperations } from '@/hooks/useWorkflowOperations'
import { useWorkflowTemplateOperations } from '@/hooks/useWorkflowTemplateOperations'
import { useAgentOperations } from '@/hooks/useAgentOperations'
import { useToolOperations } from '@/hooks/useToolOperations'
import { usePromptLibrary } from '@/hooks/usePromptLibrary'
import { useAuth } from '@/hooks/useAuth'
import { WorkflowFormModal } from '@/components/agents/WorkflowFormModal'
import { TemplateSaveModal } from '@/components/agents/TemplateSaveModal'
import { TemplateSelector } from '@/components/agents/TemplateSelector'
import { PromptEditor } from '@/components/agents/PromptEditor'
import { workflowTemplatePresets } from '@/agents/templatePresets'
import { contentTypePresets } from '@/agents/contentTypePresets'
import { builtinTools } from '@/agents/builtinTools'
import { instantiateTemplate } from '@/services/templateInstantiation'
import type { Workflow, WorkflowTemplate, PromptTemplate } from '@lifeos/agents'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useDialog } from '@/contexts/useDialog'

type WorkflowTemplateExport = {
  version: number
  type: 'workflowTemplates'
  templates: Array<{
    name: string
    description?: string
    workflowConfig: WorkflowTemplate['workflowConfig']
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

export function WorkflowsPage() {
  const { confirm, alert: showAlert } = useDialog()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { workflows, isLoading, loadWorkflows, deleteWorkflow, createWorkflow } =
    useWorkflowOperations()
  const {
    templates: workflowTemplates,
    isLoading: templatesLoading,
    loadTemplates,
    createTemplate,
    deleteTemplate,
  } = useWorkflowTemplateOperations()
  const { agents, loadAgents, createAgent } = useAgentOperations()
  const { tools, loadTools } = useToolOperations()
  const {
    templates: promptTemplates,
    loading: promptLoading,
    createTemplate: createPromptTemplate,
  } = usePromptLibrary()
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [prefillWorkflow, setPrefillWorkflow] = useState<Partial<Workflow> | null>(null)
  const [templateSourceWorkflow, setTemplateSourceWorkflow] = useState<Workflow | null>(null)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templateModalKey, setTemplateModalKey] = useState(0)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState<'workflows' | 'templates'>('workflows')
  const [isTemplateInstantiating, setIsTemplateInstantiating] = useState(false)
  const [promptEditorTemplate, setPromptEditorTemplate] = useState<PromptTemplate | null>(null)

  useEffect(() => {
    void loadWorkflows()
    void loadAgents()
    void loadTools()
  }, [loadWorkflows, loadAgents, loadTools])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const handleNew = () => {
    setSelectedWorkflow(null)
    setPrefillWorkflow(null)
    setShowModal(true)
  }

  const handleEdit = (workflow: Workflow) => {
    setSelectedWorkflow(workflow)
    setPrefillWorkflow(null)
    setShowModal(true)
  }

  const handleDelete = async (workflow: Workflow) => {
    const confirmed = await confirm({
      title: 'Delete workflow',
      description: `Are you sure you want to delete workflow "${workflow.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
    })
    if (!confirmed) return

    try {
      await deleteWorkflow(workflow.workflowId)
    } catch (err) {
      console.error('Failed to delete workflow:', err)
    }
  }

  const handleModalClose = () => {
    setShowModal(false)
    setSelectedWorkflow(null)
    setPrefillWorkflow(null)
  }

  const handleModalSave = () => {
    void loadWorkflows()
  }

  const handleSaveTemplate = (workflow: Workflow) => {
    setTemplateSourceWorkflow(workflow)
    setTemplateModalKey((prev) => prev + 1)
    setShowTemplateModal(true)
  }

  const handleTemplateClose = () => {
    setShowTemplateModal(false)
    setTemplateSourceWorkflow(null)
  }

  const handleTemplateSave = async (name: string, description?: string) => {
    if (!templateSourceWorkflow) return
    const workflowConfig = {
      name: templateSourceWorkflow.name,
      description: templateSourceWorkflow.description,
      agentIds: templateSourceWorkflow.agentIds,
      defaultAgentId: templateSourceWorkflow.defaultAgentId,
      workflowType: templateSourceWorkflow.workflowType,
      maxIterations: templateSourceWorkflow.maxIterations,
      memoryMessageLimit: templateSourceWorkflow.memoryMessageLimit,
    }
    try {
      await createTemplate({ name, description, workflowConfig })
    } catch {
      return
    }
    setShowTemplateModal(false)
    setTemplateSourceWorkflow(null)
  }

  const handleUseTemplate = (template: WorkflowTemplate) => {
    if (
      template.workflowConfig.workflowType === 'graph' &&
      template.workflowConfig.workflowGraph?.nodes.some(
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
    setSelectedWorkflow(null)
    setPrefillWorkflow(template.workflowConfig)
    setShowModal(true)
  }

  const handleInstantiatePreset = async (
    preset: (typeof workflowTemplatePresets)[number],
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
      const { workflow } = await instantiateTemplate({
        preset,
        customization: { contentType: options?.contentType },
        existingAgents: agents,
        createAgent,
        createWorkflow,
        availableTools,
        onAgentConflict: async (conflicts) => {
          // If there are modified agents, ask user what to do
          const conflictNames = conflicts.map((c) => c.existingAgent.name).join(', ')
          const useExisting = await confirm({
            title: 'Existing Agents Found',
            description: `The following agents exist but have been modified: ${conflictNames}. Use existing agents or create new ones from template?`,
            confirmLabel: 'Use Existing',
            cancelLabel: 'Create New',
          })
          const resolutions = new Map<string, 'reuse_existing' | 'create_from_template'>()
          for (const conflict of conflicts) {
            resolutions.set(
              conflict.templateName,
              useExisting ? 'reuse_existing' : 'create_from_template'
            )
          }
          return resolutions
        },
      })
      await loadWorkflows()
      await loadAgents()
      navigate(`/workflows/${workflow.workflowId}`)
    } catch (error) {
      console.error('Failed to instantiate template', error)
      await showAlert({
        title: 'Template failed',
        description: 'Unable to create workflow from template. Check logs for details.',
      })
    } finally {
      setIsTemplateInstantiating(false)
    }
  }

  const handleAddPresets = async () => {
    const existingNames = new Set(workflowTemplates.map((template) => template.name.toLowerCase()))
    let createdCount = 0
    let skippedCount = 0
    for (const preset of workflowTemplatePresets) {
      if (existingNames.has(preset.name.toLowerCase())) {
        continue
      }
      if (preset.workflowGraphTemplate || preset.agentTemplateNames?.length) {
        skippedCount += 1
        continue
      }
      try {
        await createTemplate({
          name: preset.name,
          description: preset.description,
          workflowConfig: preset.workflowConfig,
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
    const payload: WorkflowTemplateExport = {
      version: 1,
      type: 'workflowTemplates',
      templates: workflowTemplates.map((template) => ({
        name: template.name,
        description: template.description,
        workflowConfig: template.workflowConfig,
      })),
    }
    downloadJson('workflow-templates.json', payload)
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
        workflowTemplates.map((template) => template.name.toLowerCase())
      )
      let importedCount = 0
      let skippedCount = 0
      for (const entry of templates) {
        if (!entry?.name || !entry?.workflowConfig) {
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
            workflowConfig: entry.workflowConfig,
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
      console.error('Failed to import workflow templates', error)
      await showAlert({
        title: 'Import failed',
        description: 'Import failed. Please check the JSON format.',
      })
    }
  }

  const handleViewWorkflow = (workflowId: string) => {
    navigate(`/workflows/${workflowId}`)
  }

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a) => a.agentId === agentId)
    return agent?.name ?? 'Unknown Agent'
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1>Workflows</h1>
          <p>Orchestrate multiple agents to work together</p>
        </div>
        <Button onClick={handleNew}>+ New Workflow</Button>
      </header>

      <div className="section-tabs">
        <button
          type="button"
          className={`section-tab ${activeTab === 'workflows' ? 'active' : ''}`}
          onClick={() => setActiveTab('workflows')}
        >
          Workflows
        </button>
        <button
          type="button"
          className={`section-tab ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          Templates
        </button>
      </div>

      {activeTab === 'workflows' && (
        <>
          {isLoading ? (
            <div className="loading">Loading workflows...</div>
          ) : workflows.length === 0 ? (
            <EmptyState
              label="Workflows"
              title="System idle"
              description="Workflows orchestrate multiple agents to deliver complex outcomes."
              hint="Capability unlocked: multi-agent orchestration + shared memory."
              actionLabel="Create Workflow"
              onAction={handleNew}
            >
              <div className="ghost-card-grid">
                <div className="ghost-card" />
                <div className="ghost-card" />
                <div className="ghost-card" />
              </div>
            </EmptyState>
          ) : (
            <div className="workflows-grid">
              {workflows.map((workflow) => (
                <div key={workflow.workflowId} className="workflow-card">
                  <div className="card-header">
                    <h3>{workflow.name}</h3>
                    <span className="badge">{workflow.workflowType}</span>
                  </div>

                  {workflow.description && <p className="description">{workflow.description}</p>}

                  <div className="card-meta">
                    <div>
                      <strong>Agents:</strong> {workflow.agentIds.length}
                    </div>
                    {workflow.maxIterations && (
                      <div>
                        <strong>Max Iterations:</strong> {workflow.maxIterations}
                      </div>
                    )}
                  </div>

                  <div className="agent-list">
                    <strong>Team:</strong>
                    <ul>
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

                  <div className="card-actions">
                    <Button variant="ghost" onClick={() => handleViewWorkflow(workflow.workflowId)}>
                      View Details
                    </Button>
                    <Button variant="ghost" onClick={() => handleEdit(workflow)}>
                      Edit
                    </Button>
                    <Button variant="ghost" onClick={() => handleSaveTemplate(workflow)}>
                      Save Template
                    </Button>
                    <Button
                      variant="ghost"
                      className="danger"
                      onClick={() => handleDelete(workflow)}
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
            templates={workflowTemplatePresets}
            contentTypes={contentTypePresets}
            onUseTemplate={handleInstantiatePreset}
            isBusy={isTemplateInstantiating}
          />
          <div className="template-selector__notice">
            Graph-based blueprints are only available through the selector so we can bind agent IDs
            before creating the workflow.
          </div>

          <section className="settings-panel">
            <header className="settings-panel__header">
              <div>
                <p className="section-label">Prompt Library</p>
                <h2>Shared Prompts</h2>
                <p className="settings-panel__meta">
                  Manage reusable prompts with version history across workflows.
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
                description="Create a prompt to start sharing across workflows."
              />
            ) : (
              <div className="workflows-grid">
                {promptTemplates.map((template) => (
                  <div key={template.templateId} className="workflow-card">
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
                <h2>Workflow Templates</h2>
                <p className="settings-panel__meta">
                  Reuse workflow setups for repeated workflows.
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
            ) : workflowTemplates.length === 0 ? (
              <EmptyState
                label="Templates"
                title="System idle"
                description="Save a template from an existing workflow to reuse later."
              />
            ) : (
              <div className="workflows-grid">
                {workflowTemplates.map((template) => (
                  <div key={template.templateId} className="workflow-card">
                    <div className="template-thumb" aria-hidden="true" />
                    <div className="card-header">
                      <h3>{template.name}</h3>
                      <span className="badge">{template.workflowConfig.workflowType}</span>
                    </div>
                    {template.description && <p className="description">{template.description}</p>}
                    <div className="card-meta">
                      <div>
                        <strong>Agents:</strong> {template.workflowConfig.agentIds.length}
                      </div>
                      {template.workflowConfig.maxIterations && (
                        <div>
                          <strong>Max Iterations:</strong> {template.workflowConfig.maxIterations}
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

      <WorkflowFormModal
        workflow={selectedWorkflow}
        isOpen={showModal}
        onClose={handleModalClose}
        onSave={handleModalSave}
        prefill={prefillWorkflow ?? undefined}
      />

      <TemplateSaveModal
        key={templateModalKey}
        isOpen={showTemplateModal}
        title="Save Workflow Template"
        initialName={templateSourceWorkflow?.name ?? ''}
        initialDescription={templateSourceWorkflow?.description}
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
