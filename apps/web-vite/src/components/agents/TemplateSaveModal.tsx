/**
 * TemplateSaveModal Component
 *
 * Captures name/description when saving a template.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface TemplateSaveModalProps {
  isOpen: boolean
  title: string
  initialName: string
  initialDescription?: string
  onClose: () => void
  onSave: (name: string, description?: string) => void
}

export function TemplateSaveModal({
  isOpen,
  title,
  initialName,
  initialDescription,
  onClose,
  onSave,
}: TemplateSaveModalProps) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription ?? '')
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleClose = () => {
    setError(null)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>

        {error && <div className="error-message">{error}</div>}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            const trimmed = name.trim()
            if (!trimmed) {
              setError('Name is required')
              return
            }
            onSave(trimmed, description.trim() || undefined)
          }}
        >
          <div className="form-group">
            <label htmlFor="templateName">Template Name *</label>
            <input
              id="templateName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="templateDescription">Description</label>
            <input
              id="templateDescription"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          <div className="modal-actions">
            <Button variant="ghost" type="button" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit">Save Template</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
