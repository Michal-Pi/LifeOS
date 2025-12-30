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

import { useMemo, useState, useEffect } from 'react'
import { useAiProviderKeys } from '@/hooks/useAiProviderKeys'
import { useWorkspaceOperations } from '@/hooks/useWorkspaceOperations'
import type { AgentConfig, Workspace } from '@lifeos/agents'
import { useAuth } from '@/hooks/useAuth'

interface RunWorkspaceModalProps {
  workspace: Workspace | null
  agents: AgentConfig[]
  isOpen: boolean
  onClose: () => void
  onRunCreated: () => void
  initialGoal?: string
  initialContext?: Record<string, unknown>
}

export function RunWorkspaceModal({
  workspace,
  agents,
  isOpen,
  onClose,
  onRunCreated,
  initialGoal,
  initialContext,
}: RunWorkspaceModalProps) {
  const { createRun } = useWorkspaceOperations()
  const { user } = useAuth()
  const { keys } = useAiProviderKeys(user?.uid)
  const memoryLimitPlaceholder = workspace?.memoryMessageLimit
    ? `Workspace default: ${workspace.memoryMessageLimit}`
    : 'Use workspace/global default'

  const [goal, setGoal] = useState('')
  const [contextInput, setContextInput] = useState('')
  const [memoryMessageLimitInput, setMemoryMessageLimitInput] = useState('')

  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const missingProviders = useMemo(() => {
    if (!workspace) return []
    const providers = new Set(
      agents
        .filter((agent) => workspace.agentIds.includes(agent.agentId))
        .map((agent) => agent.modelProvider)
    )

    const missing: string[] = []
    providers.forEach((provider) => {
      if (provider === 'openai' && !keys.openaiKey) missing.push('OpenAI')
      if (provider === 'anthropic' && !keys.anthropicKey) missing.push('Anthropic')
      if (provider === 'google' && !keys.googleKey) missing.push('Google')
      if (provider === 'xai' && !keys.xaiKey) missing.push('xAI (Grok)')
    })

    return missing
  }, [agents, keys, workspace])

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setGoal(initialGoal ?? '')
      setContextInput(initialContext ? JSON.stringify(initialContext, null, 2) : '')
      setMemoryMessageLimitInput('')
      setError(null)
    }
  }, [initialContext, initialGoal, isOpen])

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

    if (missingProviders.length > 0) {
      setError(
        `Missing API key${missingProviders.length > 1 ? 's' : ''}: ${missingProviders.join(
          ', '
        )}. Add keys in Settings to continue.`
      )
      return
    }

    const memoryMessageLimit = memoryMessageLimitInput
      ? Number.parseInt(memoryMessageLimitInput, 10)
      : undefined

    if (
      memoryMessageLimitInput &&
      (Number.isNaN(memoryMessageLimit) || memoryMessageLimit <= 0 || memoryMessageLimit > 200)
    ) {
      setError('Context budget must be a number between 1 and 200.')
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
        memoryMessageLimit,
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
        {initialContext?.resumeRunId && (
          <div className="info-message">
            This run will include conversation history from run {initialContext.resumeRunId}.
          </div>
        )}

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

          <div className="form-group">
            <label htmlFor="memoryMessageLimit">Context Budget (optional)</label>
            <input
              id="memoryMessageLimit"
              type="number"
              min={1}
              max={200}
              value={memoryMessageLimitInput}
              onChange={(e) => setMemoryMessageLimitInput(e.target.value)}
              placeholder={memoryLimitPlaceholder}
            />
            <small>Number of recent messages to include when resuming runs (1-200)</small>
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
