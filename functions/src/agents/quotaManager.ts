/**
 * Quota Manager
 *
 * Tracks usage over time and manages quota limits with in-app alerts.
 * Provides analytics and budget management for agent operations.
 * Phase 5E.4: Error Handling & Reliability
 */

import type { ModelProvider } from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'
import { AgentError } from './errorHandler.js'
import { updateDailyCostLimit } from './rateLimiter.js'

/**
 * Usage by provider
 */
export interface ProviderUsage {
  runs: number
  tokens: number
  cost: number
}

/**
 * Alert record
 */
export interface QuotaAlert {
  threshold: number // 50, 80, or 100
  sentAtMs: number
  type: 'runs' | 'tokens' | 'cost'
}

/**
 * Quota record stored in Firestore
 * Path: users/{userId}/agentUsage/quotas
 */
export interface QuotaRecord {
  userId: string
  period: 'daily' | 'weekly' | 'monthly'
  periodStartMs: number
  periodEndMs: number

  // Usage tracking
  totalRuns: number
  totalTokens: number
  totalCost: number
  usageByProvider: Partial<Record<ModelProvider, ProviderUsage>>

  // Quota limits
  maxRuns: number
  maxTokens: number
  maxCost: number

  // Alerts
  alertsSent: QuotaAlert[]

  // Last updated
  lastUpdatedMs: number
}

/**
 * Default quota limits (generous for testing, adjust for production)
 */
export const DEFAULT_QUOTAS = {
  daily: {
    maxRuns: 100,
    maxTokens: 500000,
    maxCost: 5.0, // $5.00
  },
  weekly: {
    maxRuns: 500,
    maxTokens: 2000000,
    maxCost: 25.0, // $25.00
  },
  monthly: {
    maxRuns: 2000,
    maxTokens: 10000000,
    maxCost: 100.0, // $100.00
  },
}

/**
 * Time constants
 */
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const MONTH_MS = 30 * DAY_MS // Approximate

/**
 * Get period duration in milliseconds
 */
function getPeriodDuration(period: 'daily' | 'weekly' | 'monthly'): number {
  switch (period) {
    case 'daily':
      return DAY_MS
    case 'weekly':
      return WEEK_MS
    case 'monthly':
      return MONTH_MS
  }
}

/**
 * Get or create quota record for user and period
 *
 * @param userId User ID
 * @param period Quota period
 * @returns Quota record
 */
async function getQuotaRecord(
  userId: string,
  period: 'daily' | 'weekly' | 'monthly'
): Promise<QuotaRecord> {
  const db = getFirestore()
  const docRef = db.collection('users').doc(userId).collection('agentUsage').doc(`quota_${period}`)

  const doc = await docRef.get()

  if (!doc.exists) {
    // Create initial record
    const now = Date.now()
    const initialRecord: QuotaRecord = {
      userId,
      period,
      periodStartMs: now,
      periodEndMs: now + getPeriodDuration(period),
      totalRuns: 0,
      totalTokens: 0,
      totalCost: 0,
      usageByProvider: {},
      maxRuns: DEFAULT_QUOTAS[period].maxRuns,
      maxTokens: DEFAULT_QUOTAS[period].maxTokens,
      maxCost: DEFAULT_QUOTAS[period].maxCost,
      alertsSent: [],
      lastUpdatedMs: now,
    }

    await docRef.set(initialRecord)
    return initialRecord
  }

  return doc.data() as QuotaRecord
}

/**
 * Reset quota record if period has expired
 *
 * @param record Current quota record
 * @returns Updated record if period was reset
 */
function resetExpiredPeriod(record: QuotaRecord): QuotaRecord {
  const now = Date.now()

  if (now > record.periodEndMs) {
    // Reset for new period
    record.periodStartMs = now
    record.periodEndMs = now + getPeriodDuration(record.period)
    record.totalRuns = 0
    record.totalTokens = 0
    record.totalCost = 0
    record.usageByProvider = {}
    record.alertsSent = []
    record.lastUpdatedMs = now
  }

  return record
}

/**
 * Check if user is within quota limits
 *
 * @param userId User ID
 * @throws AgentError if quota is exceeded (hard limit)
 */
export async function checkQuota(userId: string): Promise<void> {
  // Check daily quota (hard limit)
  const dailyRecord = await getQuotaRecord(userId, 'daily')
  const resetDaily = resetExpiredPeriod(dailyRecord)

  // Check runs quota
  if (resetDaily.totalRuns >= resetDaily.maxRuns) {
    throw new AgentError(
      `Daily runs quota exceeded: ${resetDaily.totalRuns}/${resetDaily.maxRuns}`,
      `You've reached your daily limit of ${resetDaily.maxRuns} runs. Quota resets in ${Math.ceil((resetDaily.periodEndMs - Date.now()) / 3600000)} hours.`,
      'quota',
      false,
      { userId, quota: 'daily_runs', limit: resetDaily.maxRuns, used: resetDaily.totalRuns }
    )
  }

  // Check tokens quota
  if (resetDaily.totalTokens >= resetDaily.maxTokens) {
    throw new AgentError(
      `Daily tokens quota exceeded: ${resetDaily.totalTokens}/${resetDaily.maxTokens}`,
      `You've reached your daily token limit of ${resetDaily.maxTokens.toLocaleString()}. Quota resets in ${Math.ceil((resetDaily.periodEndMs - Date.now()) / 3600000)} hours.`,
      'quota',
      false,
      { userId, quota: 'daily_tokens', limit: resetDaily.maxTokens, used: resetDaily.totalTokens }
    )
  }

  // Check cost quota
  if (resetDaily.totalCost >= resetDaily.maxCost) {
    throw new AgentError(
      `Daily cost quota exceeded: $${resetDaily.totalCost.toFixed(2)}/$${resetDaily.maxCost.toFixed(2)}`,
      `You've reached your daily budget of $${resetDaily.maxCost.toFixed(2)}. Quota resets in ${Math.ceil((resetDaily.periodEndMs - Date.now()) / 3600000)} hours.`,
      'quota',
      false,
      {
        userId,
        quota: 'daily_cost',
        limit: resetDaily.maxCost,
        used: resetDaily.totalCost,
      }
    )
  }
}

/**
 * Update quota after run completion
 *
 * @param userId User ID
 * @param provider AI provider used
 * @param tokensUsed Tokens used
 * @param cost Cost in USD
 */
export async function updateQuota(
  userId: string,
  provider: ModelProvider,
  tokensUsed: number,
  cost: number
): Promise<void> {
  const db = getFirestore()

  // Update all quota periods (daily, weekly, monthly)
  const periods: Array<'daily' | 'weekly' | 'monthly'> = ['daily', 'weekly', 'monthly']

  for (const period of periods) {
    const docRef = db
      .collection('users')
      .doc(userId)
      .collection('agentUsage')
      .doc(`quota_${period}`)

    let record = await getQuotaRecord(userId, period)
    record = resetExpiredPeriod(record)

    // Update totals
    record.totalRuns += 1
    record.totalTokens += tokensUsed
    record.totalCost += cost

    // Update provider-specific usage
    if (!record.usageByProvider[provider]) {
      record.usageByProvider[provider] = {
        runs: 0,
        tokens: 0,
        cost: 0,
      }
    }
    record.usageByProvider[provider]!.runs += 1
    record.usageByProvider[provider]!.tokens += tokensUsed
    record.usageByProvider[provider]!.cost += cost

    record.lastUpdatedMs = Date.now()

    await docRef.set(record)
  }
}

/**
 * Check if quota alert should be sent
 *
 * @param userId User ID
 * @returns Alert info if alert should be sent, null otherwise
 */
export async function shouldSendQuotaAlert(userId: string): Promise<{
  type: 'runs' | 'tokens' | 'cost'
  threshold: number
  used: number
  limit: number
} | null> {
  // Check daily quota for alerts
  let record = await getQuotaRecord(userId, 'daily')
  record = resetExpiredPeriod(record)

  const now = Date.now()

  // Check runs quota (50%, 80%, 100% thresholds)
  const runsPercent = (record.totalRuns / record.maxRuns) * 100
  if (
    runsPercent >= 50 &&
    !record.alertsSent.some((a) => a.type === 'runs' && a.threshold === 50)
  ) {
    const threshold = runsPercent >= 100 ? 100 : runsPercent >= 80 ? 80 : 50

    // Record alert as sent
    const db = getFirestore()
    await db
      .collection('users')
      .doc(userId)
      .collection('agentUsage')
      .doc('quota_daily')
      .update({
        alertsSent: [
          ...record.alertsSent,
          { threshold, sentAtMs: now, type: 'runs' } as QuotaAlert,
        ],
      })

    return {
      type: 'runs',
      threshold,
      used: record.totalRuns,
      limit: record.maxRuns,
    }
  }

  // Check tokens quota
  const tokensPercent = (record.totalTokens / record.maxTokens) * 100
  if (
    tokensPercent >= 50 &&
    !record.alertsSent.some((a) => a.type === 'tokens' && a.threshold === 50)
  ) {
    const threshold = tokensPercent >= 100 ? 100 : tokensPercent >= 80 ? 80 : 50

    const db = getFirestore()
    await db
      .collection('users')
      .doc(userId)
      .collection('agentUsage')
      .doc('quota_daily')
      .update({
        alertsSent: [
          ...record.alertsSent,
          { threshold, sentAtMs: now, type: 'tokens' } as QuotaAlert,
        ],
      })

    return {
      type: 'tokens',
      threshold,
      used: record.totalTokens,
      limit: record.maxTokens,
    }
  }

  // Check cost quota
  const costPercent = (record.totalCost / record.maxCost) * 100
  if (
    costPercent >= 50 &&
    !record.alertsSent.some((a) => a.type === 'cost' && a.threshold === 50)
  ) {
    const threshold = costPercent >= 100 ? 100 : costPercent >= 80 ? 80 : 50

    const db = getFirestore()
    await db
      .collection('users')
      .doc(userId)
      .collection('agentUsage')
      .doc('quota_daily')
      .update({
        alertsSent: [
          ...record.alertsSent,
          { threshold, sentAtMs: now, type: 'cost' } as QuotaAlert,
        ],
      })

    return {
      type: 'cost',
      threshold,
      used: record.totalCost,
      limit: record.maxCost,
    }
  }

  return null
}

/**
 * Get quota status for all periods (for UI display)
 *
 * @param userId User ID
 * @returns Quota status for all periods
 */
export async function getQuotaStatus(userId: string): Promise<{
  daily: QuotaRecord
  weekly: QuotaRecord
  monthly: QuotaRecord
}> {
  const daily = await getQuotaRecord(userId, 'daily')
  const weekly = await getQuotaRecord(userId, 'weekly')
  const monthly = await getQuotaRecord(userId, 'monthly')

  return {
    daily: resetExpiredPeriod(daily),
    weekly: resetExpiredPeriod(weekly),
    monthly: resetExpiredPeriod(monthly),
  }
}

/**
 * Update daily cost limit for a user (admin function)
 * This is exposed to allow manual increases as requested
 *
 * @param userId User ID
 * @param newLimit New daily cost limit in USD
 */
export async function updateDailyCostQuota(userId: string, newLimit: number): Promise<void> {
  const db = getFirestore()
  const docRef = db.collection('users').doc(userId).collection('agentUsage').doc('quota_daily')

  await getQuotaRecord(userId, 'daily')

  await docRef.update({
    maxCost: newLimit,
    lastUpdatedMs: Date.now(),
  })

  await updateDailyCostLimit(userId, newLimit)

  console.log(`Updated daily cost quota for user ${userId} to $${newLimit.toFixed(2)}`)
}
