/**
 * Source Ingestion Pipeline
 *
 * Orchestrates search execution and document fetching for the deep research workflow.
 * Uses existing tools from the ToolRegistry (serp_search, search_scholar, semantic_search,
 * read_url, scrape_url, parse_pdf) rather than making direct API calls.
 *
 * Implements a relevance-first strategy:
 * 1. Fetch snippet/abstract only
 * 2. Score relevance against query
 * 3. Fetch full document only for sources above relevance threshold
 */

import { createHash } from 'crypto'
import type {
  RunBudget,
  SearchPlan,
  SearchResult,
  SourceRecord,
  DocumentChunk,
} from '@lifeos/agents'
import type { ToolRegistry, ToolExecutionContext } from '../toolExecutor.js'
import {
  recordSpend,
  getMaxSourcesForPhase,
  getRelevanceThreshold,
  canAffordOperation,
} from './budgetController.js'
import { classifyQueryType, getSearchStrategy } from './searchRouter.js'
import {
  computeQueryHash,
  getCachedSearchResults,
  cacheSearchResults,
  type SearchSource,
} from './searchCache.js'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('SourceIngestion')

// ----- Search Execution -----

/**
 * Execute a search plan using available tools.
 * Calls serp_search, search_scholar, and semantic_search in parallel.
 */
export async function executeSearchPlan(
  plan: SearchPlan,
  toolRegistry: ToolRegistry,
  context: ToolExecutionContext,
  budget: RunBudget,
  /** Optional Firestore instance for search result caching (Phase 45) */
  firestore?: FirebaseFirestore.Firestore
): Promise<{ results: SearchResult[]; updatedBudget: RunBudget }> {
  let currentBudget = { ...budget }
  const COST_PER_SEARCH = 0.002

  // Phase 45: Apply smart search routing to skip unnecessary search types
  const primaryQuery =
    plan.serpQueries[0] ?? plan.scholarQueries[0] ?? plan.semanticQueries[0] ?? ''
  const strategy = getSearchStrategy(classifyQueryType(primaryQuery))
  const routedPlan: SearchPlan = {
    ...plan,
    serpQueries: strategy.useSERP ? plan.serpQueries : [],
    scholarQueries: strategy.useScholar ? plan.scholarQueries : [],
    semanticQueries: strategy.useSemantic ? plan.semanticQueries : [],
  }

  // Phase 45: Check cache for each query and collect cached results
  const cachedResults: SearchResult[] = []
  const uncachedSerp: string[] = []
  const uncachedScholar: string[] = []
  const uncachedSemantic: string[] = []

  if (firestore && context.userId) {
    for (const q of routedPlan.serpQueries) {
      const hash = computeQueryHash(q)
      const cached = await getCachedSearchResults(context.userId, hash, 'serp', firestore)
      if (cached) {
        cachedResults.push(...(cached as SearchResult[]))
      } else {
        uncachedSerp.push(q)
      }
    }
    for (const q of routedPlan.scholarQueries) {
      const hash = computeQueryHash(q)
      const cached = await getCachedSearchResults(context.userId, hash, 'scholar', firestore)
      if (cached) {
        cachedResults.push(...(cached as SearchResult[]))
      } else {
        uncachedScholar.push(q)
      }
    }
    for (const q of routedPlan.semanticQueries) {
      const hash = computeQueryHash(q)
      const cached = await getCachedSearchResults(context.userId, hash, 'semantic', firestore)
      if (cached) {
        cachedResults.push(...(cached as SearchResult[]))
      } else {
        uncachedSemantic.push(q)
      }
    }
    if (cachedResults.length > 0) {
      log.info('Search cache hits', { count: cachedResults.length })
    }
  } else {
    uncachedSerp.push(...routedPlan.serpQueries)
    uncachedScholar.push(...routedPlan.scholarQueries)
    uncachedSemantic.push(...routedPlan.semanticQueries)
  }

  // Collect all planned searches upfront (only uncached queries)
  const serpTool = toolRegistry.get('serp_search')
  const scholarTool = toolRegistry.get('search_scholar')
  const semanticTool = toolRegistry.get('semantic_search')

  interface PlannedSearch {
    tool: NonNullable<ReturnType<ToolRegistry['get']>>
    params: Record<string, unknown>
    source: SearchResult['source']
    query: string
  }

  const planned: PlannedSearch[] = []

  if (serpTool) {
    for (const query of uncachedSerp) {
      planned.push({ tool: serpTool, params: { query, num: 10 }, source: 'serp', query })
    }
  }
  if (scholarTool) {
    for (const query of uncachedScholar) {
      planned.push({ tool: scholarTool, params: { query, num: 10 }, source: 'scholar', query })
    }
  }
  if (semanticTool) {
    for (const query of uncachedSemantic) {
      planned.push({
        tool: semanticTool,
        params: { query, numResults: 10 },
        source: 'semantic',
        query,
      })
    }
  }

  // Trim to what we can afford
  const affordable: PlannedSearch[] = []
  for (const search of planned) {
    if (!canAffordOperation(currentBudget, COST_PER_SEARCH)) break
    affordable.push(search)
    // Pre-allocate budget to prevent race condition
    currentBudget = recordSpend(currentBudget, COST_PER_SEARCH, 0, 'search')
  }

  // Execute all in parallel — budget already reserved
  const settled = await Promise.allSettled(
    affordable.map(async (s) => {
      const result = await s.tool.execute(s.params, context)
      const parsed = parseSearchResults(result, s.source)
      // Phase 45: Cache successful results
      if (firestore && context.userId && parsed.length > 0) {
        const hash = computeQueryHash(s.query)
        await cacheSearchResults(
          context.userId,
          hash,
          s.source as SearchSource,
          parsed,
          firestore
        ).catch((err) => log.warn('Failed to cache search results', { error: String(err) }))
      }
      return parsed
    })
  )

  // Collect results and credit back failed searches
  const results: SearchResult[] = [...cachedResults]
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      results.push(...outcome.value)
    } else {
      // Credit back the pre-allocated cost for failed searches
      currentBudget = {
        ...currentBudget,
        spentUsd: Math.max(0, currentBudget.spentUsd - COST_PER_SEARCH),
        searchCallsUsed: Math.max(0, currentBudget.searchCallsUsed - 1),
      }
      log.warn('Search failed', { error: String(outcome.reason) })
    }
  }

  // Deduplicate by URL (strip query params, fragments, and trailing slashes)
  const seen = new Set<string>()
  const deduped = results.filter((r) => {
    const key = normalizeUrlForDedup(r.url)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { results: deduped, updatedBudget: currentBudget }
}

// ----- Source Ingestion (Relevance-First) -----

/**
 * Ingest sources from search results using the relevance-first strategy:
 * 1. Use snippets to score relevance
 * 2. Only fetch full documents for high-relevance sources
 * 3. Budget-aware: threshold increases as budget decreases
 */
export async function ingestSources(
  searchResults: SearchResult[],
  query: string,
  toolRegistry: ToolRegistry,
  context: ToolExecutionContext,
  budget: RunBudget,
  scoreRelevanceFn: (snippet: string, query: string) => Promise<number>
): Promise<{
  sources: SourceRecord[]
  contentMap: Record<string, string>
  updatedBudget: RunBudget
}> {
  let currentBudget = { ...budget }
  const maxSources = getMaxSourcesForPhase(currentBudget)
  const relevanceThreshold = getRelevanceThreshold(currentBudget)

  if (maxSources === 0) {
    return { sources: [], contentMap: {}, updatedBudget: currentBudget }
  }

  // Score relevance of each search result using snippets
  const scored: Array<SearchResult & { relevance: number }> = []
  const candidates = searchResults.slice(0, maxSources * 2)
  const scoredResults = await Promise.all(
    candidates.map(async (result) => ({
      ...result,
      relevance: await scoreRelevanceFn(result.snippet, query),
    }))
  )
  scored.push(...scoredResults)

  // Sort by relevance and filter
  scored.sort((a, b) => b.relevance - a.relevance)
  const relevant = scored.filter((r) => r.relevance >= relevanceThreshold).slice(0, maxSources)

  log.info('Source relevance scoring', {
    total: searchResults.length,
    scored: scored.length,
    relevant: relevant.length,
    threshold: relevanceThreshold,
    phase: currentBudget.phase,
  })

  // Fetch full documents for relevant sources
  const sources: SourceRecord[] = []
  const contentMap = new Map<string, string>()
  const seenHashes = new Set<string>()

  for (const result of relevant) {
    if (!canAffordOperation(currentBudget, 0.005)) break

    try {
      const { content, fetchMethod } = await fetchDocument(result.url, toolRegistry, context)
      if (!content) continue

      const contentHash = createHash('sha256').update(content).digest('hex')
      if (seenHashes.has(contentHash)) continue
      seenHashes.add(contentHash)

      currentBudget = recordSpend(currentBudget, 0.003, 0, 'search')

      const sourceId = `src_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const source: SourceRecord = {
        sourceId,
        url: result.url,
        title: result.title,
        domain: new URL(result.url).hostname,
        fetchedAtMs: Date.now(),
        fetchMethod,
        contentLength: content.length,
        contentHash,
        sourceType: result.source === 'scholar' ? 'academic' : 'web',
        relevanceScore: result.relevance,
        scholarMetadata: result.scholarMetadata,
      }

      sources.push(source)
      contentMap.set(sourceId, content)
    } catch (err) {
      log.warn('Failed to fetch source', { url: result.url, error: String(err) })
    }
  }

  return { sources, contentMap: Object.fromEntries(contentMap), updatedBudget: currentBudget }
}

// ----- Document Fetching -----

/**
 * Fetch a document using the appropriate tool based on URL type.
 */
async function fetchDocument(
  url: string,
  toolRegistry: ToolRegistry,
  context: ToolExecutionContext
): Promise<{ content: string; fetchMethod: SourceRecord['fetchMethod'] }> {
  const isPDF = url.toLowerCase().endsWith('.pdf') || url.includes('/pdf/')

  if (isPDF) {
    const parsePdf = toolRegistry.get('parse_pdf')
    if (parsePdf) {
      const result = await parsePdf.execute({ url }, context)
      return { content: String(result ?? ''), fetchMethod: 'parse_pdf' }
    }
  }

  // Try read_url first (fastest, cleanest)
  const readUrl = toolRegistry.get('read_url')
  if (readUrl) {
    try {
      const result = await readUrl.execute({ url }, context)
      const content = String(result ?? '')
      if (content.length > 100) {
        return { content, fetchMethod: 'read_url' }
      }
    } catch {
      // Fall through to scrape_url
    }
  }

  // Fallback to scrape_url (handles JS-heavy sites)
  const scrapeUrl = toolRegistry.get('scrape_url')
  if (scrapeUrl) {
    const result = await scrapeUrl.execute({ url, formats: ['markdown'] }, context)
    return { content: String(result ?? ''), fetchMethod: 'scrape_url' }
  }

  throw new Error(`No URL fetching tool available for: ${url}`)
}

// ----- Document Chunking -----

/**
 * Chunk a document into sections for claim extraction.
 * Splits on heading boundaries, falling back to paragraph boundaries.
 * Safety cap: returns at most 50 chunks per document to bound extraction cost.
 */
export function chunkDocument(
  content: string,
  sourceId: string,
  maxChunkSize: number = 4000
): DocumentChunk[] {
  if (content.length <= maxChunkSize) {
    return [{ text: content, section: 'full', startOffset: 0, endOffset: content.length, sourceId }]
  }

  const chunks: DocumentChunk[] = []

  // Try heading-based splitting first
  const headingPattern = /^#{1,3}\s+.+$/gm
  const headings: Array<{ index: number; text: string }> = []
  let match: RegExpExecArray | null
  while ((match = headingPattern.exec(content)) !== null) {
    headings.push({ index: match.index, text: match[0] })
  }

  if (headings.length >= 2) {
    for (let i = 0; i < headings.length; i++) {
      const start = headings[i].index
      const end = i + 1 < headings.length ? headings[i + 1].index : content.length
      const text = content.slice(start, end).trim()

      if (text.length > maxChunkSize) {
        // Sub-chunk by paragraphs
        chunks.push(...chunkByParagraphs(text, sourceId, start, maxChunkSize))
      } else if (text.length > 50) {
        chunks.push({
          text,
          section: headings[i].text.replace(/^#+\s*/, ''),
          startOffset: start,
          endOffset: end,
          sourceId,
        })
      }
    }
  } else {
    // No headings — split by paragraphs
    chunks.push(...chunkByParagraphs(content, sourceId, 0, maxChunkSize))
  }

  return chunks.slice(0, 50) // Safety cap: max 50 chunks per document
}

function chunkByParagraphs(
  text: string,
  sourceId: string,
  baseOffset: number,
  maxChunkSize: number
): DocumentChunk[] {
  const paragraphs = text.split(/\n\n+/)
  const chunks: DocumentChunk[] = []
  let currentChunk = ''
  let currentStart = baseOffset

  for (const para of paragraphs) {
    if (currentChunk.length + para.length + 2 > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        section: `chunk_${chunks.length + 1}`,
        startOffset: currentStart,
        endOffset: currentStart + currentChunk.length,
        sourceId,
      })
      currentStart += currentChunk.length
      currentChunk = ''
    }
    currentChunk += (currentChunk ? '\n\n' : '') + para
  }

  if (currentChunk.trim().length > 50) {
    chunks.push({
      text: currentChunk.trim(),
      section: `chunk_${chunks.length + 1}`,
      startOffset: currentStart,
      endOffset: currentStart + currentChunk.length,
      sourceId,
    })
  }

  return chunks
}

// ----- Source Deduplication (Phase 22) -----

/**
 * Deduplicate sources by URL, keeping the one with the highest relevance score.
 */
export function deduplicateSources(sources: SourceRecord[]): SourceRecord[] {
  const byUrl = new Map<string, SourceRecord>()
  for (const source of sources) {
    const key = normalizeUrlForDedup(source.url)
    const existing = byUrl.get(key)
    if (!existing || (source.relevanceScore ?? 0) > (existing.relevanceScore ?? 0)) {
      byUrl.set(key, source)
    }
  }
  return [...byUrl.values()]
}

/** Strip query params, fragments, and trailing slashes for dedup comparison. */
function normalizeUrlForDedup(url: string): string {
  try {
    const parsed = new URL(url)
    return (parsed.origin + parsed.pathname).replace(/\/+$/, '').toLowerCase()
  } catch {
    return url
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .toLowerCase()
  }
}

// ----- Source Ranking (Phase 22) -----

/**
 * Rank sources by relevance using a fast LLM model.
 * Scores each source 1-5 for likely relevance and sorts descending.
 */
export async function rankSourcesByRelevance(
  results: SearchResult[],
  query: string,
  executeProvider: (systemPrompt: string, userPrompt: string) => Promise<string>
): Promise<SearchResult[]> {
  if (results.length === 0) return []

  // Build a compact list of sources for scoring
  const sourceList = results
    .map((r, i) => `${i + 1}. [${r.title}] ${r.snippet.substring(0, 150)}`)
    .join('\n')

  try {
    const response = await executeProvider(
      'Score each source 1-5 for relevance to the query. Output ONLY a JSON array of numbers, e.g. [5, 3, 1, 4, 2]. No other text.',
      `Query: "${query}"\n\nSources:\n${sourceList}`
    )

    const jsonMatch = response.match(/\[[\s\S]*?\]/)
    if (!jsonMatch) return results

    const scores = JSON.parse(jsonMatch[0]) as number[]
    const scored = results.map((r, i) => ({
      ...r,
      relevanceScore: Math.min(5, Math.max(1, Number(scores[i]) || 3)) / 5,
    }))

    return scored.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
  } catch {
    return results
  }
}

// ----- Helpers -----

function parseSearchResults(raw: unknown, source: SearchResult['source']): SearchResult[] {
  if (!raw || typeof raw !== 'object') return []

  // Handle various search result formats from different tools
  const results: SearchResult[] = []

  // Array format (common)
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === 'object' && 'url' in item) {
        results.push({
          url: String((item as Record<string, unknown>).url ?? ''),
          title: String((item as Record<string, unknown>).title ?? ''),
          snippet: String(
            (item as Record<string, unknown>).snippet ??
              (item as Record<string, unknown>).description ??
              ''
          ),
          source,
          scholarMetadata:
            source === 'scholar'
              ? {
                  authors: (item as Record<string, unknown>).authors as string[] | undefined,
                  year: (item as Record<string, unknown>).year as number | undefined,
                  citations: (item as Record<string, unknown>).cited_by as number | undefined,
                  journal: (item as Record<string, unknown>).journal as string | undefined,
                }
              : undefined,
        })
      }
    }
  }

  // Object with results array
  const obj = raw as Record<string, unknown>
  if ('organic' in obj && Array.isArray(obj.organic)) {
    return parseSearchResults(obj.organic, source)
  }
  if ('results' in obj && Array.isArray(obj.results)) {
    return parseSearchResults(obj.results, source)
  }

  return results
}
