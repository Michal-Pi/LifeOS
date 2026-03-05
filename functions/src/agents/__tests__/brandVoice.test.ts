import { describe, it, expect } from 'vitest'
import { injectBrandVoice } from '../brandVoiceInjection.js'
import type { BrandVoice } from '@lifeos/agents'

const SAMPLE_BRAND_VOICE: BrandVoice = {
  tone: 'professional but conversational',
  vocabulary: ['innovative', 'streamlined', 'empower'],
  structure: 'short paragraphs, lots of headers, bullet points',
  examples: ['We build tools that empower teams.', 'Streamlined workflows, better outcomes.'],
}

describe('Phase 43 — injectBrandVoice', () => {
  it('appends brand voice to system prompt when present', () => {
    const prompt = 'You are a writer.'
    const result = injectBrandVoice(prompt, SAMPLE_BRAND_VOICE)
    expect(result).toContain('BRAND VOICE GUIDELINES:')
    expect(result).toContain('Tone: professional but conversational')
    expect(result).toContain('innovative, streamlined, empower')
    expect(result).toContain('short paragraphs')
    expect(result).toContain('We build tools that empower teams.')
    expect(result).toContain('Streamlined workflows, better outcomes.')
  })

  it('returns original prompt when brand voice is absent', () => {
    const prompt = 'You are a writer.'
    const result = injectBrandVoice(prompt, undefined)
    expect(result).toBe(prompt)
  })

  it('handles partial brand voice (only tone)', () => {
    const partial: BrandVoice = {
      tone: 'casual',
      vocabulary: [],
      structure: '',
      examples: [],
    }
    const result = injectBrandVoice('Write a post.', partial)
    expect(result).toContain('Tone: casual')
    expect(result).not.toContain('Vocabulary')
    expect(result).not.toContain('Structure')
    expect(result).not.toContain('Reference examples')
  })

  it('starts with original prompt (no corruption)', () => {
    const prompt = 'You are a thought leadership writer.'
    const result = injectBrandVoice(prompt, SAMPLE_BRAND_VOICE)
    expect(result.startsWith(prompt)).toBe(true)
  })

  it('handles empty vocabulary array', () => {
    const voice: BrandVoice = {
      tone: 'formal',
      vocabulary: [],
      structure: 'long paragraphs',
      examples: ['Example sentence.'],
    }
    const result = injectBrandVoice('Prompt.', voice)
    expect(result).toContain('Tone: formal')
    expect(result).not.toContain('Vocabulary')
    expect(result).toContain('Structure: long paragraphs')
  })
})
