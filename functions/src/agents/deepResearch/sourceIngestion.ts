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
  budget: RunBudget
): Promise<{ results: SearchResult[]; updatedBudget: RunBudget }> {
  let currentBudget = { ...budget }
  const COST_PER_SEARCH = 0.002

  // Collect all planned searches upfront
  const serpTool = toolRegistry.get('serp_search')
  const scholarTool = toolRegistry.get('search_scholar')
  const semanticTool = toolRegistry.get('semantic_search')

  interface PlannedSearch {
    tool: NonNullable<ReturnType<ToolRegistry['get']>>
    params: Record<string, unknown>
    source: SearchResult['source']
  }

  const planned: PlannedSearch[] = []

  if (serpTool) {
    for (const query of plan.serpQueries) {
      planned.push({ tool: serpTool, params: { query, num: 10 }, source: 'serp' })
    }
  }
  if (scholarTool) {
    for (const query of plan.scholarQueries) {
      planned.push({ tool: scholarTool, params: { query, num: 10 }, source: 'scholar' })
    }
  }
  if (semanticTool) {
    for (const query of plan.semanticQueries) {
      planned.push({ tool: semanticTool, params: { query, numResults: 10 }, source: 'semantic' })
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
      return parseSearchResults(result, s.source)
    })
  )

  // Collect results and credit back failed searches
  const results: SearchResult[] = []
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

  // Deduplicate by URL
  const seen = new Set<string>()
  const deduped = results.filter((r) => {
    const key = r.url.replace(/\/$/, '').toLowerCase()
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
  for (const result of searchResults) {
    if (scored.length >= maxSources * 2) break // score up to 2x max to have good candidates
    const relevance = await scoreRelevanceFn(result.snippet, query)
    scored.push({ ...result, relevance })
  }

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

  return chunks
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
