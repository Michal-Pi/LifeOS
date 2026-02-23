/**
 * Provider Service
 *
 * Unified abstraction layer for all AI providers (OpenAI, Anthropic, Google, Grok).
 * Routes execution requests to the appropriate provider based on agent configuration.
 * Supports tool calling for all providers (Phase 5A).
 */

import type { AgentConfig } from '@lifeos/agents'

// AI provider service modules are loaded lazily to keep Firebase function
// discovery fast. Each SDK (Anthropic, OpenAI, Google AI, Grok/xAI) is only
// loaded when its provider is actually invoked.
import { AgentError, ERROR_MESSAGES } from './errorHandler.js'
import type { StreamContext } from './streamingTypes.js'
import type { BaseToolExecutionContext } from './toolExecutor.js'

/**
 * Unified execution result from any provider
 */
export interface ProviderExecutionResult {
  output: string
  tokensUsed: number
  estimatedCost: number
  iterationsUsed: number
  provider: string
  model: string
}

/**
 * Provider API keys
 */
export interface ProviderKeys {
  openai?: string
  anthropic?: string
  google?: string
  grok?: string
}

/**
 * Execute a task with the appropriate AI provider
 *
 * @param agent Agent configuration (includes provider selection)
 * @param goal User's goal/task description
 * @param context Optional context object
 * @param apiKeys Provider API keys (only the needed one is used)
 * @param toolContext Optional tool execution context (enables tool calling for OpenAI)
 * @returns Execution result with output, tokens, cost, and metadata
 */
export async function executeWithProvider(
  agent: AgentConfig,
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKeys: ProviderKeys,
  toolContext?: BaseToolExecutionContext
): Promise<ProviderExecutionResult> {
  const provider = agent.modelProvider

  switch (provider) {
    case 'openai': {
      if (!apiKeys.openai) {
        const errorMsg = ERROR_MESSAGES.PROVIDER_NOT_CONFIGURED('OpenAI')
        throw new AgentError(errorMsg.message, errorMsg.userMessage, 'auth', false, {
          provider: 'openai',
        })
      }
      const { createOpenAIClient, executeWithOpenAI } = await import('./openaiService.js')
      const client = createOpenAIClient(apiKeys.openai)
      const result = await executeWithOpenAI(client, agent, goal, context, toolContext)
      return {
        ...result,
        provider: 'openai',
        model: agent.modelName ?? 'gpt-5-mini',
      }
    }

    case 'anthropic': {
      if (!apiKeys.anthropic) {
        const errorMsg = ERROR_MESSAGES.PROVIDER_NOT_CONFIGURED('Anthropic')
        throw new AgentError(errorMsg.message, errorMsg.userMessage, 'auth', false, {
          provider: 'anthropic',
        })
      }
      const { createAnthropicClient, executeWithAnthropic } = await import(
        './anthropicService.js'
      )
      const client = createAnthropicClient(apiKeys.anthropic)
      const result = await executeWithAnthropic(client, agent, goal, context, toolContext)
      return {
        ...result,
        provider: 'anthropic',
        model: agent.modelName ?? 'claude-haiku-4-5',
      }
    }

    case 'google': {
      if (!apiKeys.google) {
        const errorMsg = ERROR_MESSAGES.PROVIDER_NOT_CONFIGURED('Google')
        throw new AgentError(errorMsg.message, errorMsg.userMessage, 'auth', false, {
          provider: 'google',
        })
      }
      const { createGoogleAIClient, executeWithGoogle } = await import('./googleService.js')
      const client = createGoogleAIClient(apiKeys.google)
      const result = await executeWithGoogle(client, agent, goal, context, toolContext)
      return {
        ...result,
        provider: 'google',
        model: agent.modelName ?? 'gemini-3-flash',
      }
    }

    case 'xai': {
      if (!apiKeys.grok) {
        const errorMsg = ERROR_MESSAGES.PROVIDER_NOT_CONFIGURED('xAI (Grok)')
        throw new AgentError(errorMsg.message, errorMsg.userMessage, 'auth', false, {
          provider: 'xai',
        })
      }
      const { createGrokClient, executeWithGrok } = await import('./grokService.js')
      const client = createGrokClient(apiKeys.grok)
      const result = await executeWithGrok(client, agent, goal, context, toolContext)
      return {
        ...result,
        provider: 'xai',
        model: agent.modelName ?? 'grok-3-mini',
      }
    }

    default:
      throw new Error(`Unsupported AI provider: ${provider}`)
  }
}

/**
 * Execute a task with streaming output when supported by the provider.
 */
export async function executeWithProviderStreaming(
  agent: AgentConfig,
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKeys: ProviderKeys,
  toolContext: BaseToolExecutionContext | undefined,
  stream: StreamContext
): Promise<ProviderExecutionResult> {
  const provider = agent.modelProvider

  switch (provider) {
    case 'openai': {
      if (!apiKeys.openai) {
        const errorMsg = ERROR_MESSAGES.PROVIDER_NOT_CONFIGURED('OpenAI')
        throw new AgentError(errorMsg.message, errorMsg.userMessage, 'auth', false, {
          provider: 'openai',
        })
      }
      const { createOpenAIClient, executeWithOpenAIStreaming } = await import(
        './openaiService.js'
      )
      const client = createOpenAIClient(apiKeys.openai)
      const result = await executeWithOpenAIStreaming(
        client,
        agent,
        goal,
        context,
        toolContext,
        stream
      )
      return {
        ...result,
        provider: 'openai',
        model: agent.modelName ?? 'gpt-5-mini',
      }
    }

    case 'anthropic': {
      if (!apiKeys.anthropic) {
        const errorMsg = ERROR_MESSAGES.PROVIDER_NOT_CONFIGURED('Anthropic')
        throw new AgentError(errorMsg.message, errorMsg.userMessage, 'auth', false, {
          provider: 'anthropic',
        })
      }
      const { createAnthropicClient, executeWithAnthropicStreaming } = await import(
        './anthropicService.js'
      )
      const client = createAnthropicClient(apiKeys.anthropic)
      const result = await executeWithAnthropicStreaming(
        client,
        agent,
        goal,
        context,
        toolContext,
        stream
      )
      return {
        ...result,
        provider: 'anthropic',
        model: agent.modelName ?? 'claude-haiku-4-5',
      }
    }

    case 'google': {
      if (!apiKeys.google) {
        const errorMsg = ERROR_MESSAGES.PROVIDER_NOT_CONFIGURED('Google')
        throw new AgentError(errorMsg.message, errorMsg.userMessage, 'auth', false, {
          provider: 'google',
        })
      }
      const { createGoogleAIClient, executeWithGoogle } = await import('./googleService.js')
      const client = createGoogleAIClient(apiKeys.google)
      const result = await executeWithGoogle(client, agent, goal, context, toolContext)
      return {
        ...result,
        provider: 'google',
        model: agent.modelName ?? 'gemini-3-flash',
      }
    }

    case 'xai': {
      if (!apiKeys.grok) {
        const errorMsg = ERROR_MESSAGES.PROVIDER_NOT_CONFIGURED('xAI (Grok)')
        throw new AgentError(errorMsg.message, errorMsg.userMessage, 'auth', false, {
          provider: 'xai',
        })
      }
      const { createGrokClient, executeWithGrok } = await import('./grokService.js')
      const client = createGrokClient(apiKeys.grok)
      const result = await executeWithGrok(client, agent, goal, context, toolContext)
      return {
        ...result,
        provider: 'xai',
        model: agent.modelName ?? 'grok-3-mini',
      }
    }

    default:
      throw new Error(`Unsupported AI provider: ${provider}`)
  }
}
