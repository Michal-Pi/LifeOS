import { describe, expect, it, vi } from 'vitest'
import type { NegationOutput, ThesisOutput } from '@lifeos/agents'

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('../providerService.js', () => ({
  executeWithProvider: vi.fn(),
}))

import { runContradictionTrackers } from '../contradictionTrackers.js'

function makeThesis(agentId: string, statement: string): ThesisOutput {
  return {
    agentId,
    model: 'gpt-4o',
    lens: 'systems',
    conceptGraph: {},
    causalModel: [statement],
    falsificationCriteria: [],
    decisionImplications: [],
    unitOfAnalysis: 'firm',
    temporalGrain: 'yearly',
    regimeAssumptions: [],
    confidence: 0.8,
    rawText: statement,
  }
}

describe('runContradictionTrackers', () => {
  const theses: ThesisOutput[] = [
    makeThesis('agent_systems', 'AI investment will increase productivity'),
    makeThesis('agent_critical', 'AI investment will decrease productivity'),
  ]
  const negations: NegationOutput[] = []
  const context = {
    sessionId: 'session-1',
    userId: 'user-1',
    cycleNumber: 1,
    apiKeys: {},
  }

  it('uses KG claim IDs when agentClaimMapping is provided', () => {
    const result = runContradictionTrackers(theses, negations, ['LOGIC'], context as never, {
      agent_systems: ['claim_123'],
      agent_critical: ['claim_456'],
    })

    expect(result.allContradictions).toHaveLength(1)
    expect(result.allContradictions[0]?.participatingClaims).toEqual(
      expect.arrayContaining(['claim_123', 'claim_456'])
    )
  })

  it('falls back to agent IDs when no mapping is provided', () => {
    const result = runContradictionTrackers(theses, negations, ['LOGIC'], context as never)

    expect(result.allContradictions).toHaveLength(1)
    expect(result.allContradictions[0]?.participatingClaims).toEqual(
      expect.arrayContaining(['agent_systems', 'agent_critical'])
    )
  })
})
