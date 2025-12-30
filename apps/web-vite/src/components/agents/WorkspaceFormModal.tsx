/**
 * WorkspaceFormModal Component
 *
 * Modal for creating and editing AI agent workspaces.
 * Features:
 * - Create new workspace or edit existing
 * - Name and description
 * - Select agents to include
 * - Set default agent
 * - Configure workflow type
 * - Set max iterations
 * - Form validation
 */

import { useState, useEffect } from 'react'
import { useWorkspaceOperations } from '@/hooks/useWorkspaceOperations'
import { useAgentOperations } from '@/hooks/useAgentOperations'
import type { Workspace, WorkflowType, AgentId } from '@lifeos/agents'

interface WorkspaceFormModalProps {
  workspace: Workspace | null
  isOpen: boolean
  onClose: () => void
  onSave: () => void
}

const WORKFLOW_OPTIONS: { value: WorkflowType; label: string; description: string }[] = [
  {
    value: 'sequential',
    label: 'Sequential',
    description: 'Agents work one after another in order',
  },
  { value: 'parallel', label: 'Parallel', description: 'Agents work simultaneously' },
  {
    value: 'supervisor',
    label: 'Supervisor',
    description: 'One agent routes tasks to others',
  },
  { value: 'custom', label: 'Custom', description: 'Define your own workflow' },
]

export function WorkspaceFormModal({
  workspace,
  isOpen,
  onClose,
  onSave,
}: WorkspaceFormModalProps) {
  const { createWorkspace, updateWorkspace } = useWorkspaceOperations()
  const { agents, loadAgents } = useAgentOperations()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedAgentIds, setSelectedAgentIds] = useState<AgentId[]>([])
  const [defaultAgentId, setDefaultAgentId] = useState<AgentId | undefined>(undefined)
  const [workflowType, setWorkflowType] = useState<WorkflowType>('sequential')
  const [maxIterations, setMaxIterations] = useState<number>(10)
  const [memoryMessageLimitInput, setMemoryMessageLimitInput] = useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load agents on mount
  useEffect(() => {
    if (isOpen) {
      void loadAgents()
    }
  }, [isOpen, loadAgents])

  // Reset form when modal opens/closes or workspace changes
  useEffect(() => {
    if (isOpen) {
      if (workspace) {
        // Edit mode
        setName(workspace.name)
        setDescription(workspace.description ?? '')
        setSelectedAgentIds(workspace.agentIds)
        setDefaultAgentId(workspace.defaultAgentId)
        setWorkflowType(workspace.workflowType)
        setMaxIterations(workspace.maxIterations ?? 10)
        setMemoryMessageLimitInput(
          workspace.memoryMessageLimit ? String(workspace.memoryMessageLimit) : ''
        )
      } else {
        // Create mode
        setName('')
        setDescription('')
        setSelectedAgentIds([])
        setDefaultAgentId(undefined)
        setWorkflowType('sequential')
        setMaxIterations(10)
        setMemoryMessageLimitInput('')
      }
      setError(null)
    }
  }, [isOpen, workspace])

  const handleAgentToggle = (agentId: AgentId) => {
    setSelectedAgentIds((prev) => {
      const isSelected = prev.includes(agentId)
      if (isSelected) {
        // Deselecting - clear default if it's this agent
        if (defaultAgentId === agentId) {
          setDefaultAgentId(undefined)
        }
        return prev.filter((id) => id !== agentId)
      } else {
        // Selecting - set as default if it's the first one
        const newList = [...prev, agentId]
        if (newList.length === 1) {
          setDefaultAgentId(agentId)
        }
        return newList
      }
    })
  }

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      setError('Workspace name is required')
      return
    }

    if (selectedAgentIds.length === 0) {
      setError('At least one agent must be selected')
      return
    }

    if (defaultAgentId && !selectedAgentIds.includes(defaultAgentId)) {
      setError('Default agent must be in the selected agents list')
      return
    }

    if (maxIterations < 1 || maxIterations > 50) {
      setError('Max iterations must be between 1 and 50')
      return
    }

    const memoryMessageLimit = memoryMessageLimitInput
      ? Number.parseInt(memoryMessageLimitInput, 10)
      : undefined

    if (
      memoryMessageLimitInput &&
      (Number.isNaN(memoryMessageLimit) || memoryMessageLimit <= 0 || memoryMessageLimit > 200)
    ) {
      setError('Memory message limit must be between 1 and 200')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const input = {
        name: name.trim(),
        description: description.trim() || undefined,
        agentIds: selectedAgentIds,
        defaultAgentId,
        workflowType,
        maxIterations,
        memoryMessageLimit,
      }

      if (workspace) {
        await updateWorkspace(workspace.workspaceId, input)
      } else {
        await createWorkspace(input)
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

  // Filter active agents only
  const activeAgents = agents.filter((agent) => !agent.archived)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>{workspace ? 'Edit Workspace' : 'Create Workspace'}</h2>

        {error && <div className="error-message">{error}</div>}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSave()
          }}
        >
          <div className="form-group">
            <label htmlFor="name">Workspace Name *</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Fitness Assistant"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description (optional)</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this workspace do?"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>Select Agents *</label>
            {activeAgents.length === 0 ? (
              <div className="empty-state">
                <p>No agents available. Create an agent first.</p>
              </div>
            ) : (
              <div className="agent-selection">
                {activeAgents.map((agent) => (
                  <div key={agent.agentId} className="agent-checkbox">
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedAgentIds.includes(agent.agentId)}
                        onChange={() => handleAgentToggle(agent.agentId)}
                      />
                      <span className="agent-info">
                        <strong>{agent.name}</strong>
                        <span className="badge">{agent.role}</span>
                        {agent.description && <small>{agent.description}</small>}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedAgentIds.length > 0 && (
            <div className="form-group">
              <label htmlFor="defaultAgent">Default Agent (optional)</label>
              <select
                id="defaultAgent"
                value={defaultAgentId ?? ''}
                onChange={(e) => setDefaultAgentId((e.target.value as AgentId) || undefined)}
              >
                <option value="">None</option>
                {activeAgents
                  .filter((agent) => selectedAgentIds.includes(agent.agentId))
                  .map((agent) => (
                    <option key={agent.agentId} value={agent.agentId}>
                      {agent.name}
                    </option>
                  ))}
              </select>
              <small>The first agent to handle incoming requests</small>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="workflowType">Workflow Type *</label>
            <select
              id="workflowType"
              value={workflowType}
              onChange={(e) => setWorkflowType(e.target.value as WorkflowType)}
            >
              {WORKFLOW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} - {option.description}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="maxIterations">Max Iterations: {maxIterations}</label>
            <input
              id="maxIterations"
              type="range"
              min="1"
              max="50"
              step="1"
              value={maxIterations}
              onChange={(e) => setMaxIterations(parseInt(e.target.value))}
            />
            <small>Maximum number of agent interactions per run (prevents infinite loops)</small>
          </div>

          <div className="form-group">
            <label htmlFor="memoryMessageLimit">Default Message Window (optional)</label>
            <input
              id="memoryMessageLimit"
              type="number"
              min={1}
              max={200}
              value={memoryMessageLimitInput}
              onChange={(e) => setMemoryMessageLimitInput(e.target.value)}
              placeholder="Use global default"
            />
            <small>
              Number of recent messages to include when resuming runs (1-200). Overrides the global
              default.
            </small>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" disabled={isSaving || activeAgents.length === 0}>
              {isSaving ? 'Saving...' : workspace ? 'Update Workspace' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
