import { describe, expect, it } from 'vitest'
import { normalizeStartupInput, parseDialecticalGoalFrame } from '../inputNormalizer.js'

describe('startup input normalizer', () => {
  it('throws for blank goals before any workflow work begins', () => {
    expect(() => normalizeStartupInput('   ', {})).toThrow('Goal is required')
  })

  it('normalizes attached notes and files into reusable startup state', () => {
    const normalized = normalizeStartupInput('  Evaluate AI adoption in hospitals  ', {
      attachedNotes: [
        {
          noteId: 'n-1',
          title: 'Hospital ops notes',
          content: '<p>AI triage pilots improved intake speed and reduced handoff delays.</p>',
        },
      ],
      uploadedFiles: [
        {
          name: 'market-brief.md',
          type: 'markdown',
          content:
            'Regional adoption is rising fastest in imaging workflows and back-office automation.',
        },
      ],
    })

    expect(normalized.normalizedGoal).toBe('Evaluate AI adoption in hospitals')
    expect(normalized.hasContext).toBe(true)
    expect(normalized.noteCount).toBe(1)
    expect(normalized.fileCount).toBe(1)
    expect(normalized.contextSummary).toContain('Hospital ops notes')
    expect(normalized.contextSummary).toContain('market-brief.md')
    expect(normalized.sources.map((source) => source.sourceId)).toEqual([
      'user_note:n-1',
      'user_file:market-brief.md',
    ])
    expect(normalized.contentMap['user_note:n-1']).toContain('AI triage pilots')
    expect(normalized.contentMap['user_file:market-brief.md']).toContain(
      'Regional adoption is rising'
    )
    expect(normalized.warnings).toEqual([])
  })

  it('skips malformed or trivially short context items and records warnings', () => {
    const normalized = normalizeStartupInput('Investigate grid resilience', {
      attachedNotes: [
        {
          noteId: 'good',
          title: 'Valid note',
          content: 'Transmission congestion is rising during peak summer demand windows.',
        },
        { noteId: 'short', title: 'Short note', content: 'Too short' },
        { title: 'Malformed note', content: 'Missing noteId and should be ignored' },
      ],
      uploadedFiles: [
        { name: 'tiny.md', type: 'markdown', content: 'tiny' },
        {
          name: 'valid.md',
          type: 'markdown',
          content: 'Battery storage reduces peak volatility when dispatch rules are stable.',
        },
        { type: 'markdown', content: 'Missing file name should be ignored' },
      ],
    })

    expect(normalized.sources.map((source) => source.sourceId)).toEqual([
      'user_note:good',
      'user_file:valid.md',
    ])
    expect(normalized.warnings).toEqual([
      'Skipped 1 malformed attached notes',
      'Skipped 1 trivially short attached notes',
      'Skipped 1 malformed uploaded files',
      'Skipped 1 trivially short uploaded files',
    ])
  })
})

describe('startup planner schemas', () => {
  it('rejects planner output that omits verificationTargets and falls back deterministically', () => {
    const parsed = parseDialecticalGoalFrame(
      JSON.stringify({
        canonicalGoal: 'Clarify industrial policy options',
        coreQuestion: 'Which policy levers matter most?',
        subquestions: ['Which sectors matter most?'],
        keyConcepts: ['industrial policy'],
        plannerRationale: 'Test payload missing required field',
        focusAreas: ['manufacturing'],
        candidateTensions: ['speed vs resilience'],
        retrievalIntent: { useKnowledgeGraph: true, useExternalResearch: true },
      }),
      {
        canonicalGoal: 'Fallback goal',
        coreQuestion: 'Fallback question',
        subquestions: ['Fallback question'],
        keyConcepts: ['Fallback'],
        verificationTargets: ['Fallback target'],
        plannerRationale: 'Fallback rationale',
        focusAreas: [],
        candidateTensions: [],
        retrievalIntent: { useKnowledgeGraph: true, useExternalResearch: true },
      }
    )

    expect(parsed.canonicalGoal).toBe('Fallback goal')
    expect(parsed.verificationTargets).toEqual(['Fallback target'])
  })
})
