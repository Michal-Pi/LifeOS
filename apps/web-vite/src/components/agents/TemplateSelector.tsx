import { useMemo, useState } from 'react'
import type { WorkspaceTemplatePreset } from '@/agents/templatePresets'
import type { ContentTypePreset } from '@/agents/contentTypePresets'
import './TemplateSelector.css'

type TemplateSelectorProps = {
  templates: WorkspaceTemplatePreset[]
  contentTypes: ContentTypePreset[]
  onUseTemplate: (
    template: WorkspaceTemplatePreset,
    options?: {
      contentType?: string
    }
  ) => void | Promise<void>
  isBusy?: boolean
}

type SelectedContentTypes = Record<string, string>

const toId = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export function TemplateSelector({
  templates,
  contentTypes,
  onUseTemplate,
  isBusy = false,
}: TemplateSelectorProps) {
  const availableTemplates = useMemo(
    () => templates.filter((template) => template.agentTemplateNames?.length),
    [templates]
  )
  const defaultContentType = contentTypes[0]?.name ?? ''
  const [selectedContentTypes, setSelectedContentTypes] = useState<SelectedContentTypes>({})

  const getContentType = (templateName: string) =>
    selectedContentTypes[templateName] ?? defaultContentType

  if (availableTemplates.length === 0) return null

  return (
    <section className="template-selector">
      <header className="template-selector__header">
        <p className="section-label">Template Presets</p>
        <h2>Workspace Blueprints</h2>
        <p className="template-selector__subhead">
          Spin up specialized teams with expert workflows, tools, and governance already wired.
        </p>
      </header>

      <div className="template-selector__grid">
        {availableTemplates.map((template) => {
          const contentType = getContentType(template.name)
          const contentTypeId = `${toId(template.name)}-content-type`
          return (
            <article key={template.name} className="template-card">
              <div className="template-card__header">
                <div className="template-card__icon">{template.icon ?? 'TEMPLATE'}</div>
                <div>
                  <h3 className="template-card__title">{template.name}</h3>
                  {template.description && (
                    <p className="template-card__description">{template.description}</p>
                  )}
                </div>
              </div>

              {template.agentTemplateNames && (
                <div className="template-card__agents">
                  <span className="template-card__label">
                    {template.agentTemplateNames.length} agents
                  </span>
                  <div className="template-card__agent-list">
                    {template.agentTemplateNames.map((agent) => (
                      <span key={agent} className="template-card__agent">
                        {agent}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="template-card__meta">
                <span className="template-card__badge">
                  {template.workspaceConfig.workflowType}
                </span>
                {(template.featureBadges ?? []).map((badge) => (
                  <span key={badge} className="template-card__badge">
                    {badge}
                  </span>
                ))}
              </div>

              {template.supportsContentTypes && contentTypes.length > 0 && (
                <div className="template-card__selector">
                  <label htmlFor={contentTypeId}>Content type</label>
                  <select
                    id={contentTypeId}
                    value={contentType}
                    onChange={(event) =>
                      setSelectedContentTypes((prev) => ({
                        ...prev,
                        [template.name]: event.target.value,
                      }))
                    }
                  >
                    {contentTypes.map((preset) => (
                      <option key={preset.id} value={preset.name}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                className="primary-button template-card__action"
                type="button"
                disabled={isBusy}
                onClick={() =>
                  onUseTemplate(
                    template,
                    template.supportsContentTypes ? { contentType } : undefined
                  )
                }
              >
                Use Template
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}
