import { describe, it, expect } from 'vitest'
import type { DialecticalWorkflowConfig } from '@lifeos/agents'
import { createDefaultDialecticalConfig } from '@lifeos/agents'

describe('Quick Dialectic Mode (Phase 28)', () => {
  it('default config has no mode set', () => {
    const config = createDefaultDialecticalConfig()
    expect(config.mode).toBeUndefined()
  })

  it('quick mode uses only 2 lenses', () => {
    const config: DialecticalWorkflowConfig = {
      ...createDefaultDialecticalConfig(),
      mode: 'quick',
      thesisAgents: [
        { lens: 'adversarial', modelProvider: 'anthropic', modelName: 'claude-sonnet-4-5' },
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
  })

  it('full mode config has no restrictions', () => {
    const config: DialecticalWorkflowConfig = {
      ...createDefaultDialecticalConfig(),
      mode: 'full',
    }

    expect(config.mode).toBe('full')
    expect(config.thesisAgents.length).toBeGreaterThanOrEqual(2)
    expect(config.maxCycles).toBeGreaterThan(1)
  })

  it('quick mode skips KG', () => {
    const config: DialecticalWorkflowConfig = {
      ...createDefaultDialecticalConfig(),
      mode: 'quick',
      enableKGPersistence: false,
      enableCommunityDetection: false,
    }

    expect(config.enableKGPersistence).toBe(false)
    expect(config.enableCommunityDetection).toBe(false)
  })
})

describe('Progressive Deepening (Phase 27)', () => {
  it('severity filter defaults to undefined', () => {
    const config = createDefaultDialecticalConfig()
    expect(config.contradictionSeverityFilter).toBeUndefined()
  })

  it('can set severity filter to high', () => {
    const config: DialecticalWorkflowConfig = {
      ...createDefaultDialecticalConfig(),
      contradictionSeverityFilter: 'high',
    }
    expect(config.contradictionSeverityFilter).toBe('high')
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
