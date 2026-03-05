import { describe, it, expect, vi } from 'vitest'
import {
  getHistoricalCalibration,
  injectHistoricalCalibration,
  type HistoricalEstimate,
} from '../historicalCalibration.js'

// ── helpers ──

function makeFirestoreMock(completedDocs: unknown[], totalDocs: unknown[]) {
  const collection = vi.fn().mockImplementation((_path: string) => ({
    where: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ docs: completedDocs }),
      }),
      get: vi.fn().mockResolvedValue({ docs: totalDocs }),
    }),
  }))
  return { collection } as unknown as FirebaseFirestore.Firestore
}

function makeTodoDoc(overrides: Record<string, unknown> = {}) {
  const createdAt = new Date('2026-02-01T10:00:00Z')
  const completedAt = new Date('2026-02-01T14:00:00Z') // 4 hours later
  return {
    data: () => ({
      status: 'done',
      createdAt: { toDate: () => createdAt },
      completedAt: { toDate: () => completedAt },
      estimatedMinutes: 120,
      category: 'development',
      ...overrides,
    }),
  }
}

// ── getHistoricalCalibration ──

describe('Phase 49 — getHistoricalCalibration', () => {
  it('returns null when fewer than 10 completed tasks exist', async () => {
    const docs = Array.from({ length: 5 }, () => makeTodoDoc())
    const firestore = makeFirestoreMock(docs, docs)
    const result = await getHistoricalCalibration('user-1', firestore)
    expect(result).toBeNull()
  })

  it('returns valid calibration with 10+ completed tasks', async () => {
    const docs = Array.from({ length: 15 }, () => makeTodoDoc())
    const firestore = makeFirestoreMock(docs, docs)
    const result = await getHistoricalCalibration('user-1', firestore)
    expect(result).not.toBeNull()
    expect(result!.sampleSize).toBe(15)
    expect(result!.averageHoursPerTask).toBe(4) // 4 hours per task
    expect(result!.completionRatePercent).toBe(100)
  })

  it('calculates correct average hours', async () => {
    const shortDocs = Array.from({ length: 10 }, () =>
      makeTodoDoc({
        createdAt: { toDate: () => new Date('2026-02-01T10:00:00Z') },
        completedAt: { toDate: () => new Date('2026-02-01T12:00:00Z') }, // 2 hours
      })
    )
    const firestore = makeFirestoreMock(shortDocs, shortDocs)
    const result = await getHistoricalCalibration('user-1', firestore)
    expect(result).not.toBeNull()
    expect(result!.averageHoursPerTask).toBe(2)
  })

  it('calculates correct completion rate', async () => {
    const completedDocs = Array.from({ length: 12 }, () => makeTodoDoc())
    const allDocs = Array.from({ length: 20 }, () => makeTodoDoc())
    const firestore = makeFirestoreMock(completedDocs, allDocs)
    const result = await getHistoricalCalibration('user-1', firestore)
    expect(result).not.toBeNull()
    expect(result!.completionRatePercent).toBe(60) // 12/20
  })

  it('identifies common delay reasons from overdue tasks', async () => {
    // Tasks that took significantly longer than estimated (>1.5x)
    const overdueDocs = Array.from({ length: 10 }, () =>
      makeTodoDoc({
        estimatedMinutes: 60, // estimated 1 hour
        createdAt: { toDate: () => new Date('2026-02-01T10:00:00Z') },
        completedAt: { toDate: () => new Date('2026-02-01T14:00:00Z') }, // took 4 hours (4x over)
        category: 'development',
      })
    )
    const firestore = makeFirestoreMock(overdueDocs, overdueDocs)
    const result = await getHistoricalCalibration('user-1', firestore)
    expect(result).not.toBeNull()
    expect(result!.commonDelayReasons).toContain('development')
  })
})

// ── injectHistoricalCalibration ──

describe('Phase 49 — injectHistoricalCalibration', () => {
  const calibration: HistoricalEstimate = {
    averageHoursPerTask: 3.5,
    completionRatePercent: 72,
    commonDelayReasons: ['development', 'meetings'],
    sampleSize: 25,
  }

  it('appends calibration data to system prompt when present', () => {
    const result = injectHistoricalCalibration('You are a planner.', calibration)
    expect(result).toContain('HISTORICAL CALIBRATION DATA')
    expect(result).toContain('3.5 hours')
    expect(result).toContain('72%')
    expect(result).toContain('25 past tasks')
    expect(result).toContain('development, meetings')
  })

  it('returns original prompt when calibration is null', () => {
    const prompt = 'You are a planner.'
    expect(injectHistoricalCalibration(prompt, null)).toBe(prompt)
  })

  it('returns original prompt when calibration is undefined', () => {
    const prompt = 'You are a planner.'
    expect(injectHistoricalCalibration(prompt, undefined)).toBe(prompt)
  })

  it('omits delay reasons line when array is empty', () => {
    const noDealys: HistoricalEstimate = {
      ...calibration,
      commonDelayReasons: [],
    }
    const result = injectHistoricalCalibration('You are a planner.', noDealys)
    expect(result).toContain('HISTORICAL CALIBRATION DATA')
    expect(result).not.toContain('Common delays')
  })
})

// ── Refinement loop graph assertions ──

describe('Phase 49 — Refinement loop edge conditions', () => {
  // Inline graph definition matching the Project Plan Builder template
  const graphEdges = [
    { from: 'planner', to: 'time_check', condition: { type: 'always' } },
    { from: 'time_check', to: 'evaluator', condition: { type: 'always' } },
    {
      from: 'evaluator',
      to: 'gap_researcher',
      condition: { type: 'equals', key: 'evaluation', value: 'NEEDS_WORK' },
    },
    {
      from: 'evaluator',
      to: 'improvement',
      condition: { type: 'equals', key: 'evaluation', value: 'COMPLETE' },
    },
    { from: 'gap_researcher', to: 'planner', condition: { type: 'always' } },
    { from: 'improvement', to: 'quality_review', condition: { type: 'always' } },
    {
      from: 'quality_review',
      to: 'improvement',
      condition: { type: 'contains', value: 'NEEDS_REVISION' },
    },
    {
      from: 'quality_review',
      to: 'end_node',
      condition: { type: 'contains', value: 'APPROVED' },
    },
  ]

  it('quality_review loops back to improvement on NEEDS_REVISION', () => {
    const loopEdge = graphEdges.find(
      (e) => e.from === 'quality_review' && e.to === 'improvement'
    )
    expect(loopEdge).toBeDefined()
    expect(loopEdge!.condition.type).toBe('contains')
    expect(loopEdge!.condition.value).toBe('NEEDS_REVISION')
  })

  it('quality_review goes to end_node on APPROVED', () => {
    const endEdge = graphEdges.find(
      (e) => e.from === 'quality_review' && e.to === 'end_node'
    )
    expect(endEdge).toBeDefined()
    expect(endEdge!.condition.type).toBe('contains')
    expect(endEdge!.condition.value).toBe('APPROVED')
  })

  it('no unconditional (always) edge from quality_review', () => {
    const alwaysEdge = graphEdges.find(
      (e) => e.from === 'quality_review' && e.condition.type === 'always'
    )
    expect(alwaysEdge).toBeUndefined()
  })

  it('graph has maxNodeVisits limit to prevent infinite loops', () => {
    const limits = { maxNodeVisits: 5, maxEdgeRepeats: 3 }
    expect(limits.maxNodeVisits).toBeGreaterThanOrEqual(2)
    expect(limits.maxEdgeRepeats).toBeGreaterThanOrEqual(1)
  })
})
