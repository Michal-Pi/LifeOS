/**
 * AgentsTab — Agent cards grid with filters, CRUD, batch delete,
 * agent templates section, and prompt library.
 */

import { useState, useMemo, useRef } from 'react'
import type { ChangeEvent } from 'react'
import { AgentCard } from '@/components/agents/AgentCard'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useDialog } from '@/contexts/useDialog'
import { useAgentTemplateOperations } from '@/hooks/useAgentTemplateOperations'
import { useAgentOperations } from '@/hooks/useAgentOperations'
import { usePromptLibrary } from '@/hooks/usePromptLibrary'
import { useAuth } from '@/hooks/useAuth'
import { PromptEditor } from '@/components/agents/PromptEditor'
import { agentTemplatePresets } from '@/agents/templatePresets'
import type {
  AgentConfig,
  AgentRole,
  ModelProvider,
  Workflow,
  AgentTemplate,
  PromptTemplate,
} from '@lifeos/agents'

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

export interface AgentsTabProps {
  agents: AgentConfig[]
  workflows: Workflow[]
  isLoading: boolean
  onNew: () => void
  onEdit: (agent: AgentConfig) => void
  onSaveTemplate: (agent: AgentConfig) => void
  onDelete: (agentId: string) => void
  onUseAgentTemplate: (template: AgentTemplate) => void
}

export function AgentsTab({
  agents,
  workflows,
  isLoading,
  onNew,
  onEdit,
  onSaveTemplate,
  onDelete,
  onUseAgentTemplate,
}: AgentsTabProps) {
  const { confirm, alert: showAlert } = useDialog()
  const { user } = useAuth()

  // ── Filters ──
  const [roleFilter, setRoleFilter] = useState<AgentRole | 'all'>('all')
  const [providerFilter, setProviderFilter] = useState<ModelProvider | 'all'>('all')

  // ── Batch delete state ──
  const [selectMode, setSelectMode] = useState(false)
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set())

  // ── Agent templates ──
  const {
    templates: agentTemplates,
    isLoading: agentTemplatesLoading,
    createTemplate: createAgentTemplate,
    deleteTemplate: deleteAgentTemplate,
  } = useAgentTemplateOperations()
  const { createAgent } = useAgentOperations()
  const agentImportRef = useRef<HTMLInputElement | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set())
  const [batchCreating, setBatchCreating] = useState(false)

  // ── Prompts ──
  const {
    templates: promptTemplates,
    loading: promptLoading,
    createTemplate: createPromptTemplate,
  } = usePromptLibrary()
  const [promptEditorTemplate, setPromptEditorTemplate] = useState<PromptTemplate | null>(null)

  // ── Computed ──

  const filteredAgents = useMemo(
    () =>
      agents.filter((agent) => {
        if (roleFilter !== 'all' && agent.role !== roleFilter) return false
        if (providerFilter !== 'all' && agent.modelProvider !== providerFilter) return false
        return true
      }),
    [agents, roleFilter, providerFilter]
  )

  const agentWorkflowMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const workflow of workflows) {
      for (const agentId of workflow.agentIds) {
        const existing = map.get(agentId) ?? []
        existing.push(workflow.name)
        map.set(agentId, existing)
      }
    }
    return map
  }, [workflows])

  // ── Batch delete handlers ──

  const toggleSelectMode = () => {
    if (selectMode) {
      setSelectMode(false)
      setSelectedAgentIds(new Set())
    } else {
      setSelectMode(true)
    }
  }

  const toggleAgentSelection = (agentId: string) => {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev)
      if (next.has(agentId)) {
        next.delete(agentId)
      } else {
        next.add(agentId)
      }
      return next
    })
  }

  const handleBatchDelete = async () => {
    if (selectedAgentIds.size === 0) return

    // Check which selected agents are used by workflows
    const usedAgents: string[] = []
    for (const agentId of selectedAgentIds) {
      const wfNames = agentWorkflowMap.get(agentId)
      if (wfNames && wfNames.length > 0) {
        const agent = agents.find((a) => a.agentId === agentId)
        usedAgents.push(`${agent?.name ?? agentId} (used by: ${wfNames.join(', ')})`)
      }
    }

    const warning =
      usedAgents.length > 0
        ? `\n\nThe following agents are used by workflows and will need to be replaced:\n${usedAgents.join('\n')}`
        : ''

    const confirmed = await confirm({
      title: `Delete ${selectedAgentIds.size} agents`,
      description: `Delete ${selectedAgentIds.size} selected agents? This cannot be undone.${warning}`,
      confirmLabel: 'Delete All',
      confirmVariant: 'danger',
    })

    if (confirmed) {
      for (const agentId of selectedAgentIds) {
        onDelete(agentId)
      }
      setSelectMode(false)
      setSelectedAgentIds(new Set())
    }
  }

  // ── Agent template handlers ──

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

  // ── Prompt handlers ──

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
      {/* ── Agent Filters ── */}
      <div className="filters">
        <div>
          <label htmlFor="roleFilter">Role:</label>
          <select
            id="roleFilter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as AgentRole | 'all')}
          >
            <option value="all">All Roles</option>
            <option value="planner">Planner</option>
            <option value="researcher">Researcher</option>
            <option value="critic">Critic</option>
            <option value="synthesizer">Synthesizer</option>
            <option value="executor">Executor</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <div>
          <label htmlFor="providerFilter">Provider:</label>
          <select
            id="providerFilter"
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value as ModelProvider | 'all')}
          >
            <option value="all">All Providers</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="google">Google</option>
            <option value="xai">Grok (xAI)</option>
          </select>
        </div>

        <div className="filter-summary">
          Showing {filteredAgents.length} of {agents.length} agents
        </div>

        {/* Batch delete controls */}
        {agents.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
            {selectMode && selectedAgentIds.size > 0 && (
              <Button variant="default" onClick={handleBatchDelete} className="danger">
                Delete ({selectedAgentIds.size})
              </Button>
            )}
            <Button variant="ghost" onClick={toggleSelectMode}>
              {selectMode ? 'Cancel' : 'Select'}
            </Button>
          </div>
        )}
      </div>

      {/* ── Agents Grid ── */}
      {isLoading ? (
        <div className="loading">Loading agents...</div>
      ) : filteredAgents.length === 0 ? (
        <EmptyState
          label="Agents"
          title="System idle"
          description="Agents are specialized intelligences. Create one to automate research, planning, and execution."
          hint="Capability unlocked: reusable workflows + delegated thinking."
          actionLabel="Create Agent"
          onAction={onNew}
        >
          <div className="ghost-card-grid">
            <div className="ghost-card" />
            <div className="ghost-card" />
            <div className="ghost-card" />
          </div>
        </EmptyState>
      ) : (
        <div className="agents-grid">
          {filteredAgents.map((agent) => (
            <AgentCard
              key={agent.agentId}
              agent={agent}
              usedByWorkflows={agentWorkflowMap.get(agent.agentId) ?? []}
              selectable={selectMode}
              selected={selectedAgentIds.has(agent.agentId)}
              onSelect={() => toggleAgentSelection(agent.agentId)}
              onEdit={onEdit}
              onSaveTemplate={onSaveTemplate}
              onDelete={async (agent) => {
                const confirmed = await confirm({
                  title: 'Delete agent',
                  description: `Delete agent "${agent.name}"? This cannot be undone. Workflows using this agent will need to be updated.`,
                  confirmLabel: 'Delete',
                  confirmVariant: 'danger',
                })
                if (confirmed) {
                  onDelete(agent.agentId)
                }
              }}
            />
          ))}
        </div>
      )}

      {/* ── Agent Templates ── */}
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
              <Button variant="ghost" onClick={() => agentImportRef.current?.click()} type="button">
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
                onClick={batchMode ? () => toggleTemplateSelection(template.templateId) : undefined}
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

      {/* ── Prompt Library ── */}
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
