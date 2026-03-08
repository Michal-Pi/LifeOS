import { describe, expect, it } from 'vitest'

import { cappedReducer } from '../../shared/reducerUtils.js'

describe('DialecticalStateAnnotation reducer semantics', () => {
  it('velocityHistory caps at 20 entries', () => {
    const reducer = cappedReducer<number>(20)
    const current = Array.from({ length: 18 }, (_, i) => i / 10)
    const update = Array.from({ length: 5 }, (_, i) => (18 + i) / 10)

    const result = reducer(current, update)

    expect(result).toHaveLength(20)
    expect(result[0]).toBeCloseTo(0.3)
    expect(result.at(-1)).toBeCloseTo(2.2)
  })

  it('densityHistory caps at 20 entries', () => {
    const reducer = cappedReducer<number>(20)
    const current = Array.from({ length: 19 }, (_, i) => i)
    const update = [19, 20, 21]

    const result = reducer(current, update)

    expect(result).toHaveLength(20)
    expect(result[0]).toBe(2)
    expect(result.at(-1)).toBe(21)
  })

  it('degradedPhases appends fallback markers', () => {
    const reducer = (cur: string[], upd: string[]) => [...cur, ...upd]

    expect(reducer(['cross_negation'], ['sublation'])).toEqual([
      'cross_negation',
      'sublation',
    ])
  })
})
