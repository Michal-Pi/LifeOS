/**
 * WorkspaceBlueprint Component
 *
 * Displays individual workspace template cards with:
 * - Cyberpunk-themed icon (light/dark variants)
 * - Title and description
 * - Agent list
 * - Feature tags
 * - Use Template button
 */

import { Button } from '@/components/ui/button'
import { Select, type SelectOption } from '@/components/Select'
import type { WorkspaceTemplatePreset } from '@/agents/templatePresets'
import './WorkspaceBlueprint.css'

export interface WorkspaceBlueprintProps {
  template: WorkspaceTemplatePreset
  contentTypes?: SelectOption[]
  selectedContentType?: string
  onContentTypeChange?: (contentType: string) => void
  onUse: (template: WorkspaceTemplatePreset, contentType?: string) => void
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

export function WorkspaceBlueprint({
  template,
  contentTypes = [],
  selectedContentType,
  onContentTypeChange,
  onUse,
  isBusy = false,
}: WorkspaceBlueprintProps) {
  const iconKey = (template.icon ?? 'TEMPLATE') as keyof typeof ICON_MAP
  const icon = ICON_MAP[iconKey] || ICON_MAP.TEMPLATE

  const showContentTypeSelector =
    template.supportsContentTypes && contentTypes.length > 0 && onContentTypeChange

  // Consolidate tags: remove workflow type if it's already in featureBadges
  const workflowTypeLabel = template.workspaceConfig.workflowType
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
    <article className="workspace-blueprint">
      <div className="workspace-blueprint__header">
        <div className="workspace-blueprint__icon">
          <picture>
            <source srcSet={icon.dark} media="(prefers-color-scheme: dark)" />
            <img src={icon.light} alt={`${template.name} icon`} loading="lazy" />
          </picture>
        </div>
        <div className="workspace-blueprint__info">
          <h3 className="workspace-blueprint__title">{truncate(template.name, 40)}</h3>
          <p className="workspace-blueprint__description">
            {truncate(template.description || 'No description available.', 120)}
          </p>
        </div>
      </div>

      {template.agentTemplateNames && template.agentTemplateNames.length > 0 && (
        <div className="workspace-blueprint__agents">
          <span className="workspace-blueprint__label">
            {template.agentTemplateNames.length} Agent
            {template.agentTemplateNames.length !== 1 ? 's' : ''}
          </span>
          <ul className="workspace-blueprint__agent-list">
            {template.agentTemplateNames.slice(0, 3).map((agent) => (
              <li key={agent} className="workspace-blueprint__agent">
                {truncate(agent, 30)}
              </li>
            ))}
            {template.agentTemplateNames.length > 3 && (
              <li className="workspace-blueprint__agent workspace-blueprint__agent--more">
                +{template.agentTemplateNames.length - 3} more
              </li>
            )}
          </ul>
        </div>
      )}

      {tags.length > 0 && (
        <div className="workspace-blueprint__tags">
          {tags.map((tag, index) => (
            <span key={`${tag}-${index}`} className="workspace-blueprint__tag">
              {tag}
            </span>
          ))}
        </div>
      )}

      {showContentTypeSelector && (
        <div className="workspace-blueprint__content-type">
          <label htmlFor={`content-type-${template.name}`} className="workspace-blueprint__label">
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

      <div className="workspace-blueprint__footer">
        <Button onClick={handleUse} disabled={isBusy} className="workspace-blueprint__button">
          Use Template
        </Button>
      </div>
    </article>
  )
}
