# @lifeos/agents

AI Agent Framework for LifeOS - A modular, extensible system for multi-agent collaboration and task orchestration.

## Overview

The `@lifeos/agents` package provides the core domain models, validation schemas, repository interfaces, and business logic for managing AI agents, workspaces, and execution runs. This package follows Domain-Driven Design (DDD) principles and is framework-agnostic, making it reusable across different platforms (web, mobile, server).

## Architecture

This package follows a layered architecture:

```
domain/         # Core types, models, and validation schemas
ports/          # Repository interfaces (contracts)
usecases/       # Pure business logic functions
```

### Key Concepts

- **Agent**: A configurable AI agent with a specific role (planner, researcher, critic, synthesizer, executor)
- **Workspace**: A collection of agents organized to work together on tasks
- **Run**: An execution instance of a workspace processing a user's goal
- **Message**: Individual interactions between agents during a run
- **Tool**: Server-side functions that agents can invoke (e.g., create workout, search calendar)
- **Module**: User-defined tool definitions exposed to agents (UI labels these as modules)

## Installation

This package is part of the LifeOS monorepo and uses workspace dependencies:

```json
{
  "dependencies": {
    "@lifeos/agents": "workspace:*"
  }
}
```

## Usage

### Creating an Agent

```typescript
import { createAgentUsecase } from '@lifeos/agents'
import { agentRepository } from './adapters/firestoreAgentRepository'

const createAgent = createAgentUsecase(agentRepository)

const agent = await createAgent('user123', {
  name: 'Workout Planner',
  role: 'planner',
  systemPrompt: 'You are an expert fitness trainer who creates personalized workout plans.',
  modelProvider: 'openai',
  modelName: 'gpt-4',
  temperature: 0.7,
  maxTokens: 2000,
  toolIds: ['tool:create_workout', 'tool:search_exercises'],
})
```

### Creating a Workspace

```typescript
import { createWorkspaceUsecase } from '@lifeos/agents'
import { workspaceRepository } from './adapters/firestoreWorkspaceRepository'

const createWorkspace = createWorkspaceUsecase(workspaceRepository)

const workspace = await createWorkspace('user123', {
  name: 'Fitness Assistant',
  description: 'Helps create and manage workout routines',
  agentIds: [planner.agentId, researcher.agentId, critic.agentId],
  defaultAgentId: planner.agentId,
  workflowType: 'supervisor',
  maxIterations: 10,
})
```

### Executing a Run

```typescript
import { createRunUsecase } from '@lifeos/agents'
import { runRepository } from './adapters/firestoreRunRepository'

const createRun = createRunUsecase(runRepository)

const run = await createRun('user123', {
  workspaceId: workspace.workspaceId,
  goal: 'Create a 4-day upper/lower split workout plan for building strength',
  context: {
    userLevel: 'intermediate',
    equipment: ['barbell', 'dumbbells', 'bench'],
  },
})
```

### Validation

All input is validated using Zod schemas before processing:

```typescript
import { CreateAgentInputSchema } from '@lifeos/agents'

const input = {
  name: 'My Agent',
  role: 'planner',
  systemPrompt: 'You are helpful',
  modelProvider: 'openai',
  modelName: 'gpt-4',
}

// Validate input
const validated = CreateAgentInputSchema.parse(input)
```

## Custom Modules (Tools)

In the web UI, custom tools are labeled as "Modules" under the Agents page. These are user-defined
tools with JSON schemas, auth requirements, and optional module scoping (`allowedModules`) for
limiting availability.

Relevant UI/logic:

- `apps/web-vite/src/pages/AgentsPage.tsx` (Modules section)
- `apps/web-vite/src/components/agents/ToolBuilderModal.tsx`

## Domain Models

### AgentConfig

```typescript
interface AgentConfig {
  agentId: AgentId
  userId: string
  name: string
  role: 'planner' | 'researcher' | 'critic' | 'synthesizer' | 'executor' | 'custom'
  systemPrompt: string
  modelProvider: 'openai' | 'anthropic' | 'google' | 'xai'
  modelName: string
  temperature?: number // 0-2
  maxTokens?: number
  toolIds?: ToolId[]
  description?: string
  archived: boolean
  createdAtMs: number
  updatedAtMs: number
  syncState: 'synced' | 'pending' | 'conflict'
  version: number
}
```

### Workspace

```typescript
interface Workspace {
  workspaceId: WorkspaceId
  userId: string
  name: string
  description?: string
  agentIds: AgentId[]
  defaultAgentId?: AgentId
  workflowType: 'sequential' | 'parallel' | 'supervisor' | 'graph' | 'custom'
  workflowGraph?: WorkflowGraph
  maxIterations?: number
  archived: boolean
  createdAtMs: number
  updatedAtMs: number
  syncState: 'synced' | 'pending' | 'conflict'
  version: number
}
```

### Workflow Graph (Phase 6E)

```typescript
type WorkflowNodeType = 'agent' | 'tool' | 'human_input' | 'join' | 'end'
type WorkflowEdgeConditionType = 'always' | 'equals' | 'contains' | 'regex'
type JoinAggregationMode = 'list' | 'ranked' | 'consensus'

interface WorkflowGraph {
  version: number
  startNodeId: string
  nodes: Array<{
    id: string
    type: WorkflowNodeType
    agentId?: AgentId
    toolId?: ToolId
    label?: string
    outputKey?: string
    aggregationMode?: JoinAggregationMode
  }>
  edges: Array<{
    from: string
    to: string
    condition: {
      type: WorkflowEdgeConditionType
      key?: string
      value?: string
    }
  }>
  limits?: {
    maxNodeVisits?: number
    maxEdgeRepeats?: number
  }
}
```

### Run

```typescript
interface Run {
  runId: RunId
  workspaceId: WorkspaceId
  userId: string
  goal: string
  context?: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'waiting_for_input'
  currentStep: number
  totalSteps?: number
  output?: string
  error?: string
  pendingInput?: { prompt: string; nodeId: string }
  workflowState?: {
    currentNodeId?: string
    pendingNodes?: string[]
    visitedCount?: Record<string, number>
    edgeHistory?: Array<{ from: string; to: string; atMs: number }>
    joinOutputs?: Record<string, unknown>
    namedOutputs?: Record<string, unknown>
  }
  errorCategory?:
    | 'network'
    | 'auth'
    | 'rate_limit'
    | 'validation'
    | 'timeout'
    | 'internal'
    | 'quota'
  errorDetails?: Record<string, unknown>
  quotaExceeded?: boolean
  startedAtMs: number
  completedAtMs?: number
  tokensUsed?: number
  estimatedCost?: number
  syncState: 'synced' | 'pending' | 'conflict'
  version: number
}
```

## Repository Ports

This package defines interfaces that must be implemented by adapters (e.g., Firestore, SQL):

- `AgentRepository` - CRUD operations for agents
- `WorkspaceRepository` - CRUD operations for workspaces
- `RunRepository` - CRUD operations for runs
- `MessageRepository` - CRUD operations for messages
- `ToolRepository` - CRUD operations for tool definitions

Example implementation:

```typescript
// apps/web-vite/src/adapters/agents/firestoreAgentRepository.ts
import { getFirestore, doc, setDoc } from 'firebase/firestore'
import type { AgentRepository } from '@lifeos/agents'

export const createFirestoreAgentRepository = (): AgentRepository => {
  return {
    async create(userId, input) {
      const db = getFirestore()
      const agentRef = doc(db, `users/${userId}/agents/${input.agentId}`)
      await setDoc(agentRef, input)
      return input
    },
    // ... other methods
  }
}
```

## Usecases

All business logic is encapsulated in pure functions that take repository dependencies:

### Agent Usecases

- `createAgentUsecase` - Create new agent with validation
- `updateAgentUsecase` - Update existing agent
- `deleteAgentUsecase` - Delete (archive) an agent
- `getAgentUsecase` - Retrieve single agent
- `listAgentsUsecase` - List agents with filtering

### Workspace Usecases

- `createWorkspaceUsecase` - Create new workspace
- `updateWorkspaceUsecase` - Update existing workspace
- `deleteWorkspaceUsecase` - Delete workspace
- `getWorkspaceUsecase` - Retrieve single workspace
- `listWorkspacesUsecase` - List workspaces

### Run Usecases

- `createRunUsecase` - Start new execution
- `updateRunUsecase` - Update run status/progress
- `getRunUsecase` - Retrieve single run
- `listRunsUsecase` - List runs with filtering
- `deleteRunUsecase` - Delete run

## Business Rules

The usecases enforce important business rules:

- Agent names cannot be empty
- System prompts must be provided
- Temperature must be between 0 and 2
- Workspaces must have at least one agent
- Default agent must be in the workspace's agent list
- Max iterations limited to 50 to prevent infinite loops
- Run goals cannot be empty

## Testing

Run tests with:

```bash
pnpm test
```

All usecases include comprehensive unit tests with mocked repositories.

## Development

```bash
# Type checking
pnpm typecheck

# Build
pnpm build

# Watch mode for tests
pnpm test:watch
```

## Integration with Other Modules

This framework is designed to work seamlessly with all LifeOS modules:

- **Training**: Agents can create workouts, suggest exercises, analyze progress
- **Calendar**: Agents can schedule events, find free slots, optimize schedules
- **Habits**: Agents can create habit stacks, analyze streaks, provide motivation
- **Notes**: Agents can compile research, create summaries, organize knowledge
- **Todos**: Agents can break down goals into tasks, prioritize work

Agents interact with these modules through the **Tool Registry** (implemented in Phase 6).

## License

Part of the LifeOS project.
