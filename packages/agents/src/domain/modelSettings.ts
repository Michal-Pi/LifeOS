/**
 * Model Settings Domain
 *
 * Allows users to configure default models for each provider.
 * These defaults are used when creating new agents or workflows.
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
    defaultModel: 'gpt-5.2',
    availableModels: ['o1', 'gpt-5.2', 'gpt-5-mini'],
    enabled: true,
  },
  anthropic: {
    defaultModel: 'claude-sonnet-4-5',
    availableModels: ['claude-opus-4-6', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
    enabled: true,
  },
  google: {
    defaultModel: 'gemini-2.5-pro',
    availableModels: ['gemini-3-pro', 'gemini-2.5-pro', 'gemini-3-flash'],
    enabled: true,
  },
  xai: {
    defaultModel: 'grok-4-1-fast-non-reasoning',
    availableModels: ['grok-4', 'grok-4-1-fast-non-reasoning', 'grok-3-mini'],
    enabled: true,
  },
}

// ----- Shared Model Options for Radix Select Dropdowns -----

export interface ModelOption {
  value: string
  label: string
}

/**
 * Model options grouped by provider — single source of truth for all Select dropdowns.
 * Excludes Max-tier models (too expensive for agent use).
 */
export const MODEL_OPTIONS_BY_PROVIDER: Record<ModelProvider, ModelOption[]> = {
  openai: [
    { value: 'o1', label: 'o1 (Thinking)' },
    { value: 'gpt-5.2', label: 'GPT-5.2 (Normal)' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini (Fast)' },
  ],
  anthropic: [
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Thinking)' },
    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (Normal)' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (Fast)' },
  ],
  google: [
    { value: 'gemini-3-pro', label: 'Gemini 3 Pro (Thinking)' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Normal)' },
    { value: 'gemini-3-flash', label: 'Gemini 3 Flash (Fast)' },
  ],
  xai: [
    { value: 'grok-4', label: 'Grok 4 (Thinking)' },
    { value: 'grok-4-1-fast-non-reasoning', label: 'Grok 4.1 Fast (Normal)' },
    { value: 'grok-3-mini', label: 'Grok 3 Mini (Fast)' },
  ],
}

/** Flat list of all model options across all providers */
export const ALL_MODEL_OPTIONS: ModelOption[] = Object.values(MODEL_OPTIONS_BY_PROVIDER).flat()

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
