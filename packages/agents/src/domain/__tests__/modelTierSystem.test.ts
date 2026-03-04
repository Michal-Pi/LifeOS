import { describe, it, expect } from 'vitest'
import {
  MODEL_TIER_MAP,
  COST_SAVING_RULES,
  resolveEffectiveModel,
  inferTierFromModel,
} from '../modelSettings'
import type { ModelProvider, ModelTier } from '../models'

describe('MODEL_TIER_MAP', () => {
  it('maps every tier to all four providers', () => {
    const tiers: ModelTier[] = ['thinking', 'balanced', 'fast']
    const providers: ModelProvider[] = ['openai', 'anthropic', 'google', 'xai']

    for (const tier of tiers) {
      for (const provider of providers) {
        expect(MODEL_TIER_MAP[tier][provider]).toBeDefined()
        expect(typeof MODEL_TIER_MAP[tier][provider]).toBe('string')
      }
    }
  })
})

describe('inferTierFromModel', () => {
  it.each([
    ['o1', 'thinking'],
    ['claude-opus-4-6', 'thinking'],
    ['gemini-3-pro', 'thinking'],
    ['grok-4', 'thinking'],
    ['gpt-5.2', 'balanced'],
    ['claude-sonnet-4-5', 'balanced'],
    ['gemini-2.5-pro', 'balanced'],
    ['grok-4-1-fast-non-reasoning', 'balanced'],
    ['gpt-5-mini', 'fast'],
    ['claude-haiku-4-5', 'fast'],
    ['gemini-3-flash', 'fast'],
    ['grok-3-mini', 'fast'],
  ])('correctly maps %s to %s tier', (model, expectedTier) => {
    expect(inferTierFromModel(model)).toBe(expectedTier)
  })

  it('returns balanced for unknown model names', () => {
    expect(inferTierFromModel('some-unknown-model')).toBe('balanced')
    expect(inferTierFromModel('')).toBe('balanced')
  })
})

describe('resolveEffectiveModel', () => {
  const anthropicAgent = {
    modelProvider: 'anthropic' as ModelProvider,
    modelName: 'claude-sonnet-4-5',
    modelTier: 'balanced' as ModelTier,
  }

  const openaiThinkingAgent = {
    modelProvider: 'openai' as ModelProvider,
    modelName: 'o1',
    modelTier: 'thinking' as ModelTier,
  }

  describe('tierOverride', () => {
    it('overrides everything when set to fast', () => {
      const result = resolveEffectiveModel(anthropicAgent, 'as_designed', 'fast', 'core')
      expect(result).toEqual({
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        resolvedTier: 'fast',
      })
    })

    it('overrides everything when set to thinking', () => {
      const result = resolveEffectiveModel(anthropicAgent, 'cost_saving', 'thinking', 'routine')
      expect(result).toEqual({
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        resolvedTier: 'thinking',
      })
    })

    it('ignores null tierOverride', () => {
      const result = resolveEffectiveModel(anthropicAgent, 'as_designed', null, 'core')
      expect(result.resolvedTier).toBe('balanced')
    })

    it('ignores undefined tierOverride', () => {
      const result = resolveEffectiveModel(anthropicAgent, 'as_designed', undefined, 'core')
      expect(result.resolvedTier).toBe('balanced')
    })
  })

  describe('as_designed mode', () => {
    it('uses agent modelTier directly', () => {
      const result = resolveEffectiveModel(openaiThinkingAgent, 'as_designed', undefined, 'core')
      expect(result).toEqual({
        provider: 'openai',
        model: 'o1',
        resolvedTier: 'thinking',
      })
    })

    it('uses balanced tier for agent with explicit balanced tier', () => {
      const result = resolveEffectiveModel(anthropicAgent, 'as_designed', undefined, 'core')
      expect(result).toEqual({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        resolvedTier: 'balanced',
      })
    })
  })

  describe('cost_saving mode — critical workflows', () => {
    it('downgrades thinking to balanced (never fast)', () => {
      const result = resolveEffectiveModel(openaiThinkingAgent, 'cost_saving', undefined, 'critical')
      expect(result).toEqual({
        provider: 'openai',
        model: 'gpt-5.2',
        resolvedTier: 'balanced',
      })
    })

    it('keeps balanced as balanced', () => {
      const result = resolveEffectiveModel(anthropicAgent, 'cost_saving', undefined, 'critical')
      expect(result).toEqual({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        resolvedTier: 'balanced',
      })
    })

    it('keeps fast as fast', () => {
      const fastAgent = {
        modelProvider: 'google' as ModelProvider,
        modelName: 'gemini-3-flash',
        modelTier: 'fast' as ModelTier,
      }
      const result = resolveEffectiveModel(fastAgent, 'cost_saving', undefined, 'critical')
      expect(result).toEqual({
        provider: 'google',
        model: 'gemini-3-flash',
        resolvedTier: 'fast',
      })
    })
  })

  describe('cost_saving mode — core workflows', () => {
    it('downgrades thinking to balanced', () => {
      const result = resolveEffectiveModel(openaiThinkingAgent, 'cost_saving', undefined, 'core')
      expect(result.resolvedTier).toBe('balanced')
    })

    it('downgrades balanced to fast', () => {
      const result = resolveEffectiveModel(anthropicAgent, 'cost_saving', undefined, 'core')
      expect(result).toEqual({
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        resolvedTier: 'fast',
      })
    })
  })

  describe('cost_saving mode — routine workflows', () => {
    it('downgrades thinking to fast', () => {
      const result = resolveEffectiveModel(openaiThinkingAgent, 'cost_saving', undefined, 'routine')
      expect(result).toEqual({
        provider: 'openai',
        model: 'gpt-5-mini',
        resolvedTier: 'fast',
      })
    })

    it('downgrades balanced to fast', () => {
      const result = resolveEffectiveModel(anthropicAgent, 'cost_saving', undefined, 'routine')
      expect(result.resolvedTier).toBe('fast')
    })

    it('keeps fast as fast', () => {
      const fastAgent = {
        modelProvider: 'xai' as ModelProvider,
        modelName: 'grok-3-mini',
        modelTier: 'fast' as ModelTier,
      }
      const result = resolveEffectiveModel(fastAgent, 'cost_saving', undefined, 'routine')
      expect(result).toEqual({
        provider: 'xai',
        model: 'grok-3-mini',
        resolvedTier: 'fast',
      })
    })
  })

  describe('legacy backward compatibility', () => {
    it('infers tier from modelName when modelTier is undefined', () => {
      const legacyAgent = {
        modelProvider: 'anthropic' as ModelProvider,
        modelName: 'claude-opus-4-6',
        // no modelTier
      }
      const result = resolveEffectiveModel(legacyAgent, 'as_designed', undefined, 'core')
      expect(result).toEqual({
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        resolvedTier: 'thinking',
      })
    })

    it('defaults to balanced for unknown model names', () => {
      const legacyAgent = {
        modelProvider: 'openai' as ModelProvider,
        modelName: 'gpt-4-turbo',
        // no modelTier, unknown model
      }
      const result = resolveEffectiveModel(legacyAgent, 'as_designed', undefined, 'core')
      expect(result).toEqual({
        provider: 'openai',
        model: 'gpt-5.2',
        resolvedTier: 'balanced',
      })
    })

    it('defaults executionMode to as_designed', () => {
      const result = resolveEffectiveModel(anthropicAgent, undefined, undefined, 'core')
      expect(result.resolvedTier).toBe('balanced')
      expect(result.model).toBe('claude-sonnet-4-5')
    })
  })
})

describe('COST_SAVING_RULES', () => {
  it('never downgrades critical workflows below balanced', () => {
    expect(COST_SAVING_RULES.critical.thinking).toBe('balanced')
    expect(COST_SAVING_RULES.critical.balanced).toBe('balanced')
    expect(COST_SAVING_RULES.critical.fast).toBe('fast')
  })

  it('core workflows save on balanced tier', () => {
    expect(COST_SAVING_RULES.core.thinking).toBe('balanced')
    expect(COST_SAVING_RULES.core.balanced).toBe('fast')
    expect(COST_SAVING_RULES.core.fast).toBe('fast')
  })

  it('routine workflows always go to fast', () => {
    expect(COST_SAVING_RULES.routine.thinking).toBe('fast')
    expect(COST_SAVING_RULES.routine.balanced).toBe('fast')
    expect(COST_SAVING_RULES.routine.fast).toBe('fast')
  })
})
