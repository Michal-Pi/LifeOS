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

import { useState, useEffect } from 'react'
import { useAgentOperations } from '@/hooks/useAgentOperations'
import type { AgentConfig, AgentRole, ModelProvider, ToolDefinition } from '@lifeos/agents'
import type { BuiltinToolMeta } from '@/agents/builtinTools'

interface AgentBuilderModalProps {
  agent: AgentConfig | null
  prefill?: Partial<AgentConfig>
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
  { value: 'custom', label: 'Custom', description: 'Define your own role' },
]

const PROVIDER_OPTIONS: { value: ModelProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google Gemini' },
  { value: 'xai', label: 'Grok (xAI)' },
]

const MODEL_DEFAULTS: Record<ModelProvider, string> = {
  openai: 'gpt-4',
  anthropic: 'claude-3-5-sonnet-20241022',
  google: 'gemini-pro',
  xai: 'grok-1',
}

export function AgentBuilderModal({
  agent,
  prefill,
  isOpen,
  onClose,
  onSave,
  availableTools,
}: AgentBuilderModalProps) {
  const { createAgent, updateAgent } = useAgentOperations()

  const [name, setName] = useState('')
  const [role, setRole] = useState<AgentRole>('planner')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [modelProvider, setModelProvider] = useState<ModelProvider>('openai')
  const [modelName, setModelName] = useState('gpt-4')
  const [temperature, setTemperature] = useState<number>(0.7)
  const [maxTokens, setMaxTokens] = useState<number>(2000)
  const [description, setDescription] = useState('')
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([])

  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when modal opens/closes or agent changes
  useEffect(() => {
    if (isOpen) {
      if (agent) {
        // Edit mode
        setName(agent.name)
        setRole(agent.role)
        setSystemPrompt(agent.systemPrompt)
        setModelProvider(agent.modelProvider)
        setModelName(agent.modelName)
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
    // Validation
    if (!name.trim()) {
      setError('Agent name is required')
      return
    }

    if (!systemPrompt.trim()) {
      setError('System prompt is required')
      return
    }

    if (!modelName.trim()) {
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
        name: name.trim(),
        role,
        systemPrompt: systemPrompt.trim(),
        modelProvider,
        modelName: modelName.trim(),
        temperature,
        maxTokens,
        description: description.trim() || undefined,
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>{agent ? 'Edit Agent' : 'Create Agent'}</h2>

        {error && <div className="error-message">{error}</div>}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSave()
          }}
        >
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
            <select id="role" value={role} onChange={(e) => setRole(e.target.value as AgentRole)}>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} - {option.description}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="systemPrompt">System Prompt *</label>
            <textarea
              id="systemPrompt"
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
                        {description && <span className="tool-description"> — {description}</span>}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
            <small>Select which tools this agent can call</small>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="provider">AI Provider *</label>
              <select
                id="provider"
                value={modelProvider}
                onChange={(e) => setModelProvider(e.target.value as ModelProvider)}
              >
                {PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="modelName">Model Name *</label>
              <input
                id="modelName"
                type="text"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="e.g., gpt-4"
                required
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

          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : agent ? 'Update Agent' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
