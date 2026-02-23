/**
 * Note AI Analysis Functions
 *
 * Cloud Functions for AI-powered note analysis tools:
 * - Summarize
 * - Fact Check
 * - LinkedIn Analysis
 * - Write with AI
 * - Tag with AI
 * - Suggest Note Tags
 */

import type Anthropic from '@anthropic-ai/sdk'
import {
  MODEL_PRICING,
  DEFAULT_AI_TOOLS,
  type AIToolSettings,
  type AIToolId,
  type ExtractedClaim,
} from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { createLogger } from '../lib/logger.js'
import { serpSearchTool, semanticSearchTool } from './advancedTools.js'

const log = createLogger('NoteAnalysis')
import { loadProviderKeys, loadSearchToolKeys, type SearchToolKeys } from './providerKeys.js'
import type { ToolDefinition } from './toolExecutor.js'

// Types
interface AIToolRequest {
  tool:
    | 'summarize'
    | 'factCheck'
    | 'factCheckExtract'
    | 'factCheckVerify'
    | 'linkedIn'
    | 'writeWithAI'
    | 'tagWithAI'
    | 'suggestNoteTags'
  content: string
  prompt?: string
  context?: {
    availableTopics?: Array<{ id: string; name: string }>
    availableNotes?: Array<{ id: string; title: string }>
    selectedClaims?: ExtractedClaim[]
  }
}

interface AIToolResponse {
  tool: string
  result: unknown
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

interface FactCheckSource {
  title: string
  url: string
  snippet: string
  supports: boolean
}

interface FactCheckResult {
  claim: string
  verdict?: 'verified' | 'likely_true' | 'disputed' | 'likely_false' | 'unverifiable'
  confidence: 'high' | 'medium' | 'low' | 'uncertain'
  explanation: string
  sources?: FactCheckSource[]
  webSearchUsed: boolean
  suggestedSources?: string[]
}

interface LinkedInTrendingContext {
  isTrending: boolean
  trendScore: number
  relatedNews: Array<{ title: string; url: string; date?: string }>
  relatedPosts: Array<{ title: string; url: string; snippet: string }>
}

interface LinkedInAnalysis {
  overallScore: number
  hooks: string[]
  suggestedHashtags: string[]
  quotableLines: string[]
  improvements: string[]
  trendingContext?: LinkedInTrendingContext
  timingAdvice?: string
  competitiveAnalysis?: string
  webSearchUsed?: boolean
}

interface ParagraphTagSuggestion {
  paragraphPath: string
  paragraphText: string
  suggestedTags: string[]
  matchedTopicIds: string[]
  matchedNoteIds: string[]
  confidence: number
}

/**
 * Calculate cost based on token usage
 */
function _calculateCost(modelName: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[modelName] ?? MODEL_PRICING.default
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}

/**
 * Load user's AI tool settings from Firestore
 */
async function loadAIToolSettings(userId: string): Promise<AIToolSettings> {
  const db = getFirestore()
  const doc = await db.doc(`users/${userId}/settings/aiTools`).get()

  if (!doc.exists) {
    return {
      tools: { ...DEFAULT_AI_TOOLS },
      version: 1,
      updatedAtMs: Date.now(),
    }
  }

  const data = doc.data() as AIToolSettings

  // Merge with defaults to ensure all tools are present
  const mergedTools = { ...DEFAULT_AI_TOOLS }
  for (const [toolId, config] of Object.entries(data.tools || {})) {
    mergedTools[toolId as AIToolId] = {
      ...DEFAULT_AI_TOOLS[toolId as AIToolId],
      ...config,
    }
  }

  return {
    ...data,
    tools: mergedTools,
  }
}

const DEFAULT_MODEL = 'claude-sonnet-4-5'

/**
 * Validate that a model name exists in our pricing table.
 * Falls back to the default alias when a stale/invalid name is stored in settings.
 */
function resolveModelName(modelName: string): string {
  if (MODEL_PRICING[modelName]) return modelName
  log.warn('Unknown model, falling back to default', { modelName, fallback: DEFAULT_MODEL })
  return DEFAULT_MODEL
}

/**
 * Execute a prompt with Claude
 */
async function executePrompt(
  client: Anthropic,
  systemPrompt: string,
  userPrompt: string,
  modelName = DEFAULT_MODEL,
  maxTokens = 4096
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const model = resolveModelName(modelName)
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const textContent = response.content.find((c) => c.type === 'text')
  const content = textContent?.type === 'text' ? textContent.text : ''

  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}

interface ToolResult<T> {
  data: T
  inputTokens: number
  outputTokens: number
}

// ----- Search Integration Helpers -----

interface SearchResult {
  title: string
  url: string
  snippet: string
}

type SearchTool = Pick<ToolDefinition, 'execute'>

/**
 * Extract the first balanced JSON array or object from a string.
 * Uses bracket counting instead of greedy regex to avoid over-matching
 * when the LLM wraps its JSON in prose or trailing commentary.
 */
function extractJson(text: string, kind: 'array' | 'object' = 'array'): string | null {
  const open = kind === 'array' ? '[' : '{'
  const close = kind === 'array' ? ']' : '}'
  const start = text.indexOf(open)
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\' && inString) {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (ch === open) depth++
    else if (ch === close) depth--

    if (depth === 0) {
      return text.slice(start, i + 1)
    }
  }

  return null // unbalanced
}

/**
 * Execute a search tool with a minimal standalone context.
 */
async function runSearch(
  tool: SearchTool,
  params: Record<string, unknown>,
  userId: string,
  searchToolKeys: SearchToolKeys
): Promise<unknown> {
  return tool.execute(params, {
    userId,
    agentId: 'ai-tools',
    workflowId: 'standalone',
    runId: 'standalone',
    searchToolKeys,
    provider: 'anthropic',
    modelName: 'claude-sonnet-4-5',
    iteration: 0,
  })
}

/**
 * Run a search with a per-call timeout. Returns null on failure.
 */
async function runSearchWithTimeout(
  tool: SearchTool,
  params: Record<string, unknown>,
  userId: string,
  searchToolKeys: SearchToolKeys,
  timeoutMs = 8000
): Promise<unknown | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      runSearch(tool, params, userId, searchToolKeys),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Search timeout')), timeoutMs)
      }),
    ])
    return result
  } catch (err) {
    log.warn('Search call failed', { reason: (err as Error).message })
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Summarize note content
 */
async function summarize(
  client: Anthropic,
  content: string,
  toolSettings: AIToolSettings
): Promise<ToolResult<string>> {
  const config = toolSettings.tools.summarize
  const userPrompt = `Please summarize the following note content:\n\n${content}`

  const result = await executePrompt(
    client,
    config.systemPrompt,
    userPrompt,
    config.modelName,
    config.maxTokens
  )
  return {
    data: result.content,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  }
}

/**
 * Phase 1: Extract verifiable claims from content + generate search queries.
 */
async function extractClaims(
  client: Anthropic,
  content: string,
  toolSettings: AIToolSettings
): Promise<ToolResult<ExtractedClaim[]>> {
  const config = toolSettings.tools.factCheck

  const extractionPrompt = `${config.systemPrompt}

IMPORTANT: Identify at most 3 of the most critical verifiable claims — the ones that matter most for the document's credibility. Skip trivial or obvious facts.

For each claim provide exactly 1 short, specific search query that would best verify or refute it.
Indicate whether "serp" (for factual/news verification) or "semantic" (for conceptual/academic verification) search is more appropriate.

Respond in JSON format:
[
  {
    "claim": "the exact claim",
    "confidence": "high|medium|low|uncertain",
    "explanation": "why this confidence level",
    "suggestedSources": ["source1", "source2"],
    "searchQueries": [{"query": "search query text", "searchType": "serp"}]
  }
]`

  const userPrompt = `Analyze the following text for factual claims:\n\n${content}`
  const result = await executePrompt(
    client,
    extractionPrompt,
    userPrompt,
    config.modelName,
    config.maxTokens
  )

  try {
    const jsonStr = extractJson(result.content, 'array')
    if (jsonStr) {
      return {
        data: JSON.parse(jsonStr) as ExtractedClaim[],
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }
    }
    return { data: [], inputTokens: result.inputTokens, outputTokens: result.outputTokens }
  } catch {
    return { data: [], inputTokens: result.inputTokens, outputTokens: result.outputTokens }
  }
}

/**
 * Phase 2: Verify claims against the web using SERP and/or semantic search.
 */
async function verifyClaimsWithSearch(
  claims: ExtractedClaim[],
  userId: string,
  searchToolKeys: SearchToolKeys
): Promise<Map<number, SearchResult[]>> {
  const resultsMap = new Map<number, SearchResult[]>()
  const claimsToVerify = claims.slice(0, 3) // Cap at 3 claims for cost efficiency

  // One search per claim, all in parallel
  const searchPromises = claimsToVerify.map(async (claim, index) => {
    const q = claim.searchQueries?.[0] ?? { query: claim.claim, searchType: 'serp' as const }

    const tool =
      q.searchType === 'semantic' && searchToolKeys.exa ? semanticSearchTool : serpSearchTool
    const params =
      q.searchType === 'semantic' && searchToolKeys.exa
        ? { query: q.query, numResults: 3, useAutoprompt: true }
        : { query: q.query, maxResults: 3, searchType: 'search' }

    const raw = await runSearchWithTimeout(tool, params, userId, searchToolKeys, 15000)
    const allResults: SearchResult[] = []
    if (raw && typeof raw === 'object' && 'results' in (raw as Record<string, unknown>)) {
      const results = (
        raw as { results: Array<{ title?: string; url?: string; snippet?: string }> }
      ).results
      for (const r of results) {
        if (r.title && r.url) {
          allResults.push({ title: r.title, url: r.url, snippet: r.snippet || '' })
        }
      }
    }

    resultsMap.set(index, allResults)
  })

  await Promise.allSettled(searchPromises)
  return resultsMap
}

/**
 * Phase 3: Synthesize claims with real search evidence into final verdicts.
 */
async function synthesizeFactCheck(
  client: Anthropic,
  claims: ExtractedClaim[],
  searchResults: Map<number, SearchResult[]>,
  toolSettings: AIToolSettings
): Promise<ToolResult<FactCheckResult[]>> {
  const config = toolSettings.tools.factCheck

  // Build context with claims and their search evidence
  const claimsWithEvidence = claims.slice(0, 3).map((claim, i) => {
    const evidence = searchResults.get(i) ?? []
    return {
      claimIndex: i,
      claim: claim.claim,
      originalConfidence: claim.confidence,
      originalExplanation: claim.explanation,
      searchEvidence: evidence.map((e) => ({ title: e.title, url: e.url, snippet: e.snippet })),
    }
  })

  const synthesisPrompt = `You are a fact-checking expert. You have been given claims extracted from a document and REAL web search results for each claim.

For each claim, provide:
1. A verdict: "verified" (strong evidence supports it), "likely_true" (some evidence supports, none contradicts), "disputed" (conflicting evidence), "likely_false" (evidence contradicts it), or "unverifiable" (no relevant evidence found)
2. Updated confidence level based on the evidence: high, medium, low, or uncertain
3. Explanation citing specific sources from the search results
4. Which sources support or contradict the claim

CRITICAL: Only cite sources from the provided search results. Do NOT invent or hallucinate sources.

Respond in JSON format:
[
  {
    "claim": "the exact claim text",
    "verdict": "verified|likely_true|disputed|likely_false|unverifiable",
    "confidence": "high|medium|low|uncertain",
    "explanation": "evidence-based explanation citing sources",
    "sources": [
      {"title": "Source Title", "url": "https://...", "snippet": "relevant excerpt", "supports": true}
    ]
  }
]`

  const userPrompt = `Claims and their search evidence:\n\n${JSON.stringify(claimsWithEvidence, null, 2)}`

  const result = await executePrompt(
    client,
    synthesisPrompt,
    userPrompt,
    config.modelName,
    config.maxTokens
  )

  try {
    const jsonStr = extractJson(result.content, 'array')
    if (jsonStr) {
      const synthesized = JSON.parse(jsonStr) as Array<{
        claim: string
        verdict: string
        confidence: string
        explanation: string
        sources?: Array<{ title: string; url: string; snippet: string; supports: boolean }>
      }>

      const finalResults: FactCheckResult[] = synthesized.map((s) => ({
        claim: s.claim,
        verdict: s.verdict as FactCheckResult['verdict'],
        confidence: s.confidence as FactCheckResult['confidence'],
        explanation: s.explanation,
        sources: s.sources ?? [],
        webSearchUsed: true,
      }))

      // Append any remaining claims (beyond the 3 verified) as-is
      for (let i = 3; i < claims.length; i++) {
        finalResults.push({
          claim: claims[i].claim,
          confidence: claims[i].confidence,
          explanation: claims[i].explanation,
          suggestedSources: claims[i].suggestedSources,
          webSearchUsed: false,
        })
      }

      return {
        data: finalResults,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }
    }
    return { data: [], inputTokens: result.inputTokens, outputTokens: result.outputTokens }
  } catch {
    return { data: [], inputTokens: result.inputTokens, outputTokens: result.outputTokens }
  }
}

/**
 * Fact-check claims in the note (three-phase: extract → search → synthesize)
 */
async function factCheck(
  client: Anthropic,
  content: string,
  toolSettings: AIToolSettings,
  searchToolKeys: SearchToolKeys,
  userId: string
): Promise<ToolResult<FactCheckResult[]>> {
  // Phase 1: Extract claims
  const extractResult = await extractClaims(client, content, toolSettings)
  const claims = extractResult.data

  if (claims.length === 0) {
    return {
      data: [],
      inputTokens: extractResult.inputTokens,
      outputTokens: extractResult.outputTokens,
    }
  }

  // Phase 2+3: Verify with search if keys are available
  const hasSearchKeys = !!(searchToolKeys.serper || searchToolKeys.exa)
  if (hasSearchKeys) {
    const searchResults = await verifyClaimsWithSearch(claims, userId, searchToolKeys)

    // Only synthesize if we actually got search results
    const totalResults = Array.from(searchResults.values()).reduce((sum, r) => sum + r.length, 0)
    if (totalResults > 0) {
      const synthesisResult = await synthesizeFactCheck(client, claims, searchResults, toolSettings)
      return {
        data: synthesisResult.data,
        inputTokens: extractResult.inputTokens + synthesisResult.inputTokens,
        outputTokens: extractResult.outputTokens + synthesisResult.outputTokens,
      }
    }
  }

  // Fallback: return Phase 1 results without web verification
  return {
    data: claims.map((c) => ({
      claim: c.claim,
      confidence: c.confidence,
      explanation: c.explanation,
      suggestedSources: c.suggestedSources,
      webSearchUsed: false,
    })),
    inputTokens: extractResult.inputTokens,
    outputTokens: extractResult.outputTokens,
  }
}

/**
 * Phase 1: Extract topic and gather trending context via web search.
 */
async function gatherTrendContext(
  client: Anthropic,
  content: string,
  userId: string,
  searchToolKeys: SearchToolKeys
): Promise<{
  topic: string
  trendingContext: LinkedInTrendingContext
  extraInputTokens: number
  extraOutputTokens: number
}> {
  // Quick topic extraction
  const topicResult = await executePrompt(
    client,
    'Extract the core topic of this content in 3-8 words. Reply with ONLY the topic, nothing else.',
    content.slice(0, 1000),
    'claude-haiku-4-5',
    100
  )
  const topic = topicResult.content.trim().replace(/^["']|["']$/g, '')

  // Run searches in parallel
  const [newsRaw, linkedInRaw] = await Promise.allSettled([
    runSearchWithTimeout(
      serpSearchTool,
      { query: topic, searchType: 'news', maxResults: 5 },
      userId,
      searchToolKeys
    ),
    runSearchWithTimeout(
      serpSearchTool,
      { query: `${topic} site:linkedin.com`, maxResults: 5, searchType: 'search' },
      userId,
      searchToolKeys
    ),
  ])

  const relatedNews: Array<{ title: string; url: string; date?: string }> = []
  const relatedPosts: Array<{ title: string; url: string; snippet: string }> = []

  if (newsRaw.status === 'fulfilled' && newsRaw.value && typeof newsRaw.value === 'object') {
    const newsData = newsRaw.value as {
      results?: Array<{ title?: string; url?: string; date?: string }>
    }
    for (const r of newsData.results ?? []) {
      if (r.title && r.url) relatedNews.push({ title: r.title, url: r.url, date: r.date })
    }
  }

  if (
    linkedInRaw.status === 'fulfilled' &&
    linkedInRaw.value &&
    typeof linkedInRaw.value === 'object'
  ) {
    const liData = linkedInRaw.value as {
      results?: Array<{ title?: string; url?: string; snippet?: string }>
    }
    for (const r of liData.results ?? []) {
      if (r.title && r.url)
        relatedPosts.push({ title: r.title, url: r.url, snippet: r.snippet || '' })
    }
  }

  // Require 3+ news results to consider a topic trending (2 is too easy to hit for any topic)
  const isTrending = relatedNews.length >= 3
  // Conservative score: news items carry 2 pts each, LinkedIn posts 1 pt each, capped at 10
  const trendScore = Math.min(10, relatedNews.length * 2 + Math.ceil(relatedPosts.length * 0.5))

  return {
    topic,
    trendingContext: { isTrending, trendScore, relatedNews, relatedPosts },
    extraInputTokens: topicResult.inputTokens,
    extraOutputTokens: topicResult.outputTokens,
  }
}

/**
 * Analyze content for LinkedIn post potential (two-phase: trend search → enhanced analysis)
 */
async function analyzeLinkedIn(
  client: Anthropic,
  content: string,
  toolSettings: AIToolSettings,
  searchToolKeys: SearchToolKeys,
  userId: string
): Promise<ToolResult<LinkedInAnalysis>> {
  const config = toolSettings.tools.linkedIn
  const hasSearchKeys = !!(searchToolKeys.serper || searchToolKeys.exa)

  let trendContext: Awaited<ReturnType<typeof gatherTrendContext>> | null = null
  let extraInputTokens = 0
  let extraOutputTokens = 0

  // Phase 1: Gather trend context if search keys available
  if (hasSearchKeys) {
    try {
      trendContext = await gatherTrendContext(client, content, userId, searchToolKeys)
      extraInputTokens = trendContext.extraInputTokens
      extraOutputTokens = trendContext.extraOutputTokens
    } catch (err) {
      log.warn('Trend context gathering failed, continuing without', {
        reason: (err as Error).message,
      })
    }
  }

  // Phase 2: Enhanced analysis with trend context
  let enrichedSystemPrompt = config.systemPrompt
  const enrichedUserPrompt = `Analyze this content for LinkedIn viral potential. Be critical - I want honest feedback, not encouragement:\n\n${content}`

  if (
    trendContext &&
    (trendContext.trendingContext.relatedNews.length > 0 ||
      trendContext.trendingContext.relatedPosts.length > 0)
  ) {
    const newsStr = trendContext.trendingContext.relatedNews
      .map((n) => `- ${n.title} (${n.url})${n.date ? ` [${n.date}]` : ''}`)
      .join('\n')
    const postsStr = trendContext.trendingContext.relatedPosts
      .map((p) => `- ${p.title}: ${p.snippet.slice(0, 120)} (${p.url})`)
      .join('\n')

    enrichedSystemPrompt += `

REAL-TIME CONTEXT (from live web search):

Trending news on "${trendContext.topic}":
${newsStr || '(no recent news found)'}

Similar LinkedIn posts:
${postsStr || '(no similar posts found)'}

In addition to your standard analysis, you MUST also provide these fields in your JSON response:
- "trendingContext": { "isTrending": boolean, "trendScore": number (1-10), "relatedNews": [{title, url, date?}], "relatedPosts": [{title, url, snippet}] }
- "timingAdvice": string (when to post based on the trending data)
- "competitiveAnalysis": string (how this compares to existing content on the topic)`
  }

  const result = await executePrompt(
    client,
    enrichedSystemPrompt,
    enrichedUserPrompt,
    config.modelName,
    config.maxTokens
  )

  try {
    const jsonStr = extractJson(result.content, 'object')
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr) as LinkedInAnalysis

      // Merge search-gathered trending context if the LLM didn't produce it
      if (trendContext && !parsed.trendingContext) {
        parsed.trendingContext = trendContext.trendingContext
      }
      parsed.webSearchUsed = !!trendContext

      return {
        data: parsed,
        inputTokens: result.inputTokens + extraInputTokens,
        outputTokens: result.outputTokens + extraOutputTokens,
      }
    }
    return {
      data: {
        overallScore: 5,
        hooks: [],
        suggestedHashtags: [],
        quotableLines: [],
        improvements: ['Unable to analyze - please try again'],
        webSearchUsed: false,
      },
      inputTokens: result.inputTokens + extraInputTokens,
      outputTokens: result.outputTokens + extraOutputTokens,
    }
  } catch {
    return {
      data: {
        overallScore: 5,
        hooks: [],
        suggestedHashtags: [],
        quotableLines: [],
        improvements: ['Unable to parse analysis - please try again'],
        webSearchUsed: false,
      },
      inputTokens: result.inputTokens + extraInputTokens,
      outputTokens: result.outputTokens + extraOutputTokens,
    }
  }
}

/**
 * Generate new content based on existing note and prompt
 */
async function writeWithAI(
  client: Anthropic,
  content: string,
  prompt: string,
  toolSettings: AIToolSettings
): Promise<ToolResult<string>> {
  const config = toolSettings.tools.writeWithAI
  const userPrompt = `Existing content:
${content}

---

Request: ${prompt}

Please generate the requested content:`

  const result = await executePrompt(
    client,
    config.systemPrompt,
    userPrompt,
    config.modelName,
    config.maxTokens
  )
  return {
    data: result.content,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  }
}

/**
 * Analyze paragraphs and suggest tags
 */
async function tagWithAI(
  client: Anthropic,
  content: string,
  availableTopics: Array<{ id: string; name: string }>,
  availableNotes: Array<{ id: string; title: string }>,
  toolSettings: AIToolSettings
): Promise<ToolResult<ParagraphTagSuggestion[]>> {
  const config = toolSettings.tools.tagWithAI
  const topicsStr = availableTopics.map((t) => `- ${t.name} (${t.id})`).join('\n')
  const notesStr = availableNotes
    .slice(0, 20)
    .map((n) => `- ${n.title} (${n.id})`)
    .join('\n')

  // Append context to the system prompt
  const systemPromptWithContext = `${config.systemPrompt}

Available Topics:
${topicsStr || '(none)'}

Available Notes:
${notesStr || '(none)'}`

  const userPrompt = `Analyze these paragraphs for tagging:\n\n${content}`

  const result = await executePrompt(
    client,
    systemPromptWithContext,
    userPrompt,
    config.modelName,
    config.maxTokens
  )

  try {
    const jsonStr = extractJson(result.content, 'array')
    if (jsonStr) {
      return {
        data: JSON.parse(jsonStr) as ParagraphTagSuggestion[],
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }
    }
    return { data: [], inputTokens: result.inputTokens, outputTokens: result.outputTokens }
  } catch {
    return { data: [], inputTokens: result.inputTokens, outputTokens: result.outputTokens }
  }
}

/**
 * Suggest note-level tags based on content
 */
async function suggestNoteTags(
  client: Anthropic,
  content: string,
  existingTags: string[],
  toolSettings: AIToolSettings
): Promise<ToolResult<string[]>> {
  const config = toolSettings.tools.suggestNoteTags
  const existingStr = existingTags.length > 0 ? `\n\nExisting tags: ${existingTags.join(', ')}` : ''

  // Append existing tags context to the system prompt
  const systemPromptWithContext = `${config.systemPrompt}${existingStr}`

  const userPrompt = `Suggest tags for this content:\n\n${content}`

  const result = await executePrompt(
    client,
    systemPromptWithContext,
    userPrompt,
    config.modelName,
    config.maxTokens
  )

  try {
    const jsonStr = extractJson(result.content, 'array')
    if (jsonStr) {
      const tags = JSON.parse(jsonStr) as string[]
      // Filter out existing tags
      return {
        data: tags.filter((t) => !existingTags.includes(t)),
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }
    }
    return { data: [], inputTokens: result.inputTokens, outputTokens: result.outputTokens }
  } catch {
    return { data: [], inputTokens: result.inputTokens, outputTokens: result.outputTokens }
  }
}

/**
 * Main Cloud Function for note AI analysis
 */
export const analyzeNoteWithAI = onCall(
  {
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (request): Promise<AIToolResponse> => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const userId = request.auth.uid
    const data = request.data as AIToolRequest

    if (!data.tool || !data.content) {
      throw new HttpsError('invalid-argument', 'Missing required fields: tool and content')
    }

    // Load API keys and search tool keys in parallel
    const [providerKeys, searchToolKeys] = await Promise.all([
      loadProviderKeys(userId),
      loadSearchToolKeys(userId),
    ])

    if (!providerKeys.anthropic) {
      throw new HttpsError(
        'failed-precondition',
        'Anthropic API key not configured. Please add your API key in Settings → Model Settings.'
      )
    }

    // Initialize Anthropic client (lazy-loaded to avoid init-time SDK import)
    const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
    const client = new AnthropicSDK({
      apiKey: providerKeys.anthropic,
    })

    // Load user's AI tool settings
    const toolSettings = await loadAIToolSettings(userId)

    // Map sub-tool variants to their parent tool for config lookup
    const toolConfigKey: AIToolId =
      data.tool === 'factCheckExtract' || data.tool === 'factCheckVerify'
        ? 'factCheck'
        : (data.tool as AIToolId)

    // Check if the requested tool is enabled
    const toolConfig = toolSettings.tools[toolConfigKey]
    if (!toolConfig.enabled) {
      throw new HttpsError('failed-precondition', `The "${toolConfig.name}" tool is disabled`)
    }

    let result: unknown
    let inputTokens = 0
    let outputTokens = 0

    try {
      switch (data.tool) {
        case 'summarize': {
          const summaryResult = await summarize(client, data.content, toolSettings)
          result = summaryResult.data
          inputTokens = summaryResult.inputTokens
          outputTokens = summaryResult.outputTokens
          break
        }

        case 'factCheck': {
          const factCheckResult = await factCheck(
            client,
            data.content,
            toolSettings,
            searchToolKeys,
            userId
          )
          result = factCheckResult.data
          inputTokens = factCheckResult.inputTokens
          outputTokens = factCheckResult.outputTokens
          break
        }

        case 'factCheckExtract': {
          const extractResult = await extractClaims(client, data.content, toolSettings)
          result = extractResult.data
          inputTokens = extractResult.inputTokens
          outputTokens = extractResult.outputTokens
          break
        }

        case 'factCheckVerify': {
          const selectedClaims = data.context?.selectedClaims
          if (!selectedClaims || selectedClaims.length === 0) {
            throw new HttpsError(
              'invalid-argument',
              'factCheckVerify requires selectedClaims in context'
            )
          }

          const hasSearchKeys = !!(searchToolKeys.serper || searchToolKeys.exa)
          if (hasSearchKeys) {
            const searchResults = await verifyClaimsWithSearch(
              selectedClaims,
              userId,
              searchToolKeys
            )
            const totalResults = Array.from(searchResults.values()).reduce(
              (sum, r) => sum + r.length,
              0
            )
            if (totalResults > 0) {
              const synthesisResult = await synthesizeFactCheck(
                client,
                selectedClaims,
                searchResults,
                toolSettings
              )
              result = synthesisResult.data
              inputTokens = synthesisResult.inputTokens
              outputTokens = synthesisResult.outputTokens
              break
            }
          }

          // Fallback: return claims without web verification
          result = selectedClaims.map((c) => ({
            claim: c.claim,
            confidence: c.confidence,
            explanation: c.explanation,
            suggestedSources: c.suggestedSources,
            webSearchUsed: false,
          }))
          break
        }

        case 'linkedIn': {
          const linkedInResult = await analyzeLinkedIn(
            client,
            data.content,
            toolSettings,
            searchToolKeys,
            userId
          )
          result = linkedInResult.data
          inputTokens = linkedInResult.inputTokens
          outputTokens = linkedInResult.outputTokens
          break
        }

        case 'writeWithAI': {
          if (!data.prompt) {
            throw new HttpsError('invalid-argument', 'Write with AI requires a prompt')
          }
          const writeResult = await writeWithAI(client, data.content, data.prompt, toolSettings)
          result = writeResult.data
          inputTokens = writeResult.inputTokens
          outputTokens = writeResult.outputTokens
          break
        }

        case 'tagWithAI': {
          const tagResult = await tagWithAI(
            client,
            data.content,
            data.context?.availableTopics ?? [],
            data.context?.availableNotes ?? [],
            toolSettings
          )
          result = tagResult.data
          inputTokens = tagResult.inputTokens
          outputTokens = tagResult.outputTokens
          break
        }

        case 'suggestNoteTags': {
          const existingTags = data.context?.availableTopics?.map((t) => t.name) ?? []
          const suggestResult = await suggestNoteTags(
            client,
            data.content,
            existingTags,
            toolSettings
          )
          result = suggestResult.data
          inputTokens = suggestResult.inputTokens
          outputTokens = suggestResult.outputTokens
          break
        }

        default:
          throw new HttpsError('invalid-argument', `Unknown tool: ${data.tool}`)
      }

      return {
        tool: data.tool,
        result,
        usage: {
          inputTokens,
          outputTokens,
        },
      }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }
      log.error('AI analysis failed', error)
      throw new HttpsError('internal', 'Failed to process AI analysis')
    }
  }
)
