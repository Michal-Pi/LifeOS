/**
 * Provider Service
 *
 * Unified abstraction layer for all AI providers (OpenAI, Anthropic, Google, Grok).
 * Routes execution requests to the appropriate provider based on agent configuration.
 */

import type { AgentConfig } from '@lifeos/agents'

import { createAnthropicClient, executeWithAnthropic } from './anthropicService.js'
import { createGoogleAIClient, executeWithGoogle } from './googleService.js'
import { createGrokClient, executeWithGrok } from './grokService.js'
import { createOpenAIClient, executeWithOpenAI } from './openaiService.js'

/**
 * Unified execution result from any provider
 */
export interface ProviderExecutionResult {
  output: string
  tokensUsed: number
  estimatedCost: number
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
 * @returns Execution result with output, tokens, cost, and metadata
 */
export async function executeWithProvider(
  agent: AgentConfig,
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKeys: ProviderKeys
): Promise<ProviderExecutionResult> {
  const provider = agent.modelProvider

  switch (provider) {
    case 'openai': {
      if (!apiKeys.openai) {
        throw new Error('OpenAI API key not configured')
      }
      const client = createOpenAIClient(apiKeys.openai)
      const result = await executeWithOpenAI(client, agent, goal, context)
      return {
        ...result,
        provider: 'openai',
        model: agent.modelName ?? 'gpt-4o-mini',
      }
    }

    case 'anthropic': {
      if (!apiKeys.anthropic) {
        throw new Error('Anthropic API key not configured')
      }
      const client = createAnthropicClient(apiKeys.anthropic)
      const result = await executeWithAnthropic(client, agent, goal, context)
      return {
        ...result,
        provider: 'anthropic',
        model: agent.modelName ?? 'claude-3-5-haiku-20241022',
      }
    }

    case 'google': {
      if (!apiKeys.google) {
        throw new Error('Google AI API key not configured')
      }
      const client = createGoogleAIClient(apiKeys.google)
      const result = await executeWithGoogle(client, agent, goal, context)
      return {
        ...result,
        provider: 'google',
        model: agent.modelName ?? 'gemini-1.5-flash',
      }
    }

    case 'xai': {
      if (!apiKeys.grok) {
        throw new Error('xAI (Grok) API key not configured')
      }
      const client = createGrokClient(apiKeys.grok)
      const result = await executeWithGrok(client, agent, goal, context)
      return {
        ...result,
        provider: 'xai',
        model: agent.modelName ?? 'grok-2-1212',
      }
    }

    default:
      throw new Error(`Unsupported AI provider: ${provider}`)
  }
}
