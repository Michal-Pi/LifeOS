# LifeOS Workflow Improvement — Agent Kickoff Prompt

> Hand this prompt to a coding agent to begin implementation. The agent should execute phases sequentially, passing the quality gate after each.

---

## Your Role

You are implementing the LifeOS Workflow Improvement Plan. You will work through phases sequentially. Each phase is scoped to ≤20 minutes of coding. After each phase, you MUST pass the quality gate before moving to the next.

---

## Project Context

**LifeOS** is a personal productivity platform built as a monorepo:

```
apps/web-vite/          — React + Vite web app (frontend)
packages/agents/        — Agent/workflow domain models, ports, usecases
packages/core/          — Core utilities, shared types
packages/calendar/      — Calendar logic
packages/habits/        — Habits tracking
packages/todos/         — Todo management
packages/notes/         — Notes/knowledge
functions/              — Firebase Cloud Functions (backend execution engine)
```

**Tech stack:** TypeScript 5.5+, React, Vite, Firebase, Vitest, ESLint 9, Prettier, pnpm, Turborepo.

**Architecture pattern:** Domain-driven design with ports/adapters. Domain models in `packages/*/src/domain/`. Ports (interfaces) in `packages/*/src/ports/`. Usecases in `packages/*/src/usecases/`. Implementations in `functions/src/`.

**Design system:** Neon/cyberpunk aesthetic. All tokens in `apps/web-vite/src/tokens.css`. Dark/light mode support. Font: Satoshi/General Sans. Mono: JetBrains Mono. All UI must reuse existing design tokens and components — never hardcode colors, spacing, or typography.

---

## Key Files You Need to Know

### Domain Models (READ THESE FIRST)

- `packages/agents/src/domain/models.ts` — AgentConfig, Workflow, Run, ExpertCouncilConfig, WorkflowGraph, ToolDefinition, all ID types
- `packages/agents/src/domain/modelSettings.ts` — ModelProvider, ProviderModelConfig, DEFAULT_MODEL_CONFIGS, MODEL_OPTIONS_BY_PROVIDER
- `packages/agents/src/domain/dialectical.ts` — Thesis lenses, dialectical types, presets
- `packages/agents/src/domain/deepResearchWorkflow.ts` — Deep research types, budget config
- `packages/agents/src/domain/workflowState.ts` — UnifiedWorkflowState, all workflow-specific state extensions
- `packages/agents/src/domain/projectManager.ts` — ProjectManagerConfig

### Ports (Interfaces)

- `packages/agents/src/ports/agentTemplateRepository.ts`
- `packages/agents/src/ports/workflowTemplateRepository.ts`

### Usecases

- `packages/agents/src/usecases/templateUsecases.ts` — Template CRUD operations

### Execution Engine (Backend)

- `functions/src/agents/workflowExecutor.ts` — Main orchestrator, routes to LangGraph
- `functions/src/agents/langgraph/executor.ts` — Unified LangGraph router
- `functions/src/agents/langgraph/utils.ts` — `executeAgentWithEvents()` — shared agent execution
- `functions/src/agents/langgraph/stateAnnotations.ts` — LangGraph state schemas
- `functions/src/agents/providerService.ts` — `executeWithProvider()` — unified provider routing

### Workflow Graphs (Backend)

- `functions/src/agents/langgraph/sequentialGraph.ts`
- `functions/src/agents/langgraph/parallelGraph.ts`
- `functions/src/agents/langgraph/supervisorGraph.ts`
- `functions/src/agents/langgraph/genericGraph.ts`
- `functions/src/agents/langgraph/dialecticalGraph.ts`
- `functions/src/agents/langgraph/deepResearchGraph.ts`

### Expert Council

- `functions/src/agents/expertCouncil.ts`

### Provider Services

- `functions/src/agents/anthropicService.ts`
- `functions/src/agents/openaiService.ts`
- `functions/src/agents/googleService.ts`
- `functions/src/agents/grokService.ts`

### AI Tools

- `packages/agents/src/domain/aiTools.ts` — Tool definitions for agents

### Design System

- `apps/web-vite/src/tokens.css` — ALL design tokens (colors, spacing, typography, etc.)

---

## Existing Types & Patterns to Follow

### ID Creation

```typescript
import type { Id } from '@lifeos/core'
export type AgentId = Id<'agent'>
// IDs are branded string types
```

### Model Provider & Models

```typescript
export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'xai'

// Models are already categorized in MODEL_OPTIONS_BY_PROVIDER:
// openai:    o1 (Thinking), gpt-5.2 (Normal), gpt-5-mini (Fast)
// anthropic: claude-opus-4-6 (Thinking), claude-sonnet-4-5 (Normal), claude-haiku-4-5 (Fast)
// google:    gemini-3-pro (Thinking), gemini-2.5-pro (Normal), gemini-3-flash (Fast)
// xai:       grok-4 (Thinking), grok-4-1-fast (Normal), grok-3-mini (Fast)
```

### AgentConfig (current)

```typescript
export interface AgentConfig {
  agentId: AgentId
  userId: string
  name: string
  role: AgentRole
  systemPrompt: string
  modelProvider: ModelProvider
  modelName: string
  temperature?: number
  maxTokens?: number
  toolIds?: ToolId[]
  description?: string
  archived: boolean
  createdAtMs: number
  updatedAtMs: number
  syncState: SyncState
  version: number
}
```

### Run (current)

```typescript
export interface Run {
  runId: RunId
  workflowId: WorkflowId
  userId: string
  goal: string
  context?: Record<string, unknown>
  status: RunStatus
  currentStep: number
  totalSteps?: number
  output?: string
  error?: string
  // ... more fields
  tokensUsed?: number
  estimatedCost?: number
  syncState: SyncState
  version: number
}
```

### Test Pattern

```typescript
// packages/agents/src/domain/__tests__/modelSettings.test.ts
import { describe, it, expect } from 'vitest'
import { resolveEffectiveModel } from '../modelSettings'

describe('resolveEffectiveModel', () => {
  it('should use agent default when no override', () => {
    // ...
  })
})
```

---

## Quality Gate (MANDATORY After Every Phase)

After completing each phase, you MUST:

```
1. CODE REVIEW    — Re-read all changed files. Check for correctness, edge cases, typos.
2. ARCHITECTURE   — Verify changes follow ports/adapters pattern. Domain logic in packages/,
                    execution in functions/. No circular imports.
3. LINT           — Run: pnpm lint
                    Must pass with ZERO errors. Fix any issues before proceeding.
4. TYPECHECK      — Run: pnpm typecheck
                    Must pass with ZERO errors. Fix any issues before proceeding.
5. TEST SUITE     — Write Vitest tests for ALL new/changed logic.
                    - Domain logic tests in packages/*/src/**/__tests__/ or *.test.ts
                    - Minimum: one test per public function/type change
                    - Test happy path + edge cases + error cases
6. TEST RUN       — Run: pnpm test
                    Must pass with ZERO failures. Fix any issues before proceeding.
7. DESIGN SYSTEM  — Any UI changes must:
                    - Use tokens from tokens.css (never hardcode colors/spacing/fonts)
                    - Reuse existing components (check apps/web-vite/src/components/)
                    - Support both dark and light mode
                    - Match the neon/cyberpunk design language
```

**DO NOT proceed to the next phase until all 7 checks pass.**

---

## Phase 1: Model Tier System — Domain Types

### Goal

Add `ModelTier`, `ExecutionMode`, and `tierOverride` to domain models. Add tier-to-model mapping.

### What to Do

**1. In `packages/agents/src/domain/models.ts`:**

Add new types (near the top, after existing type definitions):

```typescript
export type ModelTier = 'thinking' | 'balanced' | 'fast'
export type WorkflowExecutionMode = 'as_designed' | 'cost_saving'
export type WorkflowCriticality = 'critical' | 'core' | 'routine'
```

Add `modelTier` to `AgentConfig`:

```typescript
export interface AgentConfig {
  // ... existing fields ...
  modelTier?: ModelTier // NEW — defaults to 'balanced' if unset
}
```

Add execution mode fields to `Run`:

```typescript
export interface Run {
  // ... existing fields ...
  executionMode?: WorkflowExecutionMode // NEW — 'as_designed' | 'cost_saving'
  tierOverride?: ModelTier | null // NEW — forces all agents to this tier
}
```

Add criticality to `Workflow`:

```typescript
export interface Workflow {
  // ... existing fields ...
  criticality?: WorkflowCriticality // NEW — determines cost-saving behavior
}
```

Update `CreateRunInput` — it already uses `Omit<Run, ...>` so the new optional fields will flow through automatically. Verify this.

**2. In `packages/agents/src/domain/modelSettings.ts`:**

Add the tier-to-model mapping:

```typescript
import type { ModelTier, WorkflowCriticality, WorkflowExecutionMode, ModelProvider } from './models'

/**
 * Maps a ModelTier to the concrete model name for each provider.
 */
export const MODEL_TIER_MAP: Record<ModelTier, Record<ModelProvider, string>> = {
  thinking: {
    openai: 'o1',
    anthropic: 'claude-opus-4-6',
    google: 'gemini-3-pro',
    xai: 'grok-4',
  },
  balanced: {
    openai: 'gpt-5.2',
    anthropic: 'claude-sonnet-4-5',
    google: 'gemini-2.5-pro',
    xai: 'grok-4-1-fast-non-reasoning',
  },
  fast: {
    openai: 'gpt-5-mini',
    anthropic: 'claude-haiku-4-5',
    google: 'gemini-3-flash',
    xai: 'grok-3-mini',
  },
}

/**
 * Cost-saving mode downgrade rules.
 * Maps (criticality, templateTier) → effective tier.
 */
export const COST_SAVING_RULES: Record<WorkflowCriticality, Record<ModelTier, ModelTier>> = {
  critical: {
    thinking: 'balanced', // Never downgrade critical below balanced
    balanced: 'balanced', // Keep as-is
    fast: 'fast', // Already fast
  },
  core: {
    thinking: 'balanced',
    balanced: 'fast',
    fast: 'fast',
  },
  routine: {
    thinking: 'fast',
    balanced: 'fast',
    fast: 'fast',
  },
}

/**
 * Resolves the effective model for an agent given execution context.
 *
 * Priority: tierOverride > executionMode mapping > agent modelTier > agent modelName (legacy)
 */
export function resolveEffectiveModel(
  agentConfig: { modelProvider: ModelProvider; modelName: string; modelTier?: ModelTier },
  executionMode: WorkflowExecutionMode = 'as_designed',
  tierOverride: ModelTier | null | undefined,
  workflowCriticality: WorkflowCriticality = 'core'
): { provider: ModelProvider; model: string; resolvedTier: ModelTier } {
  // 1. If user forced a specific tier, use it
  if (tierOverride) {
    return {
      provider: agentConfig.modelProvider,
      model: MODEL_TIER_MAP[tierOverride][agentConfig.modelProvider],
      resolvedTier: tierOverride,
    }
  }

  // 2. Determine the agent's base tier
  const baseTier: ModelTier = agentConfig.modelTier ?? inferTierFromModel(agentConfig.modelName)

  // 3. Apply cost-saving rules if in cost_saving mode
  if (executionMode === 'cost_saving') {
    const effectiveTier = COST_SAVING_RULES[workflowCriticality][baseTier]
    return {
      provider: agentConfig.modelProvider,
      model: MODEL_TIER_MAP[effectiveTier][agentConfig.modelProvider],
      resolvedTier: effectiveTier,
    }
  }

  // 4. As-designed mode: use agent's tier directly
  return {
    provider: agentConfig.modelProvider,
    model: MODEL_TIER_MAP[baseTier][agentConfig.modelProvider],
    resolvedTier: baseTier,
  }
}

/**
 * Infers a ModelTier from a concrete model name (for backward compatibility).
 * Used when agentConfig.modelTier is not set (legacy agents).
 */
export function inferTierFromModel(modelName: string): ModelTier {
  // Check all tier maps to find a match
  for (const [tier, providers] of Object.entries(MODEL_TIER_MAP)) {
    for (const model of Object.values(providers)) {
      if (model === modelName) return tier as ModelTier
    }
  }
  // Default to balanced if unknown model
  return 'balanced'
}
```

### Tests to Write

Create `packages/agents/src/domain/__tests__/modelTierSystem.test.ts`:

Test `resolveEffectiveModel`:

- Returns correct model when `tierOverride` is set (overrides everything)
- Returns correct model in `as_designed` mode with explicit `modelTier`
- Returns correct model in `cost_saving` mode for critical workflow (thinking → balanced, never fast)
- Returns correct model in `cost_saving` mode for core workflow (balanced → fast)
- Returns correct model in `cost_saving` mode for routine workflow (everything → fast)
- Falls back to `inferTierFromModel` when `modelTier` is undefined (legacy compat)
- Defaults to `balanced` tier for unknown model names

Test `inferTierFromModel`:

- Correctly maps each known model to its tier
- Returns `balanced` for unknown model names

### Run Quality Gate

After implementation, run the full quality gate checklist.

---

## Phase 2: Model Tier System — Runtime Resolution

### Goal

Wire `resolveEffectiveModel` into the execution engine so it actually changes which model runs.

### What to Do

**1. Read these files first** (understand the execution flow):

- `functions/src/agents/workflowExecutor.ts` — Find where `Run` config is parsed and passed to LangGraph
- `functions/src/agents/langgraph/executor.ts` — Find `LangGraphExecutionConfig`
- `functions/src/agents/langgraph/utils.ts` — Find `executeAgentWithEvents`
- `functions/src/agents/providerService.ts` — Find `executeWithProvider`

**2. Thread execution mode through the execution pipeline:**

In `functions/src/agents/langgraph/executor.ts` (or wherever `LangGraphExecutionConfig` is defined):

- Add `executionMode?: WorkflowExecutionMode`, `tierOverride?: ModelTier | null`, and `workflowCriticality?: WorkflowCriticality` to the config type.

In `functions/src/agents/workflowExecutor.ts`:

- When building the `LangGraphExecutionConfig` from the `Run`, pass through `run.executionMode`, `run.tierOverride`, and the workflow's `criticality`.

In `functions/src/agents/langgraph/utils.ts` — `executeAgentWithEvents()`:

- Before calling the provider, call `resolveEffectiveModel()` with the agent config, execution mode, tier override, and workflow criticality.
- Use the resolved `{ provider, model }` instead of `agentConfig.modelProvider` and `agentConfig.modelName`.
- Log the resolution: `Resolved model: ${agentConfig.modelName} → ${resolved.model} (tier: ${resolved.resolvedTier}, mode: ${executionMode})`

**3. Important:** Do NOT change any existing behavior when `executionMode` is undefined. The default must be backward-compatible (`as_designed` with no tier override = use the agent's existing `modelName`). Verify that `inferTierFromModel` correctly maps all existing model names.

### Tests to Write

- Integration-style tests verifying that when a Run has `executionMode: 'cost_saving'` and the workflow has `criticality: 'routine'`, the resolved model is the fast-tier model.
- Test that undefined `executionMode` preserves backward compatibility (uses agent's `modelName` as-is).

### Run Quality Gate

---

## Phase 3: Model Tier System — UI Controls

### Goal

Users can select execution mode and tier override when starting a workflow run.

### What to Do

**1. Find the workflow run dialog** — search for the component that handles "Start Run" / "Execute Workflow" in `apps/web-vite/src/`. Read it thoroughly.

**2. Add two new controls:**

a) **Execution Mode Toggle** — A segmented control or toggle:

- "As-Designed" (default, selected)
- "Cost-Saving"
- Use existing toggle/segmented-control patterns from the codebase

b) **Tier Override Dropdown** (optional, collapsed by default):

- "Default" (no override)
- "Fast" → all agents use fast-tier models
- "Balanced" → all agents use balanced-tier models
- "Thinking" → all agents use thinking-tier models
- Use existing Radix Select patterns from the codebase

**3. Wire the values** to the run creation API call so they're stored on the `Run` document.

**4. Design system compliance:**

- Use tokens from `tokens.css`
- Match existing form/dialog styling patterns
- Support dark and light mode
- Reuse existing Select/Toggle components

### Tests to Write

- Component tests: controls render, selection updates state, values are passed to run creation.

### Run Quality Gate

---

## Phase 4: Agent Deduplication on Workflow Creation

### Goal

When creating a workflow from a template, check for existing identical agents and reuse them.

### What to Do

**1. Read `packages/agents/src/usecases/templateUsecases.ts`** — understand how workflow creation from templates works, specifically where new agents are created.

**2. Add a config hashing function** in `packages/agents/src/domain/models.ts` or a new utility file:

```typescript
/**
 * Creates a deterministic hash of an agent config for deduplication.
 * Two agents with the same hash are functionally identical.
 */
export function hashAgentConfig(config: {
  systemPrompt: string
  role: AgentRole
  toolIds?: ToolId[]
  modelProvider: ModelProvider
  modelName: string
  temperature?: number
  modelTier?: ModelTier
}): string {
  // Use a stable JSON serialization + simple hash
  const normalized = JSON.stringify({
    systemPrompt: config.systemPrompt,
    role: config.role,
    toolIds: [...(config.toolIds ?? [])].sort(),
    modelProvider: config.modelProvider,
    modelName: config.modelName,
    temperature: config.temperature ?? 0.7,
    modelTier: config.modelTier ?? 'balanced',
  })
  // Simple hash — use a basic string hash, don't need crypto-grade
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return `cfghash_${Math.abs(hash).toString(36)}`
}
```

**3. Add `configHash?: string` to `AgentConfig`** so we can query by it.

**4. Add `findByConfigHash(userId: string, hash: string): Promise<AgentConfig | null>`** to the agent repository port.

**5. In template usecases** — when creating agents from a workflow template:

- Compute the config hash for each agent
- Call `findByConfigHash` to check for an existing match
- If match found → use that agent's ID in the workflow's `agentIds`
- If no match → create a new agent with the computed `configHash` stored on it

**6. When an agent is updated** (config changes), clear its `configHash` or recompute it.

### Tests to Write

- `hashAgentConfig`: same input → same hash, different input → different hash, tool order doesn't matter
- Deduplication: creating workflow with identical agent reuses it, different agent creates new
- Hash is cleared/recomputed on agent update

### Run Quality Gate

---

## After Phases 1-4: Checkpoint

At this point you have:

- ✅ Model tier types in domain models
- ✅ Runtime model resolution in execution engine
- ✅ UI controls for execution mode and tier override
- ✅ Agent deduplication on workflow creation

**Commit your work**, then continue to Phase 5 (Prompt Caching).

Refer to the full plan in `WORKFLOW_IMPROVEMENT_PLAN.md` for Phases 5-49. Each phase follows the same pattern:

1. Read the relevant files
2. Implement the changes described
3. Write comprehensive tests
4. Pass the quality gate (lint, typecheck, test, design system compliance)

---

## Important Rules

1. **Never skip the quality gate.** Every phase must pass all 7 checks.
2. **Read before writing.** Always read a file before modifying it. Understand existing patterns.
3. **Reuse, don't reinvent.** Check for existing components, utilities, and patterns before creating new ones.
4. **Backward compatibility.** New fields should be optional. Existing behavior must not change when new fields are undefined.
5. **Design system compliance.** Every UI change uses design tokens from `tokens.css`. No hardcoded colors, spacing, or fonts. Support dark and light mode. Reuse existing components.
6. **Domain-driven design.** Domain types and logic in `packages/`. Execution/implementation in `functions/`. Ports define interfaces.
7. **Test everything.** Every public function gets at least one test. Cover happy path, edge cases, and error cases.
8. **Small, focused changes.** Each phase touches 2-5 files max. Don't scope-creep.
9. **Commit after each phase** or after a logical group of phases (e.g., Phases 1-2 together).
