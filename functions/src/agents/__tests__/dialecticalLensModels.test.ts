import { describe, it, expect } from 'vitest'
import { LENS_MODEL_PRESETS } from '@lifeos/agents'
import type { ThesisLens } from '@lifeos/agents'

describe('LENS_MODEL_PRESETS (Phase 26)', () => {
  it('has presets for all 9 lens types', () => {
    const lenses: ThesisLens[] = ['economic', 'systems', 'adversarial', 'behavioral', 'historical', 'technical', 'political', 'ecological', 'custom']
    for (const lens of lenses) {
      expect(LENS_MODEL_PRESETS[lens]).toBeDefined()
      expect(LENS_MODEL_PRESETS[lens].provider).toBeTruthy()
      expect(LENS_MODEL_PRESETS[lens].modelName).toBeTruthy()
    }
  })

  it('uses different providers for diversity', () => {
    const providers = new Set(Object.values(LENS_MODEL_PRESETS).map(p => p.provider))
    expect(providers.size).toBeGreaterThanOrEqual(3) // at least 3 different providers
  })

  it('adversarial and systems use claude', () => {
    expect(LENS_MODEL_PRESETS.adversarial.provider).toBe('anthropic')
    expect(LENS_MODEL_PRESETS.systems.provider).toBe('anthropic')
  })

  it('economic and technical use o1', () => {
    expect(LENS_MODEL_PRESETS.economic.modelName).toBe('o1')
    expect(LENS_MODEL_PRESETS.technical.modelName).toBe('o1')
  })
})
