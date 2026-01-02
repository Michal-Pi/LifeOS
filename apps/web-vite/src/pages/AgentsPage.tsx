/**
 * AgentsPage Component
 *
 * Main page for managing AI agents and workspaces.
 * Features:
 * - List all agents
 * - Create, edit, delete agents
 * - Filter agents by role/provider
 * - View agent details
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import type { ChangeEvent } from 'react'
import { useAgentOperations } from '@/hooks/useAgentOperations'
import { useAgentTemplateOperations } from '@/hooks/useAgentTemplateOperations'
import { useToolOperations } from '@/hooks/useToolOperations'
import { AgentBuilderModal } from '@/components/agents/AgentBuilderModal'
import { ToolBuilderModal } from '@/components/agents/ToolBuilderModal'
import { TemplateSaveModal } from '@/components/agents/TemplateSaveModal'
import { EmptyState } from '@/components/EmptyState'
import { builtinTools } from '@/agents/builtinTools'
import { agentTemplatePresets } from '@/agents/templatePresets'
import type {
  AgentConfig,
  AgentRole,
  ModelProvider,
  ToolDefinition,
  AgentTemplate,
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

export function AgentsPage() {
  const { agents, isLoading, loadAgents } = useAgentOperations()
  const {
    templates: agentTemplates,
    isLoading: templatesLoading,
    loadTemplates,
    createTemplate,
    deleteTemplate,
  } = useAgentTemplateOperations()
  const {
    tools,
    isLoading: toolsLoading,
    loadTools,
    createTool,
    updateTool,
    deleteTool,
  } = useToolOperations()
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [prefillAgent, setPrefillAgent] = useState<Partial<AgentConfig> | null>(null)
  const [templateSourceAgent, setTemplateSourceAgent] = useState<AgentConfig | null>(null)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templateModalKey, setTemplateModalKey] = useState(0)
  const [selectedTool, setSelectedTool] = useState<ToolDefinition | null>(null)
  const [showToolModal, setShowToolModal] = useState(false)
  const [roleFilter, setRoleFilter] = useState<AgentRole | 'all'>('all')
  const [providerFilter, setProviderFilter] = useState<ModelProvider | 'all'>('all')
  const importInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void loadAgents()
  }, [loadAgents])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  useEffect(() => {
    void loadTools()
  }, [loadTools])

  const handleNew = () => {
    setSelectedAgent(null)
    setPrefillAgent(null)
    setShowModal(true)
  }

  const handleEdit = (agent: AgentConfig) => {
    setSelectedAgent(agent)
    setPrefillAgent(null)
    setShowModal(true)
  }

  const handleModalClose = () => {
    setShowModal(false)
    setSelectedAgent(null)
    setPrefillAgent(null)
  }

  const handleModalSave = () => {
    void loadAgents()
  }

  const handleSaveTemplate = (agent: AgentConfig) => {
    setTemplateSourceAgent(agent)
    setTemplateModalKey((prev) => prev + 1)
    setShowTemplateModal(true)
  }

  const handleTemplateClose = () => {
    setShowTemplateModal(false)
    setTemplateSourceAgent(null)
  }

  const handleTemplateSave = async (name: string, description?: string) => {
    if (!templateSourceAgent) return
    const agentConfig = {
      name: templateSourceAgent.name,
      role: templateSourceAgent.role,
      systemPrompt: templateSourceAgent.systemPrompt,
      modelProvider: templateSourceAgent.modelProvider,
      modelName: templateSourceAgent.modelName,
      temperature: templateSourceAgent.temperature,
      maxTokens: templateSourceAgent.maxTokens,
      description: templateSourceAgent.description,
      toolIds: templateSourceAgent.toolIds,
    }
    try {
      await createTemplate({ name, description, agentConfig })
    } catch {
      return
    }
    setShowTemplateModal(false)
    setTemplateSourceAgent(null)
  }

  const handleUseTemplate = (template: AgentTemplate) => {
    setSelectedAgent(null)
    setPrefillAgent(template.agentConfig)
    setShowModal(true)
  }

  const handleAddPresets = async () => {
    const existingNames = new Set(agentTemplates.map((template) => template.name.toLowerCase()))
    let createdCount = 0
    for (const preset of agentTemplatePresets) {
      if (existingNames.has(preset.name.toLowerCase())) {
        continue
      }
      try {
        await createTemplate({
          name: preset.name,
          description: preset.description,
          agentConfig: preset.agentConfig,
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
    const payload: AgentTemplateExport = {
      version: 1,
      type: 'agentTemplates',
      templates: agentTemplates.map((template) => ({
        name: template.name,
        description: template.description,
        agentConfig: template.agentConfig,
      })),
    }
    downloadJson('agent-templates.json', payload)
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
      const existingNames = new Set(agentTemplates.map((template) => template.name.toLowerCase()))
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
          await createTemplate({
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
      window.alert(`Imported ${importedCount} templates. Skipped ${skippedCount}.`)
    } catch (error) {
      console.error('Failed to import agent templates', error)
      window.alert('Import failed. Please check the JSON format.')
    }
  }

  const handleNewTool = () => {
    setSelectedTool(null)
    setShowToolModal(true)
  }

  const handleEditTool = (tool: ToolDefinition) => {
    setSelectedTool(tool)
    setShowToolModal(true)
  }

  const handleToolModalClose = () => {
    setShowToolModal(false)
    setSelectedTool(null)
  }

  const handleToolSave = () => {
    void loadTools()
  }

  const availableTools = useMemo(() => [...builtinTools, ...tools], [tools])
  const existingToolNames = useMemo(() => availableTools.map((tool) => tool.name), [availableTools])

  // Filter agents
  const filteredAgents = agents.filter((agent) => {
    if (roleFilter !== 'all' && agent.role !== roleFilter) return false
    if (providerFilter !== 'all' && agent.modelProvider !== providerFilter) return false
    return true
  })

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1>AI Agents</h1>
          <p>Configure and manage your AI assistants</p>
        </div>
        <button onClick={handleNew} className="btn-primary">
          + New Agent
        </button>
      </header>

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
      </div>

      {isLoading ? (
        <div className="loading">Loading agents...</div>
      ) : filteredAgents.length === 0 ? (
        <EmptyState
          label="Agents"
          title="System idle"
          description="Agents are specialized intelligences. Create one to automate research, planning, and execution."
          hint="Capability unlocked: reusable workflows + delegated thinking."
          actionLabel="Create Agent"
          onAction={handleNew}
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
            <div key={agent.agentId} className="agent-card">
              <div className="card-header">
                <h3>{agent.name}</h3>
                <span className="badge">{agent.role}</span>
              </div>

              {agent.description && <p className="description">{agent.description}</p>}

              <div className="card-meta">
                <div>
                  <strong>Provider:</strong> {agent.modelProvider}
                </div>
                <div>
                  <strong>Model:</strong> {agent.modelName}
                </div>
                <div>
                  <strong>Temperature:</strong> {agent.temperature?.toFixed(2) ?? '0.70'}
                </div>
                {agent.maxTokens && (
                  <div>
                    <strong>Max Tokens:</strong> {agent.maxTokens.toLocaleString()}
                  </div>
                )}
              </div>

              <div className="prompt-preview">
                <strong>System Prompt:</strong>
                <p>{agent.systemPrompt.substring(0, 150)}...</p>
              </div>

              <div className="card-actions">
                <button onClick={() => handleEdit(agent)} className="btn-secondary">
                  Edit
                </button>
                <button onClick={() => handleSaveTemplate(agent)} className="btn-secondary">
                  Save Template
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <details className="collapsible-section" open>
        <summary className="collapsible-summary">
          <span>Templates</span>
        </summary>
        <section className="settings-panel">
        <header className="settings-panel__header">
          <div>
            <p className="section-label">Templates</p>
            <h2>Agent Templates</h2>
            <p className="settings-panel__meta">Save reusable agent setups and start faster.</p>
            <div className="settings-panel__actions">
              <button onClick={handleAddPresets} className="btn-secondary" type="button">
                Add Presets
              </button>
              <button onClick={handleExportTemplates} className="btn-secondary" type="button">
                Export
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                className="btn-secondary"
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
        ) : agentTemplates.length === 0 ? (
          <EmptyState
            label="Templates"
            title="System idle"
            description="Save a template from an existing agent to reuse later."
          />
        ) : (
          <div className="agents-grid">
            {agentTemplates.map((template) => (
              <div key={template.templateId} className="agent-card">
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
                <div className="card-actions">
                  <button onClick={() => handleUseTemplate(template)} className="btn-secondary">
                    Use Template
                  </button>
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
      </details>

      <details className="collapsible-section">
        <summary className="collapsible-summary">
          <span>Modules</span>
        </summary>
        <section className="settings-panel">
        <header className="settings-panel__header">
          <div>
            <p className="section-label">Modules</p>
            <h2>Modules</h2>
            <p className="settings-panel__meta">
              Build reusable modules that agents can call during execution.
            </p>
          </div>
          <button onClick={handleNewTool} className="btn-primary">
            + New Module
          </button>
        </header>

        {toolsLoading ? (
          <div className="loading">Loading tools...</div>
        ) : tools.length === 0 ? (
          <EmptyState
            label="Modules"
            title="System idle"
            description="Create reusable modules so agents can call structured tools."
            actionLabel="Create Module"
            onAction={handleNewTool}
          />
        ) : (
          <div className="agents-grid">
            {tools.map((tool) => (
              <div key={tool.toolId} className="agent-card">
                <div className="card-header">
                  <h3>{tool.name}</h3>
                  <span className="badge">custom</span>
                </div>
                <p className="description">{tool.description}</p>
                <div className="card-meta">
                  <div>
                    <strong>Params:</strong> {Object.keys(tool.parameters ?? {}).length}
                  </div>
                  <div>
                    <strong>Auth:</strong> {tool.requiresAuth ? 'Required' : 'None'}
                  </div>
                </div>
                <div className="card-actions">
                  <button onClick={() => handleEditTool(tool)} className="btn-secondary">
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete tool "${tool.name}"?`)) {
                        void deleteTool(tool.toolId)
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
      </details>

      <AgentBuilderModal
        agent={selectedAgent}
        isOpen={showModal}
        onClose={handleModalClose}
        onSave={handleModalSave}
        availableTools={availableTools}
        prefill={prefillAgent ?? undefined}
      />

      <ToolBuilderModal
        tool={selectedTool}
        isOpen={showToolModal}
        onClose={handleToolModalClose}
        onSave={handleToolSave}
        onCreate={async (input) => {
          await createTool(input)
        }}
        onUpdate={async (toolId, updates) => {
          await updateTool(toolId, updates)
        }}
        existingNames={existingToolNames}
      />

      <TemplateSaveModal
        key={templateModalKey}
        isOpen={showTemplateModal}
        title="Save Agent Template"
        initialName={templateSourceAgent?.name ?? ''}
        initialDescription={templateSourceAgent?.description}
        onClose={handleTemplateClose}
        onSave={handleTemplateSave}
      />
    </div>
  )
}
