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
import { useNavigate } from 'react-router-dom'
import { useAiProviderKeys } from '@/hooks/useAiProviderKeys'
import { useWorkspaceOperations } from '@/hooks/useWorkspaceOperations'
import { Button } from '@/components/ui/button'
import type { AgentConfig, ExecutionMode, Workspace, CreateRunInput } from '@lifeos/agents'
import { useAuth } from '@/hooks/useAuth'
import { useDeepResearch } from '@/hooks/useDeepResearch'
import { ExpertCouncilModeSelector } from './ExpertCouncilModeSelector'
import { ResearchQueueSidebar } from './ResearchQueueSidebar'
import { TipTapEditor } from '@/components/editor/TipTapEditor'
import type { JSONContent } from '@tiptap/react'

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
  const navigate = useNavigate()
  const { keys } = useAiProviderKeys(user?.uid)
  const memoryLimitPlaceholder = workspace?.memoryMessageLimit
    ? `Workspace default: ${workspace.memoryMessageLimit}`
    : 'Use workspace/global default'

  const [goal, setGoal] = useState('')
  const [inputMode, setInputMode] = useState<'simple' | 'rich'>('simple')
  const [richContent, setRichContent] = useState<JSONContent>({ type: 'doc', content: [] })
  const [contextInput, setContextInput] = useState('')
  const [memoryMessageLimitInput, setMemoryMessageLimitInput] = useState('')
  const [expertCouncilMode, setExpertCouncilMode] = useState<ExecutionMode>('full')
  const [showResearchQueue, setShowResearchQueue] = useState(false)

  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { requests } = useDeepResearch(isOpen ? (workspace?.workspaceId ?? null) : null)
  const resumeRunId =
    initialContext && typeof initialContext === 'object'
      ? (initialContext as { resumeRunId?: string }).resumeRunId
      : undefined
  const runRequests = useMemo(() => {
    if (!resumeRunId) return []
    return requests.filter((request) => request.runId === resumeRunId)
  }, [requests, resumeRunId])

  const missingProviders = useMemo(() => {
    if (!workspace) return []
    const providers = new Set<string>()

    if (workspace.expertCouncilConfig?.enabled) {
      workspace.expertCouncilConfig.councilModels.forEach((model) => providers.add(model.provider))
      workspace.expertCouncilConfig.judgeModels?.forEach((model) => providers.add(model.provider))
      providers.add(workspace.expertCouncilConfig.chairmanModel.provider)
    } else {
      agents
        .filter((agent) => workspace.agentIds.includes(agent.agentId))
        .forEach((agent) => providers.add(agent.modelProvider))
    }

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
      setInputMode('simple')
      setRichContent({ type: 'doc', content: [] })
      setContextInput(initialContext ? JSON.stringify(initialContext, null, 2) : '')
      setMemoryMessageLimitInput('')
      setExpertCouncilMode(workspace?.expertCouncilConfig?.defaultMode ?? 'full')
      setError(null)
    }
  }, [initialContext, initialGoal, isOpen, workspace])

  const handleStart = async () => {
    // Get goal text based on input mode
    let goalText = ''
    if (inputMode === 'simple') {
      goalText = goal.trim()
    } else {
      // Convert rich content to plain text
      const extractText = (content: JSONContent): string => {
        if (!content) return ''
        if (content.text) return content.text
        if (content.content) {
          return content.content.map(extractText).join(' ')
        }
        return ''
      }
      goalText = extractText(richContent).trim()
    }

    // Validation
    if (!goalText) {
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

      const councilConfig = workspace.expertCouncilConfig
      if (councilConfig?.enabled && councilConfig.allowModeOverride) {
        context = { ...(context ?? {}), expertCouncilMode }
      }

      // Build run input, only include memoryMessageLimit if it's defined
      const runInput: CreateRunInput = {
        workspaceId: workspace.workspaceId,
        goal: goalText,
        context,
      }

      if (memoryMessageLimit !== undefined) {
        runInput.memoryMessageLimit = memoryMessageLimit
      }

      await createRun(runInput)

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
        <div className="run-modal-layout">
          <div className="run-modal-main">
            <div className="modal-header">
              <div>
                <h2>Start New Run</h2>
                <p className="workspace-name">
                  Workspace: <strong>{workspace.name}</strong>
                </p>
              </div>
              {resumeRunId && runRequests.length > 0 && (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setShowResearchQueue((prev) => !prev)}
                >
                  {showResearchQueue ? 'Hide' : 'Show'} Research ({runRequests.length})
                </Button>
              )}
            </div>

            {resumeRunId && (
              <div className="info-message">
                This run will include conversation history from run {resumeRunId}.
              </div>
            )}

            {error && <div className="error-message">{error}</div>}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleStart()
              }}
            >
              {workspace.expertCouncilConfig?.enabled &&
                workspace.expertCouncilConfig.allowModeOverride && (
                  <ExpertCouncilModeSelector
                    config={workspace.expertCouncilConfig}
                    initialMode={expertCouncilMode}
                    onSelect={setExpertCouncilMode}
                  />
                )}
              <div className="form-group">
                <div className="form-label-with-toggle">
                  <label htmlFor="goal">Goal *</label>
                  <div className="input-mode-toggle">
                    <button
                      type="button"
                      className={`toggle-btn ${inputMode === 'simple' ? 'active' : ''}`}
                      onClick={() => setInputMode('simple')}
                    >
                      Simple Text
                    </button>
                    <button
                      type="button"
                      className={`toggle-btn ${inputMode === 'rich' ? 'active' : ''}`}
                      onClick={() => setInputMode('rich')}
                    >
                      Rich Editor
                    </button>
                  </div>
                </div>
                {inputMode === 'simple' ? (
                  <textarea
                    id="goal"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="What do you want the workspace to accomplish?"
                    rows={4}
                    required
                  />
                ) : (
                  <div className="rich-editor-container">
                    <TipTapEditor
                      content={richContent}
                      onChange={setRichContent}
                      placeholder="What do you want the workspace to accomplish?"
                      editable={true}
                    />
                  </div>
                )}
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
                <small>
                  Number of recent messages to include when resuming runs (1-200). Overrides
                  workspace and global defaults.
                </small>
              </div>

              <div className="modal-actions">
                <Button variant="ghost" type="button" onClick={onClose} disabled={isCreating}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? 'Starting...' : 'Start Run'}
                </Button>
              </div>
            </form>
          </div>

          {showResearchQueue && resumeRunId && (
            <ResearchQueueSidebar
              workspaceId={workspace.workspaceId}
              runId={resumeRunId}
              onOpenFullQueue={() => {
                navigate(`/agents/research?workspaceId=${workspace.workspaceId}`)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
