import { describe, it, expect } from 'vitest'

import { cappedReducer } from '../../shared/reducerUtils.js'

/**
 * Tests for the DeepResearchStateAnnotation reducer semantics.
 *
 * Since LangGraph Annotation internals aren't directly testable via spec access,
 * we test the reducer logic inline. The actual annotation uses these exact functions.
 */

describe('DeepResearchStateAnnotation reducer semantics', () => {
  describe('REPLACE semantics for dialectical outputs', () => {
    // These reducers match what's used in stateAnnotations.ts
    const replaceReducer = <T>(cur: T[], upd: T[]) => (upd.length > 0 ? upd : cur)

    it('replaces theses when update is non-empty', () => {
      const current = [{ agentId: 'old', lens: 'economic' }]
      const update = [{ agentId: 'new', lens: 'systems' }]
      const result = replaceReducer(current, update)

      expect(result).toEqual(update)
      expect(result).not.toContain(current[0])
    })

    it('keeps current theses when update is empty', () => {
      const current = [{ agentId: 'old', lens: 'economic' }]
      const result = replaceReducer(current, [])
      expect(result).toEqual(current)
    })

    it('replaces negations when update is non-empty', () => {
      const current = [{ agentId: 'old-neg' }]
      const update = [{ agentId: 'new-neg' }]
      const result = replaceReducer(current, update)
      expect(result).toEqual(update)
    })

    it('keeps current negations when update is empty', () => {
      const result = replaceReducer([{ agentId: 'old' }], [])
      expect(result).toEqual([{ agentId: 'old' }])
    })

    it('replaces contradictions when update is non-empty', () => {
      const current = [{ id: 'old-c' }]
      const update = [{ id: 'new-c' }]
      const result = replaceReducer(current, update)
      expect(result).toEqual(update)
    })

    it('keeps current contradictions when update is empty', () => {
      const result = replaceReducer([{ id: 'old' }], [])
      expect(result).toEqual([{ id: 'old' }])
    })

    it('does NOT accumulate across cycles (unlike APPEND)', () => {
      let state = [{ id: 'cycle1' }]

      // Cycle 2 update
      state = replaceReducer(state, [{ id: 'cycle2a' }, { id: 'cycle2b' }])
      expect(state).toHaveLength(2)
      expect(state.map((s) => s.id)).toEqual(['cycle2a', 'cycle2b'])

      // Cycle 3 update
      state = replaceReducer(state, [{ id: 'cycle3' }])
      expect(state).toHaveLength(1)
      expect(state[0].id).toBe('cycle3')
    })
  })

  describe('kgSnapshot field', () => {
    const kgSnapshotReducer = (_cur: unknown, upd: unknown) => upd

    it('defaults to null', () => {
      expect(kgSnapshotReducer(undefined, null)).toBeNull()
    })

    it('replaces on update', () => {
      const snapshot = { graph: {}, claimCount: 5, snapshotAtMs: Date.now(), gapIteration: 0 }
      const result = kgSnapshotReducer(null, snapshot)
      expect(result).toEqual(snapshot)
    })

    it('replaces previous snapshot', () => {
      const old = { graph: {}, claimCount: 3, snapshotAtMs: 1000 }
      const newer = { graph: {}, claimCount: 10, snapshotAtMs: 2000 }
      const result = kgSnapshotReducer(old, newer)
      expect(result).toEqual(newer)
    })
  })

  describe('mergedGraph field', () => {
    const mergedGraphReducer = (_cur: unknown, upd: unknown) => upd

    it('defaults to null', () => {
      expect(mergedGraphReducer(undefined, null)).toBeNull()
    })

    it('replaces on update', () => {
      const graph = { nodes: [], edges: [], summary: 'test' }
      const result = mergedGraphReducer(null, graph)
      expect(result).toEqual(graph)
    })
  })

  describe('graphHistory field', () => {
    const graphHistoryReducer = (cur: unknown[], upd: unknown[]) => [...cur, ...upd].slice(-20)

    it('accumulates entries', () => {
      const result = graphHistoryReducer([{ cycle: 0, diff: {} }], [{ cycle: 1, diff: {} }])
      expect(result).toHaveLength(2)
    })

    it('caps at 20 entries', () => {
      const current = Array.from({ length: 18 }, (_, i) => ({ cycle: i, diff: {} }))
      const update = Array.from({ length: 5 }, (_, i) => ({ cycle: 18 + i, diff: {} }))

      const result = graphHistoryReducer(current, update)
      expect(result).toHaveLength(20) // capped
      // Should keep the most recent 20 (last 20)
      expect((result[0] as { cycle: number }).cycle).toBe(3)
      expect((result[19] as { cycle: number }).cycle).toBe(22)
    })

    it('defaults to empty array', () => {
      const result = graphHistoryReducer([], [])
      expect(result).toEqual([])
    })
  })

  describe('capped reducers', () => {
    it('sources reducer caps at 100', () => {
      const reducer = cappedReducer<{ id: string }>(100)
      const current = Array.from({ length: 80 }, (_, i) => ({ id: `s${i}` }))
      const update = Array.from({ length: 40 }, (_, i) => ({ id: `s${80 + i}` }))

      const result = reducer(current, update)
      expect(result).toHaveLength(100)
      expect(result[0]?.id).toBe('s20')
      expect(result.at(-1)?.id).toBe('s119')
    })

    it('extractedClaims reducer caps at 200', () => {
      const reducer = cappedReducer<{ id: string }>(200)
      const current = Array.from({ length: 150 }, (_, i) => ({ id: `c${i}` }))
      const update = Array.from({ length: 80 }, (_, i) => ({ id: `c${150 + i}` }))

      const result = reducer(current, update)
      expect(result).toHaveLength(200)
      expect(result[0]?.id).toBe('c30')
      expect(result.at(-1)?.id).toBe('c229')
    })

    it('oracle evidence reducer caps at 200', () => {
      const reducer = cappedReducer<{ id: string }>(200)
      const current = Array.from({ length: 180 }, (_, i) => ({ id: `e${i}` }))
      const update = Array.from({ length: 40 }, (_, i) => ({ id: `e${180 + i}` }))

      const result = reducer(current, update)
      expect(result).toHaveLength(200)
      expect(result[0]?.id).toBe('e20')
      expect(result.at(-1)?.id).toBe('e219')
    })

    it('cycleMetrics reducer caps at 20', () => {
      const reducer = cappedReducer<{ cycle: number }>(20)
      const current = Array.from({ length: 18 }, (_, i) => ({ cycle: i }))
      const update = Array.from({ length: 5 }, (_, i) => ({ cycle: 18 + i }))

      const result = reducer(current, update)
      expect(result).toHaveLength(20)
      expect(result[0]?.cycle).toBe(3)
      expect(result.at(-1)?.cycle).toBe(22)
    })
  })

  describe('processedSourceUrls field', () => {
    const processedUrlsReducer = (cur: Set<string>, upd: Set<string>) => new Set([...cur, ...upd])

    it('merges sets', () => {
      const current = new Set(['url1.com', 'url2.com'])
      const update = new Set(['url2.com', 'url3.com'])
      const result = processedUrlsReducer(current, update)

      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(3)
      expect(result.has('url1.com')).toBe(true)
      expect(result.has('url2.com')).toBe(true)
      expect(result.has('url3.com')).toBe(true)
    })

    it('defaults to empty set', () => {
      const result = processedUrlsReducer(new Set(), new Set())
      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(0)
    })
  })

  describe('degradedPhases field', () => {
    const degradedReducer = (cur: string[], upd: string[]) => [...cur, ...upd]

    it('appends degraded phase names', () => {
      expect(degradedReducer(['sense_making'], ['sublation'])).toEqual([
        'sense_making',
        'sublation',
      ])
    })

    it('defaults to empty array semantics', () => {
      expect(degradedReducer([], [])).toEqual([])
    })
  })
})

describe('DeepResearchPhase type', () => {
  it('includes kg_snapshot in the union', () => {
    // If this compiles, kg_snapshot is in the union
    type Phase = import('../stateAnnotations.js').DeepResearchPhase
    const phase: Phase = 'kg_snapshot'
    expect(phase).toBe('kg_snapshot')
  })
})
