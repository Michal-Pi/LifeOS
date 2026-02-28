/**
 * Model Discovery Agent
 *
 * Searches the internet for up-to-date model information from top AI providers.
 * Returns model names, API aliases, and pricing per million tokens.
 */

import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { createLogger } from '../lib/logger.js'

const log = createLogger('ModelDiscovery')

export interface DiscoveredModel {
  provider: 'openai' | 'anthropic' | 'google' | 'xai'
  modelName: string
  apiAlias: string
  inputCostPer1M: number | null
  outputCostPer1M: number | null
  context?: string
  releaseDate?: string
}

export interface ModelDiscoveryResult {
  models: DiscoveredModel[]
  updatedAtMs: number
  source: string
}

const PROVIDER_PAGES: Record<string, { url: string; searchQuery: string }> = {
  openai: {
    url: 'https://openai.com/api/pricing/',
    searchQuery: 'OpenAI API models pricing 2026',
  },
  anthropic: {
    url: 'https://www.anthropic.com/pricing',
    searchQuery: 'Anthropic Claude API models pricing 2026',
  },
  google: {
    url: 'https://ai.google.dev/pricing',
    searchQuery: 'Google Gemini API models pricing 2026',
  },
  xai: {
    url: 'https://console.x.ai/team',
    searchQuery: 'xAI Grok API models pricing 2026',
  },
}

/**
 * Fetch content from a URL using Jina Reader
 */
async function fetchPageContent(url: string, jinaKey?: string): Promise<string> {
  const headers: Record<string, string> = {
    Accept: 'text/plain',
  }
  if (jinaKey) {
    headers['Authorization'] = `Bearer ${jinaKey}`
  }

  const response = await fetch(`https://r.jina.ai/${url}`, { headers })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  return response.text()
}

/**
 * Search the web using Serper
 */
async function searchWeb(
  query: string,
  serperKey: string
): Promise<Array<{ title: string; snippet: string; url: string }>> {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': serperKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      num: 5,
    }),
  })

  if (!response.ok) {
    throw new Error(`Serper search failed: ${response.status}`)
  }

  const data = (await response.json()) as {
    organic?: Array<{
      title: string
      snippet: string
      link: string
    }>
  }

  return (data.organic || []).map((item) => ({
    title: item.title,
    snippet: item.snippet,
    url: item.link,
  }))
}

/**
 * Parse model information from page content using pattern matching
 * This is a heuristic approach that looks for pricing patterns
 */
function parseModelsFromContent(
  content: string,
  provider: 'openai' | 'anthropic' | 'google' | 'xai'
): DiscoveredModel[] {
  const models: DiscoveredModel[] = []

  // Common pricing patterns: "$X.XX per 1M tokens", "$X / 1M", etc.
  const pricePattern =
    /\$(\d+(?:\.\d+)?)\s*(?:\/|\s*per\s*)\s*(?:1M|million|1,000,000)\s*(?:input|tokens)?/gi
  const modelNamePatterns: Record<string, RegExp[]> = {
    openai: [
      /\b(gpt-4[o0]?(?:-\d{4}-\d{2}-\d{2})?)\b/gi,
      /\b(gpt-4(?:-turbo)?(?:-\d{4}-\d{2}-\d{2})?)\b/gi,
      /\b(gpt-3\.5-turbo(?:-\d{4})?)\b/gi,
      /\b(o[13](?:-mini)?(?:-\d{4}-\d{2}-\d{2})?)\b/gi,
      /\b(gpt-4\.1(?:-\d{4}-\d{2}-\d{2})?)\b/gi,
    ],
    anthropic: [
      /\b(claude-(?:opus|sonnet|haiku)-\d(?:\.\d)?(?:-\d{8})?)\b/gi,
      /\b(claude-\d(?:\.\d)?-(?:opus|sonnet|haiku)(?:-\d{8})?)\b/gi,
      /\b(claude-(?:opus|sonnet|haiku)-4(?:\.\d)?(?:-\d{8})?)\b/gi,
    ],
    google: [
      /\b(gemini-(?:2\.5|2\.0|1\.5|1\.0)-(?:pro|flash|ultra)(?:-\d{3})?)\b/gi,
      /\b(gemini-(?:pro|ultra|flash)(?:-\d+)?)\b/gi,
    ],
    xai: [/\b(grok-(?:4|3|2|1)(?:-\d{4}-\d{2}-\d{2})?)\b/gi, /\b(grok-(?:beta|vision))\b/gi],
  }

  const patterns = modelNamePatterns[provider] || []

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      const modelName = match[1].toLowerCase()

      // Check if we already have this model
      if (models.some((m) => m.modelName === modelName)) {
        continue
      }

      // Try to find pricing near this model mention
      const contextStart = Math.max(0, match.index - 200)
      const contextEnd = Math.min(content.length, match.index + 300)
      const context = content.substring(contextStart, contextEnd)

      // Look for input/output prices in context
      const inputMatch = context.match(/input[:\s]*\$(\d+(?:\.\d+)?)/i)
      const outputMatch = context.match(/output[:\s]*\$(\d+(?:\.\d+)?)/i)
      const _genericPriceMatch = context.match(pricePattern)

      models.push({
        provider,
        modelName,
        apiAlias: modelName,
        inputCostPer1M: inputMatch ? parseFloat(inputMatch[1]) : null,
        outputCostPer1M: outputMatch ? parseFloat(outputMatch[1]) : null,
        context: context.substring(0, 150),
      })
    }
  }

  return models
}

/**
 * Get user's search tool keys from Firestore
 */
async function getUserSearchToolKeys(userId: string): Promise<{ serper?: string; jina?: string }> {
  const db = getFirestore()
  const keysDoc = await db.doc(`users/${userId}/privateSettings/searchToolKeys`).get()

  if (!keysDoc.exists) {
    return {}
  }

  const data = keysDoc.data()
  return {
    serper: data?.serperKey,
    jina: data?.jinaKey,
  }
}

/**
 * Discover models from all providers
 */
export const discoverModels = onCall(
  {
    timeoutSeconds: 120,
    memory: '256MiB',
    cors: true,
  },
  async (request): Promise<ModelDiscoveryResult> => {
    const userId = request.auth?.uid
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    // Get user's API keys
    const keys = await getUserSearchToolKeys(userId)

    if (!keys.serper) {
      throw new HttpsError(
        'failed-precondition',
        'Serper API key required. Please configure it in Settings.'
      )
    }

    const allModels: DiscoveredModel[] = []
    const providers: Array<'openai' | 'anthropic' | 'google' | 'xai'> = [
      'openai',
      'anthropic',
      'google',
      'xai',
    ]

    for (const provider of providers) {
      try {
        const config = PROVIDER_PAGES[provider]

        // First try to fetch the pricing page directly
        let content = ''
        try {
          content = await fetchPageContent(config.url, keys.jina)
        } catch {
          // If direct fetch fails, search for pricing info
          const searchResults = await searchWeb(config.searchQuery, keys.serper)
          if (searchResults.length > 0) {
            // Try to fetch the first search result
            try {
              content = await fetchPageContent(searchResults[0].url, keys.jina)
            } catch {
              // Use search snippets as fallback
              content = searchResults.map((r) => `${r.title}\n${r.snippet}`).join('\n\n')
            }
          }
        }

        if (content) {
          const models = parseModelsFromContent(content, provider)
          allModels.push(...models)
        }
      } catch (error) {
        log.error('Failed to discover models', { provider, error })
        // Continue with other providers
      }
    }

    // Deduplicate models
    const uniqueModels = allModels.filter(
      (model, index, self) =>
        index ===
        self.findIndex((m) => m.modelName === model.modelName && m.provider === model.provider)
    )

    return {
      models: uniqueModels,
      updatedAtMs: Date.now(),
      source: 'web-search',
    }
  }
)
