import type { AgentConfig, Workspace } from '@lifeos/agents'

type AgentTemplatePreset = {
  name: string
  description?: string
  agentConfig: Omit<
    AgentConfig,
    'agentId' | 'userId' | 'archived' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
  >
}

type WorkspaceTemplatePreset = {
  name: string
  description?: string
  workspaceConfig: Omit<
    Workspace,
    'workspaceId' | 'userId' | 'archived' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
  >
}

export const agentTemplatePresets: AgentTemplatePreset[] = [
  {
    name: 'Research Analyst',
    description: 'Investigates topics, summarizes findings, and surfaces key sources.',
    agentConfig: {
      name: 'Research Analyst',
      role: 'researcher',
      systemPrompt:
        'You are a meticulous research analyst. Gather credible sources, summarize key findings, and highlight open questions.',
      modelProvider: 'openai',
      modelName: 'gpt-4',
      temperature: 0.4,
      maxTokens: 1800,
      description: 'Investigates topics and summarizes sources.',
      toolIds: [],
    },
  },
  {
    name: 'Strategic Planner',
    description: 'Breaks down goals into clear steps, dependencies, and milestones.',
    agentConfig: {
      name: 'Strategic Planner',
      role: 'planner',
      systemPrompt:
        'You are a strategic planner. Convert goals into actionable steps with milestones, risks, and dependencies.',
      modelProvider: 'openai',
      modelName: 'gpt-4',
      temperature: 0.5,
      maxTokens: 1600,
      description: 'Plans tasks into structured roadmaps.',
      toolIds: [],
    },
  },
  {
    name: 'Critical Reviewer',
    description: 'Reviews outputs for gaps, risks, and quality improvements.',
    agentConfig: {
      name: 'Critical Reviewer',
      role: 'critic',
      systemPrompt:
        'You are a critical reviewer. Identify gaps, risks, and ways to improve accuracy, clarity, or feasibility.',
      modelProvider: 'anthropic',
      modelName: 'claude-3-5-sonnet-20241022',
      temperature: 0.3,
      maxTokens: 1400,
      description: 'Evaluates plans and drafts for quality.',
      toolIds: [],
    },
  },
  {
    name: 'Executive Synthesizer',
    description: 'Combines inputs into concise briefs and final outputs.',
    agentConfig: {
      name: 'Executive Synthesizer',
      role: 'synthesizer',
      systemPrompt:
        'You are a synthesizer. Combine inputs into concise, well-structured summaries and actionable recommendations.',
      modelProvider: 'openai',
      modelName: 'gpt-4',
      temperature: 0.6,
      maxTokens: 1500,
      description: 'Synthesizes results into final deliverables.',
      toolIds: [],
    },
  },
]

export const workspaceTemplatePresets: WorkspaceTemplatePreset[] = [
  {
    name: 'Deep Research Sprint',
    description: 'Sequential research → critique → synthesis workflow.',
    workspaceConfig: {
      name: 'Deep Research Sprint',
      description: 'Sequential research, critique, and synthesis workflow.',
      agentIds: [],
      defaultAgentId: undefined,
      workflowType: 'sequential',
      maxIterations: 6,
      memoryMessageLimit: 80,
    },
  },
  {
    name: 'Parallel Brainstorm',
    description: 'Parallel ideation with a consolidating review step.',
    workspaceConfig: {
      name: 'Parallel Brainstorm',
      description: 'Parallel ideation with review and synthesis.',
      agentIds: [],
      defaultAgentId: undefined,
      workflowType: 'parallel',
      maxIterations: 4,
      memoryMessageLimit: 60,
    },
  },
  {
    name: 'Supervisor Triage',
    description: 'Supervisor routes tasks to specialists and consolidates results.',
    workspaceConfig: {
      name: 'Supervisor Triage',
      description: 'Supervisor routes tasks to specialists and consolidates results.',
      agentIds: [],
      defaultAgentId: undefined,
      workflowType: 'supervisor',
      maxIterations: 5,
      memoryMessageLimit: 70,
    },
  },
]
