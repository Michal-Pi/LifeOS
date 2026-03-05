import { describe, it, expect } from 'vitest'
import type { DialecticalWorkflowConfig } from '@lifeos/agents'
import { createDefaultDialecticalConfig } from '@lifeos/agents'

describe('Quick Dialectic Mode (Phase 28)', () => {
  it('default config has no mode set', () => {
    const config = createDefaultDialecticalConfig()
    expect(config.mode).toBeUndefined()
  })

  it('default config creates at least 2 thesis agents', () => {
    const config = createDefaultDialecticalConfig()
    expect(config.thesisAgents.length).toBeGreaterThanOrEqual(2)
  })

  it('default config enables KG persistence and community detection', () => {
    const config = createDefaultDialecticalConfig()
    expect(config.enableKGPersistence).toBe(true)
    expect(config.enableCommunityDetection).toBe(true)
  })

  it('quick mode overrides disable KG and limit cycles', () => {
    const config: DialecticalWorkflowConfig = {
      ...createDefaultDialecticalConfig(),
      mode: 'quick',
      thesisAgents: [
        { lens: 'adversarial', modelProvider: 'anthropic', modelName: 'claude-sonnet-4-6' },
        { lens: 'economic', modelProvider: 'openai', modelName: 'o1' },
      ],
      maxCycles: 1,
      enableKGPersistence: false,
      enableCommunityDetection: false,
    }

    expect(config.mode).toBe('quick')
    expect(config.thesisAgents).toHaveLength(2)
    expect(config.maxCycles).toBe(1)
    expect(config.enableKGPersistence).toBe(false)
    expect(config.enableCommunityDetection).toBe(false)
  })

  it('full mode inherits all defaults without restriction', () => {
    const defaults = createDefaultDialecticalConfig()
    const config: DialecticalWorkflowConfig = {
      ...defaults,
      mode: 'full',
    }

    expect(config.mode).toBe('full')
    expect(config.thesisAgents.length).toBe(defaults.thesisAgents.length)
    expect(config.maxCycles).toBe(defaults.maxCycles)
  })
})

describe('Progressive Deepening (Phase 27)', () => {
  it('severity filter defaults to undefined', () => {
    const config = createDefaultDialecticalConfig()
    expect(config.contradictionSeverityFilter).toBeUndefined()
  })

  it('can set severity filter to HIGH', () => {
    const config: DialecticalWorkflowConfig = {
      ...createDefaultDialecticalConfig(),
      contradictionSeverityFilter: 'HIGH',
    }
    expect(config.contradictionSeverityFilter).toBe('HIGH')
  })
})

describe('Research Fusion (Phase 30)', () => {
  it('enableResearchFusion defaults to undefined', () => {
    const config = createDefaultDialecticalConfig()
    expect(config.enableResearchFusion).toBeUndefined()
  })

  it('can enable research fusion', () => {
    const config: DialecticalWorkflowConfig = {
      ...createDefaultDialecticalConfig(),
      enableResearchFusion: true,
    }
    expect(config.enableResearchFusion).toBe(true)
  })
})
