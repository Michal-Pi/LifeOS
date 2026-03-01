/**
 * AgentsTab — Agent cards grid with filters and CRUD.
 * Extracted from AgentsPage for the unified Agentic Workflows page.
 */

import { useState, useMemo } from 'react'
import { AgentCard } from '@/components/agents/AgentCard'
import { EmptyState } from '@/components/EmptyState'
import { useDialog } from '@/contexts/useDialog'
import type { AgentConfig, AgentRole, ModelProvider } from '@lifeos/agents'

export interface AgentsTabProps {
  agents: AgentConfig[]
  isLoading: boolean
  onNew: () => void
  onEdit: (agent: AgentConfig) => void
  onSaveTemplate: (agent: AgentConfig) => void
  onDelete: (agentId: string) => void
}

export function AgentsTab({
  agents,
  isLoading,
  onNew,
  onEdit,
  onSaveTemplate,
  onDelete,
}: AgentsTabProps) {
  const { confirm } = useDialog()
  const [roleFilter, setRoleFilter] = useState<AgentRole | 'all'>('all')
  const [providerFilter, setProviderFilter] = useState<ModelProvider | 'all'>('all')

  const filteredAgents = useMemo(
    () =>
      agents.filter((agent) => {
        if (roleFilter !== 'all' && agent.role !== roleFilter) return false
        if (providerFilter !== 'all' && agent.modelProvider !== providerFilter) return false
        return true
      }),
    [agents, roleFilter, providerFilter]
  )

  return (
    <>
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
    </>
  )
}
