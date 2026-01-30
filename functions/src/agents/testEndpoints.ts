/**
 * Test Endpoints for Search Tool Keys and Agent Configurations
 *
 * Provides callable Cloud Functions that verify:
 * 1. Search tool API keys work (minimal API call per service)
 * 2. Agent configurations are valid (minimal LLM call to verify model + key)
 */

import type { AgentConfig } from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

import {
  ANTHROPIC_API_KEY,
  EXA_API_KEY,
  FIRECRAWL_API_KEY,
  OPENAI_API_KEY,
  SERPER_API_KEY,
  loadProviderKeys,
  loadSearchToolKeys,
} from './providerKeys.js'
import { executeWithProvider } from './providerService.js'

/**
 * Test a search tool API key by making a minimal API call.
 *
 * Supported tools: serper, firecrawl, exa, jina
 * Reads the user's stored key from Firestore, falls back to system keys.
 */
export const testSearchToolKey = onCall(
  { secrets: [SERPER_API_KEY, FIRECRAWL_API_KEY, EXA_API_KEY] },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication required.')
    }

    const { toolId } = request.data as { toolId?: string }
    if (!toolId || !['serper', 'firecrawl', 'exa', 'jina'].includes(toolId)) {
      throw new HttpsError(
        'invalid-argument',
        'toolId is required and must be one of: serper, firecrawl, exa, jina'
      )
    }

    const keys = await loadSearchToolKeys(request.auth.uid)
    const start = Date.now()

    try {
      switch (toolId) {
        case 'serper': {
          const apiKey = keys.serper
          if (!apiKey) {
            return { ok: false, message: 'No Serper API key configured.', latencyMs: 0 }
          }
          const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: 'test', num: 1 }),
          })
          if (!response.ok) {
            const text = await response.text()
            return {
              ok: false,
              message: `Serper API returned ${response.status}: ${text.substring(0, 200)}`,
              latencyMs: Date.now() - start,
            }
          }
          const data = (await response.json()) as { organic?: unknown[] }
          return {
            ok: Array.isArray(data.organic),
            message: Array.isArray(data.organic) ? 'Serper key is valid.' : 'Unexpected response.',
            latencyMs: Date.now() - start,
          }
        }

        case 'firecrawl': {
          const apiKey = keys.firecrawl
          if (!apiKey) {
            return { ok: false, message: 'No Firecrawl API key configured.', latencyMs: 0 }
          }
          const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: 'https://example.com', formats: ['markdown'] }),
          })
          if (!response.ok) {
            const text = await response.text()
            return {
              ok: false,
              message: `Firecrawl API returned ${response.status}: ${text.substring(0, 200)}`,
              latencyMs: Date.now() - start,
            }
          }
          const data = (await response.json()) as { success?: boolean }
          return {
            ok: data.success === true,
            message: data.success ? 'Firecrawl key is valid.' : 'Unexpected response.',
            latencyMs: Date.now() - start,
          }
        }

        case 'exa': {
          const apiKey = keys.exa
          if (!apiKey) {
            return { ok: false, message: 'No Exa API key configured.', latencyMs: 0 }
          }
          const response = await fetch('https://api.exa.ai/search', {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'test', numResults: 1 }),
          })
          if (!response.ok) {
            const text = await response.text()
            return {
              ok: false,
              message: `Exa API returned ${response.status}: ${text.substring(0, 200)}`,
              latencyMs: Date.now() - start,
            }
          }
          const data = (await response.json()) as { results?: unknown[] }
          return {
            ok: Array.isArray(data.results),
            message: Array.isArray(data.results) ? 'Exa key is valid.' : 'Unexpected response.',
            latencyMs: Date.now() - start,
          }
        }

        case 'jina': {
          const headers: Record<string, string> = { Accept: 'text/plain' }
          if (keys.jina) {
            headers['Authorization'] = `Bearer ${keys.jina}`
          }
          const response = await fetch('https://r.jina.ai/https://example.com', { headers })
          if (!response.ok) {
            return {
              ok: false,
              message: `Jina Reader returned ${response.status}: ${response.statusText}`,
              latencyMs: Date.now() - start,
            }
          }
          const text = await response.text()
          return {
            ok: text.length > 0,
            message:
              text.length > 0
                ? keys.jina
                  ? 'Jina key is valid.'
                  : 'Jina Reader works (no key needed for basic usage).'
                : 'Empty response from Jina Reader.',
            latencyMs: Date.now() - start,
          }
        }

        default:
          return { ok: false, message: `Unknown tool: ${toolId}`, latencyMs: 0 }
      }
    } catch (error) {
      return {
        ok: false,
        message: `Test failed: ${(error as Error).message}`,
        latencyMs: Date.now() - start,
      }
    }
  }
)

/**
 * Test an agent configuration by sending a minimal LLM prompt.
 *
 * Verifies that the agent's modelProvider + modelName + API key combination works.
 */
export const testAgentConfig = onCall(
  { secrets: [OPENAI_API_KEY, ANTHROPIC_API_KEY, SERPER_API_KEY, FIRECRAWL_API_KEY, EXA_API_KEY] },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication required.')
    }

    const { agentId, workspaceId } = request.data as {
      agentId?: string
      workspaceId?: string
    }
    if (!agentId || !workspaceId) {
      throw new HttpsError('invalid-argument', 'agentId and workspaceId are required.')
    }

    const db = getFirestore()
    const agentDoc = await db
      .doc(`users/${request.auth.uid}/workspaces/${workspaceId}/agents/${agentId}`)
      .get()

    if (!agentDoc.exists) {
      throw new HttpsError('not-found', 'Agent not found.')
    }

    const agent = agentDoc.data() as AgentConfig
    const apiKeys = await loadProviderKeys(request.auth.uid)

    const start = Date.now()

    try {
      const testAgent: AgentConfig = {
        ...agent,
        maxTokens: 20,
        temperature: 0,
        toolIds: [],
        systemPrompt: 'You are a test. Respond with exactly: OK',
      }

      const result = await executeWithProvider(testAgent, 'Respond with exactly: OK', undefined, apiKeys)

      return {
        ok: true,
        message: `Agent "${agent.name}" is working (${agent.modelProvider}/${agent.modelName}).`,
        latencyMs: Date.now() - start,
        tokensUsed: result.tokensUsed,
      }
    } catch (error) {
      return {
        ok: false,
        message: `Agent test failed: ${(error as Error).message}`,
        latencyMs: Date.now() - start,
      }
    }
  }
)
