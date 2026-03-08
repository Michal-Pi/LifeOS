/**
 * AgentBuilderModal Component
 *
 * Modal for creating and editing AI agents.
 * Features:
 * - Create new agent or edit existing
 * - Name, role, system prompt
 * - Model provider and model name selection
 * - Temperature and max tokens configuration
 * - Form validation
 */

import { useState, useEffect, useMemo } from 'react'
import { useAgentOperations } from '@/hooks/useAgentOperations'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/Select'
import {
  MODEL_OPTIONS_BY_PROVIDER,
  hashAgentConfig,
  type AgentConfig,
  type AgentRole,
  type ModelProvider,
  type ToolDefinition,
} from '@lifeos/agents'
import type { BuiltinToolMeta } from '@/agents/builtinTools'

interface AgentBuilderModalProps {
  agent: AgentConfig | null
  prefill?: Partial<AgentConfig>
  existingAgents?: AgentConfig[]
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  availableTools: Array<ToolDefinition | BuiltinToolMeta>
}

const ROLE_OPTIONS: { value: AgentRole; label: string; description: string }[] = [
  { value: 'planner', label: 'Planner', description: 'Breaks down goals into actionable steps' },
  {
    value: 'researcher',
    label: 'Researcher',
    description: 'Gathers information and analyzes data',
  },
  {
    value: 'critic',
    label: 'Critic',
    description: 'Reviews and provides constructive feedback',
  },
  {
    value: 'synthesizer',
    label: 'Synthesizer',
    description: 'Combines information into cohesive outputs',
  },
  {
    value: 'executor',
    label: 'Executor',
    description: 'Performs tasks and takes actions',
  },
  {
    value: 'supervisor',
    label: 'Supervisor',
    description: 'Delegates and coordinates work across agents',
  },
  { value: 'custom', label: 'Custom', description: 'Define your own role' },
]

const PROVIDER_OPTIONS: { value: ModelProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google Gemini' },
  { value: 'xai', label: 'Grok (xAI)' },
]

const MODEL_DEFAULTS: Record<ModelProvider, string> = {
  openai: 'gpt-5.2',
  anthropic: 'claude-sonnet-4-5',
  google: 'gemini-2.5-pro',
  xai: 'grok-4-1-fast-non-reasoning',
}

type WizardStep = 1 | 2 | 3

export function AgentBuilderModal({
  agent,
  prefill,
  existingAgents = [],
  isOpen,
  onClose,
  onSave,
  availableTools,
}: AgentBuilderModalProps) {
  const { createAgent, updateAgent } = useAgentOperations()

  const [step, setStep] = useState<WizardStep>(1)
  const [name, setName] = useState('')
  const [role, setRole] = useState<AgentRole>('planner')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [modelProvider, setModelProvider] = useState<ModelProvider>('openai')
  const [modelName, setModelName] = useState('gpt-5.2')
  const [temperature, setTemperature] = useState<number>(0.7)
  const [maxTokens, setMaxTokens] = useState<number>(2000)
  const [description, setDescription] = useState('')
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([])

  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function isStepValid(s: WizardStep): boolean {
    switch (s) {
      case 1:
        return (name ?? '').trim() !== '' && (systemPrompt ?? '').trim() !== ''
      case 2:
        return (modelName ?? '').trim() !== ''
      case 3:
        return true
    }
  }

  // Detect duplicate agents by config hash (only for create mode)
  const duplicateAgent = useMemo(() => {
    if (agent) return null // Skip in edit mode
    if (step !== 3) return null // Only check on review step
    const currentHash = hashAgentConfig({
      systemPrompt: systemPrompt ?? '',
      role,
      toolIds: selectedToolIds,
      modelProvider,
      modelName: modelName ?? '',
      temperature,
      modelTier: 'balanced',
    })
    return (
      existingAgents.find(
        (existing) => !existing.archived && existing.configHash === currentHash
      ) ?? null
    )
  }, [
    agent,
    step,
    systemPrompt,
    role,
    selectedToolIds,
    modelProvider,
    modelName,
    temperature,
    existingAgents,
  ])

  // Clean up any orphaned Radix portal elements on unmount
  useEffect(() => {
    return () => {
      document.querySelectorAll('[data-radix-popper-content-wrapper]').forEach((el) => el.remove())
    }
  }, [])

  // Reset form when modal opens/closes or agent changes
  useEffect(() => {
    if (isOpen) {
      setStep(1)
      if (agent) {
        // Edit mode — guard against missing/null Firestore fields
        setName(agent.name ?? '')
        setRole(agent.role ?? 'custom')
        setSystemPrompt(agent.systemPrompt ?? '')
        setModelProvider(agent.modelProvider ?? 'openai')
        setModelName(agent.modelName ?? MODEL_DEFAULTS[agent.modelProvider ?? 'openai'])
        setTemperature(agent.temperature ?? 0.7)
        setMaxTokens(agent.maxTokens ?? 2000)
        setDescription(agent.description ?? '')
        setSelectedToolIds(agent.toolIds ?? [])
      } else {
        // Create mode
        setName(prefill?.name ?? '')
        setRole(prefill?.role ?? 'planner')
        setSystemPrompt(prefill?.systemPrompt ?? '')
        setModelProvider(prefill?.modelProvider ?? 'openai')
        setModelName(prefill?.modelName ?? MODEL_DEFAULTS[prefill?.modelProvider ?? 'openai'])
        setTemperature(prefill?.temperature ?? 0.7)
        setMaxTokens(prefill?.maxTokens ?? 2000)
        setDescription(prefill?.description ?? '')
        setSelectedToolIds(prefill?.toolIds ?? [])
      }
      setError(null)
      setIsSaving(false)
    }
  }, [isOpen, agent, prefill])

  // Update model name when provider changes (create mode only)
  useEffect(() => {
    if (!agent && isOpen) {
      if (prefill?.modelProvider === modelProvider && prefill?.modelName) {
        setModelName(prefill.modelName)
      } else {
        setModelName(MODEL_DEFAULTS[modelProvider])
      }
    }
  }, [modelProvider, agent, isOpen, prefill])

  const handleSave = async () => {
    // Validation — guard against undefined state values from incomplete prefill/template data
    const trimmedName = (name ?? '').trim()
    const trimmedPrompt = (systemPrompt ?? '').trim()
    const trimmedModel = (modelName ?? '').trim()
    const trimmedDescription = (description ?? '').trim()

    if (!trimmedName) {
      setError('Agent name is required')
      return
    }

    if (!trimmedPrompt) {
      setError('System prompt is required')
      return
    }

    if (!trimmedModel) {
      setError('Model name is required')
      return
    }

    if (temperature < 0 || temperature > 2) {
      setError('Temperature must be between 0 and 2')
      return
    }

    if (maxTokens <= 0) {
      setError('Max tokens must be positive')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const input = {
        name: trimmedName,
        role,
        systemPrompt: trimmedPrompt,
        modelProvider,
        modelName: trimmedModel,
        temperature,
        maxTokens,
        description: trimmedDescription || undefined,
        toolIds: selectedToolIds.length > 0 ? selectedToolIds : undefined,
      }

      if (agent) {
        await updateAgent(agent.agentId, input)
      } else {
        await createAgent(input)
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

  const toggleToolSelection = (toolId: string) => {
    setSelectedToolIds((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId]
    )
  }

  const formatDate = (timestampMs: number) => {
    return new Date(timestampMs).toLocaleString()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-with-dates">
          <h2>{agent ? 'Edit Agent' : 'Create Agent'}</h2>
          {agent && (
            <div className="agent-modal-dates">
              <small>Created: {formatDate(agent.createdAtMs)}</small>
              <small>Updated: {formatDate(agent.updatedAtMs)}</small>
            </div>
          )}
        </div>

        {/* Step indicator */}
        <div className="wizard-steps">
          {([1, 2, 3] as WizardStep[]).map((s) => (
            <div
              key={s}
              className={`wizard-step ${s === step ? 'wizard-step--active' : ''} ${s < step ? 'wizard-step--completed' : ''}`}
            >
              <span className="wizard-step__number">{s < step ? '\u2713' : s}</span>
              <span className="wizard-step__label">
                {s === 1 ? 'Basics' : s === 2 ? 'Model & Tools' : 'Review'}
              </span>
            </div>
          ))}
        </div>

        {error && <div className="error-message">{error}</div>}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (step < 3) {
              setStep((step + 1) as WizardStep)
            } else {
              void handleSave()
            }
          }}
        >
          {/* Step 1: Basics */}
          {step === 1 && (
            <>
              <div className="form-group">
                <label htmlFor="name">Agent Name *</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Workout Planner"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="role">Role *</label>
                <Select
                  id="role"
                  value={role}
                  onChange={(value) => setRole(value as AgentRole)}
                  options={ROLE_OPTIONS.map((option) => ({
                    value: option.value,
                    label: `${option.label} - ${option.description}`,
                  }))}
                />
              </div>

              <div className="form-group">
                <label htmlFor="systemPrompt">System Prompt *</label>
                <textarea
                  id="systemPrompt"
                  className="system-prompt-textarea"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="You are a helpful assistant that..."
                  rows={6}
                  required
                />
                <small>Defines the agent's behavior and personality</small>
              </div>

              <div className="form-group">
                <label htmlFor="description">Description (optional)</label>
                <input
                  id="description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of what this agent does"
                />
              </div>
            </>
          )}

          {/* Step 2: Model & Tools */}
          {step === 2 && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="provider">AI Provider *</label>
                  <Select
                    id="provider"
                    value={modelProvider}
                    onChange={(value) => setModelProvider(value as ModelProvider)}
                    options={PROVIDER_OPTIONS}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="modelName">Model Name *</label>
                  <Select
                    id="modelName"
                    value={modelName}
                    onChange={(value) => setModelName(value)}
                    options={MODEL_OPTIONS_BY_PROVIDER[modelProvider]}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="temperature">Temperature: {temperature.toFixed(2)}</label>
                  <input
                    id="temperature"
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  />
                  <small>Lower = more focused, Higher = more creative</small>
                </div>

                <div className="form-group">
                  <label htmlFor="maxTokens">Max Tokens</label>
                  <input
                    id="maxTokens"
                    type="number"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                    min="100"
                    max="32000"
                    step="100"
                  />
                  <small>Maximum response length</small>
                </div>
              </div>

              <div className="form-group">
                <label>Tools (optional)</label>
                {availableTools.length === 0 ? (
                  <p className="form-helper">No tools available yet.</p>
                ) : (
                  <div className="tool-checkbox-list">
                    {availableTools.map((tool) => {
                      const toolId = tool.toolId
                      const description = tool.description
                      return (
                        <label key={toolId} className="tool-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedToolIds.includes(toolId)}
                            onChange={() => toggleToolSelection(toolId)}
                          />
                          <span>
                            <strong>{tool.name}</strong>
                            {description && (
                              <span className="tool-description"> — {description}</span>
                            )}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
                <small>Select which tools this agent can call</small>
              </div>
            </>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="wizard-review">
              {duplicateAgent && (
                <div className="wizard-review__duplicate-warning">
                  <strong>Duplicate detected:</strong> An agent with an identical configuration
                  already exists: &ldquo;{duplicateAgent.name}&rdquo;. Consider reusing the existing
                  agent instead of creating a duplicate.
                </div>
              )}
              <div className="wizard-review__section">
                <h4>Basics</h4>
                <div className="wizard-review__row">
                  <span className="wizard-review__label">Name</span>
                  <span>{name}</span>
                </div>
                <div className="wizard-review__row">
                  <span className="wizard-review__label">Role</span>
                  <span className="badge">{role}</span>
                </div>
                <div className="wizard-review__row">
                  <span className="wizard-review__label">System Prompt</span>
                  <span className="wizard-review__prompt">{systemPrompt}</span>
                </div>
                {description && (
                  <div className="wizard-review__row">
                    <span className="wizard-review__label">Description</span>
                    <span>{description}</span>
                  </div>
                )}
              </div>

              <div className="wizard-review__section">
                <h4>Model & Tools</h4>
                <div className="wizard-review__row">
                  <span className="wizard-review__label">Provider</span>
                  <span>{modelProvider}</span>
                </div>
                <div className="wizard-review__row">
                  <span className="wizard-review__label">Model</span>
                  <span>{modelName}</span>
                </div>
                <div className="wizard-review__row">
                  <span className="wizard-review__label">Temperature</span>
                  <span>{temperature.toFixed(2)}</span>
                </div>
                <div className="wizard-review__row">
                  <span className="wizard-review__label">Max Tokens</span>
                  <span>{maxTokens}</span>
                </div>
                <div className="wizard-review__row">
                  <span className="wizard-review__label">Tools</span>
                  <span>
                    {selectedToolIds.length > 0 ? selectedToolIds.length + ' selected' : 'None'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Wizard navigation */}
          <div className="wizard-nav">
            {step > 1 && (
              <Button
                variant="ghost"
                type="button"
                onClick={() => setStep((step - 1) as WizardStep)}
              >
                Back
              </Button>
            )}
            <div style={{ flex: 1 }} />
            <Button variant="ghost" type="button" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            {step < 3 ? (
              <Button type="submit" disabled={!isStepValid(step)}>
                Next
              </Button>
            ) : (
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : agent ? 'Save Changes' : 'Create Agent'}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
