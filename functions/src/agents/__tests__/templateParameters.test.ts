import { describe, it, expect } from 'vitest'
import { resolveTemplateParameters } from '../langgraph/genericGraph.js'

describe('resolveTemplateParameters', () => {
  it('replaces placeholders with provided values', () => {
    const result = resolveTemplateParameters('Research {{topic}} for {{audience}}', {
      topic: 'AI safety',
      audience: 'executives',
    })
    expect(result).toBe('Research AI safety for executives')
  })

  it('leaves unresolved placeholders as-is', () => {
    const result = resolveTemplateParameters('Write about {{topic}} in {{tone}} tone', {
      topic: 'machine learning',
    })
    expect(result).toBe('Write about machine learning in {{tone}} tone')
  })

  it('resolves multiple placeholders in the same string', () => {
    const result = resolveTemplateParameters('{{greeting}} {{name}}, welcome to {{place}}!', {
      greeting: 'Hello',
      name: 'Alice',
      place: 'Wonderland',
    })
    expect(result).toBe('Hello Alice, welcome to Wonderland!')
  })

  it('returns text unchanged when no placeholders exist', () => {
    const result = resolveTemplateParameters('Plain text with no variables', { topic: 'unused' })
    expect(result).toBe('Plain text with no variables')
  })

  it('leaves all placeholders when parameters object is empty', () => {
    const result = resolveTemplateParameters('Research {{topic}} for {{audience}}', {})
    expect(result).toBe('Research {{topic}} for {{audience}}')
  })

  it('handles adjacent placeholders', () => {
    const result = resolveTemplateParameters('{{first}}{{second}}', { first: 'A', second: 'B' })
    expect(result).toBe('AB')
  })

  it('handles same placeholder used multiple times', () => {
    const result = resolveTemplateParameters('{{name}} said hello to {{name}}', { name: 'Bob' })
    expect(result).toBe('Bob said hello to Bob')
  })
})
