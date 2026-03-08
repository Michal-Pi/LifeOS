import { describe, it, expect, vi } from 'vitest'
import type { SublationOutput } from '@lifeos/agents'

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('../langgraph/utils.js', () => ({
  executeAgentWithEvents: vi.fn(),
}))

import { calculateConceptualVelocity } from '../metaReflection.js'

function makeSynthesis(overrides: Partial<SublationOutput> = {}): SublationOutput {
  return {
    operators: [],
    preservedElements: [],
    negatedElements: [],
    newClaims: [
      { id: 'claim-a', text: 'Claim A', confidence: 0.7 },
      { id: 'claim-b', text: 'Claim B', confidence: 0.7 },
    ],
    newPredictions: [],
    newConceptGraph: {},
    schemaDiff: null,
    ...overrides,
  }
}

describe('calculateConceptualVelocity', () => {
  it('keeps the raw change velocity when no contradictions were detected', () => {
    const velocity = calculateConceptualVelocity(makeSynthesis(), null, [])

    expect(velocity).toBeCloseTo(0.0923, 3)
  })

  it('blends change velocity with resolution depth when contradictions exist', () => {
    const velocity = calculateConceptualVelocity(
      makeSynthesis(),
      {
        newContradictions: ['c1', 'c2'],
        resolvedContradictions: ['c1'],
      } as never,
      []
    )

    expect(velocity).toBeCloseTo(0.2458, 3)
  })
})
