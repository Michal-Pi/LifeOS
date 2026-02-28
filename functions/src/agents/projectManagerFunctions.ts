import { randomUUID } from 'crypto'
import type { AgentConfig } from '@lifeos/agents'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { createLogger } from '../lib/logger.js'
import { loadProviderKeys } from './providerKeys.js'
import { executeWithProvider } from './providerService.js'

const log = createLogger('ProjectManager')

const selectProvider = (apiKeys: { openai?: string; anthropic?: string }) =>
  apiKeys.openai ? 'openai' : apiKeys.anthropic ? 'anthropic' : null

const buildAgent = (
  userId: string,
  name: string,
  systemPrompt: string,
  provider: 'openai' | 'anthropic',
  temperature: number
): AgentConfig => {
  const now = Date.now()
  const modelName = provider === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-5.2'
  return {
    agentId: `agent:pm-${name.toLowerCase()}:${randomUUID()}` as AgentConfig['agentId'],
    userId,
    name,
    role: 'custom',
    systemPrompt,
    modelProvider: provider,
    modelName,
    temperature,
    toolIds: [],
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    syncState: 'synced',
    version: 1,
  }
}

export const extractProjectManagerContext = onCall({}, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication required')
  }
  const { prompt } = request.data as { prompt?: string }
  if (!prompt) {
    throw new HttpsError('invalid-argument', 'prompt is required')
  }

  const apiKeys = await loadProviderKeys(request.auth.uid)
  const provider = selectProvider(apiKeys)
  if (!provider) {
    throw new HttpsError('failed-precondition', 'No AI provider configured')
  }

  const agent = buildAgent(
    request.auth.uid,
    'PM Context Extractor',
    'Extract structured information from conversations. Return valid JSON only.',
    provider,
    0.1
  )

  try {
    const result = await executeWithProvider(agent, prompt, undefined, apiKeys)
    return JSON.parse(result.output)
  } catch (error) {
    log.error('Context extraction failed', { error })
    throw new HttpsError('internal', 'Extraction failed')
  }
})

export const summarizeProjectManagerContext = onCall({}, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication required')
  }
  const { prompt } = request.data as { prompt?: string }
  if (!prompt) {
    throw new HttpsError('invalid-argument', 'prompt is required')
  }

  const apiKeys = await loadProviderKeys(request.auth.uid)
  const provider = selectProvider(apiKeys)
  if (!provider) {
    throw new HttpsError('failed-precondition', 'No AI provider configured')
  }

  const agent = buildAgent(
    request.auth.uid,
    'PM Context Summarizer',
    'Summarize conversation history concisely, preserving key information.',
    provider,
    0.2
  )

  try {
    const result = await executeWithProvider(agent, prompt, undefined, apiKeys)
    return { summary: result.output }
  } catch (error) {
    log.error('Context summarization failed', { error })
    return { summary: '' }
  }
})

export const detectProjectManagerConflicts = onCall({}, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication required')
  }
  const { prompt } = request.data as { prompt?: string }
  if (!prompt) {
    throw new HttpsError('invalid-argument', 'prompt is required')
  }

  const apiKeys = await loadProviderKeys(request.auth.uid)
  const provider = selectProvider(apiKeys)
  if (!provider) {
    throw new HttpsError('failed-precondition', 'No AI provider configured')
  }

  const agent = buildAgent(
    request.auth.uid,
    'PM Conflict Analyzer',
    'Analyze requirements for contradictions. Return valid JSON only.',
    provider,
    0.1
  )

  try {
    const result = await executeWithProvider(agent, prompt, undefined, apiKeys)
    return JSON.parse(result.output)
  } catch (error) {
    log.error('Conflict detection failed', { error })
    return []
  }
})
