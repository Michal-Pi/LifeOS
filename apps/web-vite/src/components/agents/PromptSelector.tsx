import { useMemo } from 'react'
import type { PromptReference, PromptType, PromptTemplate } from '@lifeos/agents'
import { usePromptLibrary } from '@/hooks/usePromptLibrary'
import { Button } from '@/components/ui/button'
import { Select, type SelectOption } from '@/components/Select'

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

  const selectOptions: SelectOption[] = useMemo(
    () => [
      { value: 'custom', label: 'Custom Prompt' },
      ...options.map((template) => ({
        value: template.templateId,
        label: `${template.name} (v${template.version})`,
      })),
    ],
    [options]
  )

  return (
    <div className="prompt-selector">
      <Select
        value={selectedValue}
        onChange={(selection) => {
          if (selection === 'custom') {
            onChange({ type: 'custom', customContent: value.customContent ?? '' })
          } else {
            onChange({ type: 'shared', templateId: selection })
          }
        }}
        options={selectOptions}
        disabled={loading}
        placeholder="Select prompt..."
      />
      {value.type === 'shared' && value.templateId && onEditTemplate && (
        <Button
          variant="ghost"
          type="button"
          onClick={() => {
            const selected = options.find((template) => template.templateId === value.templateId)
            if (selected) {
              onEditTemplate(selected)
            }
          }}
        >
          Edit Template
        </Button>
      )}
      {value.type === 'custom' && (
        <textarea
          className="custom-prompt-textarea"
          value={value.customContent ?? ''}
          onChange={(e) => {
            onChange({ type: 'custom', customContent: e.target.value })
          }}
          placeholder="Enter your custom prompt here..."
          rows={6}
          style={{
            width: '100%',
            marginTop: '0.5rem',
            padding: '0.5rem',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '0.9rem',
            resize: 'vertical',
          }}
        />
      )}
    </div>
  )
}
