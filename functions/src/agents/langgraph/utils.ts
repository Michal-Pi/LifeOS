/**
 * Shared utilities for LangGraph workflow execution
 *
 * Provides common functionality used across all graph implementations:
 * - Agent execution with streaming support
 * - Status constants
 * - Error handling utilities
 */

import type {
  AgentConfig,
  BrandVoice,
  CoachingContext,
  ModelTier,
  RunId,
  WorkflowCriticality,
  WorkflowExecutionMode,
} from '@lifeos/agents'
import type { AgentExecutionStep } from '@lifeos/agents'
import { resolveEffectiveModel } from '@lifeos/agents'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('AgentExec')
import type { ProviderKeys } from '../providerService.js'
import { executeWithProvider, executeWithProviderStreaming } from '../providerService.js'
import type { RunEventWriter } from '../runEvents.js'
import type { SearchToolKeys } from '../providerKeys.js'
import { AskUserInterrupt, type ToolRegistry } from '../toolExecutor.js'
import type { StreamContext } from '../streamingTypes.js'
import { injectBrandVoice } from '../brandVoiceInjection.js'
import { injectCoachingContext } from '../coachingContextInjection.js'
import { injectHistoricalCalibration, type HistoricalEstimate } from '../historicalCalibration.js'
import { recordComponentTelemetry } from '../telemetry/componentTelemetry.js'
import { allocateRuntimePromptVariant } from '../evaluation/runtimeExperimentAllocator.js'

// ----- Status Constants -----

/**
 * Workflow execution status values
 */
export const WorkflowStatus = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PAUSED: 'paused',
  WAITING_FOR_INPUT: 'waiting_for_input',
} as const

export type WorkflowStatusType = (typeof WorkflowStatus)[keyof typeof WorkflowStatus]

/**
 * Agent event status prefixes
 */
export const AgentEventStatus = {
  START: 'agent_start',
  DONE: 'agent_done',
  NODE_START: 'node_start',
  NODE_DONE: 'node_done',
} as const

// ----- Agent Execution Context -----

/**
 * Context required for agent execution
 */
export interface AgentExecutionContext {
  userId: string
  workflowId: string
  workflowType?: string
  runId: string
  apiKeys: ProviderKeys
  eventWriter?: RunEventWriter
  toolRegistry?: ToolRegistry
  searchToolKeys?: SearchToolKeys
  executionMode?: WorkflowExecutionMode
  tierOverride?: ModelTier | null
  workflowCriticality?: WorkflowCriticality
}

/**
 * Options for agent execution
 */
export interface AgentExecutionOptions {
  stepNumber?: number
  totalSteps?: number
  nodeId?: string
  additionalContext?: Record<string, unknown>
  maxIterations?: number
  maxTokens?: number // Per-delegation token budget
  /** Runtime prompt injections — appended to system prompt based on agent role */
  brandVoice?: BrandVoice
  coachingContext?: CoachingContext
  historicalCalibration?: HistoricalEstimate | null
}

const MAX_CAPTURE_CHARS = 20000

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function truncateCapture(value: string): { text: string; truncated: boolean } {
  if (value.length <= MAX_CAPTURE_CHARS) {
    return { text: value, truncated: false }
  }
  return {
    text: `${value.slice(0, MAX_CAPTURE_CHARS - 1)}…`,
    truncated: true,
  }
}

function fingerprint(value: string): string {
  let h1 = 0x811c9dc5 >>> 0
  let h2 = 0x01000193 >>> 0
  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index)
    h1 = Math.imul(h1 ^ charCode, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ charCode, 0x00010001) >>> 0
  }
  return `fp_${h1.toString(36)}_${h2.toString(36)}`
}

function summarizeContextKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort().slice(0, 16)
}

async function recordAgentExecutionCapture(params: {
  userId: string
  runId: string
  workflowType: string
  stepIndex: number
  agentId: string
  agentName: string
  startedAtMs: number
  completedAtMs: number
  effectiveSystemPrompt: string
  userPrompt: string
  fullContext: Record<string, unknown>
  output: string
  provider: string
  model: string
  runtimeExperiment?: {
    experimentId: string
    variantId: string
    variantName: string
    allocationMode: 'thompson' | 'winner'
  } | null
}) {
  const contextPayload = stableStringify(params.fullContext)
  const configPayload = stableStringify({
    agentId: params.agentId,
    workflowType: params.workflowType,
    provider: params.provider,
    model: params.model,
    contextKeys: summarizeContextKeys(params.fullContext),
    experimentId: params.runtimeExperiment?.experimentId ?? null,
    variantId: params.runtimeExperiment?.variantId ?? null,
  })
  const upstreamHandoffPayload = stableStringify(
    params.fullContext.lastOutput ??
      params.fullContext.finalOutput ??
      params.fullContext.namedOutputs ??
      params.fullContext.joinOutputs ??
      params.fullContext.context ??
      null
  )
  const capturedPrompt = truncateCapture(params.effectiveSystemPrompt)
  const capturedUserPrompt = truncateCapture(params.userPrompt)
  const capturedContext = truncateCapture(contextPayload)
  const capturedHandoff = truncateCapture(upstreamHandoffPayload)
  const capturedOutput = truncateCapture(params.output)

  await recordComponentTelemetry(params.userId, {
    runId: params.runId as RunId,
    userId: params.userId,
    workflowType: params.workflowType,
    componentType: 'agent',
    componentId: params.agentId,
    componentName: params.agentName,
    stepIndex: params.stepIndex,
    startedAtMs: params.startedAtMs,
    completedAtMs: params.completedAtMs,
    durationMs: params.completedAtMs - params.startedAtMs,
    metadata: {
      captureVersion: 1,
      effectiveSystemPrompt: capturedPrompt.text,
      effectiveSystemPromptTruncated: capturedPrompt.truncated,
      effectiveSystemPromptFingerprint: fingerprint(params.effectiveSystemPrompt),
      userPrompt: capturedUserPrompt.text,
      userPromptTruncated: capturedUserPrompt.truncated,
      userPromptFingerprint: fingerprint(params.userPrompt),
      configFingerprint: fingerprint(configPayload),
      contextPayload: capturedContext.text,
      contextPayloadTruncated: capturedContext.truncated,
      contextFingerprint: fingerprint(contextPayload),
      contextKeys: summarizeContextKeys(params.fullContext),
      upstreamHandoffPayload: capturedHandoff.text,
      upstreamHandoffTruncated: capturedHandoff.truncated,
      upstreamHandoffFingerprint: fingerprint(upstreamHandoffPayload),
      outputSnapshot: capturedOutput.text,
      outputSnapshotTruncated: capturedOutput.truncated,
      outputFingerprint: fingerprint(params.output),
      runtimeExperimentId: params.runtimeExperiment?.experimentId ?? null,
      runtimeVariantId: params.runtimeExperiment?.variantId ?? null,
      runtimeVariantName: params.runtimeExperiment?.variantName ?? null,
      runtimeExperimentAllocationMode: params.runtimeExperiment?.allocationMode ?? null,
    },
  })
}

// ----- Agent Execution Utility -----

/**
 * Execute an agent with standardized event handling and streaming support
 *
 * This utility consolidates the duplicated agent execution logic across
 * sequential, parallel, supervisor, and generic graphs.
 */
export async function executeAgentWithEvents(
  agent: AgentConfig,
  goal: string,
  context: Record<string, unknown>,
  execContext: AgentExecutionContext,
  options: AgentExecutionOptions = {}
): Promise<AgentExecutionStep> {
  const {
    userId,
    workflowId,
    workflowType,
    runId,
    apiKeys,
    eventWriter,
    toolRegistry,
    searchToolKeys,
    executionMode,
    tierOverride,
    workflowCriticality,
  } = execContext
  const { stepNumber, totalSteps, nodeId, additionalContext } = options
  const startMs = Date.now()

  // Resolve effective model based on execution mode and tier override
  const resolved = resolveEffectiveModel(
    agent,
    executionMode ?? 'as_designed',
    tierOverride,
    workflowCriticality ?? 'core'
  )

  // Create a modified agent config with the resolved model and optional token budget
  const needsOverride =
    resolved.model !== agent.modelName ||
    resolved.provider !== agent.modelProvider ||
    options.maxTokens !== undefined
  const effectiveAgent: AgentConfig = needsOverride
    ? {
        ...agent,
        modelProvider: resolved.provider,
        modelName: resolved.model,
        ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
      }
    : agent

  // Apply runtime prompt injections based on agent role/name
  let injectedPrompt = effectiveAgent.systemPrompt
  if (
    options.brandVoice &&
    (effectiveAgent.role === 'writer' || effectiveAgent.role === 'synthesizer')
  ) {
    injectedPrompt = injectBrandVoice(injectedPrompt, options.brandVoice)
  }
  if (
    options.coachingContext &&
    (effectiveAgent.role === 'advisor' || effectiveAgent.role === 'custom')
  ) {
    injectedPrompt = injectCoachingContext(injectedPrompt, options.coachingContext)
  }
  if (options.historicalCalibration && effectiveAgent.name?.includes('Time-Aware')) {
    injectedPrompt = injectHistoricalCalibration(injectedPrompt, options.historicalCalibration)
  }
  const agentToExecute: AgentConfig =
    injectedPrompt !== effectiveAgent.systemPrompt
      ? { ...effectiveAgent, systemPrompt: injectedPrompt }
      : effectiveAgent

  const runtimeAllocation = await allocateRuntimePromptVariant({
    userId,
    agent: agentToExecute,
    workflowType:
      workflowType ?? (typeof context.workflowType === 'string' ? context.workflowType : undefined),
  })
  const runtimeSystemPromptBase =
    runtimeAllocation?.appliedSystemPrompt ?? agentToExecute.systemPrompt
  const runtimePromptTemplate = runtimeAllocation?.appliedPromptTemplate?.trim()
  const runtimeSystemPrompt = runtimePromptTemplate
    ? `${runtimeSystemPromptBase}\n\n## Active Prompt Variant\n${runtimePromptTemplate}`
    : runtimeSystemPromptBase
  const runtimeAgent: AgentConfig =
    runtimeSystemPrompt !== agentToExecute.systemPrompt
      ? { ...agentToExecute, systemPrompt: runtimeSystemPrompt }
      : agentToExecute

  // Build tool execution context
  const toolContext = {
    userId,
    agentId: effectiveAgent.agentId,
    workflowId,
    runId,
    eventWriter,
    toolRegistry,
    searchToolKeys,
    maxIterations: options.maxIterations,
    workflowContext: context,
  }

  // Build stream context if event writer is available
  const streamContext: StreamContext | undefined = eventWriter
    ? {
        eventWriter,
        agentId: effectiveAgent.agentId,
        agentName: effectiveAgent.name,
        step: stepNumber,
      }
    : undefined

  // Emit agent start event
  const startStatus = nodeId
    ? `${AgentEventStatus.NODE_START}:${nodeId}`
    : stepNumber
      ? `${AgentEventStatus.START}:${stepNumber}`
      : AgentEventStatus.START

  log.info('Executing agent', {
    agentName: effectiveAgent.name,
    provider: effectiveAgent.modelProvider,
    model: effectiveAgent.modelName,
    step: stepNumber,
    goalLength: goal.length,
    streaming: !!streamContext,
  })

  if (eventWriter) {
    await eventWriter.writeEvent({
      type: 'status',
      workflowId,
      agentId: effectiveAgent.agentId,
      agentName: effectiveAgent.name,
      status: startStatus,
    })

    // Emit step_started event for progress tracking
    if (stepNumber !== undefined) {
      await eventWriter.writeEvent({
        type: 'step_started',
        workflowId,
        agentId: effectiveAgent.agentId,
        agentName: effectiveAgent.name,
        step: stepNumber,
        details: {
          totalSteps: totalSteps ?? 0,
        },
      })
    }
  }

  log.info('Agent events emitted, calling provider', {
    agentName: effectiveAgent.name,
    provider: effectiveAgent.modelProvider,
  })

  // Build full context
  const fullContext = {
    ...context,
    ...additionalContext,
  }

  // Execute the agent with resolved model (using injected prompt if applicable)
  let result
  try {
    result = streamContext
      ? await executeWithProviderStreaming(
          runtimeAgent,
          goal,
          fullContext,
          apiKeys,
          toolContext,
          streamContext
        )
      : await executeWithProvider(runtimeAgent, goal, fullContext, apiKeys, toolContext)
  } catch (error) {
    if (error instanceof AskUserInterrupt) {
      log.info('Agent requested user input via ask_user tool', {
        agentName: effectiveAgent.name,
        question: error.question.substring(0, 100),
      })

      // Flush any buffered streaming tokens and emit status event
      if (eventWriter) {
        await eventWriter.flushTokens({
          workflowId,
          agentId: effectiveAgent.agentId,
          agentName: effectiveAgent.name,
          provider: resolved.provider,
          model: resolved.model,
          step: stepNumber,
        })
        await eventWriter.writeEvent({
          type: 'status',
          workflowId,
          agentId: effectiveAgent.agentId,
          agentName: effectiveAgent.name,
          status: 'ask_user',
          details: { question: error.question },
        })
      }

      // Return a step that signals the pause
      return {
        agentId: effectiveAgent.agentId,
        agentName: effectiveAgent.name,
        output: `[Waiting for user input] ${error.question}`,
        tokensUsed: 0,
        estimatedCost: 0,
        provider: resolved.provider,
        model: resolved.model,
        executedAtMs: Date.now(),
        agentRole: agent.role,
        askUserInterrupt: { question: error.question },
      }
    }
    throw error
  }

  // Record execution step
  const step: AgentExecutionStep = {
    agentId: effectiveAgent.agentId,
    agentName: effectiveAgent.name,
    output: result.output,
    tokensUsed: result.tokensUsed,
    estimatedCost: result.estimatedCost,
    provider: result.provider,
    model: result.model,
    executedAtMs: Date.now(),
    iterationsUsed: result.iterationsUsed,
    agentRole: agent.role,
  }

  try {
    await recordAgentExecutionCapture({
      userId,
      runId,
      workflowType:
        workflowType ??
        (typeof fullContext.workflowType === 'string' ? fullContext.workflowType : 'unknown'),
      stepIndex: stepNumber ?? 0,
      agentId: effectiveAgent.agentId,
      agentName: effectiveAgent.name,
      startedAtMs: startMs,
      completedAtMs: step.executedAtMs,
      effectiveSystemPrompt: runtimeAgent.systemPrompt,
      userPrompt: goal,
      fullContext,
      output: result.output,
      provider: result.provider,
      model: result.model,
      runtimeExperiment: runtimeAllocation
        ? {
            experimentId: runtimeAllocation.experimentId,
            variantId: runtimeAllocation.variantId,
            variantName: runtimeAllocation.variantName,
            allocationMode: runtimeAllocation.allocationMode,
          }
        : null,
    })
  } catch (captureError) {
    log.warn('Failed to record agent execution capture', {
      agentId: effectiveAgent.agentId,
      runId,
      error: captureError instanceof Error ? captureError.message : String(captureError),
    })
  }

  // Emit agent done event
  const doneStatus = nodeId
    ? `${AgentEventStatus.NODE_DONE}:${nodeId}`
    : stepNumber
      ? `${AgentEventStatus.DONE}:${stepNumber}`
      : AgentEventStatus.DONE

  if (eventWriter) {
    await eventWriter.flushTokens({
      workflowId,
      agentId: effectiveAgent.agentId,
      agentName: effectiveAgent.name,
      provider: result.provider,
      model: result.model,
      step: stepNumber,
    })
    await eventWriter.writeEvent({
      type: 'status',
      workflowId,
      agentId: effectiveAgent.agentId,
      agentName: effectiveAgent.name,
      status: doneStatus,
    })

    // Emit step_completed event for progress tracking
    if (stepNumber !== undefined) {
      await eventWriter.writeEvent({
        type: 'step_completed',
        workflowId,
        agentId: effectiveAgent.agentId,
        agentName: effectiveAgent.name,
        step: stepNumber,
        details: {
          totalSteps: totalSteps ?? 0,
          cumulativeCost: result.estimatedCost,
          cumulativeTokens: result.tokensUsed,
          durationMs: Date.now() - startMs,
        },
      })
    }
  }

  return step
}

// ----- Ask User Interrupt Utility -----

/**
 * Check an AgentExecutionStep for an ask_user interrupt and return the
 * standard waiting_for_input state update that all graph types understand.
 * Returns null if no interrupt is present.
 */
export function handleAskUserInterrupt(
  step: AgentExecutionStep,
  nodeId: string
): { status: 'waiting_for_input'; pendingInput: { prompt: string; nodeId: string } } | null {
  if (!step.askUserInterrupt) return null
  return {
    status: 'waiting_for_input' as const,
    pendingInput: {
      prompt: step.askUserInterrupt.question,
      nodeId,
    },
  }
}

// ----- Error Handling -----

/**
 * Wrapper for workflow errors that preserves stack traces
 */
export class WorkflowExecutionError extends Error {
  public readonly workflowId: string
  public readonly runId: string
  public readonly nodeId?: string
  public readonly originalError?: Error

  constructor(
    message: string,
    workflowId: string,
    runId: string,
    nodeId?: string,
    originalError?: Error
  ) {
    super(message)
    this.name = 'WorkflowExecutionError'
    this.workflowId = workflowId
    this.runId = runId
    this.nodeId = nodeId
    this.originalError = originalError

    // Preserve the original stack trace if available
    if (originalError?.stack) {
      this.stack = `${this.stack}\nCaused by: ${originalError.stack}`
    }
  }
}

/**
 * Wrap an error with workflow context while preserving the stack trace
 */
export function wrapWorkflowError(
  error: unknown,
  workflowId: string,
  runId: string,
  nodeId?: string
): WorkflowExecutionError {
  if (error instanceof WorkflowExecutionError) {
    return error
  }

  const originalError = error instanceof Error ? error : new Error(String(error))
  const message = `Workflow ${workflowId} failed${nodeId ? ` at node ${nodeId}` : ''}: ${originalError.message}`

  return new WorkflowExecutionError(message, workflowId, runId, nodeId, originalError)
}

/**
 * Extract a safe error message from an unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
