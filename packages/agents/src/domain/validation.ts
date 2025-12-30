import { z } from 'zod'

// ----- Enums -----

export const AgentRoleSchema = z.enum([
  'planner',
  'researcher',
  'critic',
  'synthesizer',
  'executor',
  'custom',
])

export const ModelProviderSchema = z.enum(['openai', 'anthropic', 'google', 'xai'])

export const RunStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'paused'])

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool'])

export const SyncStateSchema = z.enum(['synced', 'pending', 'conflict'])

export const WorkflowTypeSchema = z.enum(['sequential', 'parallel', 'supervisor', 'custom'])

// ----- Tool Schemas -----

export const ToolParameterSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
    description: z.string(),
    required: z.boolean().optional(),
    properties: z
      .record(
        z.string(),
        z.lazy(() => ToolParameterSchema)
      )
      .optional(),
  })
)

export const ToolCallSchema = z.object({
  toolCallId: z.string(),
  toolId: z.string(),
  toolName: z.string(),
  parameters: z.record(z.string(), z.unknown()),
})

export const ToolResultSchema = z.object({
  toolCallId: z.string(),
  result: z.unknown(),
  error: z.string().optional(),
})

export const ToolDefinitionSchema = z.object({
  toolId: z.string(),
  userId: z.string().optional(),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  parameters: z.record(z.string(), ToolParameterSchema),
  requiresAuth: z.boolean(),
  allowedModules: z.array(z.string()).optional(),
  createdAtMs: z.number().int().positive(),
  updatedAtMs: z.number().int().positive(),
})

// ----- Agent Configuration -----

export const AgentConfigSchema = z.object({
  agentId: z.string(),
  userId: z.string(),
  name: z.string().min(1).max(100),
  role: AgentRoleSchema,
  systemPrompt: z.string().min(1),
  modelProvider: ModelProviderSchema,
  modelName: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  toolIds: z.array(z.string()).optional(),
  description: z.string().max(500).optional(),
  archived: z.boolean(),
  createdAtMs: z.number().int().positive(),
  updatedAtMs: z.number().int().positive(),
  syncState: SyncStateSchema,
  version: z.number().int().nonnegative(),
})

export const CreateAgentInputSchema = AgentConfigSchema.omit({
  agentId: true,
  userId: true,
  createdAtMs: true,
  updatedAtMs: true,
  syncState: true,
  version: true,
  archived: true,
})

export const UpdateAgentInputSchema = CreateAgentInputSchema.partial()

// ----- Workspace -----

export const WorkspaceSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  agentIds: z.array(z.string()),
  defaultAgentId: z.string().optional(),
  workflowType: WorkflowTypeSchema,
  maxIterations: z.number().int().positive().max(50).optional(),
  memoryMessageLimit: z.number().int().positive().max(200).optional(),
  archived: z.boolean(),
  createdAtMs: z.number().int().positive(),
  updatedAtMs: z.number().int().positive(),
  syncState: SyncStateSchema,
  version: z.number().int().nonnegative(),
})

export const CreateWorkspaceInputSchema = WorkspaceSchema.omit({
  workspaceId: true,
  userId: true,
  createdAtMs: true,
  updatedAtMs: true,
  syncState: true,
  version: true,
  archived: true,
})

export const UpdateWorkspaceInputSchema = CreateWorkspaceInputSchema.partial()

// ----- Run -----

export const RunSchema = z.object({
  runId: z.string(),
  workspaceId: z.string(),
  userId: z.string(),
  goal: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
  memoryMessageLimit: z.number().int().positive().max(200).optional(),
  status: RunStatusSchema,
  currentStep: z.number().int().nonnegative(),
  totalSteps: z.number().int().positive().optional(),
  output: z.string().optional(),
  error: z.string().optional(),
  startedAtMs: z.number().int().positive(),
  completedAtMs: z.number().int().positive().optional(),
  tokensUsed: z.number().int().nonnegative().optional(),
  estimatedCost: z.number().nonnegative().optional(),
  syncState: SyncStateSchema,
  version: z.number().int().nonnegative(),
})

export const CreateRunInputSchema = RunSchema.omit({
  runId: true,
  userId: true,
  status: true,
  currentStep: true,
  startedAtMs: true,
  completedAtMs: true,
  syncState: true,
  version: true,
})

// ----- Message -----

export const MessageSchema = z.object({
  messageId: z.string(),
  runId: z.string(),
  agentId: z.string().optional(),
  role: MessageRoleSchema,
  content: z.string(),
  toolCalls: z.array(ToolCallSchema).optional(),
  toolResults: z.array(ToolResultSchema).optional(),
  timestampMs: z.number().int().positive(),
  tokensUsed: z.number().int().nonnegative().optional(),
})

export const CreateMessageInputSchema = MessageSchema.omit({
  messageId: true,
  timestampMs: true,
})
