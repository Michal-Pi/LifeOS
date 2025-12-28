/**
 * RunWorkspaceModal Component
 *
 * Modal for starting a new run in a workspace.
 * Features:
 * - Enter goal for the run
 * - Provide optional context
 * - Start execution
 * - Form validation
 */

import { useState, useEffect } from 'react'
import { useWorkspaceOperations } from '@/hooks/useWorkspaceOperations'
import type { Workspace } from '@lifeos/agents'

interface RunWorkspaceModalProps {
  workspace: Workspace | null
  isOpen: boolean
  onClose: () => void
  onRunCreated: () => void
}

export function RunWorkspaceModal({
  workspace,
  isOpen,
  onClose,
  onRunCreated,
}: RunWorkspaceModalProps) {
  const { createRun } = useWorkspaceOperations()

  const [goal, setGoal] = useState('')
  const [contextInput, setContextInput] = useState('')

  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setGoal('')
      setContextInput('')
      setError(null)
    }
  }, [isOpen])

  const handleStart = async () => {
    // Validation
    if (!goal.trim()) {
      setError('Goal is required')
      return
    }

    if (!workspace) {
      setError('No workspace selected')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      // Parse context if provided
      let context: Record<string, unknown> | undefined
      if (contextInput.trim()) {
        try {
          context = JSON.parse(contextInput)
        } catch {
          setError('Context must be valid JSON')
          setIsCreating(false)
          return
        }
      }

      await createRun({
        workspaceId: workspace.workspaceId,
        goal: goal.trim(),
        context,
      })

      onRunCreated()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsCreating(false)
    }
  }

  if (!isOpen || !workspace) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Start New Run</h2>
        <p className="workspace-name">
          Workspace: <strong>{workspace.name}</strong>
        </p>

        {error && <div className="error-message">{error}</div>}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleStart()
          }}
        >
          <div className="form-group">
            <label htmlFor="goal">Goal *</label>
            <textarea
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What do you want the workspace to accomplish?"
              rows={4}
              required
            />
            <small>Describe the task or goal for this run</small>
          </div>

          <div className="form-group">
            <label htmlFor="context">Context (optional)</label>
            <textarea
              id="context"
              value={contextInput}
              onChange={(e) => setContextInput(e.target.value)}
              placeholder='{"key": "value"}'
              rows={6}
            />
            <small>Additional context as JSON (e.g., user preferences, data)</small>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={isCreating}>
              Cancel
            </button>
            <button type="submit" disabled={isCreating}>
              {isCreating ? 'Starting...' : 'Start Run'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
