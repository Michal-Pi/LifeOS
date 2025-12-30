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

import { useState, useEffect, useMemo } from 'react'
import { useAgentOperations } from '@/hooks/useAgentOperations'
import { useToolOperations } from '@/hooks/useToolOperations'
import { AgentBuilderModal } from '@/components/agents/AgentBuilderModal'
import { ToolBuilderModal } from '@/components/agents/ToolBuilderModal'
import { builtinTools } from '@/agents/builtinTools'
import type { AgentConfig, AgentRole, ModelProvider } from '@lifeos/agents'
import type { ToolDefinition } from '@lifeos/agents'

export function AgentsPage() {
  const { agents, isLoading, loadAgents } = useAgentOperations()
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
  const [selectedTool, setSelectedTool] = useState<ToolDefinition | null>(null)
  const [showToolModal, setShowToolModal] = useState(false)
  const [roleFilter, setRoleFilter] = useState<AgentRole | 'all'>('all')
  const [providerFilter, setProviderFilter] = useState<ModelProvider | 'all'>('all')

  useEffect(() => {
    void loadAgents()
  }, [loadAgents])

  useEffect(() => {
    void loadTools()
  }, [loadTools])

  const handleNew = () => {
    setSelectedAgent(null)
    setShowModal(true)
  }

  const handleEdit = (agent: AgentConfig) => {
    setSelectedAgent(agent)
    setShowModal(true)
  }

  const handleModalClose = () => {
    setShowModal(false)
    setSelectedAgent(null)
  }

  const handleModalSave = () => {
    void loadAgents()
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
        <div className="empty-state">
          <p>No agents found</p>
          <button onClick={handleNew}>Create your first agent</button>
        </div>
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
                <button onClick={() => handleEdit(agent)}>Edit</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="settings-panel">
        <header className="settings-panel__header">
          <div>
            <p className="section-label">Custom Tools</p>
            <h2>Custom Tools</h2>
            <p className="settings-panel__meta">Create user-defined tools that agents can call.</p>
          </div>
          <button onClick={handleNewTool} className="btn-primary">
            + New Tool
          </button>
        </header>

        {toolsLoading ? (
          <div className="loading">Loading tools...</div>
        ) : tools.length === 0 ? (
          <div className="empty-state">
            <p>No custom tools yet</p>
            <button onClick={handleNewTool}>Create your first tool</button>
          </div>
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
                  <button onClick={() => handleEditTool(tool)}>Edit</button>
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

      <AgentBuilderModal
        agent={selectedAgent}
        isOpen={showModal}
        onClose={handleModalClose}
        onSave={handleModalSave}
        availableTools={availableTools}
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
    </div>
  )
}
