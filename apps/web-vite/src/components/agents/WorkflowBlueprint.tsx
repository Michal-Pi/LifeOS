/**
 * WorkflowBlueprint Component
 *
 * Displays individual workflow template cards with:
 * - Cyberpunk-themed icon (light/dark variants)
 * - Title and description
 * - Agent list
 * - Feature tags
 * - Use Template button
 */

import { Button } from '@/components/ui/button'
import { Select, type SelectOption } from '@/components/Select'
import type { WorkflowTemplatePreset } from '@/agents/templatePresets'
import './WorkflowBlueprint.css'

export interface WorkflowBlueprintProps {
  template: WorkflowTemplatePreset
  contentTypes?: SelectOption[]
  selectedContentType?: string
  onContentTypeChange?: (contentType: string) => void
  onUse: (template: WorkflowTemplatePreset, contentType?: string) => void
  isBusy?: boolean
}

const ICON_MAP: Record<string, { light: string; dark: string }> = {
  PLAN: {
    light: '/assets/icons/templates/plan-light.svg',
    dark: '/assets/icons/templates/plan-dark.svg',
  },
  WRITE: {
    light: '/assets/icons/templates/write-light.svg',
    dark: '/assets/icons/templates/write-dark.svg',
  },
  SEARCH: {
    light: '/assets/icons/templates/search-light.svg',
    dark: '/assets/icons/templates/search-dark.svg',
  },
  RESEARCH: {
    light: '/assets/icons/templates/research-light.svg',
    dark: '/assets/icons/templates/research-dark.svg',
  },
  SUPERVISOR: {
    light: '/assets/icons/templates/supervisor-light.svg',
    dark: '/assets/icons/templates/supervisor-dark.svg',
  },
  TEMPLATE: {
    light: '/assets/icons/templates/default-light.svg',
    dark: '/assets/icons/templates/default-dark.svg',
  },
}

const truncate = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength).trim() + '…'
}

export function WorkflowBlueprint({
  template,
  contentTypes = [],
  selectedContentType,
  onContentTypeChange,
  onUse,
  isBusy = false,
}: WorkflowBlueprintProps) {
  const iconKey = (template.icon ?? 'TEMPLATE') as keyof typeof ICON_MAP
  const icon = ICON_MAP[iconKey] || ICON_MAP.TEMPLATE

  // Safety check: if icon is somehow undefined, use TEMPLATE as fallback
  const safeIcon = icon || ICON_MAP.TEMPLATE

  const showContentTypeSelector =
    template.supportsContentTypes && contentTypes.length > 0 && onContentTypeChange

  // Consolidate tags: remove workflow type if it's already in featureBadges
  const workflowTypeLabel = template.workflowConfig.workflowType
  const featureTags = template.featureBadges || []

  // Check if featureBadges already contains the workflow type
  const hasWorkflowInBadges = featureTags.some((badge) =>
    badge.toLowerCase().includes(workflowTypeLabel.toLowerCase())
  )

  // Build final tag list
  const tags: string[] = []
  if (!hasWorkflowInBadges) {
    tags.push(workflowTypeLabel)
  }
  tags.push(...featureTags)

  const handleUse = () => {
    onUse(template, selectedContentType)
  }

  return (
    <article className="workflow-blueprint">
      <div className="workflow-blueprint__header">
        <div className="workflow-blueprint__icon">
          <picture>
            <source srcSet={safeIcon.dark} media="(prefers-color-scheme: dark)" />
            <img src={safeIcon.light} alt={`${template.name} icon`} loading="lazy" />
          </picture>
        </div>
        <div className="workflow-blueprint__info">
          <h3 className="workflow-blueprint__title">{truncate(template.name, 40)}</h3>
          <p className="workflow-blueprint__description">
            {truncate(template.description || 'No description available.', 120)}
          </p>
        </div>
      </div>

      {template.agentTemplateNames && template.agentTemplateNames.length > 0 && (
        <div className="workflow-blueprint__agents">
          <span className="workflow-blueprint__label">
            {template.agentTemplateNames.length} Agent
            {template.agentTemplateNames.length !== 1 ? 's' : ''}
          </span>
          <ul className="workflow-blueprint__agent-list">
            {template.agentTemplateNames.slice(0, 3).map((agent) => (
              <li key={agent} className="workflow-blueprint__agent">
                {truncate(agent, 30)}
              </li>
            ))}
            {template.agentTemplateNames.length > 3 && (
              <li className="workflow-blueprint__agent workflow-blueprint__agent--more">
                +{template.agentTemplateNames.length - 3} more
              </li>
            )}
          </ul>
        </div>
      )}

      {tags.length > 0 && (
        <div className="workflow-blueprint__tags">
          {tags.map((tag, index) => (
            <span key={`${tag}-${index}`} className="workflow-blueprint__tag">
              {tag}
            </span>
          ))}
        </div>
      )}

      {showContentTypeSelector && (
        <div className="workflow-blueprint__content-type">
          <label htmlFor={`content-type-${template.name}`} className="workflow-blueprint__label">
            Content Type
          </label>
          <Select
            id={`content-type-${template.name}`}
            options={contentTypes}
            value={selectedContentType || contentTypes[0]?.value}
            onValueChange={onContentTypeChange}
            placeholder="Select type"
          />
        </div>
      )}

      <div className="workflow-blueprint__footer">
        <Button onClick={handleUse} disabled={isBusy} className="workflow-blueprint__button">
          Use Template
        </Button>
      </div>
    </article>
  )
}
