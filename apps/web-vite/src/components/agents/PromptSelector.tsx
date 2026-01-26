import { useMemo } from 'react'
import type { PromptReference, PromptType, PromptTemplate } from '@lifeos/agents'
import { usePromptLibrary } from '@/hooks/usePromptLibrary'

type PromptSelectorProps = {
  type: PromptType
  value: PromptReference
  onChange: (reference: PromptReference) => void
  onEditTemplate?: (template: PromptTemplate) => void
}

export function PromptSelector({ type, value, onChange, onEditTemplate }: PromptSelectorProps) {
  const { templates, loading } = usePromptLibrary({ type })

  const options = useMemo(
    () => templates.filter((template) => template.type === type),
    [templates, type]
  )

  const selectedValue = value.type === 'shared' ? (value.templateId ?? 'custom') : 'custom'

  return (
    <div className="prompt-selector">
      <select
        value={selectedValue}
        onChange={(event) => {
          const selection = event.target.value
          if (selection === 'custom') {
            onChange({ type: 'custom', customContent: value.customContent ?? '' })
          } else {
            onChange({ type: 'shared', templateId: selection })
          }
        }}
        disabled={loading}
      >
        <option value="custom">Custom Prompt</option>
        {options.map((template) => (
          <option key={template.templateId} value={template.templateId}>
            {template.name} (v{template.version})
          </option>
        ))}
      </select>
      {value.type === 'shared' && value.templateId && onEditTemplate && (
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            const selected = options.find((template) => template.templateId === value.templateId)
            if (selected) {
              onEditTemplate(selected)
            }
          }}
        >
          Edit Template
        </button>
      )}
    </div>
  )
}
