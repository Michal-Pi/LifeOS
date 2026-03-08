import { describe, expect, it } from 'vitest'
import type { AgentConfig, DialecticalWorkflowConfig } from '@lifeos/agents'
import { calculateIterationBudget } from '../iterationBudget.js'

function makeAgent(toolIds: string[] = []): AgentConfig {
  return {
    agentId: 'agent:test' as AgentConfig['agentId'],
    userId: 'user-1',
    name: 'Test Agent',
    role: 'thesis_generator',
    systemPrompt: 'test',
    modelProvider: 'openai',
    modelName: 'gpt-5.2',
    toolIds: toolIds as AgentConfig['toolIds'],
    temperature: 0.2,
    archived: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    syncState: 'synced',
    version: 1,
  }
}

describe('calculateIterationBudget', () => {
  it('allocates a higher thesis budget to the economic lens when read_url is enabled', () => {
    const dialecticalConfig: DialecticalWorkflowConfig = {
      thesisAgents: [
        { lens: 'economic', modelProvider: 'openai', modelName: 'o1' },
        { lens: 'systems', modelProvider: 'openai', modelName: 'gpt-5.2' },
        { lens: 'adversarial', modelProvider: 'google', modelName: 'gemini-2.5-pro' },
      ],
      synthesisAgents: [],
      minTheses: 2,
      maxTheses: 3,
      enableCrossNegation: true,
      negationDepth: 1,
      enabledTrackers: ['LOGIC'],
      minActionDistance: 1,
      sublationStrategy: 'COMPETITIVE',
      maxSublationCandidates: 2,
      velocityThreshold: 0.1,
      maxCycles: 3,
      minCycles: 1,
      enableKGPersistence: false,
      enableCommunityDetection: false,
      communityDetectionMethod: 'LLM_GROUPING',
      retrievalDepth: 1,
      retrievalTopK: 5,
    } as DialecticalWorkflowConfig

    const budget = calculateIterationBudget({
      workflowMaxIterations: 80,
      thesisAgents: [
        makeAgent(['tool:serp_search', 'tool:semantic_search', 'tool:read_url']),
        makeAgent(['tool:serp_search', 'tool:search_web', 'tool:search_scholar']),
        makeAgent(['tool:serp_search', 'tool:semantic_search', 'tool:search_scholar']),
      ],
      synthesisAgentCount: 1,
      dialecticalConfig,
    })

    expect(budget.perThesisAgentByLens.economic).toBeGreaterThan(
      budget.perThesisAgentByLens.systems ?? 0
    )
    expect(budget.perThesisAgentByLens.economic).toBeGreaterThan(
      budget.perThesisAgentByLens.adversarial ?? 0
    )
  })
})
