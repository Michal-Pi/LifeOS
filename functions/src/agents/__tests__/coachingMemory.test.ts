import { describe, it, expect } from 'vitest'
import { injectCoachingContext } from '../coachingContextInjection.js'
import type { CoachingContext } from '@lifeos/agents'

const SAMPLE_CONTEXT: CoachingContext = {
  businessDescription: 'SaaS productivity tool for remote teams',
  targetAudience: 'Engineering managers at mid-size companies',
  competitorNames: ['Asana', 'Monday.com', 'Linear'],
  pastDecisions: [
    { date: '2026-01-15', decision: 'Focus on PLG strategy', outcome: '40% signup increase' },
    { date: '2026-02-01', decision: 'Launch LinkedIn content series' },
  ],
  competitiveLandscape: 'Crowded market, differentiate on AI-first workflow automation',
}

describe('Phase 48 — injectCoachingContext', () => {
  it('appends coaching context to system prompt when present', () => {
    const prompt = 'You are a GTM coach.'
    const result = injectCoachingContext(prompt, SAMPLE_CONTEXT)
    expect(result).toContain('BUSINESS CONTEXT')
    expect(result).toContain('SaaS productivity tool')
    expect(result).toContain('Engineering managers')
    expect(result).toContain('Asana, Monday.com, Linear')
    expect(result).toContain('Focus on PLG strategy')
    expect(result).toContain('40% signup increase')
    expect(result).toContain('Crowded market')
  })

  it('returns original prompt when coaching context is absent', () => {
    const prompt = 'You are a GTM coach.'
    const result = injectCoachingContext(prompt, undefined)
    expect(result).toBe(prompt)
  })

  it('includes past decisions with outcomes', () => {
    const result = injectCoachingContext('Prompt.', SAMPLE_CONTEXT)
    expect(result).toContain('[2026-01-15] Focus on PLG strategy → 40% signup increase')
  })

  it('includes past decisions without outcomes', () => {
    const result = injectCoachingContext('Prompt.', SAMPLE_CONTEXT)
    expect(result).toContain('[2026-02-01] Launch LinkedIn content series')
    // No outcome arrow for the second decision
    expect(result).not.toContain('2026-02-01] Launch LinkedIn content series →')
  })

  it('starts with original prompt (no corruption)', () => {
    const prompt = 'You are a marketing strategy advisor.'
    const result = injectCoachingContext(prompt, SAMPLE_CONTEXT)
    expect(result.startsWith(prompt)).toBe(true)
  })

  it('handles coaching context with empty competitors', () => {
    const minimal: CoachingContext = {
      businessDescription: 'A small business',
      targetAudience: 'Local customers',
      competitorNames: [],
      pastDecisions: [],
    }
    const result = injectCoachingContext('Prompt.', minimal)
    expect(result).toContain('Business: A small business')
    expect(result).toContain('Target audience: Local customers')
    expect(result).not.toContain('Competitors:')
    expect(result).not.toContain('Past decisions:')
  })
})
