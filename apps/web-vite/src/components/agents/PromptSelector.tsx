import { useMemo, useState } from 'react'
import type { PromptReference, PromptType, PromptTemplate } from '@lifeos/agents'
import { usePromptLibrary } from '@/hooks/usePromptLibrary'
import { Button } from '@/components/ui/button'
import { Select, type SelectOption } from '@/components/Select'
import { CustomPromptModal } from './CustomPromptModal'

type PromptSelectorProps = {
  type: PromptType
  value: PromptReference
  onChange: (reference: PromptReference) => void
  onEditTemplate?: (template: PromptTemplate) => void
  agentName?: string
}

export function PromptSelector({
  type,
  value,
  onChange,
  onEditTemplate,
  agentName,
}: PromptSelectorProps) {
  const { templates, loading } = usePromptLibrary({ type })
  const [isCustomPromptModalOpen, setIsCustomPromptModalOpen] = useState(false)

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

  const handleCustomPromptSave = (content: string) => {
    onChange({ type: 'custom', customContent: content })
  }

  return (
    <>
      <div className="prompt-selector">
        <Select
          value={selectedValue}
          onValueChange={(selection) => {
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
          <Button
            variant="outline"
            type="button"
            onClick={() => setIsCustomPromptModalOpen(true)}
            className="edit-custom-prompt-button"
          >
            {value.customContent ? 'Edit Custom Prompt' : 'Add Custom Prompt'}
          </Button>
        )}
      </div>

      <CustomPromptModal
        isOpen={isCustomPromptModalOpen}
        value={value.customContent ?? ''}
        onSave={handleCustomPromptSave}
        onClose={() => setIsCustomPromptModalOpen(false)}
        agentName={agentName}
      />
    </>
  )
}
