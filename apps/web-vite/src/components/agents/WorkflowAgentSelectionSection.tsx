/**
 * WorkflowAgentSelectionSection
 *
 * Agent selection grid with role filtering, default agent picker,
 * and toggle between active agents and agent templates.
 */

import { useMemo } from 'react'
import type { AgentId, AgentRole } from '@lifeos/agents'
import { Select } from '@/components/Select'
import { agentTemplatePresets } from '@/agents/templatePresets'
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
  agentSource,
  setAgentSource,
  selectedTemplateNames,
  onTemplateToggle,
}: AgentSelectionSectionProps) {
  const filteredTemplates = useMemo(() => {
    if (roleFilter === 'all') return agentTemplatePresets
    return agentTemplatePresets.filter(
      (t) => t.agentConfig.role === (roleFilter as AgentRole)
    )
  }, [roleFilter])

  const isTemplateView = agentSource === 'templates'

  return (
    <>
      <div className="form-group">
        <div className="agent-selection-header">
          <label>Select Agents *</label>
          <div className="agent-source-controls">
            <div className="agent-source-toggle">
              <button
                type="button"
                className={`agent-source-btn ${!isTemplateView ? 'active' : ''}`}
                onClick={() => setAgentSource('active')}
              >
                Active Agents
              </button>
              <button
                type="button"
                className={`agent-source-btn ${isTemplateView ? 'active' : ''}`}
                onClick={() => setAgentSource('templates')}
              >
                Templates
              </button>
            </div>
            <Select
              options={ROLE_FILTER_OPTIONS}
              value={roleFilter}
              onChange={(value) => setRoleFilter(value as typeof roleFilter)}
              placeholder="Filter by type"
              className="role-filter-select"
            />
          </div>
        </div>

        {isTemplateView ? (
          // Template selection view
          filteredTemplates.length === 0 ? (
            <div className="empty-state">
              <p>No templates match the selected filter.</p>
            </div>
          ) : (
            <div className={`agent-selection ${validationErrors.agents ? 'error' : ''}`}>
              {filteredTemplates.map((template) => {
                const isSelected = selectedTemplateNames.includes(template.name)
                return (
                  <div
                    key={template.name}
                    className={`agent-selection-item ${isSelected ? 'selected' : ''}`}
                    tabIndex={0}
                    role="button"
                    onClick={() => onTemplateToggle(template.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onTemplateToggle(template.name)
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      id={`template-${template.name}`}
                      checked={isSelected}
                      onChange={() => onTemplateToggle(template.name)}
                      className="agent-selection-checkbox"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="agent-selection-content">
                      <div className="agent-selection-header">
                        <label
                          htmlFor={`template-${template.name}`}
                          className="agent-selection-name"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {template.name}
                        </label>
                        <span className="agent-selection-badge">
                          {ROLE_LABELS[template.agentConfig.role] ?? template.agentConfig.role}
                        </span>
                        <span className="agent-selection-badge template-badge">Template</span>
                      </div>
                      <p className="agent-selection-description">
                        {template.description ??
                          template.agentConfig.description ??
                          `${template.agentConfig.modelProvider} / ${template.agentConfig.modelName}`}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          // Active agents view (original)
          <>
            {activeAgents.length === 0 ? (
              <div className="empty-state">
                <p>No agents available. Create an agent first, or switch to Templates.</p>
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
          </>
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
