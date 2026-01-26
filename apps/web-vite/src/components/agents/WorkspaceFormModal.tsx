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
import { usePromptLibrary } from '@/hooks/usePromptLibrary'
import { useAuth } from '@/hooks/useAuth'
import { ProjectManagerConfig as ProjectManagerConfigForm } from './ProjectManagerConfig'
import { PromptSelector } from './PromptSelector'
import { PromptEditor } from './PromptEditor'
import type {
  Workspace,
  WorkflowType,
  AgentId,
  ExpertCouncilConfig,
  ExecutionMode,
  ModelProvider,
  ProjectManagerConfig,
  PromptReference,
  PromptTemplate,
} from '@lifeos/agents'

interface WorkspaceFormModalProps {
  workspace: Workspace | null
  prefill?: Partial<Workspace>
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
  {
    value: 'graph',
    label: 'Graph',
    description: 'Advanced workflow with branching and joins',
  },
  { value: 'custom', label: 'Custom', description: 'Define your own workflow' },
]

const EXECUTION_MODE_OPTIONS: {
  value: ExecutionMode
  label: string
  description: string
}[] = [
  {
    value: 'full',
    label: 'Full',
    description: 'All 3 stages with peer review',
  },
  {
    value: 'quick',
    label: 'Quick',
    description: 'Skip peer review for faster output',
  },
  {
    value: 'single',
    label: 'Single',
    description: 'Only gather council responses',
  },
  {
    value: 'custom',
    label: 'Custom',
    description: 'Choose stages per execution',
  },
]

const PROVIDER_OPTIONS: { value: ModelProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'xai', label: 'xAI' },
]

const createDefaultCouncilModel = (
  index: number
): ExpertCouncilConfig['councilModels'][number] => ({
  modelId: `council-${index + 1}`,
  provider: 'openai',
  modelName: 'gpt-4',
  temperature: 0.7,
})

const DEFAULT_PROJECT_MANAGER_CONFIG: ProjectManagerConfig = {
  enabled: false,
  questioningDepth: 'standard',
  autoUseExpertCouncil: false,
  expertCouncilThreshold: 60,
  qualityGateThreshold: 70,
  requireAssumptionValidation: true,
  enableConflictDetection: true,
  enableUserProfiling: true,
}

export function WorkspaceFormModal({
  workspace,
  prefill,
  isOpen,
  onClose,
  onSave,
}: WorkspaceFormModalProps) {
  const { createWorkspace, updateWorkspace } = useWorkspaceOperations()
  const { agents, loadAgents } = useAgentOperations()
  const { templates: promptTemplates } = usePromptLibrary()
  const { user } = useAuth()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedAgentIds, setSelectedAgentIds] = useState<AgentId[]>([])
  const [defaultAgentId, setDefaultAgentId] = useState<AgentId | undefined>(undefined)
  const [workflowType, setWorkflowType] = useState<WorkflowType>('sequential')
  const [maxIterations, setMaxIterations] = useState<number>(10)
  const [memoryMessageLimitInput, setMemoryMessageLimitInput] = useState('')
  const [workflowGraphInput, setWorkflowGraphInput] = useState('')
  const [executionModeChoice, setExecutionModeChoice] = useState<'workflow' | 'expert_council'>(
    'workflow'
  )
  const [expertCouncilEnabled, setExpertCouncilEnabled] = useState(false)
  const [expertCouncilDefaultMode, setExpertCouncilDefaultMode] = useState<ExecutionMode>('full')
  const [expertCouncilAllowModeOverride, setExpertCouncilAllowModeOverride] = useState(true)
  const [expertCouncilCouncilModels, setExpertCouncilCouncilModels] = useState<
    ExpertCouncilConfig['councilModels']
  >([])
  const [expertCouncilChairmanModel, setExpertCouncilChairmanModel] = useState<
    ExpertCouncilConfig['chairmanModel']
  >({
    modelId: 'chairman-1',
    provider: 'openai',
    modelName: 'gpt-4',
    temperature: 0.2,
  })
  const [expertCouncilSelfExclusionEnabled, setExpertCouncilSelfExclusionEnabled] = useState(true)
  const [expertCouncilMinCouncilSizeInput, setExpertCouncilMinCouncilSizeInput] = useState('2')
  const [expertCouncilMaxCouncilSizeInput, setExpertCouncilMaxCouncilSizeInput] = useState('10')
  const [expertCouncilConsensusThresholdInput, setExpertCouncilConsensusThresholdInput] =
    useState('')
  const [expertCouncilMaxCostInput, setExpertCouncilMaxCostInput] = useState('')
  const [expertCouncilCachingEnabled, setExpertCouncilCachingEnabled] = useState(true)
  const [expertCouncilCacheHoursInput, setExpertCouncilCacheHoursInput] = useState('24')
  const [projectManagerConfig, setProjectManagerConfig] = useState<ProjectManagerConfig>(
    DEFAULT_PROJECT_MANAGER_CONFIG
  )
  const [promptConfig, setPromptConfig] = useState<Workspace['promptConfig']>()
  const [promptEditorTemplate, setPromptEditorTemplate] = useState<PromptTemplate | null>(null)

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
        setWorkflowGraphInput(
          workspace.workflowGraph ? JSON.stringify(workspace.workflowGraph, null, 2) : ''
        )
        const councilConfig = workspace.expertCouncilConfig
        const pmConfig = workspace.projectManagerConfig ?? DEFAULT_PROJECT_MANAGER_CONFIG
        if (councilConfig) {
          setExpertCouncilEnabled(councilConfig.enabled)
          setExecutionModeChoice(councilConfig.enabled ? 'expert_council' : 'workflow')
          setExpertCouncilDefaultMode(councilConfig.defaultMode)
          setExpertCouncilAllowModeOverride(councilConfig.allowModeOverride)
          setExpertCouncilCouncilModels(councilConfig.councilModels)
          setExpertCouncilChairmanModel(councilConfig.chairmanModel)
          setExpertCouncilSelfExclusionEnabled(councilConfig.selfExclusionEnabled)
          setExpertCouncilMinCouncilSizeInput(String(councilConfig.minCouncilSize))
          setExpertCouncilMaxCouncilSizeInput(String(councilConfig.maxCouncilSize))
          setExpertCouncilConsensusThresholdInput(
            councilConfig.requireConsensusThreshold !== undefined
              ? String(councilConfig.requireConsensusThreshold)
              : ''
          )
          setExpertCouncilMaxCostInput(
            councilConfig.maxCostPerTurn !== undefined ? String(councilConfig.maxCostPerTurn) : ''
          )
          setExpertCouncilCachingEnabled(councilConfig.enableCaching)
          setExpertCouncilCacheHoursInput(String(councilConfig.cacheExpirationHours))
        } else {
          setExpertCouncilEnabled(false)
          setExecutionModeChoice('workflow')
          setExpertCouncilDefaultMode('full')
          setExpertCouncilAllowModeOverride(true)
          setExpertCouncilCouncilModels([
            createDefaultCouncilModel(0),
            createDefaultCouncilModel(1),
          ])
          setExpertCouncilChairmanModel({
            modelId: 'chairman-1',
            provider: 'openai',
            modelName: 'gpt-4',
            temperature: 0.2,
          })
          setExpertCouncilSelfExclusionEnabled(true)
          setExpertCouncilMinCouncilSizeInput('2')
          setExpertCouncilMaxCouncilSizeInput('10')
          setExpertCouncilConsensusThresholdInput('')
          setExpertCouncilMaxCostInput('')
          setExpertCouncilCachingEnabled(true)
          setExpertCouncilCacheHoursInput('24')
        }
        setProjectManagerConfig(pmConfig)
        setPromptConfig(workspace.promptConfig)
      } else {
        // Create mode
        setName(prefill?.name ?? '')
        setDescription(prefill?.description ?? '')
        setSelectedAgentIds(prefill?.agentIds ?? [])
        setDefaultAgentId(prefill?.defaultAgentId)
        setWorkflowType(prefill?.workflowType ?? 'sequential')
        setMaxIterations(prefill?.maxIterations ?? 10)
        setMemoryMessageLimitInput(
          prefill?.memoryMessageLimit ? String(prefill.memoryMessageLimit) : ''
        )
        setWorkflowGraphInput(
          prefill?.workflowGraph ? JSON.stringify(prefill.workflowGraph, null, 2) : ''
        )
        const councilConfig = prefill?.expertCouncilConfig
        const pmConfig = prefill?.projectManagerConfig ?? DEFAULT_PROJECT_MANAGER_CONFIG
        if (councilConfig) {
          setExpertCouncilEnabled(councilConfig.enabled)
          setExecutionModeChoice(councilConfig.enabled ? 'expert_council' : 'workflow')
          setExpertCouncilDefaultMode(councilConfig.defaultMode)
          setExpertCouncilAllowModeOverride(councilConfig.allowModeOverride)
          setExpertCouncilCouncilModels(councilConfig.councilModels)
          setExpertCouncilChairmanModel(councilConfig.chairmanModel)
          setExpertCouncilSelfExclusionEnabled(councilConfig.selfExclusionEnabled)
          setExpertCouncilMinCouncilSizeInput(String(councilConfig.minCouncilSize))
          setExpertCouncilMaxCouncilSizeInput(String(councilConfig.maxCouncilSize))
          setExpertCouncilConsensusThresholdInput(
            councilConfig.requireConsensusThreshold !== undefined
              ? String(councilConfig.requireConsensusThreshold)
              : ''
          )
          setExpertCouncilMaxCostInput(
            councilConfig.maxCostPerTurn !== undefined ? String(councilConfig.maxCostPerTurn) : ''
          )
          setExpertCouncilCachingEnabled(councilConfig.enableCaching)
          setExpertCouncilCacheHoursInput(String(councilConfig.cacheExpirationHours))
        } else {
          setExpertCouncilEnabled(false)
          setExecutionModeChoice('workflow')
          setExpertCouncilDefaultMode('full')
          setExpertCouncilAllowModeOverride(true)
          setExpertCouncilCouncilModels([
            createDefaultCouncilModel(0),
            createDefaultCouncilModel(1),
          ])
          setExpertCouncilChairmanModel({
            modelId: 'chairman-1',
            provider: 'openai',
            modelName: 'gpt-4',
            temperature: 0.2,
          })
          setExpertCouncilSelfExclusionEnabled(true)
          setExpertCouncilMinCouncilSizeInput('2')
          setExpertCouncilMaxCouncilSizeInput('10')
          setExpertCouncilConsensusThresholdInput('')
          setExpertCouncilMaxCostInput('')
          setExpertCouncilCachingEnabled(true)
          setExpertCouncilCacheHoursInput('24')
        }
        setProjectManagerConfig(pmConfig)
        setPromptConfig(prefill?.promptConfig)
      }
      setError(null)
    }
  }, [isOpen, workspace, prefill])

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

  const updateAgentPrompt = (agentId: string, reference: PromptReference) => {
    setPromptConfig((prev) => ({
      ...prev,
      agentPrompts: {
        ...(prev?.agentPrompts ?? {}),
        [agentId]: reference,
      },
    }))
  }

  const updateSynthesisPrompt = (key: string, reference: PromptReference) => {
    setPromptConfig((prev) => ({
      ...prev,
      synthesisPrompts: {
        ...(prev?.synthesisPrompts ?? {}),
        [key]: reference,
      },
    }))
  }

  const handleEditPromptTemplate = (template: PromptTemplate) => {
    setPromptEditorTemplate(template)
  }

  const handleCouncilModelChange = (
    index: number,
    updates: Partial<ExpertCouncilConfig['councilModels'][number]>
  ) => {
    setExpertCouncilCouncilModels((prev) =>
      prev.map((model, modelIndex) => (modelIndex === index ? { ...model, ...updates } : model))
    )
  }

  const handleCouncilModelRemove = (index: number) => {
    setExpertCouncilCouncilModels((prev) => prev.filter((_, modelIndex) => modelIndex !== index))
  }

  const handleCouncilModelAdd = () => {
    setExpertCouncilCouncilModels((prev) => [...prev, createDefaultCouncilModel(prev.length)])
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

    const expertCouncilMinCouncilSize = Number.parseInt(expertCouncilMinCouncilSizeInput, 10)
    const expertCouncilMaxCouncilSize = Number.parseInt(expertCouncilMaxCouncilSizeInput, 10)
    const expertCouncilCacheHours = Number.parseInt(expertCouncilCacheHoursInput, 10)

    if (expertCouncilEnabled) {
      if (Number.isNaN(expertCouncilMinCouncilSize) || expertCouncilMinCouncilSize < 2) {
        setError('Expert Council minimum size must be at least 2')
        return
      }

      if (
        Number.isNaN(expertCouncilMaxCouncilSize) ||
        expertCouncilMaxCouncilSize < expertCouncilMinCouncilSize
      ) {
        setError('Expert Council maximum size must be greater than or equal to minimum size')
        return
      }

      if (expertCouncilCouncilModels.length < expertCouncilMinCouncilSize) {
        setError('Add more council models to meet the minimum size')
        return
      }

      if (expertCouncilCouncilModels.length > expertCouncilMaxCouncilSize) {
        setError('Reduce council models to stay within the maximum size')
        return
      }

      if (
        expertCouncilCouncilModels.some((model) => !model.modelId.trim() || !model.modelName.trim())
      ) {
        setError('Each council model needs a model ID and name')
        return
      }

      if (
        !expertCouncilChairmanModel.modelId.trim() ||
        !expertCouncilChairmanModel.modelName.trim()
      ) {
        setError('Chairman model requires a model ID and name')
        return
      }

      if (Number.isNaN(expertCouncilCacheHours) || expertCouncilCacheHours <= 0) {
        setError('Expert Council cache expiration must be a positive number of hours')
        return
      }
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

    const expertCouncilConsensusThreshold = expertCouncilConsensusThresholdInput
      ? Number.parseInt(expertCouncilConsensusThresholdInput, 10)
      : undefined

    if (
      expertCouncilConsensusThresholdInput &&
      (Number.isNaN(expertCouncilConsensusThreshold) ||
        expertCouncilConsensusThreshold < 0 ||
        expertCouncilConsensusThreshold > 100)
    ) {
      setError('Expert Council consensus threshold must be between 0 and 100')
      return
    }

    const expertCouncilMaxCost = expertCouncilMaxCostInput
      ? Number.parseFloat(expertCouncilMaxCostInput)
      : undefined

    if (
      expertCouncilMaxCostInput &&
      (Number.isNaN(expertCouncilMaxCost) || expertCouncilMaxCost < 0)
    ) {
      setError('Expert Council max cost must be a positive number')
      return
    }

    if (promptConfig) {
      const templateIds = new Set(promptTemplates.map((template) => template.templateId))
      const missingTemplateIds: string[] = []
      const validateReference = (reference?: PromptReference) => {
        if (reference?.type !== 'shared') return
        if (!reference.templateId) return
        if (!templateIds.has(reference.templateId)) {
          missingTemplateIds.push(reference.templateId)
        }
      }

      Object.values(promptConfig.agentPrompts ?? {}).forEach(validateReference)
      validateReference(promptConfig.toneOfVoicePrompt)
      Object.values(promptConfig.synthesisPrompts ?? {}).forEach(validateReference)
      Object.values(promptConfig.workflowPrompts ?? {}).forEach(validateReference)
      Object.values(promptConfig.toolPrompts ?? {}).forEach(validateReference)

      if (missingTemplateIds.length > 0) {
        setError(
          `Missing prompt templates: ${[...new Set(missingTemplateIds)].join(', ')}`
        )
        return
      }
    }

    let workflowGraph: Workspace['workflowGraph'] | undefined
    if (workflowType === 'graph') {
      if (!workflowGraphInput.trim()) {
        setError('Workflow graph JSON is required for graph workflows')
        return
      }
      try {
        workflowGraph = JSON.parse(workflowGraphInput) as Workspace['workflowGraph']
      } catch {
        setError('Workflow graph JSON is invalid')
        return
      }
    }

    setIsSaving(true)
    setError(null)

    try {
      const expertCouncilConfig: ExpertCouncilConfig | undefined = expertCouncilEnabled
        ? {
            enabled: true,
            defaultMode: expertCouncilDefaultMode,
            allowModeOverride: expertCouncilAllowModeOverride,
            councilModels: expertCouncilCouncilModels,
            chairmanModel: expertCouncilChairmanModel,
            selfExclusionEnabled: expertCouncilSelfExclusionEnabled,
            minCouncilSize: expertCouncilMinCouncilSize,
            maxCouncilSize: expertCouncilMaxCouncilSize,
            requireConsensusThreshold: expertCouncilConsensusThreshold,
            maxCostPerTurn: expertCouncilMaxCost,
            enableCaching: expertCouncilCachingEnabled,
            cacheExpirationHours: expertCouncilCacheHours,
          }
        : {
            enabled: false,
            defaultMode: expertCouncilDefaultMode,
            allowModeOverride: expertCouncilAllowModeOverride,
            councilModels: expertCouncilCouncilModels,
            chairmanModel: expertCouncilChairmanModel,
            selfExclusionEnabled: expertCouncilSelfExclusionEnabled,
            minCouncilSize: Number.isNaN(expertCouncilMinCouncilSize)
              ? 2
              : expertCouncilMinCouncilSize,
            maxCouncilSize: Number.isNaN(expertCouncilMaxCouncilSize)
              ? 10
              : expertCouncilMaxCouncilSize,
            requireConsensusThreshold: expertCouncilConsensusThreshold,
            maxCostPerTurn: expertCouncilMaxCost,
            enableCaching: expertCouncilCachingEnabled,
            cacheExpirationHours: Number.isNaN(expertCouncilCacheHours)
              ? 24
              : expertCouncilCacheHours,
          }

      const input = {
        name: name.trim(),
        description: description.trim() || undefined,
        agentIds: selectedAgentIds,
        defaultAgentId,
        workflowType,
        workflowGraph,
        maxIterations,
        memoryMessageLimit,
        expertCouncilConfig,
        projectManagerConfig,
        promptConfig,
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
    <>
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

          {workflowType === 'graph' && (
            <div className="form-group">
              <label htmlFor="workflowGraph">Workflow Graph (JSON)</label>
              <textarea
                id="workflowGraph"
                value={workflowGraphInput}
                onChange={(e) => setWorkflowGraphInput(e.target.value)}
                placeholder='{"version":1,"startNodeId":"node_1","nodes":[],"edges":[]}'
                rows={8}
              />
              <small>Provide a graph definition for advanced orchestration.</small>
            </div>
          )}

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

          <div className="form-group">
            <label>Execution Mode</label>
            <label>
              <input
                type="radio"
                name="executionMode"
                checked={executionModeChoice === 'workflow'}
                onChange={() => {
                  setExecutionModeChoice('workflow')
                  setExpertCouncilEnabled(false)
                }}
              />
              <span>Workflow</span>
            </label>
            <label>
              <input
                type="radio"
                name="executionMode"
                checked={executionModeChoice === 'expert_council'}
                onChange={() => {
                  setExecutionModeChoice('expert_council')
                  setExpertCouncilEnabled(true)
                }}
              />
              <span>Expert Council</span>
            </label>
            {expertCouncilEnabled && workflowType !== 'sequential' && (
              <div className="run-error">
                Note: Expert Council will execute instead of the configured workflow when enabled.
              </div>
            )}
          </div>

          <ProjectManagerConfigForm
            value={projectManagerConfig}
            onChange={(updates) =>
              setProjectManagerConfig((prev) => ({
                ...prev,
                ...updates,
              }))
            }
          />

          <div className="form-section">
            <div className="section-label">Prompts (optional)</div>

            <div className="form-group">
              <label>Agent Prompts</label>
              {selectedAgentIds.map((agentId) => {
                const agent = agents.find((entry) => entry.agentId === agentId)
                return (
                  <div key={agentId} className="prompt-config-row">
                    <span>{agent?.name ?? agentId}</span>
                    <PromptSelector
                      type="agent"
                      value={promptConfig?.agentPrompts?.[agentId] ?? { type: 'custom' }}
                      onChange={(ref) => updateAgentPrompt(agentId, ref)}
                      onEditTemplate={handleEditPromptTemplate}
                    />
                  </div>
                )
              })}
            </div>

            <div className="form-group">
              <label>Tone of Voice</label>
              <PromptSelector
                type="tone-of-voice"
                value={promptConfig?.toneOfVoicePrompt ?? { type: 'custom' }}
                onChange={(ref) =>
                  setPromptConfig((prev) => ({
                    ...prev,
                    toneOfVoicePrompt: ref,
                  }))
                }
                onEditTemplate={handleEditPromptTemplate}
              />
            </div>

            <div className="form-group">
              <label>Synthesis Prompt</label>
              <PromptSelector
                type="synthesis"
                value={promptConfig?.synthesisPrompts?.default ?? { type: 'custom' }}
                onChange={(ref) => updateSynthesisPrompt('default', ref)}
                onEditTemplate={handleEditPromptTemplate}
              />
            </div>
          </div>

          <div className="form-section">
            <div className="section-label">Expert Council Settings</div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="expertCouncilMode">Default Mode</label>
                <select
                  id="expertCouncilMode"
                  value={expertCouncilDefaultMode}
                  onChange={(e) => setExpertCouncilDefaultMode(e.target.value as ExecutionMode)}
                  disabled={!expertCouncilEnabled}
                >
                  {EXECUTION_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} - {option.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="expertCouncilAllowOverride">Allow per-run override</label>
                <label>
                  <input
                    id="expertCouncilAllowOverride"
                    type="checkbox"
                    checked={expertCouncilAllowModeOverride}
                    onChange={(e) => setExpertCouncilAllowModeOverride(e.target.checked)}
                    disabled={!expertCouncilEnabled}
                  />
                  <span>Let users choose a mode per execution</span>
                </label>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="expertCouncilMinSize">Minimum council size</label>
                <input
                  id="expertCouncilMinSize"
                  type="number"
                  min={2}
                  value={expertCouncilMinCouncilSizeInput}
                  onChange={(e) => setExpertCouncilMinCouncilSizeInput(e.target.value)}
                  disabled={!expertCouncilEnabled}
                />
              </div>
              <div className="form-group">
                <label htmlFor="expertCouncilMaxSize">Maximum council size</label>
                <input
                  id="expertCouncilMaxSize"
                  type="number"
                  min={2}
                  value={expertCouncilMaxCouncilSizeInput}
                  onChange={(e) => setExpertCouncilMaxCouncilSizeInput(e.target.value)}
                  disabled={!expertCouncilEnabled}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Self-exclusion</label>
              <label>
                <input
                  type="checkbox"
                  checked={expertCouncilSelfExclusionEnabled}
                  onChange={(e) => setExpertCouncilSelfExclusionEnabled(e.target.checked)}
                  disabled={!expertCouncilEnabled}
                />
                <span>Judges do not review their own responses</span>
              </label>
            </div>

            <div className="form-group">
              <label>Council Models</label>
              {expertCouncilCouncilModels.length === 0 ? (
                <div className="empty-state">
                  <p>No council models configured.</p>
                </div>
              ) : (
                expertCouncilCouncilModels.map((model, index) => (
                  <div key={`${model.modelId}-${index}`} className="form-section">
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor={`council-model-id-${index}`}>Model ID</label>
                        <input
                          id={`council-model-id-${index}`}
                          type="text"
                          value={model.modelId}
                          onChange={(e) =>
                            handleCouncilModelChange(index, { modelId: e.target.value })
                          }
                          disabled={!expertCouncilEnabled}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor={`council-model-provider-${index}`}>Provider</label>
                        <select
                          id={`council-model-provider-${index}`}
                          value={model.provider}
                          onChange={(e) =>
                            handleCouncilModelChange(index, {
                              provider: e.target.value as ModelProvider,
                            })
                          }
                          disabled={!expertCouncilEnabled}
                        >
                          {PROVIDER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor={`council-model-name-${index}`}>Model name</label>
                        <input
                          id={`council-model-name-${index}`}
                          type="text"
                          value={model.modelName}
                          onChange={(e) =>
                            handleCouncilModelChange(index, { modelName: e.target.value })
                          }
                          disabled={!expertCouncilEnabled}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor={`council-model-temp-${index}`}>Temperature</label>
                        <input
                          id={`council-model-temp-${index}`}
                          type="number"
                          min={0}
                          max={2}
                          step={0.1}
                          value={model.temperature ?? ''}
                          onChange={(e) =>
                            handleCouncilModelChange(index, {
                              temperature: e.target.value ? Number(e.target.value) : undefined,
                            })
                          }
                          disabled={!expertCouncilEnabled}
                        />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor={`council-model-max-tokens-${index}`}>Max tokens</label>
                        <input
                          id={`council-model-max-tokens-${index}`}
                          type="number"
                          min={1}
                          value={model.maxTokens ?? ''}
                          onChange={(e) =>
                            handleCouncilModelChange(index, {
                              maxTokens: e.target.value ? Number(e.target.value) : undefined,
                            })
                          }
                          disabled={!expertCouncilEnabled}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor={`council-model-system-${index}`}>System prompt</label>
                        <input
                          id={`council-model-system-${index}`}
                          type="text"
                          value={model.systemPrompt ?? ''}
                          onChange={(e) =>
                            handleCouncilModelChange(index, {
                              systemPrompt: e.target.value || undefined,
                            })
                          }
                          disabled={!expertCouncilEnabled}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <button
                        type="button"
                        onClick={() => handleCouncilModelRemove(index)}
                        disabled={!expertCouncilEnabled}
                      >
                        Remove model
                      </button>
                    </div>
                  </div>
                ))
              )}
              <button
                type="button"
                onClick={handleCouncilModelAdd}
                disabled={!expertCouncilEnabled}
              >
                + Add Council Model
              </button>
            </div>

            <div className="form-group">
              <label>Chairman Model</label>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="chairman-model-id">Model ID</label>
                  <input
                    id="chairman-model-id"
                    type="text"
                    value={expertCouncilChairmanModel.modelId}
                    onChange={(e) =>
                      setExpertCouncilChairmanModel((prev) => ({
                        ...prev,
                        modelId: e.target.value,
                      }))
                    }
                    disabled={!expertCouncilEnabled}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="chairman-model-provider">Provider</label>
                  <select
                    id="chairman-model-provider"
                    value={expertCouncilChairmanModel.provider}
                    onChange={(e) =>
                      setExpertCouncilChairmanModel((prev) => ({
                        ...prev,
                        provider: e.target.value as ModelProvider,
                      }))
                    }
                    disabled={!expertCouncilEnabled}
                  >
                    {PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="chairman-model-name">Model name</label>
                  <input
                    id="chairman-model-name"
                    type="text"
                    value={expertCouncilChairmanModel.modelName}
                    onChange={(e) =>
                      setExpertCouncilChairmanModel((prev) => ({
                        ...prev,
                        modelName: e.target.value,
                      }))
                    }
                    disabled={!expertCouncilEnabled}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="chairman-model-temp">Temperature</label>
                  <input
                    id="chairman-model-temp"
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={expertCouncilChairmanModel.temperature ?? ''}
                    onChange={(e) =>
                      setExpertCouncilChairmanModel((prev) => ({
                        ...prev,
                        temperature: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                    disabled={!expertCouncilEnabled}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="chairman-model-max-tokens">Max tokens</label>
                <input
                  id="chairman-model-max-tokens"
                  type="number"
                  min={1}
                  value={expertCouncilChairmanModel.maxTokens ?? ''}
                  onChange={(e) =>
                    setExpertCouncilChairmanModel((prev) => ({
                      ...prev,
                      maxTokens: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                  disabled={!expertCouncilEnabled}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="expertCouncilConsensus">Consensus threshold</label>
                <input
                  id="expertCouncilConsensus"
                  type="number"
                  min={0}
                  max={100}
                  value={expertCouncilConsensusThresholdInput}
                  onChange={(e) => setExpertCouncilConsensusThresholdInput(e.target.value)}
                  placeholder="Optional"
                  disabled={!expertCouncilEnabled}
                />
              </div>
              <div className="form-group">
                <label htmlFor="expertCouncilMaxCost">Max cost per turn ($)</label>
                <input
                  id="expertCouncilMaxCost"
                  type="number"
                  min={0}
                  step={0.01}
                  value={expertCouncilMaxCostInput}
                  onChange={(e) => setExpertCouncilMaxCostInput(e.target.value)}
                  placeholder="Optional"
                  disabled={!expertCouncilEnabled}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="expertCouncilCaching">Caching</label>
                <label>
                  <input
                    id="expertCouncilCaching"
                    type="checkbox"
                    checked={expertCouncilCachingEnabled}
                    onChange={(e) => setExpertCouncilCachingEnabled(e.target.checked)}
                    disabled={!expertCouncilEnabled}
                  />
                  <span>Cache identical prompts</span>
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="expertCouncilCacheHours">Cache expiration (hours)</label>
                <input
                  id="expertCouncilCacheHours"
                  type="number"
                  min={1}
                  value={expertCouncilCacheHoursInput}
                  onChange={(e) => setExpertCouncilCacheHoursInput(e.target.value)}
                  disabled={!expertCouncilEnabled}
                />
              </div>
            </div>
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
      {promptEditorTemplate && user?.uid && (
        <div className="modal-overlay" onClick={() => setPromptEditorTemplate(null)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <PromptEditor
              userId={user.uid}
              templateId={promptEditorTemplate.templateId}
              onClose={() => setPromptEditorTemplate(null)}
            />
          </div>
        </div>
      )}
    </>
  )
}
