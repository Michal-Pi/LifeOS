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

import { useState, useEffect, useMemo } from 'react'
import { useWorkspaceOperations } from '@/hooks/useWorkspaceOperations'
import { useAgentOperations } from '@/hooks/useAgentOperations'
import { usePromptLibrary } from '@/hooks/usePromptLibrary'
import { useAuth } from '@/hooks/useAuth'
import { useAiProviderKeys } from '@/hooks/useAiProviderKeys'
import { getFirstAvailableProvider, generateWithProvider } from '@/lib/aiProviderApi'
import { Button } from '@/components/ui/button'
import { Select, type SelectOption } from '@/components/Select'
import { ProjectManagerConfig as ProjectManagerConfigForm } from './ProjectManagerConfig'
import { PromptSelector } from './PromptSelector'
import { PromptEditor } from './PromptEditor'
import { SortableAgentList } from './SortableAgentList'
import { ParallelMergeSelector } from './ParallelMergeSelector'
import { WorkflowGraphDocsModal } from './WorkflowGraphDocsModal'
import { CustomWorkflowBuilder } from './CustomWorkflowBuilder'
import { SupervisorPreview } from './SupervisorPreview'
import type {
  Workspace,
  WorkflowType,
  AgentId,
  AgentRole,
  JoinAggregationMode,
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

const ROLE_LABELS: Record<AgentRole, string> = {
  researcher: 'Researcher',
  planner: 'Planner',
  critic: 'Critic',
  synthesizer: 'Synthesizer',
  executor: 'Executor',
  supervisor: 'Supervisor',
  custom: 'Custom',
}

const ROLE_FILTER_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'All Types' },
  { value: 'planner', label: 'Planner' },
  { value: 'researcher', label: 'Researcher' },
  { value: 'critic', label: 'Critic' },
  { value: 'synthesizer', label: 'Synthesizer' },
  { value: 'executor', label: 'Executor' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'custom', label: 'Custom' },
]

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

const WORKFLOW_SELECT_OPTIONS: SelectOption[] = WORKFLOW_OPTIONS.map((option) => ({
  value: option.value,
  label: `${option.label} - ${option.description}`,
}))

const EXECUTION_MODE_SELECT_OPTIONS: SelectOption[] = EXECUTION_MODE_OPTIONS.map((option) => ({
  value: option.value,
  label: `${option.label} - ${option.description}`,
}))

const DEFAULT_AGENT_OPTION = 'none'

const PROVIDER_OPTIONS: { value: ModelProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'xai', label: 'xAI' },
]

const createDefaultCouncilModel = (
  index: number,
  connectedProviders: ModelProvider[] = ['openai']
): ExpertCouncilConfig['councilModels'][number] => {
  // Preferred order: OpenAI (GPT), Anthropic (Claude), xAI (Grok), Google (Gemini)
  const preferredOrder: ModelProvider[] = ['openai', 'anthropic', 'xai', 'google']

  // For each index, try to use the preferred provider in order
  // If that provider is not connected, cycle through connected providers
  let defaultProvider: ModelProvider

  if (connectedProviders.length === 0) {
    defaultProvider = 'openai' // Fallback
  } else {
    const preferredIndex = index % preferredOrder.length
    const preferredProvider = preferredOrder[preferredIndex]

    if (connectedProviders.includes(preferredProvider)) {
      // Use preferred provider if available
      defaultProvider = preferredProvider
    } else {
      // Cycle through connected providers in their order
      // This ensures we fill all 4 slots even if not all providers are available
      defaultProvider = connectedProviders[index % connectedProviders.length]
    }
  }

  const defaultModel =
    defaultProvider === 'openai'
      ? 'gpt-4'
      : defaultProvider === 'anthropic'
        ? 'claude-3-5-sonnet-20241022'
        : defaultProvider === 'google'
          ? 'gemini-pro'
          : defaultProvider === 'xai'
            ? 'grok-beta'
            : 'gpt-4'

  return {
    modelId: `council-${index + 1}`,
    provider: defaultProvider,
    modelName: defaultModel,
    temperature: 0.7,
  }
}

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
  const providerKeys = useAiProviderKeys(user?.uid)

  // Get connected providers in preferred order: OpenAI, Anthropic, xAI, Google
  const connectedProviders = useMemo(() => {
    const providers: ModelProvider[] = []
    if (providerKeys.keys.openaiKey) providers.push('openai')
    if (providerKeys.keys.anthropicKey) providers.push('anthropic')
    if (providerKeys.keys.xaiKey) providers.push('xai')
    if (providerKeys.keys.googleKey) providers.push('google')
    return providers.length > 0 ? providers : ['openai'] // Fallback to openai if none connected
  }, [providerKeys.keys])

  const providerOptions = useMemo<SelectOption[]>(
    () =>
      PROVIDER_OPTIONS.filter((option) => connectedProviders.includes(option.value)).map(
        (option) => ({
          value: option.value,
          label: option.label,
        })
      ),
    [connectedProviders]
  )

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedAgentIds, setSelectedAgentIds] = useState<AgentId[]>([])
  const [roleFilter, setRoleFilter] = useState<AgentRole | 'all'>('all')
  const [defaultAgentId, setDefaultAgentId] = useState<AgentId | undefined>(undefined)
  const [workflowType, setWorkflowType] = useState<WorkflowType>('sequential')
  const [maxIterations, setMaxIterations] = useState<number>(10)
  const [memoryMessageLimitInput, setMemoryMessageLimitInput] = useState('')
  const [workflowGraphInput, setWorkflowGraphInput] = useState('')
  const [workflowPrompt, setWorkflowPrompt] = useState('')
  const [isGeneratingWorkflow, setIsGeneratingWorkflow] = useState(false)
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
  const [parallelMergeStrategy, setParallelMergeStrategy] = useState<JoinAggregationMode>('list')
  const [showGraphDocs, setShowGraphDocs] = useState(false)
  const [showCustomBuilder, setShowCustomBuilder] = useState(false)
  const [supervisorAgentId, setSupervisorAgentId] = useState<AgentId | undefined>(undefined)

  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

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
        setParallelMergeStrategy(workspace.parallelMergeStrategy ?? 'list')
        if (workspace.workflowType === 'supervisor' && workspace.agentIds.length > 0) {
          setSupervisorAgentId(workspace.agentIds[0] as AgentId)
        } else {
          setSupervisorAgentId(undefined)
        }
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
            createDefaultCouncilModel(0, connectedProviders),
            createDefaultCouncilModel(1, connectedProviders),
          ])
          const defaultChairmanProvider = connectedProviders[0] || 'openai'
          const defaultChairmanModel =
            defaultChairmanProvider === 'openai'
              ? 'gpt-4'
              : defaultChairmanProvider === 'anthropic'
                ? 'claude-3-5-sonnet-20241022'
                : defaultChairmanProvider === 'google'
                  ? 'gemini-pro'
                  : defaultChairmanProvider === 'xai'
                    ? 'grok-beta'
                    : 'gpt-4'
          setExpertCouncilChairmanModel({
            modelId: 'chairman-1',
            provider: defaultChairmanProvider,
            modelName: defaultChairmanModel,
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
        setParallelMergeStrategy(prefill?.parallelMergeStrategy ?? 'list')
        if (
          (prefill?.workflowType ?? 'sequential') === 'supervisor' &&
          (prefill?.agentIds ?? []).length > 0
        ) {
          setSupervisorAgentId(prefill!.agentIds![0] as AgentId)
        } else {
          setSupervisorAgentId(undefined)
        }
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
            createDefaultCouncilModel(0, connectedProviders),
            createDefaultCouncilModel(1, connectedProviders),
          ])
          const defaultChairmanProvider = connectedProviders[0] || 'openai'
          const defaultChairmanModel =
            defaultChairmanProvider === 'openai'
              ? 'gpt-4'
              : defaultChairmanProvider === 'anthropic'
                ? 'claude-3-5-sonnet-20241022'
                : defaultChairmanProvider === 'google'
                  ? 'gemini-pro'
                  : defaultChairmanProvider === 'xai'
                    ? 'grok-beta'
                    : 'gpt-4'
          setExpertCouncilChairmanModel({
            modelId: 'chairman-1',
            provider: defaultChairmanProvider,
            modelName: defaultChairmanModel,
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
  }, [isOpen, workspace, prefill, connectedProviders])

  const handleAgentToggle = (agentId: AgentId) => {
    setSelectedAgentIds((prev) => {
      const isSelected = prev.includes(agentId)
      if (isSelected) {
        // Deselecting - clear default/supervisor if it's this agent
        if (defaultAgentId === agentId) {
          setDefaultAgentId(undefined)
        }
        if (supervisorAgentId === agentId) {
          setSupervisorAgentId(undefined)
        }
        return prev.filter((id) => id !== agentId)
      } else {
        // Selecting - set as default if it's the first one
        const newList = [...prev, agentId]
        if (newList.length === 1) {
          setDefaultAgentId(agentId)
        }
        // Clear validation error when agent is selected
        if (validationErrors.agents) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { agents: _, ...rest } = validationErrors
          setValidationErrors(rest)
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

  const handleGenerateWorkflowFromPrompt = async () => {
    if (!workflowPrompt.trim()) {
      setError('Please enter a workflow description')
      return
    }

    const providerConfig = getFirstAvailableProvider(providerKeys.keys)
    if (!providerConfig) {
      setError('No AI provider key configured. Add one in Settings.')
      return
    }

    setIsGeneratingWorkflow(true)
    setError(null)

    try {
      const systemPrompt = `You are an expert at designing AI agent workflows. Convert the user's description into a workflow graph JSON structure.

The JSON should follow this schema:
{
  "version": 1,
  "startNodeId": "node_1",
  "nodes": [
    {
      "id": "node_1",
      "type": "agent",
      "agentId": "agent_id_here",
      "label": "Node Name"
    }
  ],
  "edges": [
    {
      "from": "node_1",
      "to": "node_2",
      "condition": { "type": "always" }
    }
  ]
}

Node types: agent, tool, human_input, join, end, research_request
Edge condition types: always, equals, contains, regex

Examples:
1. "Sequential workflow with researcher then writer"
   -> 2 agent nodes connected in sequence + end node

2. "Parallel research by 3 agents, then synthesize"
   -> 3 parallel agent nodes all connecting to 1 join node then end

3. "Router that sends to specialist based on topic"
   -> 1 router agent with conditional edges to multiple specialist agents

Return ONLY valid JSON, no explanation.`

      const generatedJson = await generateWithProvider(providerConfig, systemPrompt, workflowPrompt)

      // Validate it's valid JSON
      JSON.parse(generatedJson)

      setWorkflowGraphInput(generatedJson)
      setWorkflowPrompt('') // Clear prompt after successful generation
    } catch (err) {
      const error = err as Error
      setError(`Failed to generate workflow: ${error.message}`)
    } finally {
      setIsGeneratingWorkflow(false)
    }
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
    setExpertCouncilCouncilModels((prev) => [
      ...prev,
      createDefaultCouncilModel(prev.length, connectedProviders),
    ])
  }

  const handleSave = async () => {
    // Clear previous validation errors
    setValidationErrors({})
    setError(null)

    const errors: Record<string, string> = {}

    // Validation
    if (!name.trim()) {
      errors.name = 'Workspace name is required'
    }

    if (selectedAgentIds.length === 0) {
      errors.agents = 'At least one agent must be selected'
    }

    if (defaultAgentId && !selectedAgentIds.includes(defaultAgentId)) {
      setError('Default agent must be in the selected agents list')
      return
    }

    if (workflowType === 'parallel' && parallelMergeStrategy === 'synthesize') {
      const selectedAgents = agents.filter((a) => selectedAgentIds.includes(a.agentId))
      const synthesizerCount = selectedAgents.filter((a) => a.role === 'synthesizer').length
      if (synthesizerCount === 0) {
        errors.agents = 'Synthesize merge strategy requires exactly one Synthesizer agent'
      } else if (synthesizerCount > 1) {
        errors.agents =
          'Synthesize merge strategy requires exactly one Synthesizer agent — select only one'
      }
    }

    if (workflowType === 'supervisor') {
      if (selectedAgentIds.length < 2) {
        errors.agents = 'Supervisor workflow requires at least 2 agents (1 supervisor + 1 worker)'
      }
      if (!supervisorAgentId) {
        errors.supervisor = 'A supervisor agent must be selected'
      } else if (!selectedAgentIds.includes(supervisorAgentId)) {
        errors.supervisor = 'The selected supervisor must be among the selected agents'
      }
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
        setError(`Missing prompt templates: ${[...new Set(missingTemplateIds)].join(', ')}`)
        return
      }
    }

    let workflowGraph: Workspace['workflowGraph'] | undefined
    if (workflowType === 'graph' || workflowType === 'custom') {
      if (workflowGraphInput.trim()) {
        try {
          workflowGraph = JSON.parse(workflowGraphInput) as Workspace['workflowGraph']
        } catch {
          errors.workflowGraph = 'Workflow graph JSON is invalid'
        }
      } else if (workflowType === 'graph') {
        errors.workflowGraph = 'Workflow graph JSON is required for graph workflows'
      }
    }

    // If there are validation errors, show them and return
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      setError('Please fix the validation errors highlighted below')
      return
    }

    setIsSaving(true)

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

      // For supervisor workflows, ensure supervisor is first in agentIds
      const finalAgentIds =
        workflowType === 'supervisor' && supervisorAgentId
          ? [supervisorAgentId, ...selectedAgentIds.filter((id) => id !== supervisorAgentId)]
          : selectedAgentIds

      const input = {
        name: name.trim(),
        description: description.trim() || undefined,
        agentIds: finalAgentIds,
        defaultAgentId,
        workflowType,
        workflowGraph,
        parallelMergeStrategy: workflowType === 'parallel' ? parallelMergeStrategy : undefined,
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

  // Filter active agents only
  const activeAgents = agents.filter((agent) => !agent.archived)

  // Filter by role
  const filteredAgents = useMemo(
    () =>
      roleFilter === 'all'
        ? activeAgents
        : activeAgents.filter((agent) => agent.role === roleFilter),
    [activeAgents, roleFilter]
  )

  const defaultAgentOptions = useMemo<SelectOption[]>(
    () => [
      { value: DEFAULT_AGENT_OPTION, label: 'None' },
      ...activeAgents
        .filter((agent) => selectedAgentIds.includes(agent.agentId))
        .map((agent) => ({
          value: agent.agentId,
          label: agent.name,
        })),
    ],
    [activeAgents, selectedAgentIds]
  )

  if (!isOpen) return null

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
                onChange={(e) => {
                  setName(e.target.value)
                  if (validationErrors.name) {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { name: _, ...rest } = validationErrors
                    setValidationErrors(rest)
                  }
                }}
                placeholder="e.g., Fitness Assistant"
                required
                className={validationErrors.name ? 'error' : ''}
              />
              {validationErrors.name && (
                <span className="field-error">{validationErrors.name}</span>
              )}
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
              <div className="agent-selection-header">
                <label>Select Agents *</label>
                <Select
                  options={ROLE_FILTER_OPTIONS}
                  value={roleFilter}
                  onValueChange={(value) => setRoleFilter(value as AgentRole | 'all')}
                  placeholder="Filter by type"
                  className="role-filter-select"
                />
              </div>
              {activeAgents.length === 0 ? (
                <div className="empty-state">
                  <p>No agents available. Create an agent first.</p>
                </div>
              ) : filteredAgents.length === 0 ? (
                <div className="empty-state">
                  <p>No agents match the selected filter. Try a different type.</p>
                </div>
              ) : (
                <div className={`agent-selection ${validationErrors.agents ? 'error' : ''}`}>
                  {filteredAgents.map((agent) => {
                    const isSelected = selectedAgentIds.includes(agent.agentId)
                    return (
                      <div
                        key={agent.agentId}
                        className={`agent-selection-item ${isSelected ? 'selected' : ''}`}
                        tabIndex={0}
                        role="button"
                        onClick={() => handleAgentToggle(agent.agentId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleAgentToggle(agent.agentId)
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          id={`agent-${agent.agentId}`}
                          checked={isSelected}
                          onChange={() => handleAgentToggle(agent.agentId)}
                          className="agent-selection-checkbox"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="agent-selection-content">
                          <div className="agent-selection-header">
                            <label
                              htmlFor={`agent-${agent.agentId}`}
                              className="agent-selection-name"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {agent.name}
                            </label>
                            <span className="agent-selection-badge">{ROLE_LABELS[agent.role]}</span>
                          </div>
                          {agent.description && (
                            <p className="agent-selection-description">{agent.description}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {validationErrors.agents && (
                <span className="field-error">{validationErrors.agents}</span>
              )}
            </div>

            {selectedAgentIds.length > 0 && (
              <div className="form-group">
                <label htmlFor="defaultAgent">Default Agent (optional)</label>
                <Select
                  id="defaultAgent"
                  value={defaultAgentId ?? DEFAULT_AGENT_OPTION}
                  onChange={(value) =>
                    setDefaultAgentId(
                      value === DEFAULT_AGENT_OPTION ? undefined : (value as AgentId)
                    )
                  }
                  options={defaultAgentOptions}
                  placeholder="Select a default agent"
                />
                <small>The first agent to handle incoming requests</small>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="workflowType">Workflow Type *</label>
              <Select
                id="workflowType"
                value={workflowType}
                onChange={(value) => {
                  const newType = value as WorkflowType
                  setWorkflowType(newType)
                  if (newType !== 'supervisor') {
                    setSupervisorAgentId(undefined)
                  }
                }}
                options={WORKFLOW_SELECT_OPTIONS}
              />
            </div>

            {(workflowType === 'sequential' || workflowType === 'parallel') &&
              selectedAgentIds.length > 1 && (
                <div className="form-group">
                  <label>
                    {workflowType === 'sequential' ? 'Execution Order' : 'Output Order'} (drag to
                    reorder)
                  </label>
                  <SortableAgentList
                    agents={activeAgents.filter((a) => selectedAgentIds.includes(a.agentId))}
                    orderedIds={selectedAgentIds}
                    onReorder={setSelectedAgentIds}
                  />
                  {workflowType === 'parallel' && (
                    <small>Controls the order in which agent outputs are combined</small>
                  )}
                </div>
              )}

            {workflowType === 'parallel' && (
              <div className="form-group">
                <label>Merge Strategy</label>
                <ParallelMergeSelector
                  value={parallelMergeStrategy}
                  onChange={setParallelMergeStrategy}
                  selectedAgents={activeAgents.filter((a) => selectedAgentIds.includes(a.agentId))}
                />
              </div>
            )}

            {workflowType === 'supervisor' &&
              selectedAgentIds.length > 0 &&
              (() => {
                const supervisorCandidates = activeAgents.filter(
                  (a) => selectedAgentIds.includes(a.agentId) && a.role === 'supervisor'
                )
                const workerAgents = activeAgents.filter(
                  (a) => selectedAgentIds.includes(a.agentId) && a.agentId !== supervisorAgentId
                )
                const supervisorAgent = supervisorAgentId
                  ? activeAgents.find((a) => a.agentId === supervisorAgentId)
                  : undefined

                return (
                  <>
                    <div className="form-group">
                      <label htmlFor="supervisorAgent">Supervisor Agent *</label>
                      {supervisorCandidates.length === 0 ? (
                        <div className="merge-selector__warning">
                          No supervisor-role agents found among selected agents. Create an agent
                          with the &quot;Supervisor&quot; role first, then select it here.
                        </div>
                      ) : (
                        <Select
                          id="supervisorAgent"
                          value={supervisorAgentId ?? ''}
                          onChange={(value) => setSupervisorAgentId(value as AgentId)}
                          options={supervisorCandidates.map((a) => ({
                            value: a.agentId,
                            label: a.name,
                          }))}
                          placeholder="Select a supervisor agent"
                        />
                      )}
                      {validationErrors.supervisor && (
                        <span className="field-error">{validationErrors.supervisor}</span>
                      )}
                      <small>
                        The supervisor breaks the problem into sub-tasks, dispatches to workers,
                        validates results, and decides next steps. Worker agents and their tools are
                        passed as context automatically.
                      </small>
                    </div>

                    {supervisorAgent && workerAgents.length > 0 && (
                      <div className="form-group">
                        <label>Supervisor Overview</label>
                        <SupervisorPreview
                          supervisorAgent={supervisorAgent}
                          workerAgents={workerAgents}
                        />
                      </div>
                    )}
                  </>
                )
              })()}

            {workflowType === 'graph' && (
              <>
                <div className="form-group">
                  <label htmlFor="workflowPrompt">Describe Workflow (Optional)</label>
                  <textarea
                    id="workflowPrompt"
                    value={workflowPrompt}
                    onChange={(e) => setWorkflowPrompt(e.target.value)}
                    placeholder="Example: Sequential workflow with researcher then writer, or Parallel research by 3 agents then synthesize..."
                    rows={3}
                    style={{
                      marginBottom: '0.5rem',
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleGenerateWorkflowFromPrompt}
                    disabled={
                      isGeneratingWorkflow ||
                      !workflowPrompt.trim() ||
                      connectedProviders.length === 0
                    }
                  >
                    {isGeneratingWorkflow ? 'Generating...' : 'Generate JSON from Description'}
                  </Button>
                  {connectedProviders.length === 0 && (
                    <small
                      style={{
                        display: 'block',
                        marginTop: '0.25rem',
                        color: 'var(--destructive)',
                      }}
                    >
                      An AI provider API key is required. Add one in Settings (OpenAI, Anthropic,
                      xAI, or Google).
                    </small>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="workflowGraph">
                    Workflow Graph (JSON)
                    <button
                      type="button"
                      className="help-icon-btn"
                      onClick={() => setShowGraphDocs(true)}
                      title="Graph documentation"
                    >
                      ?
                    </button>
                  </label>
                  <textarea
                    id="workflowGraph"
                    value={workflowGraphInput}
                    onChange={(e) => {
                      setWorkflowGraphInput(e.target.value)
                      if (validationErrors.workflowGraph) {
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { workflowGraph: _, ...rest } = validationErrors
                        setValidationErrors(rest)
                      }
                    }}
                    placeholder='{"version":1,"startNodeId":"node_1","nodes":[],"edges":[]}'
                    rows={8}
                    className={validationErrors.workflowGraph ? 'error' : ''}
                  />
                  {validationErrors.workflowGraph ? (
                    <span className="field-error">{validationErrors.workflowGraph}</span>
                  ) : (
                    <small>Provide a graph definition for advanced orchestration.</small>
                  )}
                </div>
              </>
            )}

            {workflowType === 'custom' && (
              <div className="form-group">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowCustomBuilder(true)}
                >
                  Open Visual Builder
                </Button>
                {workflowGraphInput &&
                  (() => {
                    try {
                      const parsed = JSON.parse(workflowGraphInput)
                      return (
                        <small
                          style={{
                            marginTop: '0.25rem',
                            display: 'block',
                            color: 'var(--success)',
                          }}
                        >
                          Graph configured ({parsed.nodes?.length ?? 0} nodes,{' '}
                          {parsed.edges?.length ?? 0} edges)
                        </small>
                      )
                    } catch {
                      return null
                    }
                  })()}
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
                Number of recent messages to include when resuming runs (1-200). Overrides the
                global default.
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
                      <span className="agent-prompt-name">{agent?.name ?? agentId}</span>
                      <PromptSelector
                        type="agent"
                        value={promptConfig?.agentPrompts?.[agentId] ?? { type: 'custom' }}
                        onChange={(ref) => updateAgentPrompt(agentId, ref)}
                        onEditTemplate={handleEditPromptTemplate}
                        agentName={agent?.name}
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
                  <Select
                    id="expertCouncilMode"
                    value={expertCouncilDefaultMode}
                    onChange={(value) => setExpertCouncilDefaultMode(value as ExecutionMode)}
                    disabled={!expertCouncilEnabled}
                    options={EXECUTION_MODE_SELECT_OPTIONS}
                  />
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
                          <Select
                            id={`council-model-provider-${index}`}
                            value={model.provider}
                            onChange={(value) =>
                              handleCouncilModelChange(index, {
                                provider: value as ModelProvider,
                              })
                            }
                            disabled={!expertCouncilEnabled}
                            options={providerOptions}
                          />
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
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => handleCouncilModelRemove(index)}
                          disabled={!expertCouncilEnabled}
                        >
                          Remove model
                        </Button>
                      </div>
                    </div>
                  ))
                )}
                <Button
                  variant="ghost"
                  type="button"
                  onClick={handleCouncilModelAdd}
                  disabled={!expertCouncilEnabled}
                >
                  + Add Council Model
                </Button>
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
                    <Select
                      id="chairman-model-provider"
                      value={expertCouncilChairmanModel.provider}
                      onChange={(value) =>
                        setExpertCouncilChairmanModel((prev) => ({
                          ...prev,
                          provider: value as ModelProvider,
                        }))
                      }
                      disabled={!expertCouncilEnabled}
                      options={providerOptions}
                    />
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
              <Button variant="ghost" type="button" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || activeAgents.length === 0}>
                {isSaving ? 'Saving...' : workspace ? 'Update Workspace' : 'Create Workspace'}
              </Button>
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
      <WorkflowGraphDocsModal isOpen={showGraphDocs} onClose={() => setShowGraphDocs(false)} />
      <CustomWorkflowBuilder
        isOpen={showCustomBuilder}
        onClose={() => setShowCustomBuilder(false)}
        initialGraph={
          workflowGraphInput
            ? (() => {
                try {
                  return JSON.parse(workflowGraphInput)
                } catch {
                  return undefined
                }
              })()
            : undefined
        }
        agents={activeAgents}
        onSave={(graph) => {
          setWorkflowGraphInput(JSON.stringify(graph, null, 2))
          setShowCustomBuilder(false)
        }}
      />
    </>
  )
}
