/**
 * Provider Keys
 *
 * Loads AI provider API keys from user settings ONLY.
 * No fallback to system secrets - users must configure their own keys.
 *
 * This ensures:
 * 1. Users control their own API costs
 * 2. No unexpected charges on system secrets
 * 3. Clear error messages directing users to configure keys
 */

import { MODEL_TIER_MAP } from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'

import type { ProviderKeys } from './providerService.js'

export interface SearchToolKeys {
  serper?: string
  firecrawl?: string
  exa?: string
  jina?: string
}

/**
 * Load search tool keys from user settings only (no system fallbacks)
 */
export async function loadSearchToolKeys(userId: string): Promise<SearchToolKeys> {
  const db = getFirestore()
  const docRef = db.doc(`users/${userId}/settings/searchToolKeys`)
  const snapshot = await docRef.get()
  const userKeys = snapshot.exists
    ? (snapshot.data() as {
        serperKey?: string
        firecrawlKey?: string
        exaKey?: string
        jinaKey?: string
      })
    : {}

  return {
    serper: userKeys.serperKey || undefined,
    firecrawl: userKeys.firecrawlKey || undefined,
    exa: userKeys.exaKey || undefined,
    jina: userKeys.jinaKey || undefined,
  }
}

/**
 * Load AI provider keys from user settings only (no system fallbacks)
 *
 * Users must configure their own API keys in Settings > Model Settings.
 * This prevents unexpected charges on system secrets.
 */
export async function loadProviderKeys(userId: string): Promise<ProviderKeys> {
  const db = getFirestore()
  const docRef = db.doc(`users/${userId}/settings/aiProviderKeys`)
  const snapshot = await docRef.get()
  const userKeys = snapshot.exists
    ? (snapshot.data() as {
        openaiKey?: string
        anthropicKey?: string
        googleKey?: string
        xaiKey?: string
      })
    : {}

  return {
    openai: userKeys.openaiKey || undefined,
    anthropic: userKeys.anthropicKey || undefined,
    google: userKeys.googleKey || undefined,
    grok: userKeys.xaiKey || undefined,
  }
}

/**
 * Provider preference order for automatic fallback
 */
export type ProviderType = 'anthropic' | 'openai' | 'google' | 'grok'

const DEFAULT_PROVIDER_ORDER: ProviderType[] = ['anthropic', 'openai', 'google', 'grok']

/**
 * Get the first available provider from user's configured keys
 *
 * Tries providers in order: Anthropic → OpenAI → Google → Grok
 * Returns null if no provider is configured
 */
export function getFirstAvailableProvider(
  keys: ProviderKeys,
  preferredOrder: ProviderType[] = DEFAULT_PROVIDER_ORDER
): { provider: ProviderType; apiKey: string } | null {
  for (const provider of preferredOrder) {
    const key = keys[provider === 'grok' ? 'grok' : provider]
    if (key) {
      return { provider, apiKey: key }
    }
  }
  return null
}

/**
 * Check if user has any AI provider configured
 */
export function hasAnyProviderConfigured(keys: ProviderKeys): boolean {
  return !!(keys.anthropic || keys.openai || keys.google || keys.grok)
}

/**
 * Get list of configured providers
 */
export function getConfiguredProviders(keys: ProviderKeys): ProviderType[] {
  const configured: ProviderType[] = []
  if (keys.anthropic) configured.push('anthropic')
  if (keys.openai) configured.push('openai')
  if (keys.google) configured.push('google')
  if (keys.grok) configured.push('grok')
  return configured
}

/**
 * Error class for missing API key configuration
 * Frontend can detect this error type and show appropriate UI
 */
export class NoAPIKeyConfiguredError extends Error {
  readonly code = 'NO_API_KEY_CONFIGURED'
  readonly isRetryable = false

  constructor(
    message: string = 'No AI provider API key configured. Please add your API key in Settings → Model Settings.'
  ) {
    super(message)
    this.name = 'NoAPIKeyConfiguredError'
  }
}

/**
 * Default model names for each provider (used for fallback)
 */
export const DEFAULT_MODELS: Record<ProviderType, string> = {
  anthropic: MODEL_TIER_MAP.fast.anthropic,
  openai: MODEL_TIER_MAP.fast.openai,
  google: MODEL_TIER_MAP.fast.google,
  grok: MODEL_TIER_MAP.fast.xai,
}
