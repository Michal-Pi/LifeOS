import type { Id } from '@lifeos/core'

// ----- IDs -----

export type AgentId = Id<'agent'>
export type WorkspaceId = Id<'workspace'>
export type RunId = Id<'run'>
export type MessageId = Id<'message'>
export type ToolId = Id<'tool'>
export type ToolCallRecordId = Id<'toolCallRecord'>

// ----- Sync State -----

export type SyncState = 'synced' | 'pending' | 'conflict'

// ----- Enums -----

export type AgentRole = 'planner' | 'researcher' | 'critic' | 'synthesizer' | 'executor' | 'custom'

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'xai'

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused'

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed'

// ----- Agent Configuration -----

export interface AgentConfig {
  agentId: AgentId
  userId: string

  name: string
  role: AgentRole
  systemPrompt: string

  // Model configuration
  modelProvider: ModelProvider
  modelName: string
  temperature?: number // 0-2, default 0.7
  maxTokens?: number // default varies by model

  // Tool permissions
  toolIds?: ToolId[] // Which tools this agent can use

  // Metadata
  description?: string
  archived: boolean
  createdAtMs: number
  updatedAtMs: number

  syncState: SyncState
  version: number
}

// ----- Workspace -----

export interface Workspace {
  workspaceId: WorkspaceId
  userId: string

  name: string
  description?: string

  // Agent configuration
  agentIds: AgentId[] // Agents available in this workspace
  defaultAgentId?: AgentId // Agent that starts the workflow

  // Workflow configuration
  workflowType: 'sequential' | 'parallel' | 'supervisor' | 'custom'
  maxIterations?: number // Prevent infinite loops, default 10

  // Memory configuration (Phase 6A)
  memoryMessageLimit?: number // Optional default for conversation history window

  // Metadata
  archived: boolean
  createdAtMs: number
  updatedAtMs: number

  syncState: SyncState
  version: number
}

// ----- Run (Execution Instance) -----

export interface Run {
  runId: RunId
  workspaceId: WorkspaceId
  userId: string

  // Input
  goal: string // User's input prompt
  context?: Record<string, unknown> // Additional context data
  memoryMessageLimit?: number // Per-run override for conversation history window

  // Status
  status: RunStatus
  currentStep: number
  totalSteps?: number // Estimated

  // Results
  output?: string // Final synthesized output
  error?: string // Error message if failed

  // Phase 5E: Enhanced error tracking
  errorCategory?:
    | 'network'
    | 'auth'
    | 'rate_limit'
    | 'validation'
    | 'timeout'
    | 'internal'
    | 'quota'
  errorDetails?: Record<string, unknown> // Technical details for debugging
  quotaExceeded?: boolean // True if run failed due to quota limits

  // Metrics
  startedAtMs: number
  completedAtMs?: number
  tokensUsed?: number
  estimatedCost?: number // USD

  syncState: SyncState
  version: number
}

// ----- Message (Agent Interaction) -----

export interface ToolCall {
  toolCallId: string
  toolId: ToolId
  toolName: string
  parameters: Record<string, unknown>
}

export interface ToolResult {
  toolCallId: string
  result: unknown
  error?: string
}

export interface Message {
  messageId: MessageId
  runId: RunId
  agentId?: AgentId // Null for user messages

  role: MessageRole
  content: string

  // Tool usage
  toolCalls?: ToolCall[]
  toolResults?: ToolResult[]

  // Metadata
  timestampMs: number
  tokensUsed?: number
}

// ----- Tool Definition -----

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required?: boolean
  properties?: Record<string, ToolParameter> // For nested objects
}

export interface ToolDefinition {
  toolId: ToolId
  userId?: string // Null for global tools, set for user-specific

  name: string
  description: string
  parameters: Record<string, ToolParameter>

  // Security
  requiresAuth: boolean
  allowedModules?: string[] // Which modules can access (e.g., ['calendar', 'todos'])

  // Metadata
  createdAtMs: number
  updatedAtMs: number
}

// ----- Tool Call Record (Phase 5B: Persistence) -----

export interface ToolCallRecord {
  toolCallRecordId: ToolCallRecordId
  runId: RunId
  workspaceId: WorkspaceId
  userId: string
  agentId: AgentId

  // Tool execution details
  toolCallId: string // Provider-specific ID (e.g., OpenAI call_xyz, Anthropic toolu_xyz)
  toolName: string
  toolId: ToolId
  parameters: Record<string, unknown>

  // Execution status
  status: ToolCallStatus
  result?: unknown
  error?: string

  // Phase 5E: Enhanced error tracking
  errorCategory?: 'network' | 'auth' | 'rate_limit' | 'validation' | 'timeout' | 'internal'
  errorDetails?: Record<string, unknown> // Technical details for debugging
  retryAttempt?: number // Number of retry attempts (0 = no retries)

  // Timing metrics
  startedAtMs: number
  completedAtMs?: number
  durationMs?: number

  // Cost tracking
  tokensUsed?: number
  estimatedCost?: number

  // Provider context
  provider: ModelProvider
  modelName: string
  iteration: number // Which iteration of agent execution (1-5)

  syncState: SyncState
  version: number
}

// ----- Input Types for Creation -----

export type CreateAgentInput = Omit<
  AgentConfig,
  'agentId' | 'userId' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version' | 'archived'
>

export type UpdateAgentInput = Partial<
  Omit<AgentConfig, 'agentId' | 'userId' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'>
>

export type CreateWorkspaceInput = Omit<
  Workspace,
  'workspaceId' | 'userId' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version' | 'archived'
>

export type UpdateWorkspaceInput = Partial<
  Omit<
    Workspace,
    'workspaceId' | 'userId' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
  >
>

export type CreateRunInput = Omit<
  Run,
  | 'runId'
  | 'userId'
  | 'status'
  | 'currentStep'
  | 'startedAtMs'
  | 'completedAtMs'
  | 'syncState'
  | 'version'
>

export type CreateMessageInput = Omit<Message, 'messageId' | 'timestampMs'>

export type CreateToolInput = Omit<ToolDefinition, 'toolId' | 'createdAtMs' | 'updatedAtMs'>

export type CreateToolCallRecordInput = Omit<
  ToolCallRecord,
  'toolCallRecordId' | 'syncState' | 'version' | 'completedAtMs' | 'durationMs' | 'result' | 'error'
>
