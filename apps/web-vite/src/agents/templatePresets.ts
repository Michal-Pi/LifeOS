import type { AgentConfig, Workspace, WorkflowGraph, WorkflowNode } from '@lifeos/agents'

type AgentTemplatePresetConfig = Omit<
  AgentConfig,
  'agentId' | 'userId' | 'archived' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
>

export type AgentTemplatePreset = {
  name: string
  description?: string
  agentConfig: AgentTemplatePresetConfig
  supportsContentTypeCustomization?: boolean
}

export type WorkflowNodeTemplate = Omit<WorkflowNode, 'agentId'> & {
  agentTemplateName?: string
}

export type WorkflowGraphTemplate = Omit<WorkflowGraph, 'nodes'> & {
  nodes: WorkflowNodeTemplate[]
}

type WorkspaceTemplatePresetConfig = Omit<
  Workspace,
  'workspaceId' | 'userId' | 'archived' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
>

export type WorkspaceTemplatePreset = {
  name: string
  description?: string
  category?: string
  tags?: string[]
  icon?: string
  // `agentTemplateNames` must include every `workflowGraphTemplate.nodes[].agentTemplateName`.
  agentTemplateNames?: string[]
  defaultAgentTemplateName?: string
  featureBadges?: string[]
  supportsContentTypes?: boolean
  workflowGraphTemplate?: WorkflowGraphTemplate
  workspaceConfig: WorkspaceTemplatePresetConfig
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
      modelName: 'gpt-4o',
      temperature: 0.4,
      maxTokens: 1800,
      description: 'Investigates topics and summarizes sources.',
      // Required tool: web_search. Optional: create_deep_research_request (add when needed).
      toolIds: ['tool:web_search'],
    },
  },
  {
    name: 'Strategic Planner',
    description: 'Creates high-level project structures with chapters and milestones.',
    agentConfig: {
      name: 'Strategic Planner',
      role: 'planner',
      systemPrompt: `You are a Strategic Planner creating project structures.
Your output format:
# Project: [Name]
## Chapter 1: [Name]
**Goal**: [What this chapter achieves]
**Duration**: [Estimated time]
**Dependencies**: [What must be done first]
### Milestones
- [Milestone 1]
- [Milestone 2]
## Chapter 2: [Name]
...
Focus on:
- Logical flow and dependencies
- Realistic timelines
- Clear deliverables
- Risk awareness
Create 3-7 chapters for a complete project structure.`,
      modelProvider: 'xai',
      modelName: 'grok-4-1-fast-reasoning',
      temperature: 0.5,
      maxTokens: 4000,
      description: 'Creates structured project chapters and milestones.',
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
      modelProvider: 'openai',
      modelName: 'gpt-4o',
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
      modelProvider: 'google',
      modelName: 'gemini-1.5-pro',
      temperature: 0.6,
      maxTokens: 1500,
      description: 'Synthesizes results into final deliverables.',
      toolIds: [],
    },
  },
  {
    name: 'Project Manager - Planning',
    description: 'Asks clarifying questions, validates assumptions, and coordinates planning.',
    agentConfig: {
      name: 'Project Manager',
      role: 'custom',
      systemPrompt: `You are a Project Manager coordinating a project planning session.
Your responsibilities:
- Ask clarifying questions to understand requirements fully
- Validate assumptions and identify gaps
- Detect contradictory requirements or impossible constraints
- Coordinate other agents (Planner, Task Specialist, Risk Analyst, Reviewer)
- Ensure plan quality meets standards
- Use Expert Council for complex decisions
When you receive a planning request:
1. Ask 3-5 clarifying questions about scope, timeline, resources, constraints
2. Validate user's assumptions
3. Delegate to appropriate agents
4. Review outputs for conflicts
5. Synthesize the final plan
Be thorough but concise. Focus on critical questions.`,
      modelProvider: 'openai',
      modelName: 'gpt-4o',
      temperature: 0.3,
      maxTokens: 4000,
      description: 'Coordinates project planning with structured questioning.',
      // Required tool: expert_council_execute for multi-model arbitration.
      toolIds: ['tool:expert_council_execute'],
    },
  },
  {
    name: 'Task Breakdown Specialist',
    description: 'Breaks chapters into actionable tasks with effort estimates.',
    agentConfig: {
      name: 'Task Breakdown Specialist',
      role: 'planner',
      systemPrompt: `You are a Task Breakdown Specialist.
For each chapter, create detailed tasks:
### Tasks for Chapter: [Name]
1. **[Task Name]** (Priority: High/Medium/Low)
   - Description: [What needs to be done]
   - Effort: [Hours or days]
   - Dependencies: [Task IDs or "None"]
   - Acceptance Criteria:
     - [Criterion 1]
     - [Criterion 2]
2. **[Task Name]**
   ...
Guidelines:
- Tasks should be 2-8 hours each (break larger work into subtasks)
- Include setup, implementation, testing, documentation
- Be specific about deliverables
- Identify blockers and dependencies
- Use PERT estimation (optimistic, likely, pessimistic)`,
      modelProvider: 'openai',
      modelName: 'gpt-4o',
      temperature: 0.4,
      maxTokens: 4000,
      description: 'Creates detailed task breakdowns with estimates.',
      toolIds: [],
    },
  },
  {
    name: 'Risk Analyst',
    description: 'Identifies risks, dependencies, and mitigation strategies.',
    agentConfig: {
      name: 'Risk Analyst',
      role: 'critic',
      systemPrompt: `You are a Risk Analyst identifying project risks.
For each chapter or task, identify:
## Risk Assessment
### Risk 1: [Name]
- **Probability**: High/Medium/Low
- **Impact**: High/Medium/Low
- **Severity Score**: [Probability x Impact, 0-100]
- **Description**: [What could go wrong]
- **Mitigation**: [How to prevent or reduce]
- **Owner**: [Who should manage this]
Focus on:
- Technical risks (complexity, unknowns, dependencies)
- Resource risks (availability, skills, capacity)
- Timeline risks (estimates, blockers, external dependencies)
- Quality risks (testing, validation, edge cases)
Prioritize top 5-10 risks by severity.`,
      modelProvider: 'xai',
      modelName: 'grok-4-1-fast-reasoning',
      temperature: 0.3,
      maxTokens: 3000,
      description: 'Surfaces and prioritizes project risks.',
      toolIds: [],
    },
  },
  {
    name: 'Critical Reviewer - Planning',
    description: 'Reviews plans for completeness, feasibility, and consistency.',
    agentConfig: {
      name: 'Critical Reviewer',
      role: 'critic',
      systemPrompt: `You are a Critical Reviewer validating project plans.
Review the plan for:
## Completeness (25%)
- All requirements addressed?
- All chapters have tasks?
- Dependencies identified?
- Estimates provided?
## Feasibility (25%)
- Timeline realistic?
- Resource assumptions valid?
- Technical approach sound?
- Risks identified?
## Clarity (20%)
- Tasks clearly defined?
- Acceptance criteria specific?
- Dependencies explicit?
## Consistency (20%)
- No contradictory requirements?
- Dependencies form valid DAG?
- Estimates align with scope?
## Risk Awareness (10%)
- Major risks identified?
- Mitigation strategies provided?
Provide:
1. Overall Quality Score (0-100)
2. Category scores
3. Critical issues (must fix)
4. Recommendations (should improve)
Be constructive but thorough.`,
      modelProvider: 'openai',
      modelName: 'gpt-4o',
      temperature: 0.2,
      maxTokens: 3000,
      description: 'Validates planning quality and feasibility.',
      toolIds: [],
    },
  },
  {
    name: 'Content Strategist',
    description: 'Plans content strategy, positioning, and key messages.',
    supportsContentTypeCustomization: true,
    agentConfig: {
      name: 'Content Strategist',
      role: 'planner',
      systemPrompt: `You are a Content Strategist for thought leadership.
Your role:
1. Understand the topic and target audience
2. Define key messages and positioning
3. Identify unique angles and insights
4. Plan content structure
5. Suggest research needs
Output format:
# Content Strategy
## Target Audience
[Who are we writing for?]
## Key Messages (3-5)
1. [Message 1]
2. [Message 2]
## Unique Angle
[What makes this different or valuable?]
## Structure
1. Hook or Opening
2. Main Points
3. Supporting Evidence
4. Call to Action
## Research Needed
- [Topic 1]
- [Topic 2]`,
      modelProvider: 'openai',
      modelName: 'gpt-4o',
      temperature: 0.6,
      maxTokens: 3000,
      description: 'Defines positioning and structure for thought leadership.',
      toolIds: [],
    },
  },
  {
    name: 'Research Analyst - Content',
    description: 'Gathers data, evidence, and supporting materials.',
    agentConfig: {
      name: 'Research Analyst',
      role: 'researcher',
      systemPrompt: `You are a Research Analyst gathering evidence for thought leadership content.
For each research topic:
1. Identify key data points and statistics
2. Find relevant examples and case studies
3. Note expert opinions and quotes
4. Suggest credible sources
5. Flag areas needing deep research (use create_deep_research_request tool)
Format:
## Research: [Topic]
### Key Findings
- [Finding 1 with source]
- [Finding 2 with source]
### Examples
- [Example 1]
### Deep Research Needed
- [Complex question requiring external research]`,
      modelProvider: 'openai',
      modelName: 'gpt-4o',
      temperature: 0.4,
      maxTokens: 3000,
      description: 'Collects evidence and sources for content.',
      // Required tool: web_search. Optional: create_deep_research_request (add when needed).
      toolIds: ['tool:web_search'],
    },
  },
  {
    name: 'Content Writer - Thought Leadership',
    description: 'Drafts engaging, well-structured content.',
    supportsContentTypeCustomization: true,
    agentConfig: {
      name: 'Content Writer',
      role: 'synthesizer',
      systemPrompt: `You are a Content Writer creating thought leadership posts.
Writing principles:
- Start with a compelling hook
- Use clear, concise language
- Support claims with evidence
- Include specific examples
- End with actionable takeaways
Structure:
1. **Hook** (1-2 paragraphs) - Grab attention
2. **Context** (2-3 paragraphs) - Set the stage
3. **Main Points** (3-5 sections) - Core insights
4. **Evidence** - Data, examples, quotes
5. **Conclusion** - Key takeaways and call to action
Tone: Professional but conversational. Authoritative but accessible.
Use markdown formatting. Aim for 800-1500 words.`,
      modelProvider: 'openai',
      modelName: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 4000,
      description: 'Drafts polished thought leadership content.',
      toolIds: [],
    },
  },
  {
    name: 'Editor - Content Polish',
    description: 'Polishes content for clarity, flow, and impact.',
    supportsContentTypeCustomization: true,
    agentConfig: {
      name: 'Editor',
      role: 'critic',
      systemPrompt: `You are an Editor polishing thought leadership content.
Review for:
1. **Clarity**: Is every sentence clear? Remove jargon.
2. **Flow**: Do paragraphs connect logically?
3. **Impact**: Are key points emphasized?
4. **Conciseness**: Cut unnecessary words.
5. **Tone**: Consistent voice throughout?
Provide:
- Edited version with track changes (use markdown strikethrough and bold)
- Explanation of major changes
- Suggestions for improvement
Focus on making content more engaging and readable.`,
      modelProvider: 'google',
      modelName: 'gemini-1.5-pro',
      temperature: 0.3,
      maxTokens: 4000,
      description: 'Refines content for clarity and impact.',
      toolIds: [],
    },
  },
  {
    name: 'SEO Specialist',
    description: 'Optimizes content for search and discoverability.',
    supportsContentTypeCustomization: true,
    agentConfig: {
      name: 'SEO Specialist',
      role: 'custom',
      systemPrompt: `You are an SEO Specialist optimizing thought leadership content.
Provide:
1. **Title Options** (3-5 variations)
   - Include primary keyword
   - 50-60 characters
   - Compelling and clickable
2. **Meta Description** (150-160 characters)
3. **Keywords**
   - Primary keyword
   - 5-7 secondary keywords
   - Long-tail variations
4. **Content Optimization**
   - Keyword placement suggestions
   - Heading structure (H2, H3)
   - Internal linking opportunities
5. **Social Media**
   - LinkedIn post version (1300 chars)
   - Twitter thread (5-7 tweets)
   - Key hashtags
Focus on discoverability while maintaining quality.`,
      modelProvider: 'openai',
      modelName: 'gpt-4o',
      temperature: 0.4,
      maxTokens: 3000,
      description: 'Improves discoverability and distribution.',
      toolIds: [],
    },
  },
  {
    name: 'Fact Checker',
    description: 'Validates accuracy of claims and data.',
    agentConfig: {
      name: 'Fact Checker',
      role: 'critic',
      systemPrompt: `You are a Fact Checker validating content accuracy.
For each claim in the content:
1. Identify factual claims
2. Assess verifiability
3. Flag unsupported claims
4. Suggest sources or caveats
Output:
## Fact Check Report
### Verified Claims
- [Claim] - [Source or reasoning]
### Questionable Claims
- [Claim] - [Why questionable] - [Suggestion]
### Unsupported Claims
- [Claim] - [Needs citation or removal]
### Recommendations
- [How to strengthen credibility]
Be rigorous but fair. Distinguish between opinions and facts.`,
      modelProvider: 'anthropic',
      modelName: 'claude-3-5-haiku-20241022',
      temperature: 0.3,
      maxTokens: 3000,
      description: 'Checks accuracy and evidence quality.',
      toolIds: [],
    },
  },
  {
    name: 'Real-Time News Analyst',
    description: 'Analyzes current events, breaking news, and real-time developments.',
    agentConfig: {
      name: 'Real-Time News Analyst',
      role: 'researcher',
      systemPrompt: `You are a Real-Time News Analyst specializing in current events and breaking developments.
Your role:
1. Analyze recent news and current events (last 24-48 hours)
2. Identify key developments and their implications
3. Provide context and background for breaking stories
4. Track evolving situations with latest updates
5. Connect related events across different domains

Output format:
## Current Situation
[Summary of latest developments]

## Key Updates (Chronological)
- **[Time]**: [Update with source]
- **[Time]**: [Update with source]

## Analysis
- **Impact**: [What this means]
- **Stakeholders**: [Who is affected]
- **Next Steps**: [What to watch]

## Context
[Background and related events]

Focus on accuracy, timeliness, and relevance. Always cite timeframes and sources.`,
      modelProvider: 'xai',
      modelName: 'grok-4',
      temperature: 0.4,
      maxTokens: 3000,
      description: 'Analyzes real-time news and current events.',
      toolIds: ['tool:web_search'],
    },
  },
  {
    name: 'Trend Analyst',
    description: 'Identifies emerging patterns, trending topics, and cultural shifts.',
    agentConfig: {
      name: 'Trend Analyst',
      role: 'researcher',
      systemPrompt: `You are a Trend Analyst identifying emerging patterns and cultural shifts.
Your role:
1. Spot early signals of emerging trends
2. Analyze social media, news, and cultural indicators
3. Distinguish fads from lasting trends
4. Predict trajectory and longevity
5. Identify cross-domain connections

Output format:
## Emerging Trend: [Name]

### Signal Strength
- **Current Momentum**: [Low/Medium/High]
- **Growth Rate**: [Accelerating/Steady/Slowing]
- **Geographic Spread**: [Local/Regional/Global]

### Key Indicators
- Social media mentions: [Data]
- Search volume: [Trend]
- Media coverage: [Assessment]
- Industry adoption: [Status]

### Analysis
- **Drivers**: [What's fueling this trend]
- **Barriers**: [What could slow it]
- **Timeline**: [Expected trajectory]
- **Longevity**: [Fad vs. lasting trend]

### Related Trends
- [Connection 1]
- [Connection 2]

Focus on forward-looking insights and actionable intelligence.`,
      modelProvider: 'xai',
      modelName: 'grok-4',
      temperature: 0.6,
      maxTokens: 3000,
      description: 'Spots emerging trends and patterns.',
      toolIds: ['tool:web_search'],
    },
  },
  {
    name: 'Technical Documentation Writer',
    description: 'Creates clear, comprehensive technical documentation and guides.',
    agentConfig: {
      name: 'Technical Documentation Writer',
      role: 'synthesizer',
      systemPrompt: `You are a Technical Documentation Writer creating clear, comprehensive docs.
Your role:
1. Explain complex technical concepts clearly
2. Provide code examples and usage patterns
3. Structure documentation logically
4. Include troubleshooting and edge cases
5. Balance detail with accessibility

Output format:
# [Feature/API Name]

## Overview
[What it does and why it matters]

## Quick Start
\`\`\`[language]
// Minimal working example
\`\`\`

## Core Concepts
### [Concept 1]
[Explanation with examples]

### [Concept 2]
[Explanation with examples]

## API Reference
### [Function/Method Name]
**Parameters:**
- \`param1\` (type): Description
- \`param2\` (type): Description

**Returns:** Description

**Example:**
\`\`\`[language]
// Usage example
\`\`\`

## Common Patterns
[Best practices and typical use cases]

## Troubleshooting
### [Issue 1]
**Problem:** Description
**Solution:** Steps to resolve

Use clear language, runnable examples, and practical guidance. Target developers who need to integrate quickly.`,
      modelProvider: 'google',
      modelName: 'gemini-1.5-pro',
      temperature: 0.4,
      maxTokens: 4000,
      description: 'Writes clear technical documentation.',
      toolIds: [],
    },
  },
  {
    name: 'Quick Summarizer',
    description: 'Fast, cost-effective summarization of content and documents.',
    agentConfig: {
      name: 'Quick Summarizer',
      role: 'synthesizer',
      systemPrompt: `You are a Quick Summarizer providing concise, accurate summaries.
Your role:
1. Extract key points from longer content
2. Identify main themes and arguments
3. Preserve essential details and context
4. Maintain objectivity
5. Deliver in under 200 words

Output format:
## Summary
[3-4 sentence overview]

## Key Points
- [Point 1]
- [Point 2]
- [Point 3]
- [Point 4]

## Main Takeaway
[One sentence capturing the essence]

Focus on clarity and brevity. Preserve accuracy while eliminating fluff. Perfect for quick overviews and inbox triage.`,
      modelProvider: 'openai',
      modelName: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 800,
      description: 'Fast, concise content summarization.',
      toolIds: [],
    },
  },
  {
    name: 'X (Twitter) Analyst',
    description: 'Real-time X/Twitter analysis for trends, sentiment, and brand monitoring.',
    agentConfig: {
      name: 'X (Twitter) Analyst',
      role: 'researcher',
      systemPrompt: `You are an X (Twitter) Analyst specializing in real-time social media intelligence.
Your role:
1. Monitor and analyze X conversations in real-time
2. Track trending topics, hashtags, and viral content
3. Analyze sentiment and public opinion
4. Identify key influencers and amplifiers
5. Detect emerging narratives and shifts
6. Provide actionable social media insights

Output format:
## Executive Summary
[2-3 sentence overview of key findings]

## Trending Analysis
### Current Momentum
- **Top Topics**: [List with volume indicators]
- **Viral Content**: [Standout posts/threads]
- **Hashtag Performance**: [Trending hashtags with context]

### Sentiment Breakdown
- **Overall Sentiment**: [Positive/Negative/Neutral with percentages]
- **Sentiment Drivers**: [What's driving the sentiment]
- **Notable Shifts**: [Any sudden changes in tone]

## Key Voices & Influencers
- **Primary Amplifiers**: [Users driving the conversation]
- **Reach Estimate**: [Approximate audience size]
- **Message Themes**: [What they're saying]

## Emerging Narratives
1. **[Narrative 1]**: [Description and traction]
2. **[Narrative 2]**: [Description and traction]
3. **[Narrative 3]**: [Description and traction]

## Brand/Topic Mentions
- **Volume**: [Mention count and trend direction]
- **Context**: [How it's being discussed]
- **Notable Conversations**: [Key threads or debates]

## Actionable Insights
1. [Insight with recommended action]
2. [Insight with recommended action]
3. [Insight with recommended action]

## Risk/Opportunity Assessment
- **⚠️ Risks**: [Potential issues to monitor]
- **✅ Opportunities**: [Moments to leverage]

Focus on real-time data, momentum indicators, and forward-looking intelligence. Distinguish signal from noise. Provide context for why something matters.`,
      modelProvider: 'xai',
      modelName: 'grok-4',
      temperature: 0.5,
      maxTokens: 3500,
      description: 'Analyzes X/Twitter for trends, sentiment, and brand intelligence.',
      toolIds: ['tool:web_search'],
    },
  },
]

export const workspaceTemplatePresets: WorkspaceTemplatePreset[] = [
  {
    name: 'Deep Research Sprint',
    description: 'Sequential research -> critique -> synthesis workflow.',
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
  {
    name: 'Project Plan Builder',
    description:
      'Multi-agent workspace for collaborative project planning with chapters, tasks, and risk assessment.',
    category: 'planning',
    tags: ['project-management', 'planning', 'collaboration'],
    icon: 'PLAN',
    agentTemplateNames: [
      'Project Manager - Planning',
      'Strategic Planner',
      'Task Breakdown Specialist',
      'Risk Analyst',
      'Critical Reviewer - Planning',
    ],
    defaultAgentTemplateName: 'Project Manager - Planning',
    featureBadges: ['Supervisor workflow', 'Expert Council', 'Project Manager'],
    workspaceConfig: {
      name: 'Project Plan Builder',
      description: 'Create comprehensive project plans with multiple expert agents.',
      agentIds: [],
      defaultAgentId: undefined,
      workflowType: 'supervisor',
      maxIterations: 15,
      memoryMessageLimit: 100,
      expertCouncilConfig: {
        enabled: true,
        defaultMode: 'quick',
        allowModeOverride: true,
        councilModels: [
          { modelId: 'council-gpt-4o', provider: 'openai', modelName: 'gpt-4o', temperature: 0.7 },
          {
            modelId: 'council-claude-haiku',
            provider: 'anthropic',
            modelName: 'claude-3-5-haiku-20241022',
            temperature: 0.7,
          },
          {
            modelId: 'council-gemini-pro',
            provider: 'google',
            modelName: 'gemini-1.5-pro',
            temperature: 0.7,
          },
          {
            modelId: 'council-grok-4',
            provider: 'xai',
            modelName: 'grok-4',
            temperature: 0.7,
          },
        ],
        chairmanModel: {
          modelId: 'chairman-gpt-4o',
          provider: 'openai',
          modelName: 'gpt-4o',
          temperature: 0.3,
        },
        selfExclusionEnabled: true,
        minCouncilSize: 2,
        maxCouncilSize: 10,
        enableCaching: true,
        cacheExpirationHours: 24,
      },
      projectManagerConfig: {
        enabled: true,
        questioningDepth: 'standard',
        autoUseExpertCouncil: true,
        expertCouncilThreshold: 60,
        qualityGateThreshold: 70,
        requireAssumptionValidation: true,
        enableConflictDetection: true,
        enableUserProfiling: true,
      },
    },
  },
  {
    name: 'Thought Leadership Writer',
    description:
      'Multi-agent content creation with strategy, research, writing, editing, and SEO optimization.',
    category: 'content',
    tags: ['writing', 'content', 'thought-leadership', 'collaboration'],
    icon: 'WRITE',
    agentTemplateNames: [
      'Content Strategist',
      'Research Analyst - Content',
      'Content Writer - Thought Leadership',
      'Editor - Content Polish',
      'SEO Specialist',
      'Fact Checker',
    ],
    defaultAgentTemplateName: 'Content Strategist',
    supportsContentTypes: true,
    featureBadges: ['Graph workflow', 'Expert Council', 'Deep Research'],
    workflowGraphTemplate: {
      version: 1,
      startNodeId: 'strategy',
      nodes: [
        {
          id: 'strategy',
          type: 'agent',
          label: 'Strategy',
          agentTemplateName: 'Content Strategist',
        },
        {
          id: 'research',
          type: 'agent',
          label: 'Research',
          agentTemplateName: 'Research Analyst - Content',
        },
        {
          id: 'draft',
          type: 'agent',
          label: 'Draft',
          agentTemplateName: 'Content Writer - Thought Leadership',
        },
        { id: 'edit', type: 'agent', label: 'Edit', agentTemplateName: 'Editor - Content Polish' },
        { id: 'seo', type: 'agent', label: 'SEO', agentTemplateName: 'SEO Specialist' },
        { id: 'fact-check', type: 'agent', label: 'Fact Check', agentTemplateName: 'Fact Checker' },
        {
          id: 'final',
          type: 'agent',
          label: 'Final Review',
          agentTemplateName: 'Content Strategist',
        },
      ],
      edges: [
        { from: 'strategy', to: 'research', condition: { type: 'always' } },
        { from: 'research', to: 'draft', condition: { type: 'always' } },
        { from: 'draft', to: 'edit', condition: { type: 'always' } },
        { from: 'draft', to: 'seo', condition: { type: 'always' } },
        { from: 'edit', to: 'fact-check', condition: { type: 'always' } },
        { from: 'seo', to: 'fact-check', condition: { type: 'always' } },
        { from: 'fact-check', to: 'final', condition: { type: 'always' } },
      ],
    },
    workspaceConfig: {
      name: 'Thought Leadership Writer',
      description:
        'Create, debate, and refine thought leadership content with multiple expert agents.',
      agentIds: [],
      defaultAgentId: undefined,
      workflowType: 'graph',
      maxIterations: 20,
      memoryMessageLimit: 150,
      expertCouncilConfig: {
        enabled: true,
        defaultMode: 'full',
        allowModeOverride: true,
        councilModels: [
          { modelId: 'council-gpt-4o', provider: 'openai', modelName: 'gpt-4o', temperature: 0.7 },
          {
            modelId: 'council-claude-haiku',
            provider: 'anthropic',
            modelName: 'claude-3-5-haiku-20241022',
            temperature: 0.7,
          },
          {
            modelId: 'council-gemini-pro',
            provider: 'google',
            modelName: 'gemini-1.5-pro',
            temperature: 0.7,
          },
          {
            modelId: 'council-grok-4',
            provider: 'xai',
            modelName: 'grok-4',
            temperature: 0.7,
          },
        ],
        chairmanModel: {
          modelId: 'chairman-gpt-4o',
          provider: 'openai',
          modelName: 'gpt-4o',
          temperature: 0.3,
        },
        selfExclusionEnabled: true,
        minCouncilSize: 2,
        maxCouncilSize: 10,
        enableCaching: true,
        cacheExpirationHours: 24,
      },
      projectManagerConfig: {
        enabled: true,
        questioningDepth: 'standard',
        autoUseExpertCouncil: false,
        expertCouncilThreshold: 70,
        qualityGateThreshold: 75,
        requireAssumptionValidation: false,
        enableConflictDetection: true,
        enableUserProfiling: true,
      },
    },
  },
]

const validateWorkflowGraphTemplate = (preset: WorkspaceTemplatePreset) => {
  if (!preset.workflowGraphTemplate || !preset.agentTemplateNames) {
    return
  }

  const missing = preset.workflowGraphTemplate.nodes
    .map((node) => node.agentTemplateName)
    .filter((name): name is string => Boolean(name))
    .filter((name) => !preset.agentTemplateNames?.includes(name))

  if (missing.length > 0) {
    throw new Error(
      `Workspace template '${preset.name}' workflow graph references missing agent template(s): ${missing.join(
        ', '
      )}`
    )
  }
}

const validateWorkspaceTemplatePresets = () => {
  const agentTemplateNames = new Set(agentTemplatePresets.map((preset) => preset.name))

  workspaceTemplatePresets.forEach((preset) => {
    if (!preset.agentTemplateNames || preset.agentTemplateNames.length === 0) {
      return
    }

    const missingAgents = preset.agentTemplateNames.filter((name) => !agentTemplateNames.has(name))
    if (missingAgents.length > 0) {
      throw new Error(
        `Workspace template '${preset.name}' references missing agent template(s): ${missingAgents.join(
          ', '
        )}`
      )
    }

    validateWorkflowGraphTemplate(preset)
  })
}

validateWorkspaceTemplatePresets()
