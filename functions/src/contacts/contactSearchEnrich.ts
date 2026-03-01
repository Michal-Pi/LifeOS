/**
 * Contact Search Enrichment
 *
 * Uses SERP search (Serper.dev) + Claude to find and extract
 * structured contact information from web results.
 *
 * Supports two modes:
 * - basic: Quick SERP search + single Claude extraction (default)
 * - deep:  Multi-agent workers searching different angles + synthesis
 *
 * POST /contactSearchEnrich
 * Body: { uid, name, company?, email?, mode?: 'basic' | 'deep' }
 */

import type { Request, Response } from 'express'
import { getAuth } from 'firebase-admin/auth'
import { onRequest } from 'firebase-functions/v2/https'
import { createLogger } from '../lib/logger.js'
import { loadProviderKeys, loadSearchToolKeys } from '../agents/providerKeys.js'
import type { SearchToolKeys } from '../agents/providerKeys.js'

const log = createLogger('ContactSearchEnrich')

const SERPER_API = 'https://google.serper.dev/search'

// ----- Auth Helper -----

async function verifyAuth(request: Request, response: Response, uid: string): Promise<boolean> {
  try {
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      response.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' })
      return false
    }

    const idToken = authHeader.split('Bearer ')[1]
    const decodedToken = await getAuth().verifyIdToken(idToken)

    if (decodedToken.uid !== uid) {
      response.status(403).json({ error: 'Forbidden: User mismatch' })
      return false
    }

    return true
  } catch {
    response.status(401).json({ error: 'Unauthorized: Invalid or expired token' })
    return false
  }
}

// ----- SERP Search -----

interface SerpResult {
  title: string
  snippet: string
  link: string
}

async function serpSearch(
  apiKey: string,
  query: string,
  num = 10
): Promise<SerpResult[]> {
  const res = await fetch(SERPER_API, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num }),
  })

  if (!res.ok) {
    throw new Error(`Serper API returned status ${res.status}`)
  }

  const data = (await res.json()) as { organic?: SerpResult[] }
  return data.organic ?? []
}

// ----- Jina Reader Scraping -----

const SCRAPE_MAX_LENGTH = 15_000

async function scrapeUrl(url: string, jinaKey?: string): Promise<string | null> {
  try {
    const headers: Record<string, string> = { Accept: 'text/plain' }
    if (jinaKey) headers['Authorization'] = `Bearer ${jinaKey}`

    const response = await fetch(`https://r.jina.ai/${url}`, { headers })
    if (!response.ok) return null

    const content = await response.text()
    return content.length > SCRAPE_MAX_LENGTH
      ? content.substring(0, SCRAPE_MAX_LENGTH) + '\n\n[... content truncated]'
      : content
  } catch {
    return null
  }
}

// ----- Shared Helpers -----

interface TokenUsage {
  input: number
  output: number
}

function deduplicateResults(settledResults: PromiseSettledResult<SerpResult[]>[]): SerpResult[] {
  const allResults: SerpResult[] = []
  const seenUrls = new Set<string>()

  for (const result of settledResults) {
    if (result.status === 'fulfilled') {
      for (const r of result.value) {
        const normalizedUrl = r.link.replace(/\/$/, '').toLowerCase()
        if (!seenUrls.has(normalizedUrl)) {
          seenUrls.add(normalizedUrl)
          allResults.push(r)
        }
      }
    }
  }
  return allResults
}

function parseJsonFromText(text: string): Record<string, unknown> {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude did not return valid JSON')
  return JSON.parse(jsonMatch[0]) as Record<string, unknown>
}

// ----- Basic Mode: Claude Extraction -----

const EXTRACTION_SYSTEM_PROMPT = `You are a contact enrichment assistant. Given search results about a person, extract structured information.

Return ONLY a JSON object with the following fields (omit any field where you have no data):
{
  "title": "current job title",
  "company": "current company",
  "bio": "brief professional bio (1-2 sentences)",
  "linkedinSlug": "linkedin public identifier/slug (just the slug, not the full URL)",
  "interests": ["interest1", "interest2"],
  "goals": "professional goals or priorities",
  "challenges": "current professional challenges",
  "strategicPriorities": "strategic priorities",
  "workHistory": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "current": true
    }
  ]
}

Rules:
- Only include information you are confident about from the search results
- Do not guess or fabricate information
- For dates, use YYYY-MM-DD format (use YYYY-01-01 if only year is known)
- For workHistory, set current=true and omit endDate for current positions
- Extract LinkedIn slug from any LinkedIn URLs found (e.g. "johndoe" from linkedin.com/in/johndoe)
- Keep bio factual and concise`

async function extractWithClaude(
  anthropicKey: string,
  name: string,
  company: string | undefined,
  searchResults: SerpResult[]
): Promise<Record<string, unknown>> {
  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
  const client = new AnthropicSDK({ apiKey: anthropicKey })

  const resultsText = searchResults
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.link}`)
    .join('\n\n')

  const userPrompt = [
    `Person: ${name}`,
    company ? `Company: ${company}` : null,
    '',
    'Search Results:',
    resultsText,
    '',
    'Extract structured contact information from these search results. Return JSON only.',
  ]
    .filter((line) => line !== null)
    .join('\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const textContent = response.content.find((c) => c.type === 'text')
  const text = textContent?.type === 'text' ? textContent.text : ''

  return {
    ...parseJsonFromText(text),
    _tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  }
}

// ----- Deep Mode: Multi-Agent Workers + Synthesis -----

const SOCIAL_MEDIA_DOMAINS = [
  'linkedin.com',
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'youtube.com',
  'reddit.com',
]

interface WorkerDefinition {
  id: string
  label: string
  queries: string[]
  scrapeMode: 'linkedin' | 'articles' | 'personal' | 'none'
  extractionPrompt: string
  targetFields: string[]
}

interface WorkerOutput {
  workerId: string
  fields: Record<string, unknown>
  sources: SerpResult[]
  tokensUsed: TokenUsage
}

function buildWorkerDefinitions(
  name: string,
  company: string | undefined,
  email: string | undefined
): WorkerDefinition[] {
  const companyTerm = company || ''

  return [
    {
      id: 'linkedin_profile',
      label: 'LinkedIn Profile',
      queries: [
        `"${name}" site:linkedin.com/in`,
        `"${name}"${companyTerm ? ` ${companyTerm}` : ''} linkedin`,
      ],
      scrapeMode: 'linkedin',
      extractionPrompt:
        'Focus on extracting current and past roles, job titles, company names, professional headline, skills, and location. Extract the LinkedIn slug from any linkedin.com/in/ URLs.',
      targetFields: ['title', 'company', 'bio', 'linkedinSlug', 'workHistory'],
    },
    {
      id: 'company_role',
      label: 'Company & Role',
      queries: companyTerm
        ? [
            `"${name}" "${companyTerm}" CEO OR CTO OR VP OR Director OR founder OR "Head of"`,
            `"${name}" "${companyTerm}" announcement OR appointed OR joined OR promoted`,
          ]
        : [
            `"${name}" CEO OR CTO OR VP OR Director OR founder OR "Head of"`,
            `"${name}" appointed OR joined OR promoted`,
          ],
      scrapeMode: 'none',
      extractionPrompt:
        'Focus on the person\'s current role details, seniority, company context, any leadership announcements, strategic direction they are driving, and professional goals mentioned in press or company communications.',
      targetFields: ['title', 'company', 'strategicPriorities', 'goals'],
    },
    {
      id: 'thought_leadership',
      label: 'Thought Leadership',
      queries: [
        `"${name}"${companyTerm ? ` "${companyTerm}"` : ''} speaker OR keynote OR conference OR podcast`,
        `"${name}"${companyTerm ? ` "${companyTerm}"` : ''} blog OR article OR interview OR opinion`,
      ],
      scrapeMode: 'articles',
      extractionPrompt:
        'Focus on topics this person speaks or writes about, their professional perspectives and opinions, areas of expertise, conferences they attend or speak at, and any stated professional interests or passions.',
      targetFields: ['interests', 'goals', 'challenges', 'bio'],
    },
    {
      id: 'personal_context',
      label: 'Personal Context',
      queries: [
        `"${name}"${companyTerm ? ` "${companyTerm}"` : ''} hobbies OR interests OR family OR personal OR "outside of work"`,
        `"${name}" about OR bio OR profile OR interview`,
      ],
      scrapeMode: 'personal',
      extractionPrompt:
        'Focus on personal life details: hobbies, interests outside of work, family mentions, communication style, personality traits observed in interviews, preferences about meetings or communication, and any personal values or causes they care about.',
      targetFields: ['interests', 'familyNotes', 'personalityStyle', 'preferences'],
    },
    {
      id: 'professional_network',
      label: 'Professional Network',
      queries: [
        `"${name}"${companyTerm ? ` "${companyTerm}"` : ''} strategy OR vision OR priorities OR challenges OR "working on"`,
        ...(email ? [`"${email}"`] : []),
      ],
      scrapeMode: 'none',
      extractionPrompt:
        'Focus on professional challenges this person is tackling, their strategic priorities, industry context, stated goals or vision, what problems they are trying to solve, and their professional network context.',
      targetFields: ['goals', 'challenges', 'strategicPriorities', 'interests'],
    },
  ]
}

function isPersonalOrInterviewUrl(url: string): boolean {
  const lower = url.toLowerCase()
  // Skip social media
  if (SOCIAL_MEDIA_DOMAINS.some((d) => lower.includes(d))) return false
  // Look for personal sites, about pages, interviews, blogs
  return (
    lower.includes('/about') ||
    lower.includes('/bio') ||
    lower.includes('/interview') ||
    lower.includes('/profile') ||
    lower.includes('/blog') ||
    lower.includes('/podcast') ||
    lower.includes('/author') ||
    // Personal domains tend to be short paths
    (new URL(url).pathname.split('/').filter(Boolean).length <= 1 &&
      !lower.includes('.com/search') &&
      !lower.includes('.com/results'))
  )
}

function selectUrlsToScrape(results: SerpResult[], mode: WorkerDefinition['scrapeMode']): string[] {
  switch (mode) {
    case 'linkedin': {
      const linkedInUrl = results.find((r) => r.link.includes('linkedin.com/in/'))
      return linkedInUrl ? [linkedInUrl.link] : []
    }
    case 'articles': {
      return results
        .filter((r) => !SOCIAL_MEDIA_DOMAINS.some((d) => r.link.includes(d)))
        .slice(0, 3)
        .map((r) => r.link)
    }
    case 'personal': {
      return results
        .filter((r) => isPersonalOrInterviewUrl(r.link))
        .slice(0, 3)
        .map((r) => r.link)
    }
    default:
      return []
  }
}

async function executeWorker(
  worker: WorkerDefinition,
  name: string,
  anthropicKey: string,
  searchKeys: SearchToolKeys
): Promise<WorkerOutput> {
  // 1. Run SERP queries in parallel
  const serpResults = await Promise.allSettled(
    worker.queries.map((q) => serpSearch(searchKeys.serper!, q, 8))
  )
  const allResults = deduplicateResults(serpResults)

  if (allResults.length === 0) {
    return { workerId: worker.id, fields: {}, sources: [], tokensUsed: { input: 0, output: 0 } }
  }

  // 2. Scrape relevant URLs via Jina Reader
  const urlsToScrape = selectUrlsToScrape(allResults, worker.scrapeMode)
  const scrapedPages: string[] = []

  if (urlsToScrape.length > 0) {
    const scrapeResults = await Promise.allSettled(
      urlsToScrape.map((url) => scrapeUrl(url, searchKeys.jina))
    )
    for (const result of scrapeResults) {
      if (result.status === 'fulfilled' && result.value) {
        scrapedPages.push(result.value)
      }
    }
  }

  // 3. Extract focused fields via Claude
  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
  const client = new AnthropicSDK({ apiKey: anthropicKey })

  const systemPrompt = `You are a contact enrichment specialist. ${worker.extractionPrompt}

Return ONLY a JSON object with these fields (omit any where you have no data):
${JSON.stringify(worker.targetFields)}

Rules:
- Only include information you are confident about
- Do not guess or fabricate information
- For arrays, include multiple items when found
- For text fields, be detailed but concise
- For dates, use YYYY-MM-DD format (use YYYY-01-01 if only year is known)
- For workHistory entries, include company, title, startDate, endDate, and current (boolean)
- Extract LinkedIn slug from any linkedin.com/in/ URLs (just the slug, not the full URL)`

  const resultsText = allResults
    .slice(0, 10)
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.link}`)
    .join('\n\n')

  const scrapedText =
    scrapedPages.length > 0
      ? '\n\nScraped Page Content:\n' +
        scrapedPages.map((p, i) => `--- Page ${i + 1} ---\n${p}`).join('\n\n')
      : ''

  const userPrompt = `Person: ${name}\n\nSearch Results:\n${resultsText}${scrapedText}\n\nExtract the targeted fields from these results. Return JSON only.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const textContent = response.content.find((c) => c.type === 'text')
  const text = textContent?.type === 'text' ? textContent.text : ''

  let fields: Record<string, unknown> = {}
  try {
    fields = parseJsonFromText(text)
  } catch {
    log.warn(`Worker ${worker.id} produced unparseable output`, { text: text.slice(0, 200) })
  }

  return {
    workerId: worker.id,
    fields,
    sources: allResults.slice(0, 5),
    tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  }
}

const SYNTHESIS_SYSTEM_PROMPT = `You are synthesizing contact research from multiple search agents into a single comprehensive profile.

Given research from multiple workers, merge all findings into one definitive JSON object.

Return ONLY a JSON object with ALL of these fields (omit only if truly no data was found):
{
  "title": "current job title",
  "company": "current company",
  "bio": "polished 2-3 sentence professional bio incorporating all findings",
  "linkedinSlug": "linkedin public identifier slug",
  "interests": ["interest1", "interest2", "..."],
  "goals": "professional goals or priorities",
  "challenges": "current professional challenges they are tackling",
  "strategicPriorities": "key strategic priorities",
  "workHistory": [
    { "company": "Name", "title": "Title", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "current": true }
  ],
  "familyNotes": "family mentions if any (spouse, kids, etc.)",
  "personalityStyle": "communication and work style based on observed signals",
  "preferences": "stated preferences about meetings, communication, or work"
}

Rules:
- When workers disagree, prefer the most specific and recent information
- Combine interests from all sources into a single deduplicated array
- Deduplicate workHistory entries — keep the most complete version of each role
- Write bio as a polished summary, not a raw concatenation
- personalityStyle should describe communication/work style if any signals exist in the data
- preferences should note stated preferences about meetings, communication, etc.
- Only include information backed by the research data — do not fabricate
- For dates, use YYYY-MM-DD format`

async function synthesizeWorkerOutputs(
  anthropicKey: string,
  name: string,
  company: string | undefined,
  workerOutputs: WorkerOutput[]
): Promise<{ fields: Record<string, unknown>; tokensUsed: TokenUsage }> {
  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
  const client = new AnthropicSDK({ apiKey: anthropicKey })

  const workerSummaries = workerOutputs
    .filter((wo) => Object.keys(wo.fields).length > 0)
    .map((wo) => `## Worker: ${wo.workerId}\n${JSON.stringify(wo.fields, null, 2)}`)
    .join('\n\n')

  if (!workerSummaries) {
    return { fields: {}, tokensUsed: { input: 0, output: 0 } }
  }

  const userPrompt = `Synthesize a comprehensive profile for: ${name}${company ? ` at ${company}` : ''}\n\nWorker Research:\n${workerSummaries}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    system: SYNTHESIS_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const textContent = response.content.find((c) => c.type === 'text')
  const text = textContent?.type === 'text' ? textContent.text : ''

  let fields: Record<string, unknown> = {}
  try {
    fields = parseJsonFromText(text)
  } catch {
    log.warn('Synthesis produced unparseable output', { text: text.slice(0, 200) })
  }

  return {
    fields,
    tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  }
}

async function deepEnrich(
  name: string,
  company: string | undefined,
  email: string | undefined,
  anthropicKey: string,
  searchKeys: SearchToolKeys
): Promise<{
  enrichedFields: Record<string, unknown>
  sources: Array<{ title: string; url: string; snippet: string }>
  tokensUsed: TokenUsage
  workersCompleted: number
}> {
  // Phase 1: Build worker definitions
  const workers = buildWorkerDefinitions(name, company, email)

  log.info('Deep enrich starting', { name, workerCount: workers.length })

  // Phase 2: Execute all workers in parallel
  const workerResults = await Promise.allSettled(
    workers.map((w) => executeWorker(w, name, anthropicKey, searchKeys))
  )

  const successfulOutputs: WorkerOutput[] = []
  const totalTokens: TokenUsage = { input: 0, output: 0 }

  for (const result of workerResults) {
    if (result.status === 'fulfilled') {
      successfulOutputs.push(result.value)
      totalTokens.input += result.value.tokensUsed.input
      totalTokens.output += result.value.tokensUsed.output
    } else {
      log.warn('Worker failed', { error: result.reason })
    }
  }

  if (successfulOutputs.length === 0) {
    return { enrichedFields: {}, sources: [], tokensUsed: totalTokens, workersCompleted: 0 }
  }

  // Phase 3: Synthesize
  const synthesis = await synthesizeWorkerOutputs(anthropicKey, name, company, successfulOutputs)
  totalTokens.input += synthesis.tokensUsed.input
  totalTokens.output += synthesis.tokensUsed.output

  // Collect and deduplicate all sources
  const allSources: SerpResult[] = []
  const seenUrls = new Set<string>()
  for (const wo of successfulOutputs) {
    for (const s of wo.sources) {
      const normalized = s.link.replace(/\/$/, '').toLowerCase()
      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized)
        allSources.push(s)
      }
    }
  }

  log.info('Deep enrich completed', {
    workersCompleted: successfulOutputs.length,
    fieldsExtracted: Object.keys(synthesis.fields).length,
    totalTokens,
  })

  return {
    enrichedFields: synthesis.fields,
    sources: allSources.slice(0, 10).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet })),
    tokensUsed: totalTokens,
    workersCompleted: successfulOutputs.length,
  }
}

// ----- Endpoint -----

export const contactSearchEnrich = onRequest(
  { timeoutSeconds: 300, memory: '1GiB' as const, cors: true },
  async (request, response) => {
    const { uid, name, company, email, mode } = request.body ?? {}
    const enrichMode = mode === 'deep' ? 'deep' : 'basic'

    if (!uid || !name) {
      response.status(400).json({ error: 'Missing required fields: uid, name' })
      return
    }

    if (!(await verifyAuth(request, response, uid))) return

    try {
      // Load API keys
      const [providerKeys, searchKeys] = await Promise.all([
        loadProviderKeys(uid),
        loadSearchToolKeys(uid),
      ])

      if (!providerKeys.anthropic) {
        response.status(400).json({
          error: 'Anthropic API key not configured. Add it in Settings > Model Settings.',
        })
        return
      }

      if (!searchKeys.serper) {
        response.status(400).json({
          error: 'Serper API key not configured. Add it in Settings > Search Tools.',
        })
        return
      }

      // ----- Deep Mode -----
      if (enrichMode === 'deep') {
        const result = await deepEnrich(
          name as string,
          company as string | undefined,
          email as string | undefined,
          providerKeys.anthropic,
          searchKeys
        )

        response.json({
          success: true,
          mode: 'deep',
          enrichedFields: result.enrichedFields,
          sources: result.sources,
          tokensUsed: result.tokensUsed,
          workersCompleted: result.workersCompleted,
        })
        return
      }

      // ----- Basic Mode -----
      const queries: string[] = [`"${name}"${company ? ` "${company}"` : ''}`]

      if (company) {
        queries.push(`"${name}" ${company} linkedin`)
      } else {
        queries.push(`"${name}" linkedin`)
      }

      if (email) {
        const domain = (email as string).split('@')[1]
        if (domain && !domain.includes('gmail') && !domain.includes('yahoo') && !domain.includes('hotmail')) {
          queries.push(`"${name}" ${domain}`)
        }
        queries.push(`"${email}"`)
      }

      // Run SERP searches in parallel
      const searchPromises = queries.map((q) => serpSearch(searchKeys.serper!, q, 8))
      const searchResults = await Promise.allSettled(searchPromises)
      const allResults = deduplicateResults(searchResults)

      if (allResults.length === 0) {
        response.json({
          success: true,
          mode: 'basic',
          enrichedFields: {},
          sources: [],
          message: 'No search results found for this person.',
        })
        return
      }

      // Extract structured data via Claude
      const extracted = await extractWithClaude(
        providerKeys.anthropic,
        name as string,
        company as string | undefined,
        allResults.slice(0, 15)
      )

      const tokensUsed = extracted._tokensUsed
      delete extracted._tokensUsed

      log.info('Contact search enrichment completed', {
        userId: uid,
        name,
        mode: 'basic',
        resultCount: allResults.length,
        fieldsExtracted: Object.keys(extracted).length,
      })

      response.json({
        success: true,
        mode: 'basic',
        enrichedFields: extracted,
        sources: allResults.slice(0, 5).map((r) => ({
          title: r.title,
          url: r.link,
          snippet: r.snippet,
        })),
        tokensUsed,
      })
    } catch (err) {
      log.error('Contact search enrichment failed', err)
      response.status(500).json({ error: (err as Error).message })
    }
  }
)
