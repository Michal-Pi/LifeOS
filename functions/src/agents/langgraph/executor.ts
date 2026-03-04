/**
 * Unified LangGraph Workflow Executor
 *
 * Provides a single entry point for executing all workflow types using LangGraph.
 * This replaces the individual executors in workflowExecutor.ts with a unified system.
 */

import type {
  AgentConfig,
  Workflow,
  UnifiedWorkflowState,
  AgentExecutionStep,
  WorkflowExecutionMode,
  ModelTier,
  WorkflowCriticality,
} from '@lifeos/agents'
import { createLogger } from '../../lib/logger.js'
import type { ProviderKeys } from '../providerService.js'
import type { RunEventWriter } from '../runEvents.js'
import type { SearchToolKeys } from '../providerKeys.js'
import type { ToolRegistry } from '../toolExecutor.js'
import { executeSequentialWorkflowLangGraph } from './sequentialGraph.js'
import { executeParallelWorkflowLangGraph } from './parallelGraph.js'
import { executeSupervisorWorkflowLangGraph } from './supervisorGraph.js'
import { executeGenericGraphWorkflowLangGraph } from './genericGraph.js'
import { executeDialecticalWorkflowLangGraph } from './dialecticalGraph.js'
import { executeDeepResearchWorkflowLangGraph } from './deepResearchGraph.js'
import { FirestoreCheckpointer } from './firestoreCheckpointer.js'
import { WorkflowStatus, wrapWorkflowError, getErrorMessage } from './utils.js'
import { createDefaultDialecticalConfig, createDefaultDeepResearchConfig } from '@lifeos/agents'
import type { DeepResearchRunConfig } from '@lifeos/agents'

const log = createLogger('LangGraphExecutor')

/**
 * Configuration for LangGraph workflow execution
 */
export interface LangGraphExecutionConfig {
  workflow: Workflow
  agents: AgentConfig[]
  apiKeys: ProviderKeys
  userId: string
  runId: string
  eventWriter?: RunEventWriter
  toolRegistry?: ToolRegistry
  searchToolKeys?: SearchToolKeys
  enableCheckpointing?: boolean
  executionMode?: WorkflowExecutionMode
  tierOverride?: ModelTier | null
  workflowCriticality?: WorkflowCriticality
}

/**
 * Result from LangGraph workflow execution
 */
export interface LangGraphExecutionResult {
  output: string
  steps: AgentExecutionStep[]
  totalTokensUsed: number
  totalEstimatedCost: number
  totalSteps: number
  status: UnifiedWorkflowState['status']
  pendingInput?: { prompt: string; nodeId: string }
  workflowState?: Record<string, unknown>
  error?: string
}

/**
 * Execute a workflow using the appropriate LangGraph implementation
 *
 * Automatically routes to the correct executor based on workflow type:
 * - sequential: Linear chain of agents
 * - parallel: Fan-out/fan-in execution
 * - supervisor: Delegation-based with supervisor agent
 * - graph/custom: User-defined topology with conditional edges
 * - dialectical: 6-phase Hegelian reasoning cycle (Phase 1)
 */
export async function executeLangGraphWorkflow(
  config: LangGraphExecutionConfig,
  goal: string,
  context?: Record<string, unknown>
): Promise<LangGraphExecutionResult> {
  const {
    workflow,
    agents,
    apiKeys,
    userId,
    runId,
    eventWriter,
    toolRegistry,
    searchToolKeys,
    executionMode,
    tierOverride,
    workflowCriticality,
  } = config

  const workflowType = workflow.workflowType

  try {
    switch (workflowType) {
      case 'sequential': {
        const result = await executeSequentialWorkflowLangGraph(
          {
            workflow,
            agents,
            apiKeys,
            userId,
            runId,
            eventWriter,
            toolRegistry,
            searchToolKeys,
            executionMode,
            tierOverride,
            workflowCriticality,
          },
          goal,
          context
        )
        return {
          output: result.output,
          steps: result.steps,
          totalTokensUsed: result.totalTokensUsed,
          totalEstimatedCost: result.totalEstimatedCost,
          totalSteps: result.totalSteps,
          status: result.status,
        }
      }

      case 'parallel': {
        const result = await executeParallelWorkflowLangGraph(
          {
            workflow,
            agents,
            apiKeys,
            userId,
            runId,
            eventWriter,
            toolRegistry,
            searchToolKeys,
            executionMode,
            tierOverride,
            workflowCriticality,
          },
          goal,
          context
        )
        return {
          output: result.output,
          steps: result.steps,
          totalTokensUsed: result.totalTokensUsed,
          totalEstimatedCost: result.totalEstimatedCost,
          totalSteps: result.totalSteps,
          status: result.status,
        }
      }

      case 'supervisor': {
        // Find supervisor agent (first agent with supervisor role, or first agent)
        const supervisorAgent = agents.find((a) => a.role === 'supervisor') ?? agents[0]
        const workerAgents = agents.filter((a) => a.agentId !== supervisorAgent?.agentId)

        if (!supervisorAgent) {
          throw new Error('No supervisor agent found for supervisor workflow')
        }

        const result = await executeSupervisorWorkflowLangGraph(
          {
            workflow,
            supervisorAgent,
            workerAgents,
            apiKeys,
            userId,
            runId,
            eventWriter,
            toolRegistry,
            searchToolKeys,
            executionMode,
            tierOverride,
            workflowCriticality,
          },
          goal,
          context
        )
        return {
          output: result.output,
          steps: result.steps,
          totalTokensUsed: result.totalTokensUsed,
          totalEstimatedCost: result.totalEstimatedCost,
          totalSteps: result.totalSteps,
          status: result.status,
        }
      }

      case 'graph':
      case 'custom': {
        // Graph and custom workflows require a graph definition
        const graphDef = workflow.workflowGraph
        if (!graphDef) {
          throw new Error(
            `Workflow ${workflow.workflowId} of type '${workflowType}' requires a graph definition`
          )
        }

        const result = await executeGenericGraphWorkflowLangGraph(
          {
            workflow,
            graphDef,
            agents,
            apiKeys,
            userId,
            runId,
            eventWriter,
            toolRegistry,
            searchToolKeys,
            executionMode,
            tierOverride,
            workflowCriticality,
          },
          goal,
          context
        )
        return {
          output: result.output,
          steps: result.steps,
          totalTokensUsed: result.totalTokensUsed,
          totalEstimatedCost: result.totalEstimatedCost,
          totalSteps: result.totalSteps,
          status: result.status,
          pendingInput: result.pendingInput,
          workflowState: result.workflowState,
        }
      }

      case 'dialectical': {
        // Dialectical workflows use the 6-phase Hegelian reasoning cycle
        // Requires at least 2 thesis agents, 1 synthesis agent, and 1 meta agent
        const dialecticalConfig = createDefaultDialecticalConfig()

        // Find thesis agents (thesis_generator role or first N agents)
        const thesisAgents = agents.filter((a) => a.role === 'thesis_generator')
        const thesisAgentsToUse =
          thesisAgents.length >= 2 ? thesisAgents : agents.slice(0, Math.min(3, agents.length))

        if (thesisAgents.length < 2) {
          log.warn(
            `No agents with 'thesis_generator' role found, falling back to first ${thesisAgentsToUse.length} agents`,
            {
              foundCount: thesisAgents.length,
              fallbackAgents: thesisAgentsToUse.map((a) => `${a.name} (${a.role})`),
            }
          )
        }

        // Find synthesis agents (can have multiple for competitive synthesis)
        const synthesisAgentsFromRoles = agents.filter(
          (a) => a.role === 'synthesis_agent' || a.role === 'synthesizer'
        )
        const synthesisAgents =
          synthesisAgentsFromRoles.length > 0
            ? synthesisAgentsFromRoles
            : [agents[agents.length - 1] ?? thesisAgentsToUse[0]]

        if (synthesisAgentsFromRoles.length === 0) {
          log.warn('No agents with synthesis_agent or synthesizer role', {
            fallback: synthesisAgents[0]?.name,
          })
        }

        // Find meta agent
        const metaAgent = agents.find((a) => a.role === 'meta_reflection') ?? synthesisAgents[0]

        if (!agents.find((a) => a.role === 'meta_reflection')) {
          log.warn('No agent with meta_reflection role', { fallback: metaAgent?.name })
        }

        if (thesisAgentsToUse.length < 2) {
          throw new Error('Dialectical workflow requires at least 2 agents for thesis generation')
        }

        const result = await executeDialecticalWorkflowLangGraph(
          {
            workflow,
            dialecticalConfig,
            thesisAgents: thesisAgentsToUse,
            synthesisAgents,
            metaAgent,
            apiKeys,
            userId,
            runId,
            eventWriter,
            toolRegistry,
            searchToolKeys,
            executionMode,
            tierOverride,
            workflowCriticality,
          },
          goal,
          context
        )
        return {
          output: result.output,
          steps: result.steps,
          totalTokensUsed: result.totalTokensUsed,
          totalEstimatedCost: result.totalEstimatedCost,
          totalSteps: result.steps.length,
          status: result.status,
          workflowState: {
            totalCycles: result.totalCycles,
            conceptualVelocity: result.conceptualVelocity,
            contradictionsFound: result.contradictionsFound,
            // Full dialectical state for visualization
            dialectical: result.dialecticalState,
          },
        }
      }

      case 'deep_research': {
        // Deep research uses budget-aware KG-building pipeline with dialectical reasoning
        const deepResearchConfig: DeepResearchRunConfig =
          (context?.deepResearchConfig as DeepResearchRunConfig) ??
          createDefaultDeepResearchConfig()

        // Find agents by role
        const plannerAgent = agents.find((a) => a.role === 'research_planner') ?? agents[0]
        const extractionAgentDR = agents.find((a) => a.role === 'claim_extractor') ?? agents[0]
        const gapAnalysisAgent = agents.find((a) => a.role === 'gap_analyst') ?? agents[0]
        const answerAgentDR = agents.find((a) => a.role === 'answer_generator') ?? agents[0]
        const thesisAgentsDR = agents.filter((a) => a.role === 'thesis_generator')
        const synthesisAgentsDR = agents.filter(
          (a) => a.role === 'synthesis_agent' || a.role === 'synthesizer'
        )
        const metaAgentDR = agents.find((a) => a.role === 'meta_reflection') ?? agents[0]

        // Fallbacks for thesis agents (need at least 2)
        const thesisAgentsToUseDR =
          thesisAgentsDR.length >= 2 ? thesisAgentsDR : agents.slice(0, Math.min(3, agents.length))

        const synthesisAgentsToUseDR =
          synthesisAgentsDR.length > 0
            ? synthesisAgentsDR
            : [agents[agents.length - 1] ?? agents[0]]

        const result = await executeDeepResearchWorkflowLangGraph(
          {
            workflow,
            researchConfig: deepResearchConfig,
            plannerAgent,
            extractionAgent: extractionAgentDR,
            gapAnalysisAgent,
            answerAgent: answerAgentDR,
            thesisAgents: thesisAgentsToUseDR,
            synthesisAgents: synthesisAgentsToUseDR,
            metaAgent: metaAgentDR,
            apiKeys,
            userId,
            runId,
            eventWriter,
            toolRegistry,
            searchToolKeys,
            executionMode,
            tierOverride,
            workflowCriticality,
          },
          goal,
          context
        )

        return {
          output: result.output,
          steps: result.steps,
          totalTokensUsed: result.totalTokensUsed,
          totalEstimatedCost: result.totalEstimatedCost,
          totalSteps: result.steps.length,
          status: result.status,
          workflowState: {
            budget: result.budget,
            sources: result.sources,
            extractedClaims: result.extractedClaims,
            kgSnapshots: result.kgSnapshots,
            gapIterationsUsed: result.gapIterationsUsed,
            answer: result.answer,
          },
        }
      }

      default: {
        // Unknown workflow type - try to execute as graph if graph definition exists
        if (workflow.workflowGraph) {
          log.warn('Unknown workflow type, falling back to graph execution', { workflowType })
          const result = await executeGenericGraphWorkflowLangGraph(
            {
              workflow,
              graphDef: workflow.workflowGraph,
              agents,
              apiKeys,
              userId,
              runId,
              eventWriter,
              toolRegistry,
              searchToolKeys,
              executionMode,
              tierOverride,
              workflowCriticality,
            },
            goal,
            context
          )
          return {
            output: result.output,
            steps: result.steps,
            totalTokensUsed: result.totalTokensUsed,
            totalEstimatedCost: result.totalEstimatedCost,
            totalSteps: result.totalSteps,
            status: result.status,
            pendingInput: result.pendingInput,
            workflowState: result.workflowState,
          }
        }

        throw new Error(`Unsupported workflow type: ${workflowType}`)
      }
    }
  } catch (error) {
    // Wrap the error to preserve stack trace and add context
    const wrappedError = wrapWorkflowError(error, workflow.workflowId, runId)
    const errorMessage = getErrorMessage(wrappedError)

    // Log with full stack trace for debugging
    log.error('Workflow execution failed', wrappedError, {
      workflowId: workflow.workflowId,
      runId,
    })

    return {
      output: '',
      steps: [],
      totalTokensUsed: 0,
      totalEstimatedCost: 0,
      totalSteps: 0,
      status: WorkflowStatus.FAILED,
      error: errorMessage,
    }
  }
}

/**
 * Check if a workflow type is supported by LangGraph
 */
export function isLangGraphSupported(workflowType: string): boolean {
  return [
    'sequential',
    'parallel',
    'supervisor',
    'graph',
    'custom',
    'dialectical',
    'deep_research',
  ].includes(workflowType)
}

/**
 * Get a human-readable description of a workflow type
 */
export function getWorkflowTypeDescription(workflowType: string): string {
  switch (workflowType) {
    case 'sequential':
      return 'Linear chain of agents where each agent receives the output of the previous'
    case 'parallel':
      return 'Fan-out execution where agents run in parallel and outputs are merged'
    case 'supervisor':
      return 'Supervisor agent delegates tasks to worker agents and synthesizes results'
    case 'graph':
      return 'User-defined graph topology with conditional edges and join nodes'
    case 'custom':
      return 'Preset graph configuration with customizable parameters'
    case 'dialectical':
      return '6-phase Hegelian reasoning cycle (thesis → antithesis → synthesis)'
    case 'deep_research':
      return 'Budget-aware deep research with KG construction, dialectical reasoning, and iterative gap analysis'
    default:
      return `Unknown workflow type: ${workflowType}`
  }
}

/**
 * Create a checkpointer for resumable workflow execution
 */
export function createWorkflowCheckpointer(
  userId: string,
  workflowId: string,
  runId: string
): FirestoreCheckpointer {
  return new FirestoreCheckpointer({ userId, workflowId, runId })
}
