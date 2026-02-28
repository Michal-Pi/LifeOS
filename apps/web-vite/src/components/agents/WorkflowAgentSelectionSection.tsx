/**
 * WorkflowAgentSelectionSection
 *
 * Agent selection grid with role filtering and default agent picker.
 */

import type { AgentId } from '@lifeos/agents'
import { Select } from '@/components/Select'
import {
  ROLE_LABELS,
  ROLE_FILTER_OPTIONS,
  DEFAULT_AGENT_OPTION,
  type AgentSelectionSectionProps,
} from './workflowFormConstants'

export function WorkflowAgentSelectionSection({
  activeAgents,
  filteredAgents,
  selectedAgentIds,
  roleFilter,
  setRoleFilter,
  defaultAgentId,
  setDefaultAgentId,
  onAgentToggle,
  defaultAgentOptions,
  validationErrors,
}: AgentSelectionSectionProps) {
  return (
    <>
      <div className="form-group">
        <div className="agent-selection-header">
          <label>Select Agents *</label>
          <Select
            options={ROLE_FILTER_OPTIONS}
            value={roleFilter}
            onChange={(value) => setRoleFilter(value as typeof roleFilter)}
            placeholder="Filter by type"
            className="role-filter-select"
          />
        </div>
        {activeAgents.length === 0 ? (
          <div className="empty-state">
            <p>No agents available. Create an agent first.</p>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="empty-state">
            <p>No agents match the selected filter. Try a different type.</p>
          </div>
        ) : (
          <div className={`agent-selection ${validationErrors.agents ? 'error' : ''}`}>
            {filteredAgents.map((agent) => {
              const isSelected = selectedAgentIds.includes(agent.agentId)
              return (
                <div
                  key={agent.agentId}
                  className={`agent-selection-item ${isSelected ? 'selected' : ''}`}
                  tabIndex={0}
                  role="button"
                  onClick={() => onAgentToggle(agent.agentId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onAgentToggle(agent.agentId)
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    id={`agent-${agent.agentId}`}
                    checked={isSelected}
                    onChange={() => onAgentToggle(agent.agentId)}
                    className="agent-selection-checkbox"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="agent-selection-content">
                    <div className="agent-selection-header">
                      <label
                        htmlFor={`agent-${agent.agentId}`}
                        className="agent-selection-name"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {agent.name}
                      </label>
                      <span className="agent-selection-badge">
                        {ROLE_LABELS[agent.role] ?? agent.role}
                      </span>
                    </div>
                    <p className="agent-selection-description">
                      {agent.description
                        ? `${agent.description} (${agent.modelName})`
                        : agent.modelName}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {validationErrors.agents && <span className="field-error">{validationErrors.agents}</span>}
      </div>

      {selectedAgentIds.length > 0 && (
        <div className="form-group">
          <label htmlFor="defaultAgent">Default Agent (optional)</label>
          <Select
            id="defaultAgent"
            value={defaultAgentId ?? DEFAULT_AGENT_OPTION}
            onChange={(value) =>
              setDefaultAgentId(value === DEFAULT_AGENT_OPTION ? undefined : (value as AgentId))
            }
            options={defaultAgentOptions}
            placeholder="Select a default agent"
          />
          <small>The first agent to handle incoming requests</small>
        </div>
      )}
    </>
  )
}
