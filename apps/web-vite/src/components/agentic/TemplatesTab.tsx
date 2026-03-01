/**
 * TemplatesTab — Unified templates view combining workflow blueprints,
 * workflow templates, agent templates, and prompt library.
 */

import { useState, useRef } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkflowTemplateOperations } from '@/hooks/useWorkflowTemplateOperations'
import { useAgentTemplateOperations } from '@/hooks/useAgentTemplateOperations'
import { useAgentOperations } from '@/hooks/useAgentOperations'
import { useToolOperations } from '@/hooks/useToolOperations'
import { usePromptLibrary } from '@/hooks/usePromptLibrary'
import { useAuth } from '@/hooks/useAuth'
import { TemplateSelector } from '@/components/agents/TemplateSelector'
import { PromptEditor } from '@/components/agents/PromptEditor'
import { workflowTemplatePresets } from '@/agents/templatePresets'
import { agentTemplatePresets } from '@/agents/templatePresets'
import { contentTypePresets } from '@/agents/contentTypePresets'
import { builtinTools } from '@/agents/builtinTools'
import { instantiateTemplate } from '@/services/templateInstantiation'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useDialog } from '@/contexts/useDialog'
import type {
  Workflow,
  WorkflowTemplate,
  AgentTemplate,
  PromptTemplate,
} from '@lifeos/agents'

type WorkflowTemplateExport = {
  version: number
  type: 'workflowTemplates'
  templates: Array<{
    name: string
    description?: string
    workflowConfig: WorkflowTemplate['workflowConfig']
  }>
}

type AgentTemplateExport = {
  version: number
  type: 'agentTemplates'
  templates: Array<{
    name: string
    description?: string
    agentConfig: AgentTemplate['agentConfig']
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

export interface TemplatesTabProps {
  onUseAgentTemplate: (template: AgentTemplate) => void
  onCreateAgentFromTemplate: (template: AgentTemplate) => Promise<void>
  createWorkflow: (workflow: Partial<Workflow>) => Promise<Workflow>
  loadWorkflows: () => Promise<void>
}

export function TemplatesTab({
  onUseAgentTemplate,
  createWorkflow,
  loadWorkflows,
}: TemplatesTabProps) {
  const { confirm, alert: showAlert } = useDialog()
  const { user } = useAuth()
  const navigate = useNavigate()

  // Workflow templates
  const {
    templates: workflowTemplates,
    isLoading: workflowTemplatesLoading,
    createTemplate: createWorkflowTemplate,
    deleteTemplate: deleteWorkflowTemplate,
  } = useWorkflowTemplateOperations()
  const workflowImportRef = useRef<HTMLInputElement | null>(null)

  // Agent templates
  const {
    templates: agentTemplates,
    isLoading: agentTemplatesLoading,
    createTemplate: createAgentTemplate,
    deleteTemplate: deleteAgentTemplate,
  } = useAgentTemplateOperations()
  const agentImportRef = useRef<HTMLInputElement | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set())
  const [batchCreating, setBatchCreating] = useState(false)

  // Agents + Tools (for template instantiation)
  const { agents, loadAgents, createAgent } = useAgentOperations()
  const { tools } = useToolOperations()

  // Prompts
  const {
    templates: promptTemplates,
    loading: promptLoading,
    createTemplate: createPromptTemplate,
  } = usePromptLibrary()
  const [promptEditorTemplate, setPromptEditorTemplate] = useState<PromptTemplate | null>(null)

  // Template instantiation state
  const [isTemplateInstantiating, setIsTemplateInstantiating] = useState(false)

  // ── Workflow Template Handlers ──

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

  const handleUseWorkflowTemplate = (template: WorkflowTemplate) => {
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
    // Navigate to workflows tab with prefilled workflow
    // This is handled by the parent page through callback
  }

  const handleAddWorkflowPresets = async () => {
    const existingNames = new Set(workflowTemplates.map((t) => t.name.toLowerCase()))
    let createdCount = 0
    let skippedCount = 0
    for (const preset of workflowTemplatePresets) {
      if (existingNames.has(preset.name.toLowerCase())) continue
      if (preset.workflowGraphTemplate || preset.agentTemplateNames?.length) {
        skippedCount += 1
        continue
      }
      try {
        await createWorkflowTemplate({
          name: preset.name,
          description: preset.description,
          workflowConfig: preset.workflowConfig,
        })
        createdCount += 1
      } catch {
        /* errors surfaced by hook */
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

  const handleExportWorkflowTemplates = () => {
    const payload: WorkflowTemplateExport = {
      version: 1,
      type: 'workflowTemplates',
      templates: workflowTemplates.map((t) => ({
        name: t.name,
        description: t.description,
        workflowConfig: t.workflowConfig,
      })),
    }
    downloadJson('workflow-templates.json', payload)
  }

  const handleImportWorkflowTemplates = async (event: ChangeEvent<HTMLInputElement>) => {
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
      const existingNames = new Set(workflowTemplates.map((t) => t.name.toLowerCase()))
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
          await createWorkflowTemplate({
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

  // ── Agent Template Handlers ──

  const handleAddAgentPresets = async () => {
    const existingNames = new Set(agentTemplates.map((t) => t.name.toLowerCase()))
    let createdCount = 0
    for (const preset of agentTemplatePresets) {
      if (existingNames.has(preset.name.toLowerCase())) continue
      try {
        await createAgentTemplate({
          name: preset.name,
          description: preset.description,
          agentConfig: preset.agentConfig,
        })
        createdCount += 1
      } catch {
        /* errors surfaced by hook */
      }
    }
    if (createdCount === 0) {
      await showAlert({
        title: 'Presets already added',
        description: 'All presets already exist.',
      })
    }
  }

  const toggleBatchMode = () => {
    if (batchMode) {
      setBatchMode(false)
      setSelectedTemplateIds(new Set())
    } else {
      setBatchMode(true)
    }
  }

  const toggleTemplateSelection = (templateId: string) => {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev)
      if (next.has(templateId)) {
        next.delete(templateId)
      } else {
        next.add(templateId)
      }
      return next
    })
  }

  const handleBatchCreate = async () => {
    if (selectedTemplateIds.size === 0) return
    setBatchCreating(true)
    let createdCount = 0
    let failedCount = 0
    for (const templateId of selectedTemplateIds) {
      const template = agentTemplates.find((t) => t.templateId === templateId)
      if (!template) continue
      try {
        await createAgent({
          name: template.agentConfig.name ?? template.name,
          role: template.agentConfig.role ?? 'custom',
          systemPrompt: template.agentConfig.systemPrompt ?? '',
          modelProvider: template.agentConfig.modelProvider ?? 'openai',
          modelName: template.agentConfig.modelName ?? 'gpt-4.1',
          temperature: template.agentConfig.temperature ?? 0.7,
          maxTokens: template.agentConfig.maxTokens ?? 2000,
          description: template.agentConfig.description,
          toolIds: template.agentConfig.toolIds,
        })
        createdCount += 1
      } catch {
        failedCount += 1
      }
    }
    setBatchCreating(false)
    setBatchMode(false)
    setSelectedTemplateIds(new Set())
    if (failedCount > 0) {
      await showAlert({
        title: 'Batch create complete',
        description: `Created ${createdCount} agents. ${failedCount} failed.`,
      })
    }
  }

  const handleExportAgentTemplates = () => {
    const payload: AgentTemplateExport = {
      version: 1,
      type: 'agentTemplates',
      templates: agentTemplates.map((t) => ({
        name: t.name,
        description: t.description,
        agentConfig: t.agentConfig,
      })),
    }
    downloadJson('agent-templates.json', payload)
  }

  const handleImportAgentTemplates = async (event: ChangeEvent<HTMLInputElement>) => {
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
      const existingNames = new Set(agentTemplates.map((t) => t.name.toLowerCase()))
      let importedCount = 0
      let skippedCount = 0
      for (const entry of templates) {
        if (!entry?.name || !entry?.agentConfig) {
          skippedCount += 1
          continue
        }
        const normalizedName = String(entry.name).toLowerCase()
        if (existingNames.has(normalizedName)) {
          skippedCount += 1
          continue
        }
        try {
          await createAgentTemplate({
            name: String(entry.name),
            description: entry.description ? String(entry.description) : undefined,
            agentConfig: entry.agentConfig,
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
      console.error('Failed to import agent templates', error)
      await showAlert({
        title: 'Import failed',
        description: 'Import failed. Please check the JSON format.',
      })
    }
  }

  // ── Prompt Handlers ──

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

  return (
    <>
      {/* Workflow Blueprints */}
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

      {/* Workflow Templates */}
      <section className="settings-panel">
        <header className="settings-panel__header">
          <div>
            <p className="section-label">Templates</p>
            <h2>Workflow Templates</h2>
            <p className="settings-panel__meta">
              Reuse workflow setups for repeated workflows.
            </p>
            <div className="settings-panel__actions">
              <Button variant="ghost" onClick={handleAddWorkflowPresets} type="button">
                Add Presets
              </Button>
              <Button variant="ghost" onClick={handleExportWorkflowTemplates} type="button">
                Export
              </Button>
              <Button
                variant="ghost"
                onClick={() => workflowImportRef.current?.click()}
                type="button"
              >
                Import
              </Button>
              <input
                ref={workflowImportRef}
                type="file"
                accept="application/json"
                onChange={handleImportWorkflowTemplates}
                hidden
              />
            </div>
          </div>
        </header>

        {workflowTemplatesLoading ? (
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
                  <Button variant="ghost" onClick={() => handleUseWorkflowTemplate(template)}>
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
                        void deleteWorkflowTemplate(template.templateId)
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

      {/* Agent Templates */}
      <section className="settings-panel">
        <header className="settings-panel__header">
          <div>
            <p className="section-label">Templates</p>
            <h2>Agent Templates</h2>
            <p className="settings-panel__meta">
              Reusable agent configurations for quick agent creation.
            </p>
            <div className="settings-panel__actions">
              <Button
                variant={batchMode ? 'default' : 'ghost'}
                onClick={
                  batchMode && selectedTemplateIds.size > 0 ? handleBatchCreate : toggleBatchMode
                }
                type="button"
                disabled={batchCreating}
              >
                {batchCreating
                  ? 'Creating...'
                  : batchMode
                    ? selectedTemplateIds.size > 0
                      ? `Create (${selectedTemplateIds.size})`
                      : 'Cancel'
                    : 'Batch'}
              </Button>
              <Button variant="ghost" onClick={handleAddAgentPresets} type="button">
                Add Presets
              </Button>
              <Button variant="ghost" onClick={handleExportAgentTemplates} type="button">
                Export
              </Button>
              <Button
                variant="ghost"
                onClick={() => agentImportRef.current?.click()}
                type="button"
              >
                Import
              </Button>
              <input
                ref={agentImportRef}
                type="file"
                accept="application/json"
                onChange={handleImportAgentTemplates}
                hidden
              />
            </div>
          </div>
        </header>

        {agentTemplatesLoading ? (
          <div className="loading">Loading templates...</div>
        ) : agentTemplates.length === 0 ? (
          <EmptyState
            label="Templates"
            title="System idle"
            description="Save a template from an existing agent to reuse later."
          />
        ) : (
          <div className="agents-grid">
            {agentTemplates.map((template) => (
              <div
                key={template.templateId}
                className={`agent-card${batchMode && selectedTemplateIds.has(template.templateId) ? ' agent-card--selected' : ''}`}
                onClick={
                  batchMode ? () => toggleTemplateSelection(template.templateId) : undefined
                }
                style={batchMode ? { cursor: 'pointer' } : undefined}
              >
                {batchMode && (
                  <div className="batch-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedTemplateIds.has(template.templateId)}
                      onChange={() => toggleTemplateSelection(template.templateId)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
                <div className="card-header">
                  <h3>{template.name}</h3>
                  <span className="badge">{template.agentConfig.role}</span>
                </div>
                {template.description && <p className="description">{template.description}</p>}
                <div className="card-meta">
                  <div>
                    <strong>Provider:</strong> {template.agentConfig.modelProvider}
                  </div>
                  <div>
                    <strong>Model:</strong> {template.agentConfig.modelName}
                  </div>
                  <div>
                    <strong>Tools:</strong> {template.agentConfig.toolIds?.length ?? 0}
                  </div>
                </div>
                {!batchMode && (
                  <div className="card-actions">
                    <Button variant="ghost" onClick={() => onUseAgentTemplate(template)}>
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
                          void deleteAgentTemplate(template.templateId)
                        }
                      }}
                      className="danger"
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Prompt Library */}
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

      {/* Prompt Editor Modal */}
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
    </>
  )
}
