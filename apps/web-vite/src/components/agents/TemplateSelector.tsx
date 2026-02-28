import { useMemo, useState } from 'react'
import type { WorkflowTemplatePreset } from '@/agents/templatePresets'
import type { ContentTypePreset } from '@/agents/contentTypePresets'
import { WorkflowBlueprint } from './WorkflowBlueprint'
import type { SelectOption } from '@/components/Select'
import './TemplateSelector.css'

type TemplateSelectorProps = {
  templates: WorkflowTemplatePreset[]
  contentTypes: ContentTypePreset[]
  onUseTemplate: (
    template: WorkflowTemplatePreset,
    options?: {
      contentType?: string
    }
  ) => void | Promise<void>
  isBusy?: boolean
}

type SelectedContentTypes = Record<string, string>

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
  const contentTypeOptions = useMemo<SelectOption[]>(
    () => contentTypes.map((preset) => ({ value: preset.name, label: preset.name })),
    [contentTypes]
  )
  const [selectedContentTypes, setSelectedContentTypes] = useState<SelectedContentTypes>({})

  const getContentType = (templateName: string) =>
    selectedContentTypes[templateName] ?? defaultContentType

  if (availableTemplates.length === 0) return null

  return (
    <section className="template-selector">
      <header className="template-selector__header">
        <p className="section-label">Template Presets</p>
        <h2>Workflow Blueprints</h2>
        <p className="template-selector__subhead">
          Spin up specialized teams with expert workflows, tools, and governance already wired.
        </p>
      </header>

      <div className="template-selector__grid">
        {availableTemplates.map((template) => {
          const contentType = getContentType(template.name)
          return (
            <WorkflowBlueprint
              key={template.name}
              template={template}
              contentTypes={contentTypeOptions}
              selectedContentType={contentType}
              onContentTypeChange={(value) =>
                setSelectedContentTypes((prev) => ({ ...prev, [template.name]: value }))
              }
              onUse={(t, ct) => onUseTemplate(t, ct ? { contentType: ct } : undefined)}
              isBusy={isBusy}
            />
          )
        })}
      </div>
    </section>
  )
}
