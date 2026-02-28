/**
 * Shared constants and types for WorkflowFormModal and its subcomponents.
 */

import type {
  AgentConfig,
  AgentId,
  AgentRole,
  ExpertCouncilConfig,
  ExecutionMode,
  JoinAggregationMode,
  ModelProvider,
  ProjectManagerConfig,
  PromptReference,
  PromptTemplate,
  Workflow,
} from '@lifeos/agents'
import type { SelectOption } from '@/components/Select'

export type WorkflowType = Workflow['workflowType']

// ----- Constants -----

export const ROLE_LABELS: Record<AgentRole, string> = {
  researcher: 'Researcher',
  planner: 'Planner',
  critic: 'Critic',
  synthesizer: 'Synthesizer',
  executor: 'Executor',
  supervisor: 'Supervisor',
  custom: 'Custom',
  thesis_generator: 'Thesis Generator',
  antithesis_agent: 'Antithesis Agent',
  contradiction_tracker: 'Contradiction Tracker',
  synthesis_agent: 'Synthesis Agent',
  meta_reflection: 'Meta Reflection',
  schema_induction: 'Schema Induction',
  research_planner: 'Research Planner',
  claim_extractor: 'Claim Extractor',
  gap_analyst: 'Gap Analyst',
  answer_generator: 'Answer Generator',
}

export const ROLE_FILTER_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'All Types' },
  { value: 'planner', label: 'Planner' },
  { value: 'researcher', label: 'Researcher' },
  { value: 'critic', label: 'Critic' },
  { value: 'synthesizer', label: 'Synthesizer' },
  { value: 'executor', label: 'Executor' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'custom', label: 'Custom' },
]

export const WORKFLOW_OPTIONS: { value: WorkflowType; label: string; description: string }[] = [
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
  {
    value: 'dialectical',
    label: 'Dialectical',
    description: 'Multi-agent Hegelian reasoning cycle',
  },
]

export const EXECUTION_MODE_OPTIONS: {
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

export const WORKFLOW_SELECT_OPTIONS: SelectOption[] = WORKFLOW_OPTIONS.map((option) => ({
  value: option.value,
  label: `${option.label} - ${option.description}`,
}))

export const EXECUTION_MODE_SELECT_OPTIONS: SelectOption[] = EXECUTION_MODE_OPTIONS.map(
  (option) => ({
    value: option.value,
    label: `${option.label} - ${option.description}`,
  })
)

export const DEFAULT_AGENT_OPTION = 'none'

export const PROVIDER_OPTIONS: { value: ModelProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'xai', label: 'xAI' },
]

export const DEFAULT_PROJECT_MANAGER_CONFIG: ProjectManagerConfig = {
  enabled: false,
  questioningDepth: 'standard',
  autoUseExpertCouncil: false,
  expertCouncilThreshold: 60,
  qualityGateThreshold: 70,
  requireAssumptionValidation: true,
  enableConflictDetection: true,
  enableUserProfiling: true,
}

// ----- Helper Functions -----

export const getDefaultModelForProvider = (provider: ModelProvider): string => {
  switch (provider) {
    case 'openai':
      return 'gpt-5.2'
    case 'anthropic':
      return 'claude-sonnet-4-5'
    case 'google':
      return 'gemini-2.5-pro'
    case 'xai':
      return 'grok-4-1-fast-non-reasoning'
    default:
      return 'gpt-5.2'
  }
}

export const createDefaultCouncilModel = (
  index: number,
  connectedProviders: ModelProvider[] = ['openai']
): ExpertCouncilConfig['councilModels'][number] => {
  const preferredOrder: ModelProvider[] = ['openai', 'anthropic', 'xai', 'google']

  let defaultProvider: ModelProvider

  if (connectedProviders.length === 0) {
    defaultProvider = 'openai'
  } else {
    const preferredIndex = index % preferredOrder.length
    const preferredProvider = preferredOrder[preferredIndex]

    if (connectedProviders.includes(preferredProvider)) {
      defaultProvider = preferredProvider
    } else {
      defaultProvider = connectedProviders[index % connectedProviders.length]
    }
  }

  return {
    modelId: `council-${index + 1}`,
    provider: defaultProvider,
    modelName: getDefaultModelForProvider(defaultProvider),
    temperature: 0.7,
  }
}

// ----- Shared Prop Interfaces -----

export interface WorkflowFormState {
  name: string
  description: string
  selectedAgentIds: AgentId[]
  roleFilter: AgentRole | 'all'
  defaultAgentId: AgentId | undefined
  workflowType: WorkflowType
  maxIterations: number
  memoryMessageLimitInput: string
  workflowGraphInput: string
  workflowPrompt: string
  isGeneratingWorkflow: boolean
  executionModeChoice: 'workflow' | 'expert_council'
  expertCouncilEnabled: boolean
  expertCouncilDefaultMode: ExecutionMode
  expertCouncilAllowModeOverride: boolean
  expertCouncilCouncilModels: ExpertCouncilConfig['councilModels']
  expertCouncilChairmanModel: ExpertCouncilConfig['chairmanModel']
  expertCouncilSelfExclusionEnabled: boolean
  expertCouncilMinCouncilSizeInput: string
  expertCouncilMaxCouncilSizeInput: string
  expertCouncilConsensusThresholdInput: string
  expertCouncilMaxCostInput: string
  expertCouncilCachingEnabled: boolean
  expertCouncilCacheHoursInput: string
  projectManagerConfig: ProjectManagerConfig
  promptConfig: Workflow['promptConfig']
  promptEditorTemplate: PromptTemplate | null
  parallelMergeStrategy: JoinAggregationMode
  showGraphDocs: boolean
  showCustomBuilder: boolean
  showGraphPreview: boolean
  supervisorAgentId: AgentId | undefined
  isSaving: boolean
  error: string | null
  validationErrors: Record<string, string>
}

export interface BasicInfoSectionProps {
  name: string
  setName: (name: string) => void
  description: string
  setDescription: (description: string) => void
  validationErrors: Record<string, string>
  setValidationErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>
}

export interface AgentSelectionSectionProps {
  agents: AgentConfig[]
  activeAgents: AgentConfig[]
  filteredAgents: AgentConfig[]
  selectedAgentIds: AgentId[]
  roleFilter: AgentRole | 'all'
  setRoleFilter: (filter: AgentRole | 'all') => void
  defaultAgentId: AgentId | undefined
  setDefaultAgentId: (id: AgentId | undefined) => void
  onAgentToggle: (agentId: AgentId) => void
  defaultAgentOptions: SelectOption[]
  validationErrors: Record<string, string>
}

export interface WorkflowTypeConfigSectionProps {
  workflowType: WorkflowType
  setWorkflowType: (type: WorkflowType) => void
  selectedAgentIds: AgentId[]
  setSelectedAgentIds: (ids: AgentId[]) => void
  activeAgents: AgentConfig[]
  parallelMergeStrategy: JoinAggregationMode
  setParallelMergeStrategy: (strategy: JoinAggregationMode) => void
  supervisorAgentId: AgentId | undefined
  setSupervisorAgentId: (id: AgentId | undefined) => void
  maxIterations: number
  setMaxIterations: (iterations: number) => void
  memoryMessageLimitInput: string
  setMemoryMessageLimitInput: (value: string) => void
  executionModeChoice: 'workflow' | 'expert_council'
  setExecutionModeChoice: (choice: 'workflow' | 'expert_council') => void
  expertCouncilEnabled: boolean
  setExpertCouncilEnabled: (enabled: boolean) => void
  workflowGraphInput: string
  setWorkflowGraphInput: (input: string) => void
  workflowPrompt: string
  setWorkflowPrompt: (prompt: string) => void
  isGeneratingWorkflow: boolean
  onGenerateWorkflowFromPrompt: () => Promise<void>
  connectedProviders: ModelProvider[]
  parsedGraph: Workflow['workflowGraph'] | null
  setShowGraphDocs: (show: boolean) => void
  setShowCustomBuilder: (show: boolean) => void
  setShowGraphPreview: (show: boolean) => void
  validationErrors: Record<string, string>
  setValidationErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>
  projectManagerConfig: ProjectManagerConfig
  setProjectManagerConfig: React.Dispatch<React.SetStateAction<ProjectManagerConfig>>
}

export interface PromptConfigSectionProps {
  selectedAgentIds: AgentId[]
  agents: AgentConfig[]
  promptConfig: Workflow['promptConfig']
  updateAgentPrompt: (agentId: string, reference: PromptReference) => void
  updateSynthesisPrompt: (key: string, reference: PromptReference) => void
  setPromptConfig: React.Dispatch<React.SetStateAction<Workflow['promptConfig']>>
  onEditPromptTemplate: (template: PromptTemplate) => void
}

export interface ExpertCouncilSectionProps {
  expertCouncilEnabled: boolean
  expertCouncilDefaultMode: ExecutionMode
  setExpertCouncilDefaultMode: (mode: ExecutionMode) => void
  expertCouncilAllowModeOverride: boolean
  setExpertCouncilAllowModeOverride: (allow: boolean) => void
  expertCouncilMinCouncilSizeInput: string
  setExpertCouncilMinCouncilSizeInput: (value: string) => void
  expertCouncilMaxCouncilSizeInput: string
  setExpertCouncilMaxCouncilSizeInput: (value: string) => void
  expertCouncilSelfExclusionEnabled: boolean
  setExpertCouncilSelfExclusionEnabled: (enabled: boolean) => void
  expertCouncilCouncilModels: ExpertCouncilConfig['councilModels']
  expertCouncilChairmanModel: ExpertCouncilConfig['chairmanModel']
  setExpertCouncilChairmanModel: React.Dispatch<
    React.SetStateAction<ExpertCouncilConfig['chairmanModel']>
  >
  onCouncilModelChange: (
    index: number,
    updates: Partial<ExpertCouncilConfig['councilModels'][number]>
  ) => void
  onCouncilModelRemove: (index: number) => void
  onCouncilModelAdd: () => void
  expertCouncilConsensusThresholdInput: string
  setExpertCouncilConsensusThresholdInput: (value: string) => void
  expertCouncilMaxCostInput: string
  setExpertCouncilMaxCostInput: (value: string) => void
  expertCouncilCachingEnabled: boolean
  setExpertCouncilCachingEnabled: (enabled: boolean) => void
  expertCouncilCacheHoursInput: string
  setExpertCouncilCacheHoursInput: (value: string) => void
  providerOptions: SelectOption[]
}

export interface WorkflowFormModalsProps {
  promptEditorTemplate: PromptTemplate | null
  setPromptEditorTemplate: (template: PromptTemplate | null) => void
  userId: string | undefined
  showGraphDocs: boolean
  setShowGraphDocs: (show: boolean) => void
  showGraphPreview: boolean
  setShowGraphPreview: (show: boolean) => void
  parsedGraph: Workflow['workflowGraph'] | null
  showCustomBuilder: boolean
  setShowCustomBuilder: (show: boolean) => void
  workflowGraphInput: string
  setWorkflowGraphInput: (input: string) => void
  activeAgents: AgentConfig[]
  selectedAgentIds: AgentId[]
  onCreateAgent: (input: import('@lifeos/agents').CreateAgentInput) => Promise<AgentConfig>
}
