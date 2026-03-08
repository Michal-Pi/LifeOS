/**
 * AgentCard Component
 *
 * Displays individual agent cards with:
 * - Role-based cyberpunk icon (light/dark variants)
 * - Title and description (fixed height)
 * - Agent metadata
 * - Action buttons at bottom
 * - Tooltip from template preset when name matches
 * - Optional selection mode for batch operations
 */

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { agentTemplatePresets } from '@/agents/templatePresets'
import type { AgentConfig, AgentRole } from '@lifeos/agents'
import './AgentCard.css'

export interface AgentCardProps {
  agent: AgentConfig
  usedByWorkflows?: string[]
  selectable?: boolean
  selected?: boolean
  onSelect?: () => void
  onEdit: (agent: AgentConfig) => void
  onSaveTemplate: (agent: AgentConfig) => void
  onDelete: (agent: AgentConfig) => void
}

const presetDescriptionMap = new Map(
  agentTemplatePresets
    .filter((p) => p.description)
    .map((p) => [p.name, p.description!])
)

const ROLE_ICON_MAP: Record<AgentRole, { light: string; dark: string }> = {
  researcher: {
    light: '/assets/icons/agents/researcher-light.svg',
    dark: '/assets/icons/agents/researcher-dark.svg',
  },
  planner: {
    light: '/assets/icons/agents/planner-light.svg',
    dark: '/assets/icons/agents/planner-dark.svg',
  },
  critic: {
    light: '/assets/icons/agents/critic-light.svg',
    dark: '/assets/icons/agents/critic-dark.svg',
  },
  synthesizer: {
    light: '/assets/icons/agents/synthesizer-light.svg',
    dark: '/assets/icons/agents/synthesizer-dark.svg',
  },
  executor: {
    light: '/assets/icons/agents/executor-light.svg',
    dark: '/assets/icons/agents/executor-dark.svg',
  },
  supervisor: {
    light: '/assets/icons/agents/supervisor-light.svg',
    dark: '/assets/icons/agents/supervisor-dark.svg',
  },
  custom: {
    light: '/assets/icons/agents/custom-light.svg',
    dark: '/assets/icons/agents/custom-dark.svg',
  },
}

const ROLE_LABELS: Record<AgentRole, string> = {
  researcher: 'Researcher',
  planner: 'Planner',
  critic: 'Critic',
  synthesizer: 'Synthesizer',
  executor: 'Executor',
  supervisor: 'Supervisor',
  custom: 'Custom',
}

const truncate = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength).trim() + '…'
}

export function AgentCard({
  agent,
  usedByWorkflows = [],
  selectable,
  selected,
  onSelect,
  onEdit,
  onSaveTemplate,
  onDelete,
}: AgentCardProps) {
  const icon = ROLE_ICON_MAP[agent.role] ?? ROLE_ICON_MAP.custom

  const presetTooltip = useMemo(
    () => presetDescriptionMap.get(agent.name),
    [agent.name]
  )

  const cardClassName = [
    'agent-card',
    selectable && selected ? 'agent-card--selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article
      className={cardClassName}
      title={presetTooltip}
      onClick={selectable ? onSelect : undefined}
      style={selectable ? { cursor: 'pointer' } : undefined}
    >
      {selectable && (
        <div className="batch-checkbox">
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={onSelect}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <div className="agent-card__header">
        <div className="agent-card__icon">
          <picture>
            <source srcSet={icon.dark} media="(prefers-color-scheme: dark)" />
            <img src={icon.light} alt={`${agent.role} icon`} loading="lazy" />
          </picture>
        </div>
        <div className="agent-card__info">
          <h3 className="agent-card__title">{truncate(agent.name, 35)}</h3>
          <span className="agent-card__role">{ROLE_LABELS[agent.role] ?? 'Custom'}</span>
        </div>
      </div>

      {agent.description && (
        <div className="agent-card__description">
          <p>{truncate(agent.description, 120)}</p>
        </div>
      )}

      <div className="agent-card__meta">
        <div className="agent-card__meta-item">
          <span className="agent-card__label">Provider</span>
          <span className="agent-card__value">{agent.modelProvider}</span>
        </div>
        <div className="agent-card__meta-item">
          <span className="agent-card__label">Model</span>
          <span className="agent-card__value">{truncate(agent.modelName, 20)}</span>
        </div>
        <div className="agent-card__meta-item">
          <span className="agent-card__label">Temp</span>
          <span className="agent-card__value">{agent.temperature?.toFixed(2) ?? '0.70'}</span>
        </div>
        {agent.maxTokens && (
          <div className="agent-card__meta-item">
            <span className="agent-card__label">Max Tokens</span>
            <span className="agent-card__value">{agent.maxTokens.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Workflow usage indicator */}
      {usedByWorkflows.length > 0 && (
        <div className="agent-card__usage">
          <span className="agent-card__label">Used by</span>
          <div className="agent-card__usage-list">
            {usedByWorkflows.map((name) => (
              <span key={name} className="agent-card__usage-tag">
                {truncate(name, 25)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Config fingerprint indicator */}
      {agent.configHash && (
        <div className="agent-card__fingerprint">
          <span className="agent-card__label">Fingerprint</span>
          <span className="agent-card__value" title={agent.configHash}>
            {agent.configHash.replace('cfghash_', '').slice(0, 12)}
          </span>
        </div>
      )}

      <div className="agent-card__prompt">
        <span className="agent-card__label">System Prompt</span>
        <p className="agent-card__prompt-preview">{truncate(agent.systemPrompt, 100)}</p>
      </div>

      {!selectable && (
        <div className="agent-card__footer">
          <Button variant="ghost" onClick={() => onEdit(agent)} size="sm">
            Edit
          </Button>
          <Button variant="ghost" onClick={() => onSaveTemplate(agent)} size="sm">
            Save Template
          </Button>
          <Button variant="ghost" onClick={() => onDelete(agent)} className="danger" size="sm">
            Delete
          </Button>
        </div>
      )}
    </article>
  )
}
