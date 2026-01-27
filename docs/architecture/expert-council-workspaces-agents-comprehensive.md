# Expert Council, Workspaces, and Agents: Comprehensive Architecture Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architectural Patterns](#architectural-patterns)
3. [Technology Stack](#technology-stack)
4. [Core Components](#core-components)
5. [Expert Council System](#expert-council-system)
6. [Workspace System](#workspace-system)
7. [Agent System](#agent-system)
8. [Workflow Execution](#workflow-execution)
9. [Templates and Presets](#templates-and-presets)
10. [Data Models](#data-models)

---

## Overview

The LifeOS AI Agent Framework is a sophisticated multi-agent collaboration system that enables:
- **Multi-model consensus** through Expert Council
- **Flexible workflow orchestration** (sequential, parallel, supervisor, graph-based)
- **Modular agent configuration** with role-based templates
- **Tool integration** for real-world actions
- **Project management** with intelligent questioning and conflict detection

### Key Capabilities
- Run multiple AI models in parallel for consensus-based decisions
- Orchestrate complex agent workflows with branching and loops
- Integrate with external tools (calendar, todos, research, web search)
- Persist execution history and enable resumption
- Stream real-time outputs to the UI
- Cost tracking and quota management

---

## Architectural Patterns

### 1. **Domain-Driven Design (DDD)**
```
packages/agents/
├── domain/          # Core types, models, validation
├── ports/           # Repository interfaces
└── usecases/        # Pure business logic
```

### 2. **Hexagonal Architecture (Ports & Adapters)**
- **Domain Layer**: Pure business logic (`@lifeos/agents`)
- **Application Layer**: Use cases and orchestration
- **Infrastructure Layer**: Firebase adapters, AI provider services
- **Presentation Layer**: React UI components

### 3. **Repository Pattern**
Each entity has a repository interface in `ports/` and Firebase implementation in `apps/web-vite/src/adapters/agents/`.

### 4. **Strategy Pattern**
Provider abstraction allows switching between OpenAI, Anthropic, Google, xAI through unified interface.

### 5. **Pipeline Pattern**
Expert Council uses a 3-stage pipeline:
- **Stage 1**: Council models generate responses in parallel
- **Stage 2**: Judge models review and rank responses
- **Stage 3**: Chairman model synthesizes final answer

---

## Technology Stack

### Backend
- **Runtime**: Firebase Cloud Functions (Node.js)
- **Database**: Cloud Firestore
- **Auth**: Firebase Authentication
- **AI Providers**: OpenAI, Anthropic, Google Gemini, xAI (Grok)
- **Graph Processing**: `graphlib` for workflow graphs
- **Condition Logic**: `json-logic-js` for edge conditions

### Frontend
- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **State**: React hooks + Firestore realtime listeners
- **UI Components**: Custom component library

### Shared Packages
- **@lifeos/agents**: Domain models and business logic
- **@lifeos/core**: Shared utilities and types

---

## Core Components

### 1. **Agent**
A configurable AI agent with specific role and capabilities.

```typescript
interface AgentConfig {
  agentId: AgentId
  userId: string
  name: string
  role: 'planner' | 'researcher' | 'critic' | 'synthesizer' | 'executor' | 'custom'
  systemPrompt: string
  modelProvider: 'openai' | 'anthropic' | 'google' | 'xai'
  modelName: string
  temperature?: number
  maxTokens?: number
  toolIds?: ToolId[]
  description?: string
}
```

### 2. **Workspace**
A collection of agents organized to work together.

```typescript
interface Workspace {
  workspaceId: WorkspaceId
  userId: string
  name: string
  description?: string
  agentIds: AgentId[]
  defaultAgentId?: AgentId
  workflowType: 'sequential' | 'parallel' | 'supervisor' | 'graph'
  workflowGraph?: WorkflowGraph
  expertCouncilConfig?: ExpertCouncilConfig
  projectManagerConfig?: ProjectManagerConfig
  maxIterations?: number
}
```

### 3. **Run**
An execution instance of a workspace processing a goal.

```typescript
interface Run {
  runId: RunId
  workspaceId: WorkspaceId
  userId: string
  goal: string
  context?: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'waiting_for_input'
  output?: string
  workflowState?: WorkflowState
  tokensUsed?: number
  estimatedCost?: number
}
```

---

## Expert Council System

### Architecture

The Expert Council implements a **multi-model consensus pipeline** with three stages:

#### **Stage 1: Council (Parallel Responses)**
- Multiple AI models receive the same prompt
- Execute in parallel for speed
- Each model provides independent response
- Responses are anonymized with labels (A, B, C, etc.)

#### **Stage 2: Judges (Peer Review)**
- Judge models review anonymized responses
- Provide critiques for each response
- Rank responses from best to worst
- Can enable self-exclusion (judges don't review their own responses)
- Calculate consensus metrics (Kendall's Tau, Borda scores)

#### **Stage 3: Chairman (Synthesis)**
- Chairman model receives all responses + reviews
- Synthesizes final consensus answer
- Incorporates best insights from all perspectives
- Addresses gaps identified in reviews

### Execution Modes

1. **Full Mode**: All 3 stages (highest quality, highest cost)
2. **Quick Mode**: Stage 1 + Stage 3 only (skip peer review)
3. **Single Mode**: Stage 1 only (no synthesis)
4. **Custom Mode**: User-configurable stage selection

### Configuration

```typescript
interface ExpertCouncilConfig {
  enabled: boolean
  defaultMode: ExecutionMode
  allowModeOverride: boolean
  
  // Models
  councilModels: Array<{
    modelId: string
    provider: ModelProvider
    modelName: string
    temperature?: number
    systemPrompt?: string
  }>
  
  chairmanModel: {
    modelId: string
    provider: ModelProvider
    modelName: string
    temperature?: number
  }
  
  judgeModels?: Array<...>  // Optional, defaults to councilModels
  
  // Settings
  selfExclusionEnabled: boolean
  minCouncilSize: number
  maxCouncilSize: number
  requireConsensusThreshold?: number  // 0-100
  
  // Cost controls
  maxCostPerTurn?: number
  enableCaching: boolean
  cacheExpirationHours: number
}
```

### Consensus Metrics

1. **Borda Score**: Positional voting system
   - 1st place: n points, 2nd: n-1, etc.
   - Aggregates across all judges

2. **Kendall's Tau**: Ranking correlation
   - Measures agreement between judge rankings
   - Range: -1 (complete disagreement) to +1 (perfect agreement)

3. **Consensus Score**: 0-100 scale
   - Derived from average Kendall's Tau
   - Formula: `((avgTau + 1) / 2) * 100`

4. **Ranking Completeness**: % of responses consistently ranked
   - Identifies if judges skipped responses

5. **Controversial Responses**: High standard deviation in rankings
   - Flags responses with polarized opinions

### Caching Strategy

- **Cache Key**: Hash of (userId, prompt, config, mode, context)
- **Scope**: User-scoped (privacy + reuse across runs)
- **Expiration**: Configurable (default 24 hours)
- **Storage**: Firestore subcollection `users/{userId}/councilCache`

### Cost Management

- Estimates cost before execution
- Checks against `maxCostPerTurn` limit
- Tracks actual cost per stage
- Records usage for quota management

---

## Workspace System

### Workflow Types

#### 1. **Sequential**
Agents execute one after another in order.
```
Agent A → Agent B → Agent C → Agent D
```
- Output of A becomes input for B
- Linear progression
- Simple to understand and debug

#### 2. **Parallel**
Agents execute simultaneously.
```
        ┌→ Agent A →┐
Goal →  ├→ Agent B →├→ Synthesizer
        └→ Agent C →┘
```
- All agents receive same goal
- Results combined by final agent
- Fastest for independent tasks

#### 3. **Supervisor**
One agent coordinates others.
```
                ┌→ Worker A →┐
Supervisor  →  ├→ Worker B →├→ Supervisor → Final
                └→ Worker C →┘
```
- Supervisor routes tasks to specialists
- Can iterate based on quality
- Good for complex projects

#### 4. **Graph**
Custom workflow with branching and loops.
```
Start → Agent A → [Decision] → Agent B → Join
                      ↓              ↓
                  Agent C ─────────→┘
                                    ↓
                                   End
```
- Full control over execution flow
- Supports conditional branching
- Enables human-in-the-loop steps

### Workflow Graph Structure

```typescript
interface WorkflowGraph {
  version: 1
  startNodeId: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  limits?: {
    maxNodeVisits?: number
    maxEdgeRepeats?: number
  }
}

interface WorkflowNode {
  id: string
  type: 'agent' | 'tool' | 'human_input' | 'join' | 'end' | 'research_request'
  agentId?: AgentId
  toolId?: ToolId
  label?: string
  outputKey?: string
  aggregationMode?: 'list' | 'ranked' | 'consensus'
}

interface WorkflowEdge {
  from: string
  to: string
  condition: {
    type: 'always' | 'equals' | 'contains' | 'regex'
    key?: string
    value?: string
  }
}
```

### Project Manager Configuration

Enables intelligent project planning with structured questioning.

```typescript
interface ProjectManagerConfig {
  enabled: boolean
  questioningDepth: 'minimal' | 'standard' | 'thorough'
  autoUseExpertCouncil: boolean
  expertCouncilThreshold: number  // 0-100, triggers council for complex questions
  qualityGateThreshold: number    // 0-100, minimum quality score
  requireAssumptionValidation: boolean
  enableConflictDetection: boolean
  enableUserProfiling: boolean
}
```

**Features**:
- Extracts requirements and assumptions from conversations
- Validates assumptions with user
- Detects contradictory requirements
- Tracks decisions and rationale
- Maintains user profile for adaptive questioning
- Triggers Expert Council for complex decisions

---

## Agent System

### Agent Roles

1. **Planner**: Creates structured plans and strategies
2. **Researcher**: Gathers information and evidence
3. **Critic**: Reviews outputs for quality and risks
4. **Synthesizer**: Combines inputs into final deliverables
5. **Executor**: Performs specific tasks or actions
6. **Custom**: User-defined role

### Tool Integration

Agents can invoke server-side tools:

```typescript
interface ToolDefinition {
  toolId: ToolId
  name: string
  description: string
  parameters: Record<string, ToolParameter>
  implementation?: ToolImplementation
  source: 'builtin' | 'custom'
  requiresAuth: boolean
}
```

**Built-in Tools**:
- `get_current_time`: Returns current date/time
- `query_firestore`: Queries user's Firestore data
- `search_web`: Web search via provider
- `calculate`: Math calculations
- `expert_council_execute`: Triggers Expert Council
- `list_calendar_events`: Calendar integration
- `create_calendar_event`: Create events
- `list_notes`: Notes integration
- `create_note`: Create notes
- `create_deep_research_request`: Async research requests

### Provider Abstraction

Unified interface across all AI providers:

```typescript
interface ProviderExecutionResult {
  output: string
  tokensUsed: number
  estimatedCost: number
  provider: string
  model: string
}

async function executeWithProvider(
  agent: AgentConfig,
  goal: string,
  context: Record<string, unknown>,
  apiKeys: ProviderKeys,
  toolContext?: ToolExecutionContext
): Promise<ProviderExecutionResult>
```

**Supported Providers**:
- OpenAI (GPT-4, GPT-4 Turbo, GPT-3.5)
- Anthropic (Claude 3 Opus, Sonnet, Haiku)
- Google (Gemini Pro, Gemini 1.5 Pro)
- xAI (Grok Beta)

---

## Workflow Execution

### Execution Flow

1. **User submits goal** in UI
2. **Frontend creates Run** document in Firestore
3. **Firestore trigger** fires `onRunCreated` function
4. **Function loads** workspace config and agents
5. **Rate limits and quotas** checked
6. **Workflow executor** routes to appropriate type
7. **Agents execute** with streaming output
8. **Tools invoked** as needed
9. **Results persisted** to Firestore
10. **UI updates** in real-time via listeners

### Graph Workflow Execution

```typescript
async function executeGraphWorkflow(
  workspace: Workspace,
  agents: AgentConfig[],
  run: Run,
  apiKeys: ProviderKeys
): Promise<WorkflowExecutionResult>
```

**Algorithm**:
1. Initialize workflow state from run
2. Start with `startNodeId` in pending nodes
3. While pending nodes exist:
   - Filter nodes waiting for human input
   - Execute ready nodes in parallel
   - Evaluate edge conditions
   - Add next nodes to pending
   - Check iteration limits
4. Return final output and steps

**Safety Features**:
- Max iterations limit (prevents infinite loops)
- Max node visits per node
- Max edge repeats per edge
- Cycle detection
- Timeout handling

### State Management

```typescript
interface WorkflowState {
  currentNodeId?: string
  pendingNodes?: string[]
  visitedCount?: Record<string, number>
  edgeHistory?: Array<{ from: string; to: string; atMs: number }>
  joinOutputs?: Record<string, unknown>
  namedOutputs?: Record<string, unknown>
}
```

State persisted to Firestore enables:
- **Resumption** after pauses
- **Debugging** via execution history
- **Auditing** of decision paths

---

## Templates and Presets

### Agent Templates

Pre-configured agent personas with optimized prompts.

#### **Research Analyst**
```typescript
{
  name: 'Research Analyst',
  role: 'researcher',
  systemPrompt: 'You are a meticulous research analyst...',
  modelProvider: 'openai',
  modelName: 'gpt-4',
  temperature: 0.4,
  toolIds: ['tool:web_search']
}
```

#### **Strategic Planner**
```typescript
{
  name: 'Strategic Planner',
  role: 'planner',
  systemPrompt: 'You are a Strategic Planner creating project structures...',
  modelProvider: 'anthropic',
  modelName: 'claude-3-5-sonnet-20241022',
  temperature: 0.5
}
```

#### **Critical Reviewer**
```typescript
{
  name: 'Critical Reviewer',
  role: 'critic',
  systemPrompt: 'You are a critical reviewer. Identify gaps, risks...',
  modelProvider: 'anthropic',
  modelName: 'claude-3-5-sonnet-20241022',
  temperature: 0.3
}
```

#### **Content Writer - Thought Leadership**
```typescript
{
  name: 'Content Writer',
  role: 'synthesizer',
  systemPrompt: 'You are a Content Writer creating thought leadership posts...',
  modelProvider: 'anthropic',
  modelName: 'claude-3-5-sonnet-20241022',
  temperature: 0.7,
  maxTokens: 4000
}
```

**Full List** (14 agent templates):
1. Research Analyst
2. Strategic Planner
3. Critical Reviewer
4. Executive Synthesizer
5. Project Manager - Planning
6. Task Breakdown Specialist
7. Risk Analyst
8. Critical Reviewer - Planning
9. Content Strategist
10. Research Analyst - Content
11. Content Writer - Thought Leadership
12. Editor - Content Polish
13. SEO Specialist
14. Fact Checker

### Workspace Templates

Pre-configured multi-agent workflows.

#### **Project Plan Builder** (Supervisor + Expert Council)
```typescript
{
  name: 'Project Plan Builder',
  workflowType: 'supervisor',
  agentTemplateNames: [
    'Project Manager - Planning',
    'Strategic Planner',
    'Task Breakdown Specialist',
    'Risk Analyst',
    'Critical Reviewer - Planning'
  ],
  expertCouncilConfig: {
    enabled: true,
    defaultMode: 'quick',
    councilModels: [
      { provider: 'openai', modelName: 'gpt-4' },
      { provider: 'anthropic', modelName: 'claude-3-5-sonnet-20241022' },
      { provider: 'google', modelName: 'gemini-1.5-pro' }
    ],
    chairmanModel: { provider: 'openai', modelName: 'gpt-4' }
  },
  projectManagerConfig: {
    enabled: true,
    autoUseExpertCouncil: true,
    enableConflictDetection: true
  }
}
```

**Configuration Details**:
- **Workflow Type**: Supervisor (Project Manager coordinates specialists)
- **Default Agent**: Project Manager - Planning
- **Max Iterations**: 15
- **Memory Limit**: 100 messages
- **Expert Council**: Enabled with 3 council models (GPT-4, Claude Sonnet, Gemini Pro)
- **Project Manager**: Enabled with conflict detection and Expert Council auto-trigger

#### **Thought Leadership Writer** (Graph + Deep Research)
```typescript
{
  name: 'Thought Leadership Writer',
  workflowType: 'graph',
  workflowGraphTemplate: {
    startNodeId: 'strategy',
    nodes: [
      { id: 'strategy', type: 'agent', agentTemplateName: 'Content Strategist' },
      { id: 'research', type: 'agent', agentTemplateName: 'Research Analyst - Content' },
      { id: 'draft', type: 'agent', agentTemplateName: 'Content Writer' },
      { id: 'edit', type: 'agent', agentTemplateName: 'Editor' },
      { id: 'seo', type: 'agent', agentTemplateName: 'SEO Specialist' },
      { id: 'fact-check', type: 'agent', agentTemplateName: 'Fact Checker' },
      { id: 'final', type: 'agent', agentTemplateName: 'Content Strategist' }
    ],
    edges: [
      { from: 'strategy', to: 'research', condition: { type: 'always' } },
      { from: 'research', to: 'draft', condition: { type: 'always' } },
      { from: 'draft', to: 'edit', condition: { type: 'always' } },
      { from: 'draft', to: 'seo', condition: { type: 'always' } },
      { from: 'edit', to: 'fact-check', condition: { type: 'always' } },
      { from: 'seo', to: 'fact-check', condition: { type: 'always' } },
      { from: 'fact-check', to: 'final', condition: { type: 'always' } }
    ]
  }
}
```

**Configuration Details**:
- **Workflow Type**: Graph (custom branching workflow)
- **Default Agent**: Content Strategist
- **Max Iterations**: 20
- **Memory Limit**: 150 messages
- **Expert Council**: Enabled with full mode (all 3 stages)
- **Workflow Flow**: Strategy → Research → Draft → (Edit + SEO in parallel) → Fact Check → Final Review

**Workflow Visualization**:
```
Strategy → Research → Draft → Edit ──┐
                                      ├→ Fact Check → Final
Strategy → Research → Draft → SEO ──┘
```

### Agent Template Details

#### **Project Manager - Planning**
- **Role**: Custom
- **Model**: GPT-4 Turbo
- **Temperature**: 0.3 (low for consistency)
- **Tools**: `expert_council_execute`
- **Purpose**: Coordinates planning session, asks clarifying questions, validates assumptions, delegates to specialists

**System Prompt Excerpt**:
```
You are a Project Manager coordinating a project planning session.
Your responsibilities:
- Ask clarifying questions to understand requirements fully
- Validate assumptions and identify gaps
- Detect contradictory requirements or impossible constraints
- Coordinate other agents (Planner, Task Specialist, Risk Analyst, Reviewer)
- Ensure plan quality meets standards
- Use Expert Council for complex decisions
```

#### **Task Breakdown Specialist**
- **Role**: Planner
- **Model**: GPT-4
- **Temperature**: 0.4
- **Purpose**: Breaks chapters into actionable tasks with effort estimates

**System Prompt Excerpt**:
```
You are a Task Breakdown Specialist.
For each chapter, create detailed tasks:
### Tasks for Chapter: [Name]
1. **[Task Name]** (Priority: High/Medium/Low)
   - Description: [What needs to be done]
   - Effort: [Hours or days]
   - Dependencies: [Task IDs or "None"]
   - Acceptance Criteria:
     - [Criterion 1]
     - [Criterion 2]
```

#### **Risk Analyst**
- **Role**: Critic
- **Model**: Claude 3.5 Sonnet
- **Temperature**: 0.3
- **Purpose**: Identifies risks, dependencies, and mitigation strategies

**System Prompt Excerpt**:
```
You are a Risk Analyst identifying project risks.
For each chapter or task, identify:
## Risk Assessment
### Risk 1: [Name]
- **Probability**: High/Medium/Low
- **Impact**: High/Medium/Low
- **Severity Score**: [Probability x Impact, 0-100]
- **Description**: [What could go wrong]
- **Mitigation**: [How to prevent or reduce]
```

#### **Content Strategist**
- **Role**: Planner
- **Model**: Claude 3.5 Sonnet
- **Temperature**: 0.6
- **Purpose**: Plans content strategy, positioning, and key messages

**System Prompt Excerpt**:
```
You are a Content Strategist for thought leadership.
Your role:
1. Understand the topic and target audience
2. Define key messages and positioning
3. Identify unique angles and insights
4. Plan content structure
5. Suggest research needs
```

#### **Content Writer - Thought Leadership**
- **Role**: Synthesizer
- **Model**: Claude 3.5 Sonnet
- **Temperature**: 0.7 (higher for creativity)
- **Max Tokens**: 4000
- **Purpose**: Drafts engaging, well-structured content

**System Prompt Excerpt**:
```
You are a Content Writer creating thought leadership posts.
Writing principles:
- Start with a compelling hook
- Use clear, concise language
- Support claims with evidence
- Include specific examples
- End with actionable takeaways
```

#### **Editor - Content Polish**
- **Role**: Critic
- **Model**: GPT-4
- **Temperature**: 0.3 (low for precision)
- **Purpose**: Polishes content for clarity, flow, and impact

**System Prompt Excerpt**:
```
You are an Editor polishing thought leadership content.
Review for:
1. **Clarity**: Is every sentence clear? Remove jargon.
2. **Flow**: Do paragraphs connect logically?
3. **Impact**: Are key points emphasized?
4. **Conciseness**: Cut unnecessary words.
5. **Tone**: Consistent voice throughout?
```

#### **SEO Specialist**
- **Role**: Custom
- **Model**: GPT-4
- **Temperature**: 0.4
- **Purpose**: Optimizes content for search and discoverability

**System Prompt Excerpt**:
```
You are an SEO Specialist optimizing thought leadership content.
Provide:
1. **Title Options** (3-5 variations)
2. **Meta Description** (150-160 characters)
3. **Keywords** (primary + 5-7 secondary)
4. **Content Optimization** suggestions
5. **Social Media** versions (LinkedIn, Twitter)
```

#### **Fact Checker**
- **Role**: Critic
- **Model**: Claude 3.5 Sonnet
- **Temperature**: 0.3
- **Purpose**: Validates accuracy of claims and data

**System Prompt Excerpt**:
```
You are a Fact Checker validating content accuracy.
For each claim in the content:
1. Identify factual claims
2. Assess verifiability
3. Flag unsupported claims
4. Suggest sources or caveats
```

---

## Data Models

### Firestore Collections

```
users/{userId}/
├── agents/{agentId}
├── workspaces/{workspaceId}
│   ├── runs/{runId}
│   │   ├── messages/{messageId}
│   │   ├── toolCallRecords/{recordId}
│   │   ├── workflowSteps/{stepId}
│   │   └── expertCouncilTurns/{turnId}
│   └── deepResearchRequests/{requestId}
├── agentTemplates/{templateId}
├── workspaceTemplates/{templateId}
├── councilCache/{cacheKey}
└── councilAnalytics/{workspaceId}
```

### Expert Council Turn Data

```typescript
interface ExpertCouncilTurn {
  turnId: string
  runId: RunId
  userPrompt: string
  
  stage1: {
    responses: Array<{
      modelId: string
      provider: ModelProvider
      modelName: string
      answerText: string
      status: 'completed' | 'failed'
      tokensUsed?: number
      estimatedCost?: number
      latency: number
      timestampMs: number
    }>
  }
  
  stage2: {
    anonymizationMap: Record<string, string>  // label -> modelId
    reviews: Array<{
      judgeModelId: string
      critiques: Record<string, string>  // label -> critique
      ranking: string[]  // ordered labels
      confidenceScore?: number
      timestampMs: number
      tokensUsed?: number
      estimatedCost?: number
    }>
    aggregateRanking: Array<{
      label: string
      modelId: string
      bordaScore: number
      averageRank: number
      individualRanks: number[]
      standardDeviation: number
    }>
    consensusMetrics: {
      kendallTau: number
      consensusScore: number
      topRankedLabel: string
      controversialResponses: string[]
      rankingCompleteness?: number
      excludedResponses?: string[]
    }
  }
  
  stage3: {
    chairmanModelId: string
    finalResponse: string
    tokensUsed?: number
    estimatedCost?: number
    timestampMs: number
  }
  
  totalDurationMs: number
  totalCost: number
  createdAtMs: number
  executionMode: ExecutionMode
  cacheHit: boolean
  retryCount: number
  qualityScore?: number
  userFeedback?: {
    rating: 1 | 2 | 3 | 4 | 5
    helpful: boolean
    comment?: string
    submittedAtMs: number
  }
}
```

### Workflow State

```typescript
interface WorkflowState {
  currentNodeId?: string
  pendingNodes?: string[]
  visitedCount?: Record<string, number>
  edgeHistory?: Array<{ from: string; to: string; atMs: number }>
  joinOutputs?: Record<string, unknown>
  namedOutputs?: Record<string, unknown>
  pendingResearchRequestId?: string
  pendingResearchOutputKey?: string
}
```

### Project Manager Context

```typescript
interface ConversationContext {
  contextId: ConversationContextId
  userId: string
  workspaceId?: WorkspaceId
  runId?: RunId
  requirements: Requirement[]
  assumptions: Assumption[]
  decisions: DecisionRecord[]
  conflicts: Conflict[]
  turnCount: number
  startedAtMs: number
  lastUpdatedAtMs: number
  summary?: string
  fullHistory: ConversationTurn[]
}

interface Requirement {
  requirementId: RequirementId
  text: string
  category: 'functional' | 'non-functional' | 'constraint' | 'goal'
  priority: 'must-have' | 'should-have' | 'nice-to-have'
  source: 'user-stated' | 'inferred' | 'clarified'
  confidence: number
  extractedAtTurn: number
}

interface Assumption {
  assumptionId: AssumptionId
  text: string
  category: 'technical' | 'business' | 'user' | 'timeline' | 'resource'
  source: 'user-stated' | 'inferred' | 'clarified'
  confidence: number
  validated: boolean
  extractedAtTurn: number
}

interface Conflict {
  conflictId: ConflictId
  type: 'contradictory-requirements' | 'impossible-constraint' | 'priority-conflict'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  involvedItems: string[]
  detectedAtTurn: number
  resolved: boolean
  resolution?: ConflictResolution
}
```

---

## Summary

The LifeOS AI Agent Framework is a production-grade system for multi-agent AI collaboration featuring:

✅ **Multi-model consensus** through Expert Council  
✅ **Flexible orchestration** (4 workflow types)  
✅ **14 pre-configured agent templates**  
✅ **2 complete workspace templates**  
✅ **Graph-based workflows** with conditions and loops  
✅ **Project management** with intelligent questioning  
✅ **Tool integration** for real-world actions  
✅ **Cost tracking and quota management**  
✅ **Streaming output** and real-time UI updates  
✅ **Resumable execution** with state persistence  
✅ **Production deployment** on Firebase

The system follows clean architecture principles, uses TypeScript for type safety, and is designed for extensibility and maintainability.

---

## Additional Resources

- **User Guide**: `docs/features/expert-council-user-guide.md`
- **Agent Framework PRD**: `docs/Agent Framework.md`
- **Workflow Graph Plan**: `docs/features/agents-phase-6e-plan.md`
- **Package README**: `packages/agents/README.md`
