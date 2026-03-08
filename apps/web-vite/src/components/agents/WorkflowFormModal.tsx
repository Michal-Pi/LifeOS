/**
 * WorkflowFormModal Component
 *
 * Modal for creating and editing AI agent workflows.
 * Features:
 * - Create new workflow or edit existing
 * - Name and description
 * - Select agents to include
 * - Set default agent
 * - Configure workflow type
 * - Set max iterations
 * - Form validation
 */

import { useState, useEffect, useMemo } from 'react'
import { useWorkflowOperations } from '@/hooks/useWorkflowOperations'
import { useAgentOperations } from '@/hooks/useAgentOperations'
import { usePromptLibrary } from '@/hooks/usePromptLibrary'
import { useAuth } from '@/hooks/useAuth'
import { useAiProviderKeys } from '@/hooks/useAiProviderKeys'
import { getFirstAvailableProvider, generateWithProvider } from '@/lib/aiProviderApi'
import { agentTemplatePresets } from '@/agents/templatePresets'
import { Button } from '@/components/ui/button'
import type { SelectOption } from '@/components/Select'
import type {
  Workflow,
  AgentId,
  AgentRole,
  CreateAgentInput,
  ExpertCouncilConfig,
  ExecutionMode,
  ModelProvider,
  ProjectManagerConfig,
  PromptReference,
  PromptTemplate,
  JoinAggregationMode,
} from '@lifeos/agents'
import { hashAgentConfig } from '@lifeos/agents'
import {
  PROVIDER_OPTIONS,
  DEFAULT_AGENT_OPTION,
  DEFAULT_PROJECT_MANAGER_CONFIG,
  createDefaultCouncilModel,
  getDefaultModelForProvider,
  type WorkflowType,
  type AgentSource,
} from './workflowFormConstants'
import { WorkflowBasicInfoSection } from './WorkflowBasicInfoSection'
import { WorkflowAgentSelectionSection } from './WorkflowAgentSelectionSection'
import { WorkflowTypeConfigSection } from './WorkflowTypeConfigSection'
import { WorkflowPromptConfigSection } from './WorkflowPromptConfigSection'
import { ExpertCouncilConfigSection } from './ExpertCouncilConfigSection'
import { WorkflowFormModals } from './WorkflowFormModals'

interface WorkflowFormModalProps {
  workflow: Workflow | null
  prefill?: Partial<Workflow>
  isOpen: boolean
  onClose: () => void
  onSave: () => void
}

export function WorkflowFormModal({
  workflow,
  prefill,
  isOpen,
  onClose,
  onSave,
}: WorkflowFormModalProps) {
  const { createWorkflow, updateWorkflow } = useWorkflowOperations()
  const { agents, loadAgents, createAgent } = useAgentOperations()
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
    return providers.length > 0 ? providers : (['openai'] as ModelProvider[])
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

  // --- Form State ---
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
    modelName: 'gpt-5.2',
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
  const [promptConfig, setPromptConfig] = useState<Workflow['promptConfig']>()
  const [promptEditorTemplate, setPromptEditorTemplate] = useState<PromptTemplate | null>(null)
  const [parallelMergeStrategy, setParallelMergeStrategy] = useState<JoinAggregationMode>('list')
  const [showGraphDocs, setShowGraphDocs] = useState(false)
  const [showCustomBuilder, setShowCustomBuilder] = useState(false)
  const [showGraphPreview, setShowGraphPreview] = useState(false)
  const [supervisorAgentId, setSupervisorAgentId] = useState<AgentId | undefined>(undefined)
  const [agentSource, setAgentSource] = useState<AgentSource>('active')
  const [selectedTemplateNames, setSelectedTemplateNames] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const parsedGraph = useMemo(() => {
    if (!workflowGraphInput.trim()) return null
    try {
      return JSON.parse(workflowGraphInput) as Workflow['workflowGraph']
    } catch {
      return null
    }
  }, [workflowGraphInput])

  // Load agents on mount
  useEffect(() => {
    if (isOpen) {
      void loadAgents()
    }
  }, [isOpen, loadAgents])

  // Reset form when modal opens/closes or workflow changes
  useEffect(() => {
    if (!isOpen) return
    const source = workflow ?? prefill
    const isEdit = !!workflow

    setName(source?.name ?? '')
    setDescription(source?.description ?? '')
    setSelectedAgentIds(source?.agentIds ?? [])
    setDefaultAgentId(source?.defaultAgentId)
    setWorkflowType(source?.workflowType ?? 'sequential')
    setMaxIterations(source?.maxIterations ?? 10)
    setMemoryMessageLimitInput(source?.memoryMessageLimit ? String(source.memoryMessageLimit) : '')
    setWorkflowGraphInput(
      source?.workflowGraph ? JSON.stringify(source.workflowGraph, null, 2) : ''
    )
    setParallelMergeStrategy(source?.parallelMergeStrategy ?? 'list')

    if (
      (source?.workflowType ?? 'sequential') === 'supervisor' &&
      (source?.agentIds ?? []).length > 0
    ) {
      setSupervisorAgentId((isEdit ? workflow! : prefill!).agentIds![0] as AgentId)
    } else {
      setSupervisorAgentId(undefined)
    }

    const councilConfig = source?.expertCouncilConfig
    const pmConfig = source?.projectManagerConfig ?? DEFAULT_PROJECT_MANAGER_CONFIG

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
      setExpertCouncilChairmanModel({
        modelId: 'chairman-1',
        provider: defaultChairmanProvider,
        modelName: getDefaultModelForProvider(defaultChairmanProvider),
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
    setPromptConfig(source?.promptConfig)
    setAgentSource('active')
    setSelectedTemplateNames([])
    setError(null)
  }, [isOpen, workflow, prefill, connectedProviders])

  // --- Handlers ---

  const handleAgentToggle = (agentId: AgentId) => {
    setSelectedAgentIds((prev) => {
      const isSelected = prev.includes(agentId)
      if (isSelected) {
        if (defaultAgentId === agentId) setDefaultAgentId(undefined)
        if (supervisorAgentId === agentId) setSupervisorAgentId(undefined)
        return prev.filter((id) => id !== agentId)
      } else {
        const newList = [...prev, agentId]
        if (newList.length === 1) setDefaultAgentId(agentId)
        if (validationErrors.agents) {
          const { agents: _, ...rest } = validationErrors
          setValidationErrors(rest)
        }
        return newList
      }
    })
  }

  const handleTemplateToggle = (templateName: string) => {
    setSelectedTemplateNames((prev) => {
      if (prev.includes(templateName)) {
        return prev.filter((n) => n !== templateName)
      }
      const next = [...prev, templateName]
      if (validationErrors.agents) {
        const { agents: _, ...rest } = validationErrors
        setValidationErrors(rest)
      }
      return next
    })
  }

  const updateAgentPrompt = (agentId: string, reference: PromptReference) => {
    setPromptConfig((prev) => ({
      ...prev,
      agentPrompts: { ...(prev?.agentPrompts ?? {}), [agentId]: reference },
    }))
  }

  const updateSynthesisPrompt = (key: string, reference: PromptReference) => {
    setPromptConfig((prev) => ({
      ...prev,
      synthesisPrompts: { ...(prev?.synthesisPrompts ?? {}), [key]: reference },
    }))
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
      JSON.parse(generatedJson)
      setWorkflowGraphInput(generatedJson)
      setWorkflowPrompt('')
    } catch (err) {
      setError(`Failed to generate workflow: ${(err as Error).message}`)
    } finally {
      setIsGeneratingWorkflow(false)
    }
  }

  const handleCouncilModelChange = (
    index: number,
    updates: Partial<ExpertCouncilConfig['councilModels'][number]>
  ) => {
    setExpertCouncilCouncilModels((prev) =>
      prev.map((model, i) => (i === index ? { ...model, ...updates } : model))
    )
  }

  const handleCouncilModelRemove = (index: number) => {
    setExpertCouncilCouncilModels((prev) => prev.filter((_, i) => i !== index))
  }

  const handleCouncilModelAdd = () => {
    setExpertCouncilCouncilModels((prev) => [
      ...prev,
      createDefaultCouncilModel(prev.length, connectedProviders),
    ])
  }

  const handleSave = async () => {
    setValidationErrors({})
    setError(null)
    const errors: Record<string, string> = {}

    if (!name.trim()) errors.name = 'Workflow name is required'
    const hasAgents = selectedAgentIds.length > 0 || selectedTemplateNames.length > 0
    if (!hasAgents) errors.agents = 'At least one agent or template must be selected'
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
          'Synthesize merge strategy requires exactly one Synthesizer agent -- select only one'
      }
    }

    if (workflowType === 'supervisor') {
      if (selectedAgentIds.length < 2)
        errors.agents = 'Supervisor workflow requires at least 2 agents (1 supervisor + 1 worker)'
      if (!supervisorAgentId) errors.supervisor = 'A supervisor agent must be selected'
      else if (!selectedAgentIds.includes(supervisorAgentId))
        errors.supervisor = 'The selected supervisor must be among the selected agents'
    }

    if (maxIterations < 1 || maxIterations > 200) {
      setError('Max iterations must be between 1 and 200')
      return
    }

    const ecMinSize = Number.parseInt(expertCouncilMinCouncilSizeInput, 10)
    const ecMaxSize = Number.parseInt(expertCouncilMaxCouncilSizeInput, 10)
    const ecCacheHrs = Number.parseInt(expertCouncilCacheHoursInput, 10)

    if (expertCouncilEnabled) {
      if (Number.isNaN(ecMinSize) || ecMinSize < 2) {
        setError('Expert Council minimum size must be at least 2')
        return
      }
      if (Number.isNaN(ecMaxSize) || ecMaxSize < ecMinSize) {
        setError('Expert Council maximum size must be greater than or equal to minimum size')
        return
      }
      if (expertCouncilCouncilModels.length < ecMinSize) {
        setError('Add more council models to meet the minimum size')
        return
      }
      if (expertCouncilCouncilModels.length > ecMaxSize) {
        setError('Reduce council models to stay within the maximum size')
        return
      }
      if (expertCouncilCouncilModels.some((m) => !m.modelId.trim() || !m.modelName.trim())) {
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
      if (Number.isNaN(ecCacheHrs) || ecCacheHrs <= 0) {
        setError('Expert Council cache expiration must be a positive number of hours')
        return
      }
    }

    const memoryMessageLimit = memoryMessageLimitInput
      ? Number.parseInt(memoryMessageLimitInput, 10)
      : undefined
    if (
      memoryMessageLimitInput &&
      (Number.isNaN(memoryMessageLimit) || memoryMessageLimit! <= 0 || memoryMessageLimit! > 200)
    ) {
      setError('Memory message limit must be between 1 and 200')
      return
    }

    const ecConsensus = expertCouncilConsensusThresholdInput
      ? Number.parseInt(expertCouncilConsensusThresholdInput, 10)
      : undefined
    if (
      expertCouncilConsensusThresholdInput &&
      (Number.isNaN(ecConsensus) || ecConsensus! < 0 || ecConsensus! > 100)
    ) {
      setError('Expert Council consensus threshold must be between 0 and 100')
      return
    }

    const ecMaxCost = expertCouncilMaxCostInput
      ? Number.parseFloat(expertCouncilMaxCostInput)
      : undefined
    if (expertCouncilMaxCostInput && (Number.isNaN(ecMaxCost) || ecMaxCost! < 0)) {
      setError('Expert Council max cost must be a positive number')
      return
    }

    if (promptConfig) {
      const templateIds = new Set(promptTemplates.map((t) => t.templateId))
      const missing: string[] = []
      const check = (ref?: PromptReference) => {
        if (ref?.type === 'shared' && ref.templateId && !templateIds.has(ref.templateId))
          missing.push(ref.templateId)
      }
      Object.values(promptConfig.agentPrompts ?? {}).forEach(check)
      check(promptConfig.toneOfVoicePrompt)
      Object.values(promptConfig.synthesisPrompts ?? {}).forEach(check)
      Object.values(promptConfig.workflowPrompts ?? {}).forEach(check)
      Object.values(promptConfig.toolPrompts ?? {}).forEach(check)
      if (missing.length > 0) {
        setError(`Missing prompt templates: ${[...new Set(missing)].join(', ')}`)
        return
      }
    }

    let workflowGraph: Workflow['workflowGraph'] | undefined
    if (workflowType === 'graph' || workflowType === 'custom') {
      if (workflowGraphInput.trim()) {
        try {
          workflowGraph = JSON.parse(workflowGraphInput) as Workflow['workflowGraph']
        } catch {
          errors.workflowGraph = 'Workflow graph JSON is invalid'
        }
      } else if (workflowType === 'graph') {
        errors.workflowGraph = 'Workflow graph JSON is required for graph workflows'
      }
    }

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
            minCouncilSize: ecMinSize,
            maxCouncilSize: ecMaxSize,
            ...(ecConsensus !== undefined ? { requireConsensusThreshold: ecConsensus } : {}),
            ...(ecMaxCost !== undefined ? { maxCostPerTurn: ecMaxCost } : {}),
            enableCaching: expertCouncilCachingEnabled,
            cacheExpirationHours: ecCacheHrs,
          }
        : {
            enabled: false,
            defaultMode: expertCouncilDefaultMode,
            allowModeOverride: expertCouncilAllowModeOverride,
            councilModels: expertCouncilCouncilModels,
            chairmanModel: expertCouncilChairmanModel,
            selfExclusionEnabled: expertCouncilSelfExclusionEnabled,
            minCouncilSize: Number.isNaN(ecMinSize) ? 2 : ecMinSize,
            maxCouncilSize: Number.isNaN(ecMaxSize) ? 10 : ecMaxSize,
            ...(ecConsensus !== undefined ? { requireConsensusThreshold: ecConsensus } : {}),
            ...(ecMaxCost !== undefined ? { maxCostPerTurn: ecMaxCost } : {}),
            enableCaching: expertCouncilCachingEnabled,
            cacheExpirationHours: Number.isNaN(ecCacheHrs) ? 24 : ecCacheHrs,
          }

      // Resolve selected templates → agents (reuse existing via configHash, or create new)
      const templateAgentIds: AgentId[] = []
      if (selectedTemplateNames.length > 0) {
        const latestAgents = agents.filter((a) => !a.archived)
        for (const tplName of selectedTemplateNames) {
          const preset = agentTemplatePresets.find((p) => p.name === tplName)
          if (!preset) continue
          const agentInput: CreateAgentInput = {
            ...preset.agentConfig,
            toolIds: preset.agentConfig.toolIds ?? [],
          }
          const hash = hashAgentConfig(agentInput)
          // Check for existing agent with same configHash
          const existing = latestAgents.find((a) => a.configHash === hash)
          if (existing) {
            templateAgentIds.push(existing.agentId as AgentId)
          } else {
            // Check for name match (may be a modified version)
            const nameMatch = latestAgents.find((a) => a.name === agentInput.name)
            if (nameMatch) {
              // Reuse the name-matched agent rather than creating a duplicate name
              templateAgentIds.push(nameMatch.agentId as AgentId)
            } else {
              const created = await createAgent({ ...agentInput, configHash: hash })
              templateAgentIds.push(created.agentId as AgentId)
              // Add to latestAgents so subsequent templates can dedup against it
              latestAgents.push(created)
            }
          }
        }
      }

      const allAgentIds = [...selectedAgentIds, ...templateAgentIds]

      const finalAgentIds =
        workflowType === 'supervisor' && supervisorAgentId
          ? [supervisorAgentId, ...allAgentIds.filter((id) => id !== supervisorAgentId)]
          : allAgentIds

      const input = {
        name: name.trim(),
        agentIds: finalAgentIds,
        workflowType,
        maxIterations,
        expertCouncilConfig,
        projectManagerConfig,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(defaultAgentId ? { defaultAgentId } : {}),
        ...(workflowGraph ? { workflowGraph } : {}),
        ...(workflowType === 'parallel' ? { parallelMergeStrategy } : {}),
        ...(memoryMessageLimit !== undefined ? { memoryMessageLimit } : {}),
        ...(promptConfig ? { promptConfig } : {}),
      }

      if (workflow) {
        await updateWorkflow(workflow.workflowId, input)
      } else {
        await createWorkflow(input)
      }
      onSave()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  // --- Derived Data ---

  const activeAgents = agents.filter((agent) => !agent.archived)

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
        .map((agent) => ({ value: agent.agentId, label: agent.name })),
    ],
    [activeAgents, selectedAgentIds]
  )

  if (!isOpen) return null

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <h2>{workflow ? 'Edit Workflow' : 'Create Workflow'}</h2>

          {error && <div className="error-message">{error}</div>}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleSave()
            }}
          >
            <WorkflowBasicInfoSection
              name={name}
              setName={setName}
              description={description}
              setDescription={setDescription}
              validationErrors={validationErrors}
              setValidationErrors={setValidationErrors}
            />

            <WorkflowAgentSelectionSection
              agents={agents}
              activeAgents={activeAgents}
              filteredAgents={filteredAgents}
              selectedAgentIds={selectedAgentIds}
              roleFilter={roleFilter}
              setRoleFilter={setRoleFilter}
              defaultAgentId={defaultAgentId}
              setDefaultAgentId={setDefaultAgentId}
              onAgentToggle={handleAgentToggle}
              defaultAgentOptions={defaultAgentOptions}
              validationErrors={validationErrors}
              agentSource={agentSource}
              setAgentSource={setAgentSource}
              selectedTemplateNames={selectedTemplateNames}
              onTemplateToggle={handleTemplateToggle}
            />

            <WorkflowTypeConfigSection
              workflowType={workflowType}
              setWorkflowType={setWorkflowType}
              selectedAgentIds={selectedAgentIds}
              setSelectedAgentIds={setSelectedAgentIds}
              activeAgents={activeAgents}
              parallelMergeStrategy={parallelMergeStrategy}
              setParallelMergeStrategy={setParallelMergeStrategy}
              supervisorAgentId={supervisorAgentId}
              setSupervisorAgentId={setSupervisorAgentId}
              maxIterations={maxIterations}
              setMaxIterations={setMaxIterations}
              memoryMessageLimitInput={memoryMessageLimitInput}
              setMemoryMessageLimitInput={setMemoryMessageLimitInput}
              executionModeChoice={executionModeChoice}
              setExecutionModeChoice={setExecutionModeChoice}
              expertCouncilEnabled={expertCouncilEnabled}
              setExpertCouncilEnabled={setExpertCouncilEnabled}
              workflowGraphInput={workflowGraphInput}
              setWorkflowGraphInput={setWorkflowGraphInput}
              workflowPrompt={workflowPrompt}
              setWorkflowPrompt={setWorkflowPrompt}
              isGeneratingWorkflow={isGeneratingWorkflow}
              onGenerateWorkflowFromPrompt={handleGenerateWorkflowFromPrompt}
              connectedProviders={connectedProviders}
              parsedGraph={parsedGraph}
              setShowGraphDocs={setShowGraphDocs}
              setShowCustomBuilder={setShowCustomBuilder}
              setShowGraphPreview={setShowGraphPreview}
              validationErrors={validationErrors}
              setValidationErrors={setValidationErrors}
              projectManagerConfig={projectManagerConfig}
              setProjectManagerConfig={setProjectManagerConfig}
            />

            <WorkflowPromptConfigSection
              selectedAgentIds={selectedAgentIds}
              agents={agents}
              promptConfig={promptConfig}
              updateAgentPrompt={updateAgentPrompt}
              updateSynthesisPrompt={updateSynthesisPrompt}
              setPromptConfig={setPromptConfig}
              onEditPromptTemplate={(template) => setPromptEditorTemplate(template)}
            />

            <ExpertCouncilConfigSection
              expertCouncilEnabled={expertCouncilEnabled}
              expertCouncilDefaultMode={expertCouncilDefaultMode}
              setExpertCouncilDefaultMode={setExpertCouncilDefaultMode}
              expertCouncilAllowModeOverride={expertCouncilAllowModeOverride}
              setExpertCouncilAllowModeOverride={setExpertCouncilAllowModeOverride}
              expertCouncilMinCouncilSizeInput={expertCouncilMinCouncilSizeInput}
              setExpertCouncilMinCouncilSizeInput={setExpertCouncilMinCouncilSizeInput}
              expertCouncilMaxCouncilSizeInput={expertCouncilMaxCouncilSizeInput}
              setExpertCouncilMaxCouncilSizeInput={setExpertCouncilMaxCouncilSizeInput}
              expertCouncilSelfExclusionEnabled={expertCouncilSelfExclusionEnabled}
              setExpertCouncilSelfExclusionEnabled={setExpertCouncilSelfExclusionEnabled}
              expertCouncilCouncilModels={expertCouncilCouncilModels}
              expertCouncilChairmanModel={expertCouncilChairmanModel}
              setExpertCouncilChairmanModel={setExpertCouncilChairmanModel}
              onCouncilModelChange={handleCouncilModelChange}
              onCouncilModelRemove={handleCouncilModelRemove}
              onCouncilModelAdd={handleCouncilModelAdd}
              expertCouncilConsensusThresholdInput={expertCouncilConsensusThresholdInput}
              setExpertCouncilConsensusThresholdInput={setExpertCouncilConsensusThresholdInput}
              expertCouncilMaxCostInput={expertCouncilMaxCostInput}
              setExpertCouncilMaxCostInput={setExpertCouncilMaxCostInput}
              expertCouncilCachingEnabled={expertCouncilCachingEnabled}
              setExpertCouncilCachingEnabled={setExpertCouncilCachingEnabled}
              expertCouncilCacheHoursInput={expertCouncilCacheHoursInput}
              setExpertCouncilCacheHoursInput={setExpertCouncilCacheHoursInput}
              providerOptions={providerOptions}
            />

            <div className="modal-actions">
              <Button variant="ghost" type="button" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || (activeAgents.length === 0 && selectedTemplateNames.length === 0)}>
                {isSaving ? 'Saving...' : workflow ? 'Update Workflow' : 'Create Workflow'}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <WorkflowFormModals
        promptEditorTemplate={promptEditorTemplate}
        setPromptEditorTemplate={setPromptEditorTemplate}
        userId={user?.uid}
        showGraphDocs={showGraphDocs}
        setShowGraphDocs={setShowGraphDocs}
        showGraphPreview={showGraphPreview}
        setShowGraphPreview={setShowGraphPreview}
        parsedGraph={parsedGraph}
        showCustomBuilder={showCustomBuilder}
        setShowCustomBuilder={setShowCustomBuilder}
        workflowGraphInput={workflowGraphInput}
        setWorkflowGraphInput={setWorkflowGraphInput}
        activeAgents={activeAgents}
        selectedAgentIds={selectedAgentIds}
        onCreateAgent={createAgent}
      />
    </>
  )
}
