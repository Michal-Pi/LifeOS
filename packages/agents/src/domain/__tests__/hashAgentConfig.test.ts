import { describe, it, expect } from 'vitest'
import { hashAgentConfig } from '../models'

describe('hashAgentConfig', () => {
  const baseConfig = {
    systemPrompt: 'You are a helpful assistant',
    role: 'planner' as const,
    toolIds: ['tool:search' as const, 'tool:calc' as const],
    modelProvider: 'openai' as const,
    modelName: 'gpt-5.2',
    temperature: 0.7,
    modelTier: 'balanced' as const,
  }

  it('produces the same hash for identical configs', () => {
    const hash1 = hashAgentConfig(baseConfig)
    const hash2 = hashAgentConfig({ ...baseConfig })
    expect(hash1).toBe(hash2)
  })

  it('produces different hash for different system prompts', () => {
    const hash1 = hashAgentConfig(baseConfig)
    const hash2 = hashAgentConfig({ ...baseConfig, systemPrompt: 'You are a different assistant' })
    expect(hash1).not.toBe(hash2)
  })

  it('produces different hash for different roles', () => {
    const hash1 = hashAgentConfig(baseConfig)
    const hash2 = hashAgentConfig({ ...baseConfig, role: 'researcher' as const })
    expect(hash1).not.toBe(hash2)
  })

  it('produces different hash for different model providers', () => {
    const hash1 = hashAgentConfig(baseConfig)
    const hash2 = hashAgentConfig({ ...baseConfig, modelProvider: 'anthropic' as const })
    expect(hash1).not.toBe(hash2)
  })

  it('produces different hash for different model names', () => {
    const hash1 = hashAgentConfig(baseConfig)
    const hash2 = hashAgentConfig({ ...baseConfig, modelName: 'o1' })
    expect(hash1).not.toBe(hash2)
  })

  it('produces different hash for different temperatures', () => {
    const hash1 = hashAgentConfig(baseConfig)
    const hash2 = hashAgentConfig({ ...baseConfig, temperature: 1.0 })
    expect(hash1).not.toBe(hash2)
  })

  it('produces different hash for different model tiers', () => {
    const hash1 = hashAgentConfig(baseConfig)
    const hash2 = hashAgentConfig({ ...baseConfig, modelTier: 'thinking' as const })
    expect(hash1).not.toBe(hash2)
  })

  it('produces different hash for different tool sets', () => {
    const hash1 = hashAgentConfig(baseConfig)
    const hash2 = hashAgentConfig({
      ...baseConfig,
      toolIds: ['tool:search' as const],
    })
    expect(hash1).not.toBe(hash2)
  })

  it('tool order does not affect hash', () => {
    const hash1 = hashAgentConfig({
      ...baseConfig,
      toolIds: ['tool:search' as const, 'tool:calc' as const],
    })
    const hash2 = hashAgentConfig({
      ...baseConfig,
      toolIds: ['tool:calc' as const, 'tool:search' as const],
    })
    expect(hash1).toBe(hash2)
  })

  it('defaults temperature to 0.7 when undefined', () => {
    const hash1 = hashAgentConfig({ ...baseConfig, temperature: 0.7 })
    const hash2 = hashAgentConfig({ ...baseConfig, temperature: undefined })
    expect(hash1).toBe(hash2)
  })

  it('defaults modelTier to balanced when undefined', () => {
    const hash1 = hashAgentConfig({ ...baseConfig, modelTier: 'balanced' as const })
    const hash2 = hashAgentConfig({ ...baseConfig, modelTier: undefined })
    expect(hash1).toBe(hash2)
  })

  it('defaults toolIds to empty array when undefined', () => {
    const configNoTools = { ...baseConfig, toolIds: undefined }
    const configEmptyTools = { ...baseConfig, toolIds: [] as string[] }
    expect(hashAgentConfig(configNoTools)).toBe(hashAgentConfig(configEmptyTools))
  })

  it('returns a string starting with cfghash_', () => {
    const hash = hashAgentConfig(baseConfig)
    expect(hash).toMatch(/^cfghash_[a-z0-9]+_[a-z0-9]+$/)
  })
})
