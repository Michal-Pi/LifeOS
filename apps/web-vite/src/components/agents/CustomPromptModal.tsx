/**
 * CustomPromptModal Component
 *
 * Modal for editing custom prompts with a large text area.
 * - 80% screen width
 * - 75% screen height
 * - Centered on screen
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import './CustomPromptModal.css'

interface CustomPromptModalProps {
  isOpen: boolean
  value: string
  onSave: (content: string) => void
  onClose: () => void
  agentName?: string
}

export function CustomPromptModal({
  isOpen,
  value,
  onSave,
  onClose,
  agentName,
}: CustomPromptModalProps) {
  if (!isOpen) return null

  return (
    <CustomPromptModalInner value={value} onSave={onSave} onClose={onClose} agentName={agentName} />
  )
}

function CustomPromptModalInner({
  value,
  onSave,
  onClose,
  agentName,
}: Omit<CustomPromptModalProps, 'isOpen'>) {
  const [content, setContent] = useState(value)

  const handleSave = () => {
    onSave(content)
    onClose()
  }

  const handleCancel = () => {
    setContent(value)
    onClose()
  }

  return (
    <div className="custom-prompt-modal-overlay" onClick={handleCancel}>
      <div className="custom-prompt-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="custom-prompt-modal-header">
          <h3>{agentName ? `Custom Prompt for ${agentName}` : 'Custom Prompt'}</h3>
          <button className="close-button" onClick={handleCancel} aria-label="Close">
            ×
          </button>
        </div>

        <div className="custom-prompt-modal-body">
          <textarea
            className="custom-prompt-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Enter your custom prompt here..."
            autoFocus
          />
        </div>

        <div className="custom-prompt-modal-footer">
          <span className="character-count">{content.length} characters</span>
          <div className="button-group">
            <Button variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Prompt</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
