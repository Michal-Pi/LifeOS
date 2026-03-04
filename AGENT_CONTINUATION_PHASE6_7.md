# LifeOS Workflow Improvement — Continuation Prompt (Phases 6–7)

> **Start here.** Phases 1–5 are complete and committed. Continue with Phase 6.

---

## What Was Already Implemented (Phases 1–5)

### Phases 1–4: Model Tier System + Agent Deduplication

- `ModelTier`, `WorkflowExecutionMode`, `WorkflowCriticality` types
- `MODEL_TIER_MAP`, `COST_SAVING_RULES`, `resolveEffectiveModel()`
- Runtime resolution in all graph executors (sequential, parallel, supervisor, graph, dialectical, deep_research)
- UI controls (execution mode toggle + tier override dropdown) in `RunWorkflowModal.tsx`
- `hashAgentConfig()` + deduplication in `templateInstantiation.ts`

### Phase 5: Prompt Caching — Anthropic

- `functions/src/agents/anthropicService.ts`:
  - `estimateTokenCount()` — rough heuristic (~1 token per 4 chars)
  - `buildSystemPromptWithCaching()` — returns `TextBlockParam[]` with `cache_control: { type: 'ephemeral' }` when >= 1024 estimated tokens, plain string otherwise
  - `determineCacheStatus()` — classifies cache outcome (`hit`, `creation`, `none`)
  - `calculateCost()` — updated with cache pricing (25% premium on writes, 90% discount on reads)
  - `AnthropicCacheMetrics` interface on `AnthropicExecutionResult`
  - Both `executeWithAnthropic` and `executeWithAnthropicStreaming` updated
- `functions/src/agents/__tests__/promptCaching.test.ts` — 16 tests

---

## Important Patterns & Conventions

1. **Architecture:** Domain-Driven Design. Domain types in `packages/*/src/domain/`, ports in `packages/*/src/ports/`, execution in `functions/src/agents/`.
2. **Backward Compatibility:** All new fields are optional with sensible defaults.
3. **Model Resolution Pipeline:** `workflowExecutor.ts` → `LangGraphExecutionConfig` → `executor.ts` → graph config → `AgentExecutionContext` → `executeAgentWithEvents()` → `resolveEffectiveModel()` → `executeWithProvider()`.
4. **Tests:** Vitest. Functions tests in `functions/src/agents/__tests__/`. Domain tests in `packages/agents/src/domain/__tests__/`. Run with `pnpm --filter functions test` or `pnpm --filter @lifeos/agents test`.
5. **Pre-existing test failures** (not ours): `functions/src/agents/__tests__/mailboxAITools.test.ts` fails due to Firestore mock issue (`firestore.settings is not a function`). Ignore this.
6. **UI Design System:** Neon/cyberpunk dark/light mode. Use tokens from `tokens.css`. Reuse existing component patterns.
7. **Zod Validation:** Domain types have Zod schemas in `packages/agents/src/domain/validation.ts`. Add new fields to schemas when modifying domain types.
8. **Event System:** Two layers:
   - `functions/src/agents/runEvents.ts` — **Infrastructure**: Firestore-backed event writer (`RunEventWriter`), handles token batching/flushing
   - `functions/src/agents/langgraph/events.ts` — **Event schemas**: `WorkflowEventType` union type + event creator functions

---

## Quality Gate (Required After Every Phase)

```
1. Code Review     — Read through all changed files for correctness and clarity
2. Architecture    — Verify changes follow existing patterns (ports/adapters, domain models, usecases)
3. Lint            — pnpm --filter functions lint (must pass with zero errors)
4. TypeCheck       — pnpm --filter functions typecheck (must pass with zero errors)
5. Test Suite      — Write tests for ALL new/changed logic (unit tests in Vitest)
6. Test Run        — pnpm --filter functions test (must pass, excluding known pre-existing failures)
7. Design System   — Any UI changes must use tokens from tokens.css, reuse existing components
```

---

## Phase 6: Context Compression Between Sequential Agents

**Goal:** Compress agent output before passing to the next agent in sequential workflows, reducing token usage in later stages.

### 6a. Domain Model Changes

**File: `packages/agents/src/domain/models.ts`**

Add `enableContextCompression?: boolean` to the `Workflow` interface:

```typescript
// In the Workflow interface, after the `criticality` field (~line 209):
enableContextCompression?: boolean // Compress output between sequential agents (default: per criticality)
```

**File: `packages/agents/src/domain/validation.ts`**

Add `enableContextCompression` to the Workflow Zod schema. Find the `WorkflowSchema` and add `enableContextCompression: z.boolean().optional()`.

### 6b. Compression Logic

**File: `functions/src/agents/langgraph/sequentialGraph.ts`**

Add a compression step after each agent node (except the last). The compression logic should:

1. Check if `config.workflow.enableContextCompression` is enabled (if undefined, default based on criticality: `false` for `critical`, `true` for `routine`, `false` for `core`)
2. After an agent node returns, estimate the output token count using the `estimateTokenCount()` function from `anthropicService.ts`
3. If output exceeds **2000 tokens**, compress it using a fast model call
4. Pass the compressed output (or original if under threshold) as `previousAgentOutput` to the next agent

**Current code to modify** (the agent node callback, lines 93-129):

```typescript
graph.addNode(nodeId, async (state: SequentialState) => {
  // ... existing agent execution ...
  const step = await executeAgentWithEvents(...)

  // ADD: compression step here before returning
  // If not the last agent AND compression is enabled AND output > 2000 tokens:
  //   1. Call a fast model (e.g., via executeWithProvider with a minimal agent config)
  //   2. System prompt: "Summarize the following agent output concisely, preserving all key findings, decisions, and action items. Remove redundancy."
  //   3. Use the compressed output as `lastOutput` and `currentGoal`

  return { ... }
})
```

**For the compression call itself:**

- Create a lightweight helper function `compressAgentOutput(output: string, apiKeys: ProviderKeys): Promise<string>` in the same file
- Use OpenAI `gpt-5-mini` (cheapest fast model) via `executeWithProvider`
- Create a minimal agent config: `{ modelProvider: 'openai', modelName: 'gpt-5-mini', temperature: 0.3, role: 'synthesizer', systemPrompt: '...' }`
- System prompt: `"You are a context compression agent. Summarize the following output concisely, preserving all key findings, data, decisions, action items, and conclusions. Remove redundancy and filler. Output ONLY the compressed summary."`
- The goal passed to the compression agent should be the original output text

**Important:** Thread `executionMode`, `tierOverride`, and `workflowCriticality` through to the compression agent context as well.

**Log compression events:**

```typescript
log.info('Compressing agent output', {
  originalTokens: estimatedTokens,
  step: i + 1,
  totalSteps: agents.length,
})
```

### 6c. Thread Config Through

**File: `functions/src/agents/langgraph/executor.ts`**

Find where `SequentialGraphConfig` is constructed (search for `enableCheckpointing` being passed). Ensure `workflow` is already being passed (it is — via `config.workflow`). The `enableContextCompression` field is on the `Workflow` type, so it will be available automatically through `config.workflow.enableContextCompression`.

No changes needed here if `workflow` is already passed — verify this.

### 6d. Tests

**File: `functions/src/agents/__tests__/contextCompression.test.ts`** (new)

Write unit tests for the compression helper:

1. **Compression triggers when output exceeds threshold** — mock a long output (>2000 tokens), verify compression model is called
2. **Compression skips when output is under threshold** — short output, verify no compression call
3. **Compression respects enableContextCompression flag** — when `false`, never compress regardless of output length
4. **Default compression behavior by criticality** — `critical` defaults to off, `routine` defaults to on
5. **Compressed output is passed to next agent** — verify the state update uses compressed text

**Testing approach:** Since `compressAgentOutput` calls `executeWithProvider`, you'll need to mock that import. Use `vi.mock('../providerService.js', ...)` pattern.

---

## Phase 7: Streaming & Real-Time Progress

**Goal:** Add step-level progress indicators and cost accumulation display so users see "Agent 3/5: Writing draft..." and a running cost total.

### 7a. Add Event Types

**File: `functions/src/agents/runEvents.ts`**

Add `step_started` and `step_completed` to the `RunEventType` union:

```typescript
export type RunEventType =
  | 'token'
  | 'tool_call'
  | 'tool_result'
  | 'status'
  | 'error'
  | 'final'
  | 'step_started' // ADD
  | 'step_completed' // ADD
  // Deep research events
  | 'deep_research_phase'
// ... rest unchanged
```

**File: `functions/src/agents/langgraph/events.ts`**

Add `step_started` and `step_completed` to the `WorkflowEventType` union and create event factory functions:

```typescript
// Add to WorkflowEventType union:
| 'step_started'
| 'step_completed'

// Add event creator functions:
export function stepStartedEvent(params: {
  workflowId: string
  runId: string
  agentId: string
  agentName: string
  stepIndex: number
  totalSteps: number
}): WorkflowEvent { ... }

export function stepCompletedEvent(params: {
  workflowId: string
  runId: string
  agentId: string
  agentName: string
  stepIndex: number
  totalSteps: number
  cumulativeCost: number
  cumulativeTokens: number
  durationMs: number
}): WorkflowEvent { ... }
```

### 7b. Emit Progress Events

**File: `functions/src/agents/langgraph/utils.ts`**

In `executeAgentWithEvents()`, emit step progress events. Find the existing `agent_start` event emission (~line 143) and the `agent_done` emission (~line 192). Add step events:

Before agent execution (right after existing agent_start event):

```typescript
if (eventWriter) {
  await eventWriter.writeEvent({
    type: 'step_started',
    agentId: agent.agentId,
    agentName: agent.name,
    step: options.stepNumber,
    details: {
      totalSteps: options.totalSteps, // You need to add totalSteps to AgentExecutionOptions
    },
  })
}
```

After agent execution (right after existing agent_done event):

```typescript
if (eventWriter) {
  await eventWriter.writeEvent({
    type: 'step_completed',
    agentId: agent.agentId,
    agentName: agent.name,
    step: options.stepNumber,
    details: {
      totalSteps: options.totalSteps,
      cumulativeCost: result.estimatedCost,
      cumulativeTokens: result.tokensUsed,
    },
  })
}
```

**Add `totalSteps` to `AgentExecutionOptions`** (same file):

```typescript
export interface AgentExecutionOptions {
  stepNumber?: number
  totalSteps?: number // ADD
}
```

### 7c. Pass `totalSteps` from Graph Executors

**File: `functions/src/agents/langgraph/sequentialGraph.ts`**

Update the `executeAgentWithEvents` call to include `totalSteps`:

```typescript
const step = await executeAgentWithEvents(agent, state.currentGoal, agentContext, execContext, {
  stepNumber: i + 1,
  totalSteps: agents.length, // ADD
})
```

Also do the same for other graph files that call `executeAgentWithEvents` — check:

- `parallelGraph.ts`
- `supervisorGraph.ts`
- `genericGraph.ts`
- `dialecticalGraph.ts`
- `deepResearchGraph.ts`

For each, add `totalSteps` to the options object. The value depends on the workflow type — for parallel it might be the number of branches, for supervisor it might be dynamic. Use best judgement; if the total isn't known, omit it.

### 7d. Web UI — Progress Indicator

**File: `apps/web-vite/src/components/agents/RunDetailModal.tsx`**

The `RunDetailModal` already subscribes to run events via `useRunEvents`. Add a progress indicator that shows current step info:

```tsx
// After the streaming output section, add:
const stepEvents = events.filter((e) => e.type === 'step_started' || e.type === 'step_completed')
const latestStep = [...stepEvents].reverse()[0]
const completedSteps = events.filter((e) => e.type === 'step_completed')
const cumulativeCost = completedSteps.reduce(
  (sum, e) => sum + ((e.details?.cumulativeCost as number) ?? 0),
  0
)

// Render progress when run is active:
{
  run.status === 'running' && latestStep && (
    <div className="run-progress-indicator">
      <span className="run-progress-step">
        Agent {latestStep.step}/{latestStep.details?.totalSteps ?? '?'}: {latestStep.agentName}
        {latestStep.type === 'step_started' ? '...' : ' ✓'}
      </span>
      {cumulativeCost > 0 && (
        <span className="run-progress-cost">${cumulativeCost.toFixed(4)}</span>
      )}
    </div>
  )
}
```

**File: `apps/web-vite/src/styles/components/RunDetailModal.css`**

Add minimal styling using existing design tokens:

```css
.run-progress-indicator {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--surface-secondary);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-3);
}

.run-progress-step {
  color: var(--text-primary);
  font-weight: 500;
}

.run-progress-cost {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}
```

### 7e. Tests

**File: `functions/src/agents/__tests__/stepProgressEvents.test.ts`** (new)

Write unit tests:

1. **step_started event is emitted before agent execution** — mock eventWriter, verify writeEvent called with `type: 'step_started'`
2. **step_completed event is emitted after agent execution** — verify writeEvent called with `type: 'step_completed'` and includes cost/token data
3. **Events include correct step index and total** — verify `step` and `details.totalSteps` are accurate
4. **Events are not emitted when no eventWriter** — no crash when eventWriter is undefined
5. **Cumulative cost is tracked across steps** — verify the cost increases across sequential steps

**Testing approach:** Mock `executeWithProvider` to return a known result, and mock `eventWriter.writeEvent` to capture calls.

---

## Key Files Summary

| Phase | File                                                        | Action                                        |
| ----- | ----------------------------------------------------------- | --------------------------------------------- |
| 6     | `packages/agents/src/domain/models.ts`                      | Add `enableContextCompression` to Workflow    |
| 6     | `packages/agents/src/domain/validation.ts`                  | Add to WorkflowSchema                         |
| 6     | `functions/src/agents/langgraph/sequentialGraph.ts`         | Add compression step + helper                 |
| 6     | `functions/src/agents/__tests__/contextCompression.test.ts` | New test file                                 |
| 7     | `functions/src/agents/runEvents.ts`                         | Add `step_started`, `step_completed` types    |
| 7     | `functions/src/agents/langgraph/events.ts`                  | Add event types + creator functions           |
| 7     | `functions/src/agents/langgraph/utils.ts`                   | Emit step events, add `totalSteps` to options |
| 7     | `functions/src/agents/langgraph/sequentialGraph.ts`         | Pass `totalSteps`                             |
| 7     | Other graph files                                           | Pass `totalSteps` where applicable            |
| 7     | `apps/web-vite/src/components/agents/RunDetailModal.tsx`    | Add progress indicator                        |
| 7     | `apps/web-vite/src/styles/components/RunDetailModal.css`    | Add progress styles                           |
| 7     | `functions/src/agents/__tests__/stepProgressEvents.test.ts` | New test file                                 |

---

## How To Execute

1. Read all files listed above before making changes.
2. Implement Phase 6 first, run quality gate, commit: `feat(agents): add context compression between sequential agents (Phase 6)`
3. Implement Phase 7, run quality gate, commit: `feat(agents): add step-level progress events and cost display (Phase 7)`
4. Each phase is a separate commit. Do not batch.
5. Quality gate for each phase: `pnpm --filter functions lint && pnpm --filter functions typecheck && pnpm --filter functions test && pnpm --filter @lifeos/agents test`
