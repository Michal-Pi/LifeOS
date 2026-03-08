import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { CreateClaimInput, DialecticalSessionId, KGDiff } from '@lifeos/agents'

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
import { applyKGDiffToGraph } from '../../deepResearch/kgEnrichment.js'
import { generateAnswer } from '../../deepResearch/answerGeneration.js'

const SESSION_ID = 'session-1' as DialecticalSessionId

function makeClaimInput(text: string): CreateClaimInput {
  return {
    sessionId: SESSION_ID,
    userId: 'user-1',
    text,
    normalizedText: text.toLowerCase().trim().replace(/\s+/g, ' '),
    sourceEpisodeId: 'src-1' as CreateClaimInput['sourceEpisodeId'],
    sourceAgentId: 'agent:test' as CreateClaimInput['sourceAgentId'],
    sourceLens: 'systems' as CreateClaimInput['sourceLens'],
    claimType: 'ASSERTION',
    confidence: 0.8,
    conceptIds: [],
  }
}

describe('deep research KG evolution', () => {
  let kg: KnowledgeHypergraph

  beforeEach(() => {
    vi.clearAllMocks()
    kg = new KnowledgeHypergraph(SESSION_ID, 'user-1', mockDb as never)
  })

  it('applies synthesis kgDiff claims before answer generation uses the KG summary', async () => {
    await kg.addClaim(makeClaimInput('Claim one about hospital AI adoption'))
    await kg.addClaim(makeClaimInput('Claim two about regulation slowing deployment'))
    await kg.addClaim(makeClaimInput('Claim three about workflow efficiency gains'))

    const kgDiff: KGDiff = {
      conceptSplits: [],
      conceptMerges: [],
      newMediators: [],
      edgeReversals: [],
      regimeScopings: [],
      temporalizations: [],
      newClaims: [
        { id: 'new-1', text: 'New claim about reimbursement incentives accelerating adoption' },
        { id: 'new-2', text: 'New claim about clinician trust remaining the bottleneck' },
      ],
      supersededClaims: [],
      newContradictions: [],
      resolvedContradictions: [],
      newPredictions: [],
    }

    await applyKGDiffToGraph(kgDiff, kg, SESSION_ID, 'user-1')

    expect(kg.getNodesByType('claim')).toHaveLength(5)

    let capturedPrompt = ''
    await expect(
      generateAnswer(
        kg,
        'What matters most?',
        async (_systemPrompt, userPrompt) => {
          capturedPrompt = userPrompt
          throw new Error('stop after prompt capture')
        },
        {
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
      )
    ).rejects.toThrow('stop after prompt capture')

    expect(capturedPrompt).toContain(
      'New claim about reimbursement incentives accelerating adoption'
    )
    expect(capturedPrompt).toContain('New claim about clinician trust remaining the bottleneck')
  })
})
