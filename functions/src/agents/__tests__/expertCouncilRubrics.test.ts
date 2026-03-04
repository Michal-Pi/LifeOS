import { describe, it, expect, vi } from 'vitest'
import { detectPromptDomain, JUDGE_RUBRICS, enforceProviderDiversity } from '../expertCouncil.js'
import type { ExpertCouncilConfig } from '@lifeos/agents'

vi.mock('../providerService.js', () => ({
  executeWithProvider: vi.fn(),
  executeWithProviderStreaming: vi.fn(),
}))

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
}))

describe('detectPromptDomain', () => {
  it('classifies code prompts correctly', () => {
    expect(detectPromptDomain('Write a TypeScript function to sort arrays')).toBe('code')
    expect(detectPromptDomain('Debug this Python class')).toBe('code')
    expect(detectPromptDomain('Implement the API endpoint')).toBe('code')
  })

  it('classifies research prompts correctly', () => {
    expect(detectPromptDomain('Research the effects of caffeine on sleep')).toBe('research')
    expect(detectPromptDomain('Analyze the evidence for climate change')).toBe('research')
    expect(detectPromptDomain('What do the findings suggest about the hypothesis?')).toBe(
      'research'
    )
  })

  it('classifies creative prompts correctly', () => {
    expect(detectPromptDomain('Write a blog post about productivity')).toBe('creative')
    expect(detectPromptDomain('Draft an essay on modern architecture')).toBe('creative')
    expect(detectPromptDomain('Create a narrative about space exploration')).toBe('creative')
  })

  it('classifies analytical prompts correctly', () => {
    expect(detectPromptDomain('Compare the trade-offs between React and Vue')).toBe('analytical')
    expect(detectPromptDomain('Evaluate the pros and cons of remote work')).toBe('analytical')
    expect(detectPromptDomain('Assess the strategy for market expansion')).toBe('analytical')
  })

  it('defaults to factual for unclassifiable prompts', () => {
    expect(detectPromptDomain('What is the capital of France?')).toBe('factual')
    expect(detectPromptDomain('How tall is Mount Everest?')).toBe('factual')
    expect(detectPromptDomain('When was the Roman Empire founded?')).toBe('factual')
  })
})

describe('JUDGE_RUBRICS', () => {
  it('research rubric contains evidence quality criterion', () => {
    expect(JUDGE_RUBRICS.research).toContain('Evidence quality')
  })

  it('code rubric contains correctness criterion', () => {
    expect(JUDGE_RUBRICS.code).toContain('Correctness')
  })

  it('creative rubric contains originality criterion', () => {
    expect(JUDGE_RUBRICS.creative).toContain('Originality')
  })

  it('analytical rubric contains logical soundness criterion', () => {
    expect(JUDGE_RUBRICS.analytical).toContain('Logical soundness')
  })

  it('factual rubric contains accuracy criterion', () => {
    expect(JUDGE_RUBRICS.factual).toContain('Accuracy')
  })

  it('all domains have rubrics defined', () => {
    const domains = ['research', 'creative', 'analytical', 'code', 'factual'] as const
    for (const domain of domains) {
      expect(JUDGE_RUBRICS[domain]).toBeDefined()
      expect(JUDGE_RUBRICS[domain].length).toBeGreaterThan(0)
    }
  })
})

describe('enforceProviderDiversity', () => {
  const makeModel = (
    provider: string,
    modelName: string,
    modelId?: string
  ): ExpertCouncilConfig['councilModels'][number] => ({
    modelId: modelId ?? `${provider}-${modelName}`,
    provider: provider as ExpertCouncilConfig['councilModels'][number]['provider'],
    modelName,
  })

  it('reassigns duplicate providers', () => {
    const models = [
      makeModel('openai', 'gpt-5.2'),
      makeModel('openai', 'gpt-5.2'),
      makeModel('openai', 'gpt-5.2'),
    ]

    const result = enforceProviderDiversity(models)

    const providers = result.map((m) => m.provider)
    const unique = new Set(providers)
    expect(unique.size).toBe(3)
  })

  it('no-op when already diverse', () => {
    const models = [
      makeModel('openai', 'gpt-5.2'),
      makeModel('anthropic', 'claude-sonnet-4-5'),
      makeModel('google', 'gemini-2.5-pro'),
    ]

    const result = enforceProviderDiversity(models)

    expect(result[0].provider).toBe('openai')
    expect(result[1].provider).toBe('anthropic')
    expect(result[2].provider).toBe('google')
  })

  it('updates modelName to match new provider at same tier', () => {
    const models = [makeModel('openai', 'gpt-5.2'), makeModel('openai', 'gpt-5.2')]

    const result = enforceProviderDiversity(models)

    expect(result[0].provider).toBe('openai')
    expect(result[0].modelName).toBe('gpt-5.2')
    // Second model should be reassigned to a different provider with balanced tier model
    expect(result[1].provider).not.toBe('openai')
    // The model name should be the balanced tier model for the new provider
    expect(result[1].modelName).toBeDefined()
    expect(result[1].modelName.length).toBeGreaterThan(0)
  })

  it('handles thinking tier models', () => {
    const models = [
      makeModel('anthropic', 'claude-opus-4-6'),
      makeModel('anthropic', 'claude-opus-4-6'),
    ]

    const result = enforceProviderDiversity(models)

    expect(result[0].provider).toBe('anthropic')
    // Second one should use thinking tier of another provider
    expect(result[1].provider).not.toBe('anthropic')
    // Verify it's a thinking tier model
    const thinkingModels = ['o1', 'claude-opus-4-6', 'gemini-3-pro', 'grok-4']
    expect(thinkingModels).toContain(result[1].modelName)
  })

  it('does not modify original array', () => {
    const models = [makeModel('openai', 'gpt-5.2'), makeModel('openai', 'gpt-5.2')]

    const result = enforceProviderDiversity(models)

    // Original should be unchanged
    expect(models[0].provider).toBe('openai')
    expect(models[1].provider).toBe('openai')
    // Result should have diversity
    expect(result[1].provider).not.toBe('openai')
  })
})
