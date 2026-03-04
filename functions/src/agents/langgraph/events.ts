/**
 * Standardized Workflow Event Types
 *
 * Provides a consistent event format for all workflow types.
 * Events are emitted during workflow execution for:
 * - Real-time progress updates
 * - Debugging and tracing
 * - Telemetry collection
 */

// ----- Event Types -----

/**
 * All possible workflow event types
 */
export type WorkflowEventType =
  | 'workflow_start'
  | 'workflow_done'
  | 'workflow_failed'
  | 'agent_start'
  | 'agent_done'
  | 'agent_failed'
  | 'node_start'
  | 'node_done'
  | 'node_failed'
  | 'step_started'
  | 'step_completed'
  | 'tool_start'
  | 'tool_done'
  | 'tool_failed'
  | 'token_delta'
  | 'waiting_for_input'
  | 'input_received'
  | 'checkpoint_saved'
  | 'checkpoint_restored'

/**
 * Error information for failed events
 */
export interface EventError {
  message: string
  code?: string
  retryable?: boolean
  stack?: string
}

/**
 * Metrics included with completion events
 */
export interface EventMetrics {
  tokensUsed?: number
  estimatedCost?: number
  durationMs?: number
  stepCount?: number
}

/**
 * Base workflow event structure
 */
export interface WorkflowEvent {
  /** Event type */
  type: WorkflowEventType

  /** Workflow identifier */
  workflowId: string

  /** Run identifier */
  runId: string

  /** Event timestamp */
  timestamp: number

  /** Agent context (for agent events) */
  agentId?: string
  agentName?: string

  /** Node context (for graph node events) */
  nodeId?: string
  nodeType?: string

  /** Step context */
  stepNumber?: number

  /** Tool context (for tool events) */
  toolId?: string
  toolName?: string

  /** Error context (for failure events) */
  error?: EventError

  /** Metrics (for completion events) */
  metrics?: EventMetrics

  /** Token delta for streaming */
  tokenDelta?: string

  /** Human-in-the-loop prompt */
  inputPrompt?: string

  /** Arbitrary additional data */
  data?: Record<string, unknown>
}

// ----- Event Creators -----

/**
 * Create a workflow event with defaults
 */
export function createEvent(
  base: Partial<WorkflowEvent> & Pick<WorkflowEvent, 'type' | 'workflowId' | 'runId'>
): WorkflowEvent {
  return {
    timestamp: Date.now(),
    ...base,
  }
}

/**
 * Create a workflow start event
 */
export function workflowStartEvent(workflowId: string, runId: string): WorkflowEvent {
  return createEvent({
    type: 'workflow_start',
    workflowId,
    runId,
  })
}

/**
 * Create a workflow done event
 */
export function workflowDoneEvent(
  workflowId: string,
  runId: string,
  metrics?: EventMetrics
): WorkflowEvent {
  return createEvent({
    type: 'workflow_done',
    workflowId,
    runId,
    metrics,
  })
}

/**
 * Create a workflow failed event
 */
export function workflowFailedEvent(
  workflowId: string,
  runId: string,
  error: EventError,
  metrics?: EventMetrics
): WorkflowEvent {
  return createEvent({
    type: 'workflow_failed',
    workflowId,
    runId,
    error,
    metrics,
  })
}

/**
 * Create an agent start event
 */
export function agentStartEvent(
  workflowId: string,
  runId: string,
  agentId: string,
  agentName: string,
  stepNumber?: number
): WorkflowEvent {
  return createEvent({
    type: 'agent_start',
    workflowId,
    runId,
    agentId,
    agentName,
    stepNumber,
  })
}

/**
 * Create an agent done event
 */
export function agentDoneEvent(
  workflowId: string,
  runId: string,
  agentId: string,
  agentName: string,
  metrics?: EventMetrics,
  stepNumber?: number
): WorkflowEvent {
  return createEvent({
    type: 'agent_done',
    workflowId,
    runId,
    agentId,
    agentName,
    metrics,
    stepNumber,
  })
}

/**
 * Create an agent failed event
 */
export function agentFailedEvent(
  workflowId: string,
  runId: string,
  agentId: string,
  agentName: string,
  error: EventError,
  stepNumber?: number
): WorkflowEvent {
  return createEvent({
    type: 'agent_failed',
    workflowId,
    runId,
    agentId,
    agentName,
    error,
    stepNumber,
  })
}

/**
 * Create a node start event
 */
export function nodeStartEvent(
  workflowId: string,
  runId: string,
  nodeId: string,
  nodeType?: string
): WorkflowEvent {
  return createEvent({
    type: 'node_start',
    workflowId,
    runId,
    nodeId,
    nodeType,
  })
}

/**
 * Create a node done event
 */
export function nodeDoneEvent(
  workflowId: string,
  runId: string,
  nodeId: string,
  metrics?: EventMetrics
): WorkflowEvent {
  return createEvent({
    type: 'node_done',
    workflowId,
    runId,
    nodeId,
    metrics,
  })
}

/**
 * Create a node failed event
 */
export function nodeFailedEvent(
  workflowId: string,
  runId: string,
  nodeId: string,
  error: EventError
): WorkflowEvent {
  return createEvent({
    type: 'node_failed',
    workflowId,
    runId,
    nodeId,
    error,
  })
}

/**
 * Create a tool start event
 */
export function toolStartEvent(
  workflowId: string,
  runId: string,
  toolId: string,
  toolName: string,
  agentId?: string
): WorkflowEvent {
  return createEvent({
    type: 'tool_start',
    workflowId,
    runId,
    toolId,
    toolName,
    agentId,
  })
}

/**
 * Create a tool done event
 */
export function toolDoneEvent(
  workflowId: string,
  runId: string,
  toolId: string,
  toolName: string,
  metrics?: EventMetrics,
  agentId?: string
): WorkflowEvent {
  return createEvent({
    type: 'tool_done',
    workflowId,
    runId,
    toolId,
    toolName,
    metrics,
    agentId,
  })
}

/**
 * Create a tool failed event
 */
export function toolFailedEvent(
  workflowId: string,
  runId: string,
  toolId: string,
  toolName: string,
  error: EventError,
  agentId?: string
): WorkflowEvent {
  return createEvent({
    type: 'tool_failed',
    workflowId,
    runId,
    toolId,
    toolName,
    error,
    agentId,
  })
}

/**
 * Create a token delta event for streaming
 */
export function tokenDeltaEvent(
  workflowId: string,
  runId: string,
  tokenDelta: string,
  agentId?: string
): WorkflowEvent {
  return createEvent({
    type: 'token_delta',
    workflowId,
    runId,
    tokenDelta,
    agentId,
  })
}

/**
 * Create a waiting for input event
 */
export function waitingForInputEvent(
  workflowId: string,
  runId: string,
  nodeId: string,
  inputPrompt: string
): WorkflowEvent {
  return createEvent({
    type: 'waiting_for_input',
    workflowId,
    runId,
    nodeId,
    inputPrompt,
  })
}

/**
 * Create an input received event
 */
export function inputReceivedEvent(
  workflowId: string,
  runId: string,
  nodeId: string
): WorkflowEvent {
  return createEvent({
    type: 'input_received',
    workflowId,
    runId,
    nodeId,
  })
}

/**
 * Create a checkpoint saved event
 */
export function checkpointSavedEvent(
  workflowId: string,
  runId: string,
  checkpointId: string
): WorkflowEvent {
  return createEvent({
    type: 'checkpoint_saved',
    workflowId,
    runId,
    data: { checkpointId },
  })
}

/**
 * Create a checkpoint restored event
 */
export function checkpointRestoredEvent(
  workflowId: string,
  runId: string,
  checkpointId: string
): WorkflowEvent {
  return createEvent({
    type: 'checkpoint_restored',
    workflowId,
    runId,
    data: { checkpointId },
  })
}

/**
 * Create a step started event
 */
export function stepStartedEvent(params: {
  workflowId: string
  runId: string
  agentId: string
  agentName: string
  stepIndex: number
  totalSteps: number
}): WorkflowEvent {
  return createEvent({
    type: 'step_started',
    workflowId: params.workflowId,
    runId: params.runId,
    agentId: params.agentId,
    agentName: params.agentName,
    stepNumber: params.stepIndex,
    data: { totalSteps: params.totalSteps },
  })
}

/**
 * Create a step completed event
 */
export function stepCompletedEvent(params: {
  workflowId: string
  runId: string
  agentId: string
  agentName: string
  stepIndex: number
  totalSteps: number
  cumulativeCost: number
  cumulativeTokens: number
  durationMs: number
}): WorkflowEvent {
  return createEvent({
    type: 'step_completed',
    workflowId: params.workflowId,
    runId: params.runId,
    agentId: params.agentId,
    agentName: params.agentName,
    stepNumber: params.stepIndex,
    data: {
      totalSteps: params.totalSteps,
      cumulativeCost: params.cumulativeCost,
      cumulativeTokens: params.cumulativeTokens,
    },
    metrics: {
      durationMs: params.durationMs,
      estimatedCost: params.cumulativeCost,
      tokensUsed: params.cumulativeTokens,
    },
  })
}

// ----- Event Helpers -----

/**
 * Check if an event represents a failure
 */
export function isFailureEvent(event: WorkflowEvent): boolean {
  return event.type.endsWith('_failed')
}

/**
 * Check if an event represents a completion
 */
export function isCompletionEvent(event: WorkflowEvent): boolean {
  return event.type.endsWith('_done')
}

/**
 * Check if an event represents the start of something
 */
export function isStartEvent(event: WorkflowEvent): boolean {
  return event.type.endsWith('_start')
}

/**
 * Extract error from an event if present
 */
export function extractEventError(event: WorkflowEvent): EventError | undefined {
  return event.error
}

/**
 * Format event for logging
 */
export function formatEventForLog(event: WorkflowEvent): string {
  const parts = [
    `[${event.type}]`,
    `workflow=${event.workflowId.slice(0, 8)}`,
    `run=${event.runId.slice(0, 8)}`,
  ]

  if (event.agentId) {
    parts.push(`agent=${event.agentId}`)
  }
  if (event.nodeId) {
    parts.push(`node=${event.nodeId}`)
  }
  if (event.stepNumber !== undefined) {
    parts.push(`step=${event.stepNumber}`)
  }
  if (event.error) {
    parts.push(`error="${event.error.message}"`)
  }
  if (event.metrics?.durationMs) {
    parts.push(`duration=${event.metrics.durationMs}ms`)
  }

  return parts.join(' ')
}
