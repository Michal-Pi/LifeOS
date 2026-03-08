import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Workflow } from '@lifeos/agents'

vi.mock('../../../lib/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { collectEvidenceFromSearchPlan } from '../../langgraph/oracleGraph.js'

const mockSerpSearchTool = {
  name: 'serp_search',
  description: 'Mock SERP search tool for Oracle evidence tests',
  parameters: {
    type: 'object' as const,
    properties: {
      query: { type: 'string' as const, description: 'Search query', required: true },
    },
    required: ['query'],
  },
  execute: vi.fn(async (params: Record<string, unknown>) => {
    const query = String(params.query ?? '')
    return {
    results: [
      {
        title: `Evidence for ${query}`,
        snippet: `Top result snippet for ${query}`,
        url: `https://example.com/${encodeURIComponent(query)}`,
        source: 'Example Source',
        date: '2026-01-01',
      },
    ],
    }
  }),
}

const baseConfig = {
  toolRegistry: new Map([['serp_search', mockSerpSearchTool]]),
  searchToolKeys: { serper: 'test-serper-key' },
  userId: 'user-test',
  workflow: ({
    workflowId: 'wf-oracle-test',
    name: 'Oracle Evidence Test',
    workflowType: 'oracle',
    agentIds: [],
    edges: [],
    archived: false,
    syncState: 'synced',
    version: 1,
    createdAtMs: 0,
    updatedAtMs: 0,
    userId: 'user-test',
  } as unknown) as Workflow,
  runId: 'run-test',
} as const

describe('Oracle evidence gathering', () => {
  beforeEach(() => {
    mockSerpSearchTool.execute.mockReset()
    mockSerpSearchTool.execute.mockImplementation(async (params: Record<string, unknown>) => {
      const query = String(params.query ?? '')
      return {
        results: [
          {
            title: `Evidence for ${query}`,
            snippet: `Top result snippet for ${query}`,
            url: `https://example.com/${encodeURIComponent(query)}`,
            source: 'Example Source',
            date: '2026-01-01',
          },
        ],
      }
    })
  })

  it('populates evidence records from the context-gathering search plan', async () => {
    const { evidence, failedQueries } = await collectEvidenceFromSearchPlan(
      { technology: ['AI trends 2026', 'quantum computing'] },
      baseConfig,
    )

    expect(evidence).toHaveLength(2)
    expect(failedQueries).toEqual([])

    for (const record of evidence) {
      expect(record.id).toMatch(/^EVD-\d{3}$/)
      expect(record.category).toBe('technology')
      expect(record.query).toBeTruthy()
      expect(record.source).toBeTruthy()
      expect(record.reliability).toBeGreaterThan(0)
      expect(record.timestamp).toEqual(expect.any(Number))
    }
  })

  it('caps generated evidence at 200 records', async () => {
    const { evidence, failedQueries } = await collectEvidenceFromSearchPlan(
      {
        technology: Array.from({ length: 250 }, (_, i) => `query-${i}`),
      },
      baseConfig,
    )

    expect(evidence).toHaveLength(200)
    expect(evidence[0]?.id).toBe('EVD-051')
    expect(evidence.at(-1)?.id).toBe('EVD-250')
    expect(failedQueries).toEqual([])
  })

  it('continues when some planned queries fail and returns degradation metadata', async () => {
    mockSerpSearchTool.execute.mockImplementationOnce(async () => ({
      results: [],
    }))

    const { evidence, failedQueries } = await collectEvidenceFromSearchPlan(
      { technology: ['weak signal query', 'strong signal query'] },
      baseConfig,
    )

    expect(evidence).toHaveLength(1)
    expect(evidence[0]?.query).toBe('strong signal query')
    expect(failedQueries).toEqual(['weak signal query'])
  })
})
