/**
 * Model Settings Domain
 *
 * Allows users to configure default models for each provider.
 * These defaults are used when creating new agents or workflows.
 */

import type { ModelProvider, ModelTier, WorkflowCriticality, WorkflowExecutionMode } from './models'

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
    defaultModel: 'claude-sonnet-4-6',
    availableModels: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
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
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Normal)' },
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

// ----- Model Tier System -----

/**
 * Maps a ModelTier to the concrete model name for each provider.
 */
export const MODEL_TIER_MAP: Record<ModelTier, Record<ModelProvider, string>> = {
  thinking: {
    openai: 'o1',
    anthropic: 'claude-opus-4-6',
    google: 'gemini-3-pro',
    xai: 'grok-4',
  },
  balanced: {
    openai: 'gpt-5.2',
    anthropic: 'claude-sonnet-4-6',
    google: 'gemini-2.5-pro',
    xai: 'grok-4-1-fast-non-reasoning',
  },
  fast: {
    openai: 'gpt-5-mini',
    anthropic: 'claude-haiku-4-5',
    google: 'gemini-3-flash',
    xai: 'grok-3-mini',
  },
}

/**
 * Cost-saving mode downgrade rules.
 * Maps (criticality, templateTier) → effective tier.
 */
export const COST_SAVING_RULES: Record<WorkflowCriticality, Record<ModelTier, ModelTier>> = {
  critical: {
    thinking: 'balanced',
    balanced: 'balanced',
    fast: 'fast',
  },
  core: {
    thinking: 'balanced',
    balanced: 'fast',
    fast: 'fast',
  },
  routine: {
    thinking: 'fast',
    balanced: 'fast',
    fast: 'fast',
  },
}

/**
 * Resolves the effective model for an agent given execution context.
 *
 * Priority: tierOverride > executionMode mapping > agent modelTier > agent modelName (legacy)
 */
export function resolveEffectiveModel(
  agentConfig: { modelProvider: ModelProvider; modelName: string; modelTier?: ModelTier },
  executionMode: WorkflowExecutionMode = 'as_designed',
  tierOverride: ModelTier | null | undefined,
  workflowCriticality: WorkflowCriticality = 'core'
): { provider: ModelProvider; model: string; resolvedTier: ModelTier } {
  // 1. If user forced a specific tier, use it
  if (tierOverride) {
    return {
      provider: agentConfig.modelProvider,
      model: MODEL_TIER_MAP[tierOverride][agentConfig.modelProvider],
      resolvedTier: tierOverride,
    }
  }

  // 2. Determine the agent's base tier
  const baseTier: ModelTier = agentConfig.modelTier ?? inferTierFromModel(agentConfig.modelName)

  // 3. Apply cost-saving rules if in cost_saving mode
  if (executionMode === 'cost_saving') {
    const effectiveTier = COST_SAVING_RULES[workflowCriticality][baseTier]
    return {
      provider: agentConfig.modelProvider,
      model: MODEL_TIER_MAP[effectiveTier][agentConfig.modelProvider],
      resolvedTier: effectiveTier,
    }
  }

  // 4. As-designed mode: use agent's tier directly
  return {
    provider: agentConfig.modelProvider,
    model: MODEL_TIER_MAP[baseTier][agentConfig.modelProvider],
    resolvedTier: baseTier,
  }
}

/**
 * Infers a ModelTier from a concrete model name (for backward compatibility).
 * Used when agentConfig.modelTier is not set (legacy agents).
 */
export function inferTierFromModel(modelName: string): ModelTier {
  for (const [tier, providers] of Object.entries(MODEL_TIER_MAP)) {
    for (const model of Object.values(providers)) {
      if (model === modelName) return tier as ModelTier
    }
  }
  // Default to balanced if unknown model
  return 'balanced'
}
