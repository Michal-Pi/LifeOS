import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  OracleClaim,
  OracleAssumption,
  OracleKnowledgeGraph,
  OracleEvidence,
} from '@lifeos/agents'

// Mock logger
vi.mock('../../../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Mock axiomLoader — return test axioms with boundary conditions
const mockGetAxiomById = vi.fn()

vi.mock('../axiomLoader.js', () => ({
  getAxiomById: (...args: unknown[]) => mockGetAxiomById(...args),
  getRecipesForAgent: vi.fn().mockReturnValue([]),
  getRecipesByCategory: vi.fn().mockReturnValue([]),
  getRecipesByPhase: vi.fn().mockReturnValue([]),
  getRecipeById: vi.fn().mockReturnValue(undefined),
  getTechniqueById: vi.fn().mockReturnValue(undefined),
  getTechniquesForRecipe: vi.fn().mockReturnValue([]),
  getAxiomsByIds: vi.fn().mockReturnValue([]),
  getSystemElevations: vi.fn().mockReturnValue([]),
  getRecipesUsingAxiom: vi.fn().mockReturnValue([]),
  getAxiomsByDomain: vi.fn().mockReturnValue([]),
  formatRecipeForPrompt: vi.fn().mockReturnValue(''),
  formatTechniqueForPrompt: vi.fn().mockReturnValue(''),
  formatAxiomForPrompt: vi.fn().mockReturnValue(''),
}))

// Import after mocks
import {
  runTier1Checks,
  buildTier2ConfirmationPrompt,
  parseTier2Confirmation,
  computeHealthScore,
  buildConsistencyReport,
  buildBatchedTier2Prompt,
  parseBatchedTier2Confirmation,
  type ConsistencyFlag,
} from '../consistencyChecker.js'

// ----- Test Helpers -----

function makeClaim(overrides: Partial<OracleClaim> = {}): OracleClaim {
  return {
    id: 'CLM-001',
    type: 'causal',
    text: 'Test claim text',
    confidence: 0.8,
    confidenceBasis: 'data' as const,
    assumptions: [],
    dependencies: [],
    axiomRefs: [],
    evidenceIds: [],
    sourceIds: [],
    createdBy: 'test-agent',
    phase: 1,
    createdAtMs: Date.now(),
    ...overrides,
  } as OracleClaim
}

function makeAssumption(overrides: Partial<OracleAssumption> = {}): OracleAssumption {
  return {
    id: 'ASM-001',
    type: 'economic',
    statement: 'Test assumption statement',
    sensitivity: 'medium',
    observables: ['market indicator'],
    confidence: 0.7,
    ...overrides,
  } as OracleAssumption
}

function makeEvidence(overrides: Partial<OracleEvidence> = {}): OracleEvidence {
  return {
    id: 'EVD-001',
    ...overrides,
  } as OracleEvidence
}

function emptyGraph(): OracleKnowledgeGraph {
  return { nodes: [], edges: [], loops: [] }
}

function makeFlag(overrides: Partial<ConsistencyFlag> = {}): ConsistencyFlag {
  return {
    id: 'CF-001',
    type: 'graph_contradiction',
    severity: 'critical',
    message: 'Test flag message',
    affectedIds: ['CLM-001'],
    ...overrides,
  }
}

// ----- Tests -----

describe('Consistency Checker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: axiom lookup returns undefined (no axiom found)
    mockGetAxiomById.mockReturnValue(undefined)
  })

  // ========================================
  // runTier1Checks
  // ========================================

  describe('runTier1Checks', () => {
    describe('Axiom violations', () => {
      it('flags a claim whose text overlaps with an axiom boundary condition', () => {
        // Set up axiom with a boundary condition
        mockGetAxiomById.mockImplementation((id: string) => {
          if (id === 'AXM-010') {
            return {
              id: 'AXM-010',
              name: 'Network Effects',
              domain: 'economics',
              formalDefinition: 'Value increases with number of users',
              boundaryConditions: [
                'Does not apply when market saturation occurs and growth stagnates',
              ],
              canonicalCitations: [],
            }
          }
          return undefined
        })

        // Claim text contains "market saturation" and "growth stagnates"
        // which overlap with the boundary condition keywords
        const claim = makeClaim({
          id: 'CLM-010',
          text: 'Network effects will drive growth even when market saturation occurs and growth stagnates rapidly',
          axiomRefs: ['AXM-010'],
        })

        const flags = runTier1Checks([claim], [], emptyGraph(), [])

        const axiomFlags = flags.filter((f) => f.type === 'axiom_violation')
        expect(axiomFlags.length).toBe(1)
        expect(axiomFlags[0].severity).toBe('warning')
        expect(axiomFlags[0].affectedIds).toContain('CLM-010')
        expect(axiomFlags[0].affectedIds).toContain('AXM-010')
        expect(axiomFlags[0].message).toContain('boundary condition')
      })

      it('does not flag a claim when boundary keywords do not overlap', () => {
        mockGetAxiomById.mockImplementation((id: string) => {
          if (id === 'AXM-011') {
            return {
              id: 'AXM-011',
              name: 'Supply Demand',
              domain: 'economics',
              formalDefinition: 'Price is set by supply and demand intersection',
              boundaryConditions: [
                'Breaks down under government price controls and monopolistic conditions',
              ],
              canonicalCitations: [],
            }
          }
          return undefined
        })

        const claim = makeClaim({
          id: 'CLM-011',
          text: 'Rising consumer interest will increase widget sales in rural areas',
          axiomRefs: ['AXM-011'],
        })

        const flags = runTier1Checks([claim], [], emptyGraph(), [])
        const axiomFlags = flags.filter((f) => f.type === 'axiom_violation')
        expect(axiomFlags.length).toBe(0)
      })

      it('skips claims with no axiomRefs', () => {
        const claim = makeClaim({ axiomRefs: [] })
        const flags = runTier1Checks([claim], [], emptyGraph(), [])
        const axiomFlags = flags.filter((f) => f.type === 'axiom_violation')
        expect(axiomFlags.length).toBe(0)
      })
    })

    describe('Graph contradictions', () => {
      it('flags when same source-target pair has both supports and contradicts edges', () => {
        const graph: OracleKnowledgeGraph = {
          nodes: [
            { id: 'N1', type: 'principle', label: 'Node 1', properties: {} },
            { id: 'N2', type: 'trend', label: 'Node 2', properties: {} },
          ],
          edges: [
            { source: 'N1', target: 'N2', type: 'supports', strength: 0.8 },
            { source: 'N1', target: 'N2', type: 'contradicts', strength: 0.6 },
          ],
          loops: [],
        }

        const flags = runTier1Checks([], [], graph, [])

        const contradictionFlags = flags.filter((f) => f.type === 'graph_contradiction')
        expect(contradictionFlags.length).toBe(1)
        expect(contradictionFlags[0].severity).toBe('critical')
        expect(contradictionFlags[0].affectedIds).toContain('N1')
        expect(contradictionFlags[0].affectedIds).toContain('N2')
        expect(contradictionFlags[0].message).toContain('supports')
        expect(contradictionFlags[0].message).toContain('contradicts')
      })

      it('flags reinforces + disrupts as a contradiction', () => {
        const graph: OracleKnowledgeGraph = {
          nodes: [
            { id: 'N1', type: 'principle', label: 'Node 1', properties: {} },
            { id: 'N2', type: 'trend', label: 'Node 2', properties: {} },
          ],
          edges: [
            { source: 'N1', target: 'N2', type: 'reinforces', strength: 0.9 },
            { source: 'N1', target: 'N2', type: 'disrupts', strength: 0.5 },
          ],
          loops: [],
        }

        const flags = runTier1Checks([], [], graph, [])
        const contradictionFlags = flags.filter((f) => f.type === 'graph_contradiction')
        expect(contradictionFlags.length).toBe(1)
      })

      it('does not flag edges between different node pairs', () => {
        const graph: OracleKnowledgeGraph = {
          nodes: [
            { id: 'N1', type: 'principle', label: 'Node 1', properties: {} },
            { id: 'N2', type: 'trend', label: 'Node 2', properties: {} },
            { id: 'N3', type: 'constraint', label: 'Node 3', properties: {} },
          ],
          edges: [
            { source: 'N1', target: 'N2', type: 'supports', strength: 0.8 },
            { source: 'N1', target: 'N3', type: 'contradicts', strength: 0.6 },
          ],
          loops: [],
        }

        const flags = runTier1Checks([], [], graph, [])
        const contradictionFlags = flags.filter((f) => f.type === 'graph_contradiction')
        expect(contradictionFlags.length).toBe(0)
      })

      it('does not flag when only positive or only negative edges exist', () => {
        const graph: OracleKnowledgeGraph = {
          nodes: [
            { id: 'N1', type: 'principle', label: 'Node 1', properties: {} },
            { id: 'N2', type: 'trend', label: 'Node 2', properties: {} },
          ],
          edges: [
            { source: 'N1', target: 'N2', type: 'supports', strength: 0.8 },
            { source: 'N1', target: 'N2', type: 'causes', strength: 0.7 },
          ],
          loops: [],
        }

        const flags = runTier1Checks([], [], graph, [])
        const contradictionFlags = flags.filter((f) => f.type === 'graph_contradiction')
        expect(contradictionFlags.length).toBe(0)
      })
    })

    describe('Invalid references', () => {
      it('flags claims referencing non-existent evidence', () => {
        const claim = makeClaim({
          id: 'CLM-020',
          evidenceIds: ['EVD-999'],
        })

        const flags = runTier1Checks([claim], [], emptyGraph(), [])
        const refFlags = flags.filter((f) => f.type === 'invalid_reference')
        expect(refFlags.length).toBe(1)
        expect(refFlags[0].severity).toBe('warning')
        expect(refFlags[0].affectedIds).toContain('CLM-020')
        expect(refFlags[0].affectedIds).toContain('EVD-999')
        expect(refFlags[0].message).toContain('evidence')
      })

      it('does not flag claims with existing evidence', () => {
        const claim = makeClaim({
          id: 'CLM-021',
          evidenceIds: ['EVD-001'],
        })
        const evidence = [makeEvidence({ id: 'EVD-001' })]

        const flags = runTier1Checks([claim], [], emptyGraph(), evidence)
        const refFlags = flags.filter(
          (f) => f.type === 'invalid_reference' && f.message.includes('evidence')
        )
        expect(refFlags.length).toBe(0)
      })

      it('flags claims referencing non-existent axioms', () => {
        // mockGetAxiomById already returns undefined by default
        const claim = makeClaim({
          id: 'CLM-022',
          axiomRefs: ['AXM-MISSING'],
        })

        const flags = runTier1Checks([claim], [], emptyGraph(), [])
        const refFlags = flags.filter(
          (f) => f.type === 'invalid_reference' && f.message.includes('axiom')
        )
        expect(refFlags.length).toBe(1)
        expect(refFlags[0].affectedIds).toContain('AXM-MISSING')
      })

      it('flags claims with non-existent dependency claim IDs', () => {
        const claim = makeClaim({
          id: 'CLM-023',
          dependencies: ['CLM-NONEXISTENT'],
        })

        const flags = runTier1Checks([claim], [], emptyGraph(), [])
        const refFlags = flags.filter(
          (f) => f.type === 'invalid_reference' && f.message.includes('depends on')
        )
        expect(refFlags.length).toBe(1)
        expect(refFlags[0].severity).toBe('critical')
        expect(refFlags[0].affectedIds).toContain('CLM-NONEXISTENT')
      })

      it('flags claims with non-existent assumption IDs', () => {
        const claim = makeClaim({
          id: 'CLM-024',
          assumptions: ['ASM-MISSING'],
        })

        const flags = runTier1Checks([claim], [], emptyGraph(), [])
        const refFlags = flags.filter(
          (f) => f.type === 'invalid_reference' && f.message.includes('assumption')
        )
        expect(refFlags.length).toBe(1)
        expect(refFlags[0].affectedIds).toContain('ASM-MISSING')
      })

      it('does not flag when all references are valid', () => {
        mockGetAxiomById.mockImplementation((id: string) => {
          if (id === 'AXM-001') {
            return {
              id: 'AXM-001',
              name: 'Test Axiom',
              domain: 'test',
              formalDefinition: 'test',
              boundaryConditions: [],
              canonicalCitations: [],
            }
          }
          return undefined
        })

        const claims = [
          makeClaim({
            id: 'CLM-A',
            dependencies: ['CLM-B'],
            evidenceIds: ['EVD-001'],
            axiomRefs: ['AXM-001'],
            assumptions: ['ASM-001'],
          }),
          makeClaim({
            id: 'CLM-B',
            dependencies: [],
            evidenceIds: [],
            axiomRefs: [],
            assumptions: [],
          }),
        ]
        const assumptions = [makeAssumption({ id: 'ASM-001' })]
        const evidence = [makeEvidence({ id: 'EVD-001' })]

        const flags = runTier1Checks(claims, assumptions, emptyGraph(), evidence)
        const refFlags = flags.filter((f) => f.type === 'invalid_reference')
        expect(refFlags.length).toBe(0)
      })
    })

    describe('Circular dependencies', () => {
      it('detects a simple two-claim cycle', () => {
        const claims = [
          makeClaim({ id: 'CLM-001', dependencies: ['CLM-002'] }),
          makeClaim({ id: 'CLM-002', dependencies: ['CLM-001'] }),
        ]

        const flags = runTier1Checks(claims, [], emptyGraph(), [])
        const circularFlags = flags.filter((f) => f.type === 'circular_dependency')
        expect(circularFlags.length).toBe(1)
        expect(circularFlags[0].severity).toBe('critical')
        expect(circularFlags[0].affectedIds).toContain('CLM-001')
        expect(circularFlags[0].affectedIds).toContain('CLM-002')
        expect(circularFlags[0].message).toContain('Circular dependency')
        expect(circularFlags[0].message).toContain('DAG')
      })

      it('detects a three-claim cycle', () => {
        const claims = [
          makeClaim({ id: 'CLM-A', dependencies: ['CLM-B'] }),
          makeClaim({ id: 'CLM-B', dependencies: ['CLM-C'] }),
          makeClaim({ id: 'CLM-C', dependencies: ['CLM-A'] }),
        ]

        const flags = runTier1Checks(claims, [], emptyGraph(), [])
        const circularFlags = flags.filter((f) => f.type === 'circular_dependency')
        expect(circularFlags.length).toBe(1)
        expect(circularFlags[0].affectedIds.length).toBeGreaterThanOrEqual(2)
      })

      it('does not flag a linear dependency chain', () => {
        const claims = [
          makeClaim({ id: 'CLM-X', dependencies: ['CLM-Y'] }),
          makeClaim({ id: 'CLM-Y', dependencies: ['CLM-Z'] }),
          makeClaim({ id: 'CLM-Z', dependencies: [] }),
        ]

        const flags = runTier1Checks(claims, [], emptyGraph(), [])
        const circularFlags = flags.filter((f) => f.type === 'circular_dependency')
        expect(circularFlags.length).toBe(0)
      })
    })

    describe('Orphan claims', () => {
      it('flags a claim with no deps, no evidence, no axiomRefs, no assumptions, and not referenced by others', () => {
        const claim = makeClaim({
          id: 'CLM-ORPHAN',
          dependencies: [],
          evidenceIds: [],
          axiomRefs: [],
          assumptions: [],
        })

        const flags = runTier1Checks([claim], [], emptyGraph(), [])
        const orphanFlags = flags.filter((f) => f.type === 'orphan_claim')
        expect(orphanFlags.length).toBe(1)
        expect(orphanFlags[0].severity).toBe('info')
        expect(orphanFlags[0].affectedIds).toContain('CLM-ORPHAN')
        expect(orphanFlags[0].message).toContain('orphan')
      })

      it('does not flag a claim that has evidence', () => {
        const claim = makeClaim({
          id: 'CLM-WITH-EVD',
          dependencies: [],
          evidenceIds: ['EVD-001'],
          axiomRefs: [],
          assumptions: [],
        })
        const evidence = [makeEvidence({ id: 'EVD-001' })]

        const flags = runTier1Checks([claim], [], emptyGraph(), evidence)
        const orphanFlags = flags.filter((f) => f.type === 'orphan_claim')
        expect(orphanFlags.length).toBe(0)
      })

      it('does not flag a claim referenced as a dependency by another claim', () => {
        const claims = [
          makeClaim({
            id: 'CLM-REF',
            dependencies: [],
            evidenceIds: [],
            axiomRefs: [],
            assumptions: [],
          }),
          makeClaim({
            id: 'CLM-PARENT',
            dependencies: ['CLM-REF'],
            evidenceIds: ['EVD-001'],
            axiomRefs: [],
            assumptions: [],
          }),
        ]
        const evidence = [makeEvidence({ id: 'EVD-001' })]

        const flags = runTier1Checks(claims, [], emptyGraph(), evidence)
        const orphanFlags = flags.filter(
          (f) => f.type === 'orphan_claim' && f.affectedIds.includes('CLM-REF')
        )
        expect(orphanFlags.length).toBe(0)
      })

      it('does not flag a claim with axiomRefs', () => {
        mockGetAxiomById.mockImplementation((id: string) => {
          if (id === 'AXM-001') {
            return {
              id: 'AXM-001',
              name: 'Test',
              domain: 'test',
              formalDefinition: 'test',
              boundaryConditions: [],
              canonicalCitations: [],
            }
          }
          return undefined
        })

        const claim = makeClaim({
          id: 'CLM-WITH-AXM',
          dependencies: [],
          evidenceIds: [],
          axiomRefs: ['AXM-001'],
          assumptions: [],
        })

        const flags = runTier1Checks([claim], [], emptyGraph(), [])
        const orphanFlags = flags.filter((f) => f.type === 'orphan_claim')
        expect(orphanFlags.length).toBe(0)
      })

      it('does not flag a claim with assumptions', () => {
        const claim = makeClaim({
          id: 'CLM-WITH-ASM',
          dependencies: [],
          evidenceIds: [],
          axiomRefs: [],
          assumptions: ['ASM-001'],
        })
        const assumptions = [makeAssumption({ id: 'ASM-001' })]

        const flags = runTier1Checks([claim], assumptions, emptyGraph(), [])
        const orphanFlags = flags.filter((f) => f.type === 'orphan_claim')
        expect(orphanFlags.length).toBe(0)
      })
    })

    describe('Flag ordering and IDs', () => {
      it('sorts flags by severity: critical first, then warning, then info', () => {
        // Set up a scenario that produces all three severity levels:
        // - graph_contradiction (critical)
        // - invalid_reference on evidence (warning)
        // - orphan_claim (info)
        const claims = [
          makeClaim({
            id: 'CLM-050',
            evidenceIds: ['EVD-MISSING'],
            dependencies: [],
            axiomRefs: [],
            assumptions: [],
          }),
          makeClaim({
            id: 'CLM-051',
            dependencies: [],
            evidenceIds: [],
            axiomRefs: [],
            assumptions: [],
          }),
        ]

        const graph: OracleKnowledgeGraph = {
          nodes: [
            { id: 'N1', type: 'principle', label: 'A', properties: {} },
            { id: 'N2', type: 'trend', label: 'B', properties: {} },
          ],
          edges: [
            { source: 'N1', target: 'N2', type: 'supports', strength: 0.8 },
            { source: 'N1', target: 'N2', type: 'contradicts', strength: 0.6 },
          ],
          loops: [],
        }

        const flags = runTier1Checks(claims, [], graph, [])

        expect(flags.length).toBeGreaterThanOrEqual(3)

        // Verify ordering: critical before warning before info
        const severities = flags.map((f) => f.severity)
        const criticalIdx = severities.indexOf('critical')
        const warningIdx = severities.indexOf('warning')
        const infoIdx = severities.indexOf('info')

        if (criticalIdx !== -1 && warningIdx !== -1) {
          expect(criticalIdx).toBeLessThan(warningIdx)
        }
        if (warningIdx !== -1 && infoIdx !== -1) {
          expect(warningIdx).toBeLessThan(infoIdx)
        }
      })

      it('assigns sequential CF-XXX IDs after sorting', () => {
        const claims = [
          makeClaim({
            id: 'CLM-060',
            evidenceIds: ['EVD-MISSING'],
            dependencies: [],
            axiomRefs: [],
            assumptions: [],
          }),
          makeClaim({
            id: 'CLM-061',
            dependencies: [],
            evidenceIds: [],
            axiomRefs: [],
            assumptions: [],
          }),
        ]

        const flags = runTier1Checks(claims, [], emptyGraph(), [])

        for (let i = 0; i < flags.length; i++) {
          expect(flags[i].id).toBe(`CF-${String(i + 1).padStart(3, '0')}`)
        }
      })
    })

    it('returns empty flags for valid data with no issues', () => {
      mockGetAxiomById.mockImplementation((id: string) => {
        if (id === 'AXM-001') {
          return {
            id: 'AXM-001',
            name: 'Test',
            domain: 'test',
            formalDefinition: 'test',
            boundaryConditions: [],
            canonicalCitations: [],
          }
        }
        return undefined
      })

      const claims = [
        makeClaim({
          id: 'CLM-100',
          dependencies: ['CLM-101'],
          evidenceIds: ['EVD-001'],
          axiomRefs: ['AXM-001'],
          assumptions: ['ASM-001'],
        }),
        makeClaim({
          id: 'CLM-101',
          dependencies: [],
          evidenceIds: ['EVD-002'],
          axiomRefs: [],
          assumptions: [],
        }),
      ]
      const assumptions = [makeAssumption({ id: 'ASM-001' })]
      const evidence = [
        makeEvidence({ id: 'EVD-001' }),
        makeEvidence({ id: 'EVD-002' }),
      ]

      const flags = runTier1Checks(claims, assumptions, emptyGraph(), evidence)
      expect(flags.length).toBe(0)
    })
  })

  // ========================================
  // buildTier2ConfirmationPrompt
  // ========================================

  describe('buildTier2ConfirmationPrompt', () => {
    it('includes the flag type and severity', () => {
      const flag = makeFlag({
        type: 'graph_contradiction',
        severity: 'critical',
        message: 'Contradictory edges between N1 and N2',
        affectedIds: ['CLM-001'],
      })
      const claims = [makeClaim({ id: 'CLM-001', text: 'The economy will grow' })]

      const prompt = buildTier2ConfirmationPrompt(flag, claims)

      expect(prompt).toContain('graph_contradiction')
      expect(prompt).toContain('critical')
    })

    it('includes the flag message', () => {
      const flag = makeFlag({
        message: 'Contradictory edges between N1 and N2: supports vs contradicts',
      })
      const claims = [makeClaim({ id: 'CLM-001' })]

      const prompt = buildTier2ConfirmationPrompt(flag, claims)

      expect(prompt).toContain('Contradictory edges between N1 and N2')
    })

    it('includes relevant claim text for affected claim IDs', () => {
      const flag = makeFlag({
        affectedIds: ['CLM-001', 'CLM-002'],
      })
      const claims = [
        makeClaim({ id: 'CLM-001', text: 'AI will revolutionize healthcare' }),
        makeClaim({ id: 'CLM-002', text: 'Regulation will slow adoption' }),
      ]

      const prompt = buildTier2ConfirmationPrompt(flag, claims)

      expect(prompt).toContain('AI will revolutionize healthcare')
      expect(prompt).toContain('Regulation will slow adoption')
      expect(prompt).toContain('CLM-001')
      expect(prompt).toContain('CLM-002')
    })

    it('includes affected IDs even when they are not claim IDs', () => {
      const flag = makeFlag({
        affectedIds: ['CLM-001', 'AXM-010'],
      })
      const claims = [makeClaim({ id: 'CLM-001', text: 'Some claim text' })]

      const prompt = buildTier2ConfirmationPrompt(flag, claims)

      // AXM-010 is not a claim so no claim text, but still listed as affected
      expect(prompt).toContain('AXM-010')
      expect(prompt).toContain('Some claim text')
    })

    it('asks for JSON response with confirmed field', () => {
      const flag = makeFlag()
      const claims = [makeClaim()]

      const prompt = buildTier2ConfirmationPrompt(flag, claims)

      expect(prompt).toContain('"confirmed"')
      expect(prompt).toContain('JSON')
    })
  })

  // ========================================
  // parseTier2Confirmation
  // ========================================

  describe('parseTier2Confirmation', () => {
    it('parses valid JSON with confirmed=true', () => {
      const input = JSON.stringify({
        confirmed: true,
        explanation: 'This is indeed a real contradiction.',
      })

      const result = parseTier2Confirmation(input)

      expect(result).not.toBeNull()
      expect(result!.confirmed).toBe(true)
      expect(result!.explanation).toBe('This is indeed a real contradiction.')
    })

    it('parses valid JSON with confirmed=false', () => {
      const input = JSON.stringify({
        confirmed: false,
        explanation: 'This is a false positive due to context.',
      })

      const result = parseTier2Confirmation(input)

      expect(result).not.toBeNull()
      expect(result!.confirmed).toBe(false)
      expect(result!.explanation).toBe('This is a false positive due to context.')
    })

    it('extracts JSON from surrounding text', () => {
      const input = `After careful review:
      {"confirmed": true, "explanation": "The contradiction is real."}
      That concludes my analysis.`

      const result = parseTier2Confirmation(input)

      expect(result).not.toBeNull()
      expect(result!.confirmed).toBe(true)
      expect(result!.explanation).toBe('The contradiction is real.')
    })

    it('returns null for completely invalid input', () => {
      expect(parseTier2Confirmation('this is not json at all')).toBeNull()
    })

    it('returns null when confirmed field is missing', () => {
      const input = JSON.stringify({ explanation: 'No confirmed field' })

      const result = parseTier2Confirmation(input)
      expect(result).toBeNull()
    })

    it('returns null when confirmed field is not a boolean', () => {
      const input = JSON.stringify({ confirmed: 'yes', explanation: 'String instead of bool' })

      const result = parseTier2Confirmation(input)
      expect(result).toBeNull()
    })

    it('provides default explanation when explanation field is missing', () => {
      const input = JSON.stringify({ confirmed: true })

      const result = parseTier2Confirmation(input)

      expect(result).not.toBeNull()
      expect(result!.confirmed).toBe(true)
      expect(result!.explanation).toBe('No explanation provided.')
    })

    it('provides default explanation when explanation is not a string', () => {
      const input = JSON.stringify({ confirmed: false, explanation: 42 })

      const result = parseTier2Confirmation(input)

      expect(result).not.toBeNull()
      expect(result!.explanation).toBe('No explanation provided.')
    })

    it('returns null for empty string', () => {
      expect(parseTier2Confirmation('')).toBeNull()
    })
  })

  // ========================================
  // computeHealthScore
  // ========================================

  describe('computeHealthScore', () => {
    it('returns 1.0 for no flags', () => {
      expect(computeHealthScore([])).toBe(1.0)
    })

    it('subtracts 0.15 for each critical flag (no normalization)', () => {
      const flags = [
        makeFlag({ severity: 'critical' }),
        makeFlag({ severity: 'critical', id: 'CF-002' }),
      ]

      const score = computeHealthScore(flags)
      expect(score).toBe(0.7) // 1.0 - 0.15 - 0.15
    })

    it('subtracts 0.05 for each warning flag', () => {
      const flags = [
        makeFlag({ severity: 'warning' }),
      ]

      expect(computeHealthScore(flags)).toBe(0.95)
    })

    it('subtracts 0.01 for each info flag', () => {
      const flags = [
        makeFlag({ severity: 'info' }),
      ]

      expect(computeHealthScore(flags)).toBe(0.99)
    })

    it('applies penalties from mixed severity flags', () => {
      const flags = [
        makeFlag({ severity: 'critical' }),
        makeFlag({ severity: 'warning', id: 'CF-002' }),
        makeFlag({ severity: 'info', id: 'CF-003' }),
      ]

      // 1.0 - 0.15 - 0.05 - 0.01 = 0.79
      expect(computeHealthScore(flags)).toBe(0.79)
    })

    it('clamps to minimum of 0.0', () => {
      // 7 critical flags: 1.0 - 7*0.15 = -0.05 -> clamped to 0
      const flags = Array.from({ length: 7 }, (_, i) =>
        makeFlag({ severity: 'critical', id: `CF-${i + 1}` })
      )

      expect(computeHealthScore(flags)).toBe(0)
    })

    it('skips flags where llmConfirmed is false', () => {
      const flags = [
        makeFlag({ severity: 'critical', llmConfirmed: false }),
        makeFlag({ severity: 'warning', id: 'CF-002', llmConfirmed: false }),
      ]

      // Both flags are skipped because llmConfirmed === false
      expect(computeHealthScore(flags)).toBe(1.0)
    })

    it('counts flags where llmConfirmed is true', () => {
      const flags = [
        makeFlag({ severity: 'critical', llmConfirmed: true }),
      ]

      expect(computeHealthScore(flags)).toBe(0.85)
    })

    it('counts flags where llmConfirmed is undefined (Tier 2 not run)', () => {
      const flags = [
        makeFlag({ severity: 'critical', llmConfirmed: undefined }),
      ]

      // undefined !== false, so the flag still counts
      expect(computeHealthScore(flags)).toBe(0.85)
    })

    it('mixes confirmed and unconfirmed flags correctly', () => {
      const flags = [
        makeFlag({ severity: 'critical', llmConfirmed: true }),  // counts: -0.15
        makeFlag({ severity: 'critical', id: 'CF-002', llmConfirmed: false }), // skipped
        makeFlag({ severity: 'warning', id: 'CF-003' }),         // counts: -0.05
      ]

      // 1.0 - 0.15 - 0.05 = 0.80
      expect(computeHealthScore(flags)).toBe(0.8)
    })

    it('normalizes penalties for larger graphs', () => {
      const flags = [
        makeFlag({ severity: 'critical' }),
      ]

      // Without normalization: 1.0 - 0.15 = 0.85
      const scoreSmall = computeHealthScore(flags)
      expect(scoreSmall).toBe(0.85)

      // With 100 total items: normFactor = log2(101)/3 ≈ 2.22
      // penalty = 0.15/2.22 ≈ 0.068 → score ≈ 0.93
      const scoreLarge = computeHealthScore(flags, 100)
      expect(scoreLarge).toBeGreaterThan(0.85)
      expect(scoreLarge).toBeLessThan(1.0)
    })
  })

  // ========================================
  // buildConsistencyReport
  // ========================================

  describe('buildConsistencyReport', () => {
    it('returns correct tier1FlagCount', () => {
      const flags = [
        makeFlag({ id: 'CF-001' }),
        makeFlag({ id: 'CF-002', type: 'orphan_claim' }),
        makeFlag({ id: 'CF-003', type: 'invalid_reference' }),
      ]

      const report = buildConsistencyReport(flags)

      expect(report.tier1FlagCount).toBe(3)
    })

    it('counts tier2ConfirmedCount from llmConfirmed=true flags', () => {
      const flags = [
        makeFlag({ id: 'CF-001', llmConfirmed: true }),
        makeFlag({ id: 'CF-002', llmConfirmed: false }),
        makeFlag({ id: 'CF-003', llmConfirmed: true }),
        makeFlag({ id: 'CF-004' }), // undefined
      ]

      const report = buildConsistencyReport(flags)

      expect(report.tier2ConfirmedCount).toBe(2)
    })

    it('includes all flags in the report', () => {
      const flags = [
        makeFlag({ id: 'CF-001', type: 'axiom_violation' }),
        makeFlag({ id: 'CF-002', type: 'graph_contradiction' }),
      ]

      const report = buildConsistencyReport(flags)

      expect(report.flags).toHaveLength(2)
      expect(report.flags[0].type).toBe('axiom_violation')
      expect(report.flags[1].type).toBe('graph_contradiction')
    })

    it('computes overallHealthScore from flags', () => {
      const flags = [
        makeFlag({ id: 'CF-001', severity: 'critical' }),
        makeFlag({ id: 'CF-002', severity: 'warning' }),
      ]

      const report = buildConsistencyReport(flags)

      // 1.0 - 0.15 - 0.05 = 0.80
      expect(report.overallHealthScore).toBe(0.8)
    })

    it('returns health score of 1.0 for empty flags', () => {
      const report = buildConsistencyReport([])

      expect(report.tier1FlagCount).toBe(0)
      expect(report.tier2ConfirmedCount).toBe(0)
      expect(report.overallHealthScore).toBe(1.0)
    })

    it('correctly aggregates a complex mix of flags', () => {
      const flags = [
        makeFlag({ id: 'CF-001', severity: 'critical', type: 'circular_dependency', llmConfirmed: true }),
        makeFlag({ id: 'CF-002', severity: 'critical', type: 'graph_contradiction', llmConfirmed: false }),
        makeFlag({ id: 'CF-003', severity: 'warning', type: 'axiom_violation', llmConfirmed: true }),
        makeFlag({ id: 'CF-004', severity: 'warning', type: 'invalid_reference' }),
        makeFlag({ id: 'CF-005', severity: 'info', type: 'orphan_claim' }),
      ]

      const report = buildConsistencyReport(flags)

      expect(report.tier1FlagCount).toBe(5)
      expect(report.tier2ConfirmedCount).toBe(2) // CF-001 and CF-003
      expect(report.flags).toHaveLength(5)

      // Health: 1.0 - 0.15 (CF-001 confirmed) - skip CF-002 - 0.05 (CF-003) - 0.05 (CF-004) - 0.01 (CF-005)
      // = 1.0 - 0.15 - 0.05 - 0.05 - 0.01 = 0.74
      expect(report.overallHealthScore).toBe(0.74)
    })

    it('passes totalItems to health score normalization', () => {
      const flags = [
        makeFlag({ id: 'CF-001', severity: 'critical' }),
      ]

      const reportSmall = buildConsistencyReport(flags)
      const reportLarge = buildConsistencyReport(flags, 200)

      // Large graph should have a higher health score for the same flag count
      expect(reportLarge.overallHealthScore).toBeGreaterThan(reportSmall.overallHealthScore)
    })
  })

  // ========================================
  // Batched Tier 2
  // ========================================

  describe('buildBatchedTier2Prompt', () => {
    it('includes all flags in the prompt', () => {
      const flags = [
        makeFlag({ id: 'CF-001', type: 'graph_contradiction', message: 'Contradiction between N1 and N2' }),
        makeFlag({ id: 'CF-002', type: 'orphan_claim', message: 'Orphan claim CLM-005' }),
      ]
      const claims = [makeClaim({ id: 'CLM-001' })]

      const prompt = buildBatchedTier2Prompt(flags, claims)

      expect(prompt).toContain('CF-001')
      expect(prompt).toContain('CF-002')
      expect(prompt).toContain('graph_contradiction')
      expect(prompt).toContain('orphan_claim')
      expect(prompt).toContain('Contradiction between N1 and N2')
      expect(prompt).toContain('JSON array')
    })

    it('includes relevant claim text for affected IDs', () => {
      const flags = [
        makeFlag({ id: 'CF-001', affectedIds: ['CLM-001'] }),
      ]
      const claims = [makeClaim({ id: 'CLM-001', text: 'AI will transform diagnostics' })]

      const prompt = buildBatchedTier2Prompt(flags, claims)

      expect(prompt).toContain('AI will transform diagnostics')
    })
  })

  describe('parseBatchedTier2Confirmation', () => {
    it('parses a valid batched response', () => {
      const output = JSON.stringify([
        { flagId: 'CF-001', confirmed: true, explanation: 'Real issue' },
        { flagId: 'CF-002', confirmed: false, explanation: 'False positive' },
      ])

      const result = parseBatchedTier2Confirmation(output)

      expect(result).not.toBeNull()
      expect(result!).toHaveLength(2)
      expect(result![0].flagId).toBe('CF-001')
      expect(result![0].confirmed).toBe(true)
      expect(result![1].confirmed).toBe(false)
    })

    it('extracts JSON array from surrounding text', () => {
      const output = `Analysis complete:\n[{"flagId": "CF-001", "confirmed": true, "explanation": "Valid"}]\nEnd.`

      const result = parseBatchedTier2Confirmation(output)

      expect(result).not.toBeNull()
      expect(result!).toHaveLength(1)
    })

    it('returns null for invalid input', () => {
      expect(parseBatchedTier2Confirmation('not json')).toBeNull()
    })

    it('filters out entries without required fields', () => {
      const output = JSON.stringify([
        { flagId: 'CF-001', confirmed: true, explanation: 'Valid' },
        { explanation: 'Missing flagId and confirmed' },
        { flagId: 'CF-003', confirmed: 'yes' }, // confirmed not boolean
      ])

      const result = parseBatchedTier2Confirmation(output)

      expect(result).not.toBeNull()
      expect(result!).toHaveLength(1) // Only CF-001 is valid
    })
  })
})
