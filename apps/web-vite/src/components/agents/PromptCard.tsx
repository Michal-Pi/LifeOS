/**
 * PromptCard Component
 *
 * Displays individual prompt template cards with:
 * - Type-based cyberpunk icon (light/dark variants)
 * - Title and description (fixed height)
 * - Metadata (category, version, usage)
 * - Action buttons at bottom (Edit, Delete)
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PromptTemplate, PromptType } from '@lifeos/agents'
import './PromptCard.css'

export interface PromptCardProps {
  template: PromptTemplate
  onClick?: (template: PromptTemplate) => void
  onEdit: (template: PromptTemplate) => void
  onDelete: (template: PromptTemplate) => void
}

const TYPE_ICON_MAP: Record<PromptType, { light: string; dark: string }> = {
  agent: {
    light: '/assets/icons/prompts/agent-light.svg',
    dark: '/assets/icons/prompts/agent-dark.svg',
  },
  tool: {
    light: '/assets/icons/prompts/tool-light.svg',
    dark: '/assets/icons/prompts/tool-dark.svg',
  },
  workflow: {
    light: '/assets/icons/prompts/workflow-light.svg',
    dark: '/assets/icons/prompts/workflow-dark.svg',
  },
  synthesis: {
    light: '/assets/icons/prompts/synthesis-light.svg',
    dark: '/assets/icons/prompts/synthesis-dark.svg',
  },
  'tone-of-voice': {
    light: '/assets/icons/prompts/tone-light.svg',
    dark: '/assets/icons/prompts/tone-dark.svg',
  },
}

const TYPE_LABELS: Record<PromptType, string> = {
  agent: '🤖 Agent',
  tool: '🔧 Tool',
  workflow: '⚡ Workflow',
  synthesis: '🧩 Synthesis',
  'tone-of-voice': '🎭 Tone',
}

const truncate = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength).trim() + '…'
}

export function PromptCard({ template, onClick, onEdit, onDelete }: PromptCardProps) {
  const [expanded, setExpanded] = useState(false)
  const icon = TYPE_ICON_MAP[template.type]

  return (
    <article className="prompt-card" onClick={() => onClick?.(template)}>
      <div className="prompt-card__header">
        <div className="prompt-card__icon">
          <picture>
            <source srcSet={icon.dark} media="(prefers-color-scheme: dark)" />
            <img src={icon.light} alt={`${template.type} icon`} loading="lazy" />
          </picture>
        </div>
        <div className="prompt-card__info">
          <h3 className="prompt-card__title">{truncate(template.name, 35)}</h3>
          <span className="prompt-card__type">{TYPE_LABELS[template.type]}</span>
        </div>
      </div>

      <div className="prompt-card__description">
        <p className={expanded ? '' : 'prompt-card__description--clamped'}>
          {template.description}
        </p>
        {template.description.length > 100 && (
          <button
            className="prompt-card__expand"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      <div className="prompt-card__meta">
        <div className="prompt-card__meta-item">
          <span className="prompt-card__label">Category</span>
          <span className="prompt-card__value">{template.category}</span>
        </div>
        <div className="prompt-card__meta-item">
          <span className="prompt-card__label">Version</span>
          <span className="prompt-card__value">v{template.version}</span>
        </div>
        <div className="prompt-card__meta-item">
          <span className="prompt-card__label">Usage</span>
          <span className="prompt-card__value">{template.usageCount}</span>
        </div>
      </div>

      {template.tags && template.tags.length > 0 && (
        <div className="prompt-card__tags">
          {template.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="prompt-card__tag">
              {tag}
            </span>
          ))}
          {template.tags.length > 3 && (
            <span className="prompt-card__tag prompt-card__tag--more">
              +{template.tags.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="prompt-card__footer">
        <Button
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(template)
          }}
        >
          Edit
        </Button>
        <Button
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(template)
          }}
          className="danger"
        >
          Delete
        </Button>
      </div>
    </article>
  )
}
