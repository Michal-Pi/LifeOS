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

export const RunStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'paused',
  'waiting_for_input',
])

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool'])

export const SyncStateSchema = z.enum(['synced', 'pending', 'conflict'])

export const WorkflowTypeSchema = z.enum(['sequential', 'parallel', 'supervisor', 'custom', 'graph'])

export const WorkflowNodeTypeSchema = z.enum(['agent', 'tool', 'human_input', 'join', 'end'])

export const WorkflowEdgeConditionTypeSchema = z.enum(['always', 'equals', 'contains', 'regex'])

export const JoinAggregationModeSchema = z.enum(['list', 'ranked', 'consensus'])

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

export const ToolImplementationSchema = z.object({
  type: z.literal('javascript'),
  code: z.string().min(1),
})

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
  implementation: ToolImplementationSchema.optional(),
  source: z.enum(['builtin', 'custom']).optional(),
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
  workflowGraph: z
    .object({
      version: z.literal(1),
      startNodeId: z.string(),
      nodes: z.array(
        z.object({
          id: z.string(),
          type: WorkflowNodeTypeSchema,
          agentId: z.string().optional(),
          toolId: z.string().optional(),
          label: z.string().optional(),
          outputKey: z.string().optional(),
          aggregationMode: JoinAggregationModeSchema.optional(),
        })
      ),
      edges: z.array(
        z.object({
          from: z.string(),
          to: z.string(),
          condition: z.object({
            type: WorkflowEdgeConditionTypeSchema,
            key: z.string().optional(),
            value: z.string().optional(),
          }),
        })
      ),
      limits: z
        .object({
          maxNodeVisits: z.number().int().positive().optional(),
          maxEdgeRepeats: z.number().int().positive().optional(),
        })
        .optional(),
    })
    .optional(),
  maxIterations: z.number().int().positive().max(50).optional(),
  memoryMessageLimit: z.number().int().positive().max(200).optional(),
  archived: z.boolean(),
  createdAtMs: z.number().int().positive(),
  updatedAtMs: z.number().int().positive(),
  syncState: SyncStateSchema,
  version: z.number().int().nonnegative(),
})

export const AgentTemplateSchema = z.object({
  templateId: z.string(),
  userId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  agentConfig: AgentConfigSchema.omit({
    agentId: true,
    userId: true,
    archived: true,
    createdAtMs: true,
    updatedAtMs: true,
    syncState: true,
    version: true,
  }),
  createdAtMs: z.number().int().positive(),
  updatedAtMs: z.number().int().positive(),
})

export const WorkspaceTemplateSchema = z.object({
  templateId: z.string(),
  userId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  workspaceConfig: WorkspaceSchema.omit({
    workspaceId: true,
    userId: true,
    archived: true,
    createdAtMs: true,
    updatedAtMs: true,
    syncState: true,
    version: true,
  }),
  createdAtMs: z.number().int().positive(),
  updatedAtMs: z.number().int().positive(),
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
  errorCategory: z
    .enum(['network', 'auth', 'rate_limit', 'validation', 'timeout', 'internal', 'quota'])
    .optional(),
  errorDetails: z.record(z.string(), z.unknown()).optional(),
  quotaExceeded: z.boolean().optional(),
  pendingInput: z
    .object({
      prompt: z.string(),
      nodeId: z.string(),
    })
    .optional(),
  workflowState: z
    .object({
      currentNodeId: z.string().optional(),
      pendingNodes: z.array(z.string()).optional(),
      visitedCount: z.record(z.string(), z.number().int().nonnegative()).optional(),
      edgeHistory: z
        .array(
          z.object({
            from: z.string(),
            to: z.string(),
            atMs: z.number().int().positive(),
          })
        )
        .optional(),
      joinOutputs: z.record(z.string(), z.unknown()).optional(),
      namedOutputs: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
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
