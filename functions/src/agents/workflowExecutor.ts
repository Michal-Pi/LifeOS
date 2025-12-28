/**
 * Workflow Executor
 *
 * Orchestrates multi-agent workflows with different execution patterns.
 * Supports sequential, parallel, and supervisor-based agent coordination.
 */

import type { AgentConfig, Run, Workspace } from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'

import type { ProviderKeys } from './providerService.js'
import { executeWithProvider } from './providerService.js'

/**
 * Result from a single agent execution within a workflow
 */
export interface AgentExecutionStep {
  agentId: string
  agentName: string
  output: string
  tokensUsed: number
  estimatedCost: number
  provider: string
  model: string
  executedAtMs: number
}

/**
 * Result from complete workflow execution
 */
export interface WorkflowExecutionResult {
  output: string // Final output from the workflow
  steps: AgentExecutionStep[] // All execution steps
  totalTokensUsed: number
  totalEstimatedCost: number
  totalSteps: number
}

/**
 * Execute a sequential workflow
 * Agents execute one after another, each receiving the previous agent's output as context
 *
 * @param workspace Workspace configuration
 * @param agents Array of agent configurations in execution order
 * @param goal User's goal/task description
 * @param context Optional initial context
 * @param apiKeys Provider API keys
 * @param maxIterations Maximum number of iterations to prevent infinite loops
 * @param userId User ID for tool execution context
 * @param runId Run ID for tool execution context
 * @returns Workflow execution result
 */
export async function executeSequentialWorkflow(
  workspace: Workspace,
  agents: AgentConfig[],
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKeys: ProviderKeys,
  maxIterations: number = 10,
  userId?: string,
  runId?: string
): Promise<WorkflowExecutionResult> {
  const steps: AgentExecutionStep[] = []
  let currentContext = context ?? {}
  let currentGoal = goal

  // Limit iterations to prevent infinite loops
  const iterationLimit = Math.min(maxIterations, workspace.maxIterations ?? 10)
  const executionCount = Math.min(agents.length, iterationLimit)

  for (let i = 0; i < executionCount; i++) {
    const agent = agents[i]

    console.log(
      `Sequential workflow step ${i + 1}/${executionCount}: Executing agent ${agent.agentId} (${agent.name})`
    )

    // Build tool execution context if userId and runId are provided
    const toolContext =
      userId && runId
        ? {
            userId,
            agentId: agent.agentId,
            workspaceId: workspace.workspaceId,
            runId,
          }
        : undefined

    // Execute agent with current goal and context
    const result = await executeWithProvider(agent, currentGoal, currentContext, apiKeys, toolContext)

    // Record execution step
    const step: AgentExecutionStep = {
      agentId: agent.agentId,
      agentName: agent.name,
      output: result.output,
      tokensUsed: result.tokensUsed,
      estimatedCost: result.estimatedCost,
      provider: result.provider,
      model: result.model,
      executedAtMs: Date.now(),
    }
    steps.push(step)

    // Update context with previous agent's output for next iteration
    currentContext = {
      ...currentContext,
      previousAgentOutput: result.output,
      previousAgentName: agent.name,
      stepNumber: i + 1,
    }

    // For sequential workflows, the output becomes the refined goal for the next agent
    currentGoal = result.output
  }

  // Calculate totals
  const totalTokensUsed = steps.reduce((sum, step) => sum + step.tokensUsed, 0)
  const totalEstimatedCost = steps.reduce((sum, step) => sum + step.estimatedCost, 0)

  return {
    output: steps[steps.length - 1]?.output ?? 'No output generated',
    steps,
    totalTokensUsed,
    totalEstimatedCost,
    totalSteps: steps.length,
  }
}

/**
 * Execute a parallel workflow
 * All agents execute concurrently with the same goal and context
 *
 * @param workspace Workspace configuration
 * @param agents Array of agent configurations
 * @param goal User's goal/task description
 * @param context Optional initial context
 * @param apiKeys Provider API keys
 * @param userId User ID for tool execution context
 * @param runId Run ID for tool execution context
 * @returns Workflow execution result
 */
export async function executeParallelWorkflow(
  workspace: Workspace,
  agents: AgentConfig[],
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKeys: ProviderKeys,
  userId?: string,
  runId?: string
): Promise<WorkflowExecutionResult> {
  console.log(`Parallel workflow: Executing ${agents.length} agents concurrently`)

  // Execute all agents in parallel
  const executionPromises = agents.map(async (agent) => {
    console.log(`Parallel workflow: Starting agent ${agent.agentId} (${agent.name})`)

    // Build tool execution context if userId and runId are provided
    const toolContext =
      userId && runId
        ? {
            userId,
            agentId: agent.agentId,
            workspaceId: workspace.workspaceId,
            runId,
          }
        : undefined

    const result = await executeWithProvider(agent, goal, context, apiKeys, toolContext)

    const step: AgentExecutionStep = {
      agentId: agent.agentId,
      agentName: agent.name,
      output: result.output,
      tokensUsed: result.tokensUsed,
      estimatedCost: result.estimatedCost,
      provider: result.provider,
      model: result.model,
      executedAtMs: Date.now(),
    }

    console.log(`Parallel workflow: Completed agent ${agent.agentId} (${agent.name})`)
    return step
  })

  const steps = await Promise.all(executionPromises)

  // Calculate totals
  const totalTokensUsed = steps.reduce((sum, step) => sum + step.tokensUsed, 0)
  const totalEstimatedCost = steps.reduce((sum, step) => sum + step.estimatedCost, 0)

  // Combine all outputs into a summary
  const combinedOutput = steps
    .map((step) => `**${step.agentName}:**\n${step.output}`)
    .join('\n\n---\n\n')

  return {
    output: combinedOutput,
    steps,
    totalTokensUsed,
    totalEstimatedCost,
    totalSteps: steps.length,
  }
}

/**
 * Execute a supervisor workflow
 * A supervisor agent coordinates and delegates tasks to worker agents
 *
 * @param workspace Workspace configuration
 * @param supervisorAgent The supervisor agent (should be first in workspace.agentIds)
 * @param workerAgents Array of worker agent configurations
 * @param goal User's goal/task description
 * @param context Optional initial context
 * @param apiKeys Provider API keys
 * @param maxIterations Maximum number of iterations
 * @param userId User ID for tool execution context
 * @param runId Run ID for tool execution context
 * @returns Workflow execution result
 */
export async function executeSupervisorWorkflow(
  workspace: Workspace,
  supervisorAgent: AgentConfig,
  workerAgents: AgentConfig[],
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKeys: ProviderKeys,
  maxIterations: number = 10,
  userId?: string,
  runId?: string
): Promise<WorkflowExecutionResult> {
  const steps: AgentExecutionStep[] = []
  const iterationLimit = Math.min(maxIterations, workspace.maxIterations ?? 10)

  console.log(`Supervisor workflow: Starting with supervisor ${supervisorAgent.name}`)

  // Step 1: Supervisor creates execution plan
  const supervisorContext = {
    ...context,
    availableAgents: workerAgents.map((a) => ({
      name: a.name,
      role: a.role,
      description: a.description,
    })),
    instruction:
      'You are a supervisor agent. Analyze the goal and create a delegation plan. Which agents should work on this task and in what order?',
  }

  // Build tool execution context for supervisor
  const supervisorToolContext =
    userId && runId
      ? {
          userId,
          agentId: supervisorAgent.agentId,
          workspaceId: workspace.workspaceId,
          runId,
        }
      : undefined

  const planResult = await executeWithProvider(
    supervisorAgent,
    goal,
    supervisorContext,
    apiKeys,
    supervisorToolContext
  )

  steps.push({
    agentId: supervisorAgent.agentId,
    agentName: `${supervisorAgent.name} (Planning)`,
    output: planResult.output,
    tokensUsed: planResult.tokensUsed,
    estimatedCost: planResult.estimatedCost,
    provider: planResult.provider,
    model: planResult.model,
    executedAtMs: Date.now(),
  })

  // Step 2: Execute worker agents (simplified - execute all workers in sequence)
  let currentContext = {
    ...context,
    supervisorPlan: planResult.output,
  }

  for (let i = 0; i < Math.min(workerAgents.length, iterationLimit - 1); i++) {
    const worker = workerAgents[i]

    console.log(
      `Supervisor workflow: Executing worker ${i + 1}/${workerAgents.length}: ${worker.name}`
    )

    // Build tool execution context for worker
    const workerToolContext =
      userId && runId
        ? {
            userId,
            agentId: worker.agentId,
            workspaceId: workspace.workspaceId,
            runId,
          }
        : undefined

    const result = await executeWithProvider(worker, goal, currentContext, apiKeys, workerToolContext)

    steps.push({
      agentId: worker.agentId,
      agentName: worker.name,
      output: result.output,
      tokensUsed: result.tokensUsed,
      estimatedCost: result.estimatedCost,
      provider: result.provider,
      model: result.model,
      executedAtMs: Date.now(),
    })

    currentContext = {
      ...currentContext,
      [`worker_${i + 1}_output`]: result.output,
      [`worker_${i + 1}_name`]: worker.name,
    }
  }

  // Step 3: Supervisor synthesizes final output
  const synthesisContext = {
    ...currentContext,
    instruction:
      'You are a supervisor agent. Review all worker outputs and synthesize a final comprehensive response.',
  }

  const finalResult = await executeWithProvider(
    supervisorAgent,
    goal,
    synthesisContext,
    apiKeys,
    supervisorToolContext
  )

  steps.push({
    agentId: supervisorAgent.agentId,
    agentName: `${supervisorAgent.name} (Synthesis)`,
    output: finalResult.output,
    tokensUsed: finalResult.tokensUsed,
    estimatedCost: finalResult.estimatedCost,
    provider: finalResult.provider,
    model: finalResult.model,
    executedAtMs: Date.now(),
  })

  // Calculate totals
  const totalTokensUsed = steps.reduce((sum, step) => sum + step.tokensUsed, 0)
  const totalEstimatedCost = steps.reduce((sum, step) => sum + step.estimatedCost, 0)

  return {
    output: finalResult.output,
    steps,
    totalTokensUsed,
    totalEstimatedCost,
    totalSteps: steps.length,
  }
}

/**
 * Main workflow executor that routes to appropriate workflow type
 *
 * @param userId User ID
 * @param workspace Workspace configuration
 * @param run Run configuration
 * @param apiKeys Provider API keys
 * @returns Workflow execution result
 */
export async function executeWorkflow(
  userId: string,
  workspace: Workspace,
  run: Run,
  apiKeys: ProviderKeys
): Promise<WorkflowExecutionResult> {
  const db = getFirestore()

  // Load all agents in the workspace
  const agentDocs = await Promise.all(
    workspace.agentIds.map((agentId) => db.doc(`users/${userId}/agents/${agentId}`).get())
  )

  const agents = agentDocs.filter((doc) => doc.exists).map((doc) => doc.data() as AgentConfig)

  if (agents.length === 0) {
    throw new Error('No agents found in workspace')
  }

  // Route to appropriate workflow executor
  switch (workspace.workflowType) {
    case 'sequential':
      console.log('Executing sequential workflow')
      return executeSequentialWorkflow(
        workspace,
        agents,
        run.goal,
        run.context,
        apiKeys,
        workspace.maxIterations,
        userId,
        run.runId
      )

    case 'parallel':
      console.log('Executing parallel workflow')
      return executeParallelWorkflow(workspace, agents, run.goal, run.context, apiKeys, userId, run.runId)

    case 'supervisor': {
      console.log('Executing supervisor workflow')
      if (agents.length < 2) {
        throw new Error('Supervisor workflow requires at least 2 agents (1 supervisor + 1 worker)')
      }
      // First agent is supervisor, rest are workers
      const supervisorAgent = agents[0]
      const workerAgents = agents.slice(1)
      return executeSupervisorWorkflow(
        workspace,
        supervisorAgent,
        workerAgents,
        run.goal,
        run.context,
        apiKeys,
        workspace.maxIterations,
        userId,
        run.runId
      )
    }

    case 'custom':
      // For now, fall back to sequential for custom workflows
      console.log('Custom workflow not yet implemented, falling back to sequential')
      return executeSequentialWorkflow(
        workspace,
        agents,
        run.goal,
        run.context,
        apiKeys,
        workspace.maxIterations,
        userId,
        run.runId
      )

    default:
      throw new Error(`Unsupported workflow type: ${workspace.workflowType}`)
  }
}
