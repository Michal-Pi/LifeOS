/**
 * Rate Limiter
 *
 * Firestore-based rate limiting to prevent abuse and manage API costs.
 * Tracks runs per hour, tokens per day, provider calls per minute, and daily cost.
 * Phase 5E.3: Error Handling & Reliability
 */

import type { ModelProvider } from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'
import { RateLimitError } from './errorHandler.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('RateLimiter')

/**
 * Rate limit record stored in Firestore
 * Path: users/{userId}/agentUsage/rateLimits
 */
export interface RateLimitRecord {
  userId: string

  // Time window
  windowStartMs: number
  windowEndMs: number

  // Run limits (per hour)
  runsInWindow: number
  maxRunsPerHour: number

  // Token limits (per day)
  tokensInWindow: number
  maxTokensPerDay: number

  // Provider call limits (per minute, per provider)
  providerCalls: Partial<Record<ModelProvider, number>>
  maxProviderCallsPerMinute: number

  // Cost limits (per day, in USD)
  costInWindow: number
  maxCostPerDay: number

  // Last updated
  lastUpdatedMs: number
}

/**
 * Default rate limits (configurable per user in future)
 */
export const DEFAULT_RATE_LIMITS = {
  maxRunsPerHour: 20,
  maxTokensPerDay: 100000,
  maxProviderCallsPerMinute: 30,
  maxCostPerDay: 5.0, // $5.00 per day
}

/**
 * Time constants
 */
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const MINUTE_MS = 60 * 1000

/**
 * Get or create rate limit record for user
 *
 * @param userId User ID
 * @returns Rate limit record
 */
async function getRateLimitRecord(userId: string): Promise<RateLimitRecord> {
  const db = getFirestore()
  const docRef = db.collection('users').doc(userId).collection('agentUsage').doc('rateLimits')

  const doc = await docRef.get()

  if (!doc.exists) {
    // Create initial record
    const now = Date.now()
    const initialRecord: RateLimitRecord = {
      userId,
      windowStartMs: now,
      windowEndMs: now + HOUR_MS,
      runsInWindow: 0,
      maxRunsPerHour: DEFAULT_RATE_LIMITS.maxRunsPerHour,
      tokensInWindow: 0,
      maxTokensPerDay: DEFAULT_RATE_LIMITS.maxTokensPerDay,
      providerCalls: {},
      maxProviderCallsPerMinute: DEFAULT_RATE_LIMITS.maxProviderCallsPerMinute,
      costInWindow: 0,
      maxCostPerDay: DEFAULT_RATE_LIMITS.maxCostPerDay,
      lastUpdatedMs: now,
    }

    await docRef.set(initialRecord)
    return initialRecord
  }

  return doc.data() as RateLimitRecord
}

/**
 * Reset windows if they've expired
 *
 * @param record Current rate limit record
 * @returns Updated record if windows were reset
 */
function resetExpiredWindows(record: RateLimitRecord): RateLimitRecord {
  const now = Date.now()
  let updated = false

  // Reset hourly run window
  if (now > record.windowEndMs) {
    record.windowStartMs = now
    record.windowEndMs = now + HOUR_MS
    record.runsInWindow = 0
    updated = true
  }

  // Reset daily token/cost windows (24 hours from start)
  if (now > record.windowStartMs + DAY_MS) {
    record.tokensInWindow = 0
    record.costInWindow = 0
    updated = true
  }

  // Reset provider call windows (per minute)
  // We reset provider calls every minute
  if (now > record.lastUpdatedMs + MINUTE_MS) {
    record.providerCalls = {}
    updated = true
  }

  if (updated) {
    record.lastUpdatedMs = now
  }

  return record
}

/**
 * Check if user can start a new run (within rate limits)
 *
 * @param userId User ID
 * @param estimatedTokens Estimated tokens for this run (optional)
 * @throws RateLimitError if any limit is exceeded
 */
export async function checkRunRateLimit(
  userId: string,
  estimatedTokens: number = 0
): Promise<void> {
  const db = getFirestore()
  const docRef = db.collection('users').doc(userId).collection('agentUsage').doc('rateLimits')

  let record = await getRateLimitRecord(userId)
  record = resetExpiredWindows(record)

  // Check runs per hour
  if (record.runsInWindow >= record.maxRunsPerHour) {
    const resetInMs = record.windowEndMs - Date.now()
    const resetInMin = Math.ceil(resetInMs / 60000)

    throw new RateLimitError(
      'user',
      'runs per hour limit',
      `Limit resets in ${resetInMin} minute${resetInMin > 1 ? 's' : ''}.`,
      {
        userId,
        limit: record.maxRunsPerHour,
        used: record.runsInWindow,
        resetInMs,
      }
    )
  }

  // Check tokens per day
  if (estimatedTokens > 0 && record.tokensInWindow + estimatedTokens > record.maxTokensPerDay) {
    const resetInMs = record.windowStartMs + DAY_MS - Date.now()
    const resetInHours = Math.ceil(resetInMs / 3600000)

    throw new RateLimitError(
      'user',
      'tokens per day limit',
      `Limit resets in ${resetInHours} hour${resetInHours > 1 ? 's' : ''}.`,
      {
        userId,
        limit: record.maxTokensPerDay,
        used: record.tokensInWindow,
        resetInMs,
      }
    )
  }

  // Check cost per day
  // For now, just check against existing cost (we don't have upfront cost estimation)
  if (record.costInWindow >= record.maxCostPerDay) {
    const resetInMs = record.windowStartMs + DAY_MS - Date.now()
    const resetInHours = Math.ceil(resetInMs / 3600000)

    throw new RateLimitError(
      'user',
      'daily cost limit',
      `You've reached your $${record.maxCostPerDay.toFixed(2)} daily limit. Limit resets in ${resetInHours} hour${resetInHours > 1 ? 's' : ''}.`,
      {
        userId,
        limit: record.maxCostPerDay,
        used: record.costInWindow,
        resetInMs,
      }
    )
  }

  // Increment run count
  await docRef.update({
    runsInWindow: record.runsInWindow + 1,
    lastUpdatedMs: Date.now(),
  })
}

/**
 * Check if user can make a provider API call (within rate limits)
 *
 * @param userId User ID
 * @param provider AI provider
 * @throws RateLimitError if limit is exceeded
 */
export async function checkProviderRateLimit(
  userId: string,
  provider: ModelProvider
): Promise<void> {
  const db = getFirestore()
  const docRef = db.collection('users').doc(userId).collection('agentUsage').doc('rateLimits')

  let record = await getRateLimitRecord(userId)
  record = resetExpiredWindows(record)

  // Check provider calls per minute
  const providerCalls = record.providerCalls[provider] || 0

  if (providerCalls >= record.maxProviderCallsPerMinute) {
    throw new RateLimitError(
      'provider',
      `${provider} calls per minute limit`,
      'Too many requests. Please wait a moment.',
      {
        userId,
        provider,
        limit: record.maxProviderCallsPerMinute,
        used: providerCalls,
      }
    )
  }

  // Increment provider call count
  await docRef.update({
    [`providerCalls.${provider}`]: providerCalls + 1,
    lastUpdatedMs: Date.now(),
  })
}

/**
 * Update daily cost limit in rate limiter (admin/manual override)
 *
 * @param userId User ID
 * @param newLimit New daily cost limit in USD
 */
/**
 * Record usage after run completion
 *
 * @param userId User ID
 * @param tokensUsed Tokens used in this run
 * @param cost Cost of this run (USD)
 */
export async function recordRunUsage(
  userId: string,
  tokensUsed: number,
  cost: number
): Promise<void> {
  const db = getFirestore()
  const docRef = db.collection('users').doc(userId).collection('agentUsage').doc('rateLimits')

  let record = await getRateLimitRecord(userId)
  record = resetExpiredWindows(record)

  // Update token and cost usage
  await docRef.update({
    tokensInWindow: record.tokensInWindow + tokensUsed,
    costInWindow: record.costInWindow + cost,
    lastUpdatedMs: Date.now(),
  })
}

/**
 * Get current rate limit status for user (for UI display)
 *
 * @param userId User ID
 * @returns Rate limit status
 */
export async function getRateLimitStatus(userId: string): Promise<{
  runs: { used: number; limit: number; resetInMs: number }
  tokens: { used: number; limit: number; resetInMs: number }
  cost: { used: number; limit: number; resetInMs: number }
}> {
  let record = await getRateLimitRecord(userId)
  record = resetExpiredWindows(record)

  const now = Date.now()

  return {
    runs: {
      used: record.runsInWindow,
      limit: record.maxRunsPerHour,
      resetInMs: record.windowEndMs - now,
    },
    tokens: {
      used: record.tokensInWindow,
      limit: record.maxTokensPerDay,
      resetInMs: record.windowStartMs + DAY_MS - now,
    },
    cost: {
      used: record.costInWindow,
      limit: record.maxCostPerDay,
      resetInMs: record.windowStartMs + DAY_MS - now,
    },
  }
}

/**
 * Update daily cost limit for a user (admin function)
 *
 * @param userId User ID
 * @param newLimit New daily cost limit in USD
 */
export async function updateDailyCostLimit(userId: string, newLimit: number): Promise<void> {
  const db = getFirestore()
  const docRef = db.collection('users').doc(userId).collection('agentUsage').doc('rateLimits')
  const record = await getRateLimitRecord(userId)
  record.maxCostPerDay = newLimit
  record.lastUpdatedMs = Date.now()

  await docRef.set(record)

  log.info('Updated daily cost limit', { userId, newLimit: `$${newLimit.toFixed(2)}` })
}
