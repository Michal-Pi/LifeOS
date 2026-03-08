import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DialecticalSessionId, ExtractedClaim, RunBudget, SourceRecord } from '@lifeos/agents'

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => mockDb),
}))

vi.mock('../../../lib/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const mockSet = vi.fn().mockResolvedValue(undefined)
const mockUpdate = vi.fn().mockResolvedValue(undefined)
const mockDoc = vi.fn(() => ({ set: mockSet, update: mockUpdate }))
const mockGet = vi.fn().mockResolvedValue({ docs: [] })
const mockCollection = vi.fn(() => ({ get: mockGet }))
const mockDb = { doc: mockDoc, collection: mockCollection }

import { KnowledgeHypergraph } from '../../knowledgeHypergraph.js'
import { mapClaimsToKG } from '../claimExtraction.js'
import { generateAnswer } from '../answerGeneration.js'

const SESSION_ID = 'session-1' as DialecticalSessionId

function makeBudget(): RunBudget {
  return {
    maxBudgetUsd: 10,
    spentUsd: 0,
    spentTokens: 0,
    searchCallsUsed: 0,
    maxSearchCalls: 10,
    llmCallsUsed: 0,
    phase: 'full',
    maxRecursiveDepth: 3,
    gapIterationsUsed: 0,
  }
}

function makeSource(sourceId: string): SourceRecord {
  return {
    sourceId,
    url: `https://example.com/${sourceId}`,
    title: `Source ${sourceId}`,
    domain: 'example.com',
    fetchedAtMs: Date.now(),
    fetchMethod: 'read_url',
    contentLength: 1000,
    contentHash: `hash_${sourceId}`,
    sourceType: 'web',
  }
}

function makeClaim(overrides?: Partial<ExtractedClaim>): ExtractedClaim {
  return {
    claimText: 'AI adoption depends on reimbursement incentives',
    confidence: 0.9,
    evidenceType: 'empirical',
    sourceId: 'src-1',
    concepts: ['AI adoption', 'reimbursement'],
    ...overrides,
  }
}

describe('answer generation quality markers', () => {
  let kg: KnowledgeHypergraph

  beforeEach(() => {
    vi.clearAllMocks()
    kg = new KnowledgeHypergraph(SESSION_ID, 'user-1', mockDb as never)
  })

  it('includes single-source markers in the KG summary used for answer generation', async () => {
    await mapClaimsToKG([makeClaim()], [makeSource('src-1')], kg, SESSION_ID, 'user-1')

    let capturedPrompt = ''
    await generateAnswer(
      kg,
      'What drives AI adoption?',
      async (_systemPrompt, userPrompt) => {
        capturedPrompt = userPrompt
        return JSON.stringify({
          directAnswer: 'Answer',
          supportingClaims: [],
          counterclaims: [],
          openUncertainties: [],
          confidenceAssessment: { overall: 0.7, byTopic: {} },
          citations: [],
          knowledgeGraphSummary: { resolvedCount: 0 },
        })
      },
      makeBudget()
    )

    expect(capturedPrompt).toContain('[single-source]')
  })

  it('appends a traceability warning when answer claims do not match KG claims', async () => {
    await mapClaimsToKG([makeClaim()], [makeSource('src-1')], kg, SESSION_ID, 'user-1')

    const { answer } = await generateAnswer(
      kg,
      'What drives AI adoption?',
      async () =>
        JSON.stringify({
          directAnswer: 'A synthesized answer with unsupported framing.',
          supportingClaims: [
            {
              claimText: 'A different unmatched claim',
              confidence: 0.6,
              sources: ['https://example.com/src-1'],
              evidenceType: 'empirical',
            },
          ],
          counterclaims: [],
          openUncertainties: [],
          confidenceAssessment: { overall: 0.7, byTopic: {} },
          citations: [],
          knowledgeGraphSummary: { resolvedCount: 0 },
        }),
      makeBudget()
    )

    expect(answer.directAnswer).toContain(
      'Note: Some claims in this analysis could not be traced to indexed sources.'
    )
  })
})
