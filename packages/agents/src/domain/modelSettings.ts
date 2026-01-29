/**
 * Model Settings Domain
 *
 * Allows users to configure default models for each provider.
 * These defaults are used when creating new agents or workspaces.
 */

import type { ModelProvider } from './models'

export type { ModelProvider }

export interface ProviderModelConfig {
  /**
   * Default model name for this provider
   */
  defaultModel: string

  /**
   * Available models for this provider (for dropdown)
   */
  availableModels: string[]

  /**
   * Whether this provider is enabled
   */
  enabled: boolean

  /**
   * Optional API key override (stored encrypted)
   */
  apiKeyOverride?: string

  /**
   * Last updated timestamp
   */
  lastUpdatedMs?: number
}

export interface ModelSettings {
  /**
   * User ID who owns these settings
   */
  userId: string

  /**
   * Provider-specific configurations
   */
  providers: {
    openai: ProviderModelConfig
    anthropic: ProviderModelConfig
    google: ProviderModelConfig
    xai: ProviderModelConfig
  }

  /**
   * When settings were created
   */
  createdAtMs: number

  /**
   * When settings were last modified
   */
  updatedAtMs: number
}

/**
 * Default model configurations by provider
 */
export const DEFAULT_MODEL_CONFIGS: Record<ModelProvider, ProviderModelConfig> = {
  openai: {
    defaultModel: 'gpt-4o',
    availableModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    enabled: true,
  },
  anthropic: {
    defaultModel: 'claude-3-5-haiku-20241022',
    availableModels: [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ],
    enabled: true,
  },
  google: {
    defaultModel: 'gemini-1.5-pro',
    availableModels: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'],
    enabled: true,
  },
  xai: {
    defaultModel: 'grok-4',
    availableModels: [
      'grok-4',
      'grok-4-1-fast-reasoning',
      'grok-code-fast-1',
      'grok-2-1212',
      'grok-beta',
    ],
    enabled: true,
  },
}

/**
 * Creates default model settings for a user
 */
export function createDefaultModelSettings(userId: string): ModelSettings {
  const now = Date.now()
  return {
    userId,
    providers: {
      openai: { ...DEFAULT_MODEL_CONFIGS.openai, lastUpdatedMs: now },
      anthropic: { ...DEFAULT_MODEL_CONFIGS.anthropic, lastUpdatedMs: now },
      google: { ...DEFAULT_MODEL_CONFIGS.google, lastUpdatedMs: now },
      xai: { ...DEFAULT_MODEL_CONFIGS.xai, lastUpdatedMs: now },
    },
    createdAtMs: now,
    updatedAtMs: now,
  }
}
