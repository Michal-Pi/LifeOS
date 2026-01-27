/**
 * ToolBuilderModal Component
 *
 * Modal for creating and editing custom tools.
 */

import { useEffect, useState } from 'react'
import type { ToolDefinition, ToolParameter, CreateToolInput } from '@lifeos/agents'
import { Button } from '@/components/ui/button'

interface ToolBuilderModalProps {
  tool: ToolDefinition | null
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  onCreate: (
    input: Omit<CreateToolInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>
  ) => Promise<void>
  onUpdate: (
    toolId: string,
    updates: Partial<Omit<CreateToolInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>>
  ) => Promise<void>
  existingNames: string[]
}

const DEFAULT_PARAMS: Record<string, ToolParameter> = {
  input: {
    type: 'string',
    description: 'Input text',
    required: true,
  },
}

export function ToolBuilderModal({
  tool,
  isOpen,
  onClose,
  onSave,
  onCreate,
  onUpdate,
  existingNames,
}: ToolBuilderModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [parametersInput, setParametersInput] = useState(JSON.stringify(DEFAULT_PARAMS, null, 2))
  const [code, setCode] = useState('')
  const [requiresAuth, setRequiresAuth] = useState(false)
  const [allowedModulesInput, setAllowedModulesInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    if (tool) {
      setName(tool.name)
      setDescription(tool.description)
      setParametersInput(JSON.stringify(tool.parameters ?? DEFAULT_PARAMS, null, 2))
      setCode(tool.implementation?.code ?? '')
      setRequiresAuth(tool.requiresAuth)
      setAllowedModulesInput((tool.allowedModules ?? []).join(', '))
    } else {
      setName('')
      setDescription('')
      setParametersInput(JSON.stringify(DEFAULT_PARAMS, null, 2))
      setCode('')
      setRequiresAuth(false)
      setAllowedModulesInput('')
    }
    setError(null)
  }, [isOpen, tool])

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Tool name is required')
      return
    }
    if (!/^[a-z0-9_]+$/.test(trimmedName)) {
      setError('Tool name must be lowercase letters, numbers, and underscores only')
      return
    }
    if (!description.trim()) {
      setError('Description is required')
      return
    }
    if (!code.trim()) {
      setError('Tool code is required')
      return
    }

    const normalizedName = trimmedName.toLowerCase()
    const nameConflict = existingNames.some((existing) => {
      const normalizedExisting = existing.toLowerCase()
      if (tool && normalizedExisting === tool.name.toLowerCase()) {
        return false
      }
      return normalizedExisting === normalizedName
    })
    if (nameConflict) {
      setError('Tool name already exists')
      return
    }

    let parsedParams: Record<string, ToolParameter>
    try {
      parsedParams = JSON.parse(parametersInput) as Record<string, ToolParameter>
    } catch {
      setError('Parameters must be valid JSON')
      return
    }

    const allowedModules = allowedModulesInput
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)

    setIsSaving(true)
    setError(null)

    const payload = {
      name: trimmedName,
      description: description.trim(),
      parameters: parsedParams,
      implementation: {
        type: 'javascript' as const,
        code: code.trim(),
      },
      source: 'custom' as const,
      requiresAuth,
      allowedModules: allowedModules.length > 0 ? allowedModules : undefined,
    }

    try {
      if (tool) {
        await onUpdate(tool.toolId, payload)
      } else {
        await onCreate(payload)
      }
      onSave()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>{tool ? 'Edit Tool' : 'Create Tool'}</h2>

        {error && <div className="error-message">{error}</div>}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSave()
          }}
        >
          <div className="form-group">
            <label htmlFor="toolName">Tool Name *</label>
            <input
              id="toolName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., summarize_notes"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="toolDescription">Description *</label>
            <textarea
              id="toolDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="toolParameters">Parameters (JSON) *</label>
            <textarea
              id="toolParameters"
              value={parametersInput}
              onChange={(e) => setParametersInput(e.target.value)}
              rows={6}
              required
            />
            <small>JSON map of parameter definitions (type, description, required)</small>
          </div>

          <div className="form-group">
            <label htmlFor="toolCode">Tool Code (JavaScript) *</label>
            <textarea
              id="toolCode"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="return { result: params.input.toUpperCase() }"
              rows={8}
              required
            />
            <small>Return a JSON-serializable value. Use params and context.</small>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="requiresAuth">Requires Auth</label>
              <select
                id="requiresAuth"
                value={requiresAuth ? 'yes' : 'no'}
                onChange={(e) => setRequiresAuth(e.target.value === 'yes')}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="allowedModules">Allowed Modules</label>
              <input
                id="allowedModules"
                type="text"
                value={allowedModulesInput}
                onChange={(e) => setAllowedModulesInput(e.target.value)}
                placeholder="calendar, planner"
              />
              <small>Optional comma-separated module list</small>
            </div>
          </div>

          <div className="modal-actions">
            <Button variant="ghost" type="button" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : tool ? 'Update Tool' : 'Create Tool'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
