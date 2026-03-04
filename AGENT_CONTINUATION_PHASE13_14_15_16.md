# LifeOS Workflow Improvement — Continuation Prompt (Phases 13–16)

> **Start here.** Phases 1–12 are complete and committed. Continue with Phase 13.

---

## What Was Already Implemented (Phases 1–12)

### Phases 1–4: Model Tier System + Agent Deduplication

- `ModelTier`, `WorkflowExecutionMode`, `WorkflowCriticality` types
- `MODEL_TIER_MAP`, `COST_SAVING_RULES`, `resolveEffectiveModel()`
- Runtime resolution in all graph executors (sequential, parallel, supervisor, graph, dialectical, deep_research)
- UI controls (execution mode toggle + tier override dropdown) in `RunWorkflowModal.tsx`
- `hashAgentConfig()` — uses dual 32-bit FNV-1a hash (format: `cfghash_{h1}_{h2}`) + deduplication in `templateInstantiation.ts`

### Phase 5: Prompt Caching — Anthropic

- `estimateTokenCount()` — rough heuristic (~1 token per 4 chars)
- `buildSystemPromptWithCaching()` — returns `TextBlockParam[]` with `cache_control` when >= 1024 estimated tokens
- Both `executeWithAnthropic` and `executeWithAnthropicStreaming` updated

### Phase 6: Context Compression Between Sequential Agents

- `enableContextCompression?: boolean` on `Workflow` interface + Zod schema
- `compressAgentOutput()` in `sequentialGraph.ts` — uses gpt-4o-mini to compress output > 2000 tokens
- `isCompressionEnabled()` — defaults based on criticality (routine → on, core/critical → off)

### Phase 7: Streaming & Real-Time Progress

- `step_started` and `step_completed` event types in `runEvents.ts` and `events.ts`
- `executeAgentWithEvents()` emits step progress events with step/total/cost/tokens/duration
- UI progress indicator in `RunDetailModal.tsx`

### Phase 8: Auto-Evaluation Pipeline

- `evaluateRunOutput()` in `functions/src/agents/evaluation.ts` — judge uses gpt-4o-mini, scores relevance/completeness/accuracy 1-5
- `evaluationScores` field on `Run` interface + Zod schema
- Hooked into `runExecutor.ts` at both Expert Council and workflow completion paths

### Phase 9: Early-Exit Conditions for Sequential Workflows

- `earlyExitPatterns?: string[]` on `Workflow` interface + Zod schema
- Pattern detection in `sequentialGraph.ts`, routes to END when matched
- `addConditionalEdges` for branching logic

### Phase 10: Sequential — Quality Gates

- `enableQualityGates?: boolean` and `qualityGateThreshold?: number` on `Workflow`
- `scoreAgentOutput()` — uses gpt-4o-mini, returns 1-5 score, defaults to 3 on parse failure
- `NEXT_TIER_UP` mapping: `fast → balanced`, `balanced → thinking`, `thinking → thinking`
- After each non-last agent, scores output and retries with upgraded tier if below threshold
- Accumulates tokens/cost from both original and retry attempts

### Phase 11: Parallel — Heterogeneous Models & Adaptive Fan-Out

- `heterogeneousModels?: boolean` and `adaptiveFanOut?: boolean` on `Workflow`
- `getAvailableProviders()` — maps ProviderKeys to ModelProvider[] (note: key is `grok`, value is `'xai'`)
- `rotateAgentProvider()` — rotates provider across branches using `resolveEffectiveModel`
- `computeSimpleConsensus()` — Jaccard similarity of word sets (words > 3 chars)
- For consensus merge with `adaptiveFanOut`, spawns 2 additional agents if consensus < 0.6

### Phase 12: Parallel — Weighted Merge & Budget-Aware Parallelism

- `maxBudget?: number` on `Workflow`
- `qualityWeights?: Record<string, number>` on `ParallelGraphConfig`
- `formatAgentEntry()` includes quality weight labels in merge output
- `mergeOutputs()` accepts optional weights; ranked strategy sorts by weight
- Budget-aware fan-out: estimates $0.03/agent, reduces to ceil(n/2) (min 2) if > 80% of maxBudget

---

## Important Patterns & Conventions

1. **Architecture:** Domain-Driven Design. Domain types in `packages/agents/src/domain/`, execution in `functions/src/agents/`.
2. **Backward Compatibility:** All new fields are optional with sensible defaults.
3. **Model Resolution Pipeline:** `workflowExecutor.ts` → `LangGraphExecutionConfig` → `executor.ts` → graph config → `AgentExecutionContext` → `executeAgentWithEvents()` → `resolveEffectiveModel()` → `executeWithProvider()`.
4. **Tests:** Vitest. Functions tests in `functions/src/agents/__tests__/`. Domain tests in `packages/agents/src/domain/__tests__/`. Run with `pnpm --filter functions test` or `pnpm --filter @lifeos/agents test`.
5. **Pre-existing test failures** (not ours): `functions/src/agents/__tests__/mailboxAITools.test.ts` fails due to Firestore mock issue (`firestore.settings is not a function`). Ignore this.
6. **Zod Validation:** Domain types have Zod schemas in `packages/agents/src/domain/validation.ts`. Add new fields to schemas when modifying domain types.
7. **Event System:** Two layers:
   - **Backend:** `functions/src/agents/runEvents.ts` — `RunEventWriter` writes to Firestore. `functions/src/agents/langgraph/events.ts` — factory functions like `stepStartedEvent()`, `stepCompletedEvent()`.
   - **Frontend:** `apps/web-vite/src/hooks/useRunEvents.ts` — Firestore onSnapshot subscription. `RunEventType` union type must mirror backend event types.
8. **LangGraph patterns:**
   - `Annotation<T>` = simple replacement on update
   - `Annotation<T>({ reducer, default })` = accumulates/merges values
   - `addConditionalEdges()` for branching logic
   - Type assertions `as typeof START` needed for dynamic node names
9. **CSS tokens:** All colors/spacing from `apps/web-vite/src/tokens.css`. Never use raw hex/px in component CSS.
10. **Cloud Functions safety:** Always `await` async operations. No fire-and-forget promises.
11. **Mock patterns in tests:**
    - Use `vi.mock()` with factory for module mocking (hoisted automatically)
    - Use `mockReset()` (not `clearAllMocks()`) in `beforeEach`
    - Use call-counter pattern (`setupAgentOutputs()`) for reliable mock ordering
12. **Provider service:** `executeWithProvider()` in `functions/src/agents/providerService.ts` — unified API for all providers. Takes `AgentConfig`, goal string, context, and API keys. Returns `{ output, tokensUsed, estimatedCost, iterationsUsed, provider, model }`.
13. **ToolRegistry:** `Map<string, ToolDefinition>` defined in `functions/src/agents/toolExecutor.ts`. Each tool has `toolId`, `name`, `description`. Agents reference tools via `toolIds?: ToolId[]` array. `getAgentToolsFromRegistry(agent, registry)` returns the agent's available tools.

---

## Quality Gate (Run After Each Phase)

```bash
# Lint
pnpm --filter functions lint
# Typecheck both packages
pnpm --filter functions typecheck && pnpm --filter @lifeos/agents typecheck
# Tests (ignore pre-existing mailboxAITools failures)
pnpm --filter functions test && pnpm --filter @lifeos/agents test
```

Commit each phase separately with format: `feat(agents): <description> (Phase N)`

---

## Phase 13: Supervisor — Planning Phase & Self-Reflection

**Goal:** Enhance the supervisor's planning node to produce a structured delegation plan. After each worker returns, add a reflection step where the supervisor evaluates the worker's output.

### Current Supervisor Architecture

**File: `functions/src/agents/langgraph/supervisorGraph.ts`** (331 lines)

The current graph structure is: `START → supervisor_plan → worker_0 → worker_1 → ... → supervisor_synthesize → END`

The planning node already exists at lines 145-180 — it gives the supervisor a list of available agents (name, role, description) and asks it to create a delegation plan. **This is a good foundation.** The enhancement is to:

1. **Improve the planning prompt** — make the supervisor produce a structured plan with clear expectations per worker
2. **Emit the plan as a `supervisor_plan` event** so the UI can display it
3. **Add reflection after each worker** — supervisor evaluates "Did this worker's output meet my expectations?"
4. **Re-delegation on poor output** — if reflection says output is unsatisfactory, re-run the worker with enhanced instructions

### 13a: New Event Type

**File: `functions/src/agents/langgraph/events.ts`**

Add a `supervisorPlanEvent()` factory function:

```typescript
export function supervisorPlanEvent(plan: string, agentName: string): Partial<RunEvent> {
  return {
    type: 'status',
    status: 'supervisor_plan',
    output: plan,
    agentName,
  }
}
```

**File: `apps/web-vite/src/hooks/useRunEvents.ts`**

No changes needed — the existing `status` event type already covers this. The `RunDetailModal` already displays status events.

### 13b: Enhanced Planning Node

**File: `functions/src/agents/langgraph/supervisorGraph.ts`**

Modify the `supervisor_plan` node (lines 145-180):

1. Enhance the context instruction to produce a structured plan:

```typescript
const supervisorContext = {
  ...state.context,
  availableAgents: workerAgents.map((a) => ({
    name: a.name,
    role: a.role,
    description: a.description,
  })),
  instruction:
    'You are a supervisor agent. Analyze the goal and create a structured delegation plan.\n\n' +
    'For each worker, specify:\n' +
    '1. Which agent should handle the task\n' +
    '2. What specific subtask they should accomplish\n' +
    '3. What you expect their output to contain\n' +
    '4. How their output feeds into the next step\n\n' +
    'Format: use clear headings per worker so the plan is easy to follow.',
}
```

2. After executing the supervisor, emit the plan as an event:

```typescript
if (execContext.eventWriter) {
  await execContext.eventWriter.writeEvent({
    type: 'status',
    status: 'supervisor_plan',
    output: step.output,
    agentName: supervisorAgent.name,
  })
}
```

### 13c: Self-Reflection After Each Worker

**File: `functions/src/agents/langgraph/supervisorGraph.ts`**

This is the main enhancement. Add a `reflectionEnabled` config and reflection logic:

**Add to `SupervisorGraphConfig`:**

```typescript
export interface SupervisorGraphConfig {
  // ... existing fields ...
  enableReflection?: boolean // Supervisor evaluates each worker's output (default true)
}
```

**Add reflection state fields to `SupervisorStateAnnotation`:**

```typescript
reflectionResults: Annotation<Record<string, string>>({
  reducer: (current, update) => ({ ...current, ...update }),
  default: () => ({}),
}),
```

**Add a reflection node after each worker.** There are two approaches:

**Approach A (Recommended): Inline reflection in each worker node.** After `executeAgentWithEvents(worker, ...)` returns, call the supervisor again to evaluate:

```typescript
// Inside worker node callback, after getting worker step:
const enableReflection = config.enableReflection !== false // default true
if (enableReflection) {
  const reflectionContext = {
    supervisorPlan: state.supervisorPlan,
    workerName: worker.name,
    workerOutput: step.output,
    instruction:
      'Review this worker\'s output against your plan. Respond with:\n' +
      '1. SATISFACTORY or UNSATISFACTORY\n' +
      '2. Brief explanation (1-2 sentences)\n' +
      'Be concise.',
  }

  const reflectionStep = await executeAgentWithEvents(
    supervisorAgent,
    state.goal,
    reflectionContext,
    execContext,
    { stepNumber: /* reflection step */, totalSteps: totalStepsWithReflections }
  )
  reflectionStep.agentName = `${supervisorAgent.name} (Reflection on ${worker.name})`

  // Store reflection result
  // Note: do NOT re-delegate in v1 — just log and continue
  // Re-delegation adds significant complexity and is deferred
}
```

**Important considerations:**

- **Step numbering:** When reflection is enabled, total steps increases. Calculate as: `1 (plan) + N*2 (worker + reflection) + 1 (synthesis)` = `2N + 2`. Pass correct `totalSteps` to all `executeAgentWithEvents` calls.
- **Token tracking:** Reflection steps must accumulate tokens/cost via the state reducer.
- **Emit reflection as event:** Write a `status` event with `status: 'supervisor_reflection'` containing the reflection output.
- **Do NOT re-delegate in this phase.** Just capture the reflection. Re-delegation would require conditional edges, re-execution logic, and max-retry limits — that's too much scope. Log a warning if the reflection says UNSATISFACTORY.

### 13d: Tests

**File: `functions/src/agents/__tests__/supervisorReflection.test.ts`**

Mock patterns — follow the same approach as `qualityGate.test.ts`:

- Mock `providerService.js` — not used directly but needed for module resolution
- Mock `firestoreCheckpointer.js`
- Mock `logger.js`
- Mock `langgraph/utils.js` — specifically `executeAgentWithEvents` with call-counter pattern
- **Do NOT mock `@lifeos/agents`** unless you need `resolveEffectiveModel` behavior

**Helper functions:**

```typescript
function makeAgent(name: string, role: string = 'custom'): AgentConfig { ... }
function makeWorkflow(overrides?: Partial<Workflow>): Workflow { ... }
function makeStep(name: string, output: string, overrides?: Partial<AgentExecutionStep>): AgentExecutionStep { ... }
function setupAgentOutputs(outputs: Array<{ name: string; output: string; tokens?: number; cost?: number }>) { ... }
```

**Test cases:**

1. **Planning node emits supervisor plan** — `executeAgentWithEvents` called for planning step, plan is stored in state, event emitted
2. **Reflection runs after each worker** — with 2 workers and reflection enabled, `executeAgentWithEvents` called 6 times: plan + (worker_0 + reflection_0) + (worker_1 + reflection_1) + synthesis
3. **Reflection disabled** — `enableReflection: false`, only plan + workers + synthesis = no reflection calls
4. **Reflection results stored in state** — check that `reflectionResults` in final state contains entries per worker
5. **Reflection tokens/cost accumulate** — total tokens includes planning + workers + reflections + synthesis
6. **Step numbering with reflection** — verify `totalSteps` passed to each `executeAgentWithEvents` call is `2 * workerCount + 2`
7. **No workers (edge case)** — supervisor goes directly to synthesis, no reflection

---

## Phase 14: Supervisor — Tool-Aware Delegation & Budget Allocation

**Goal:** Supervisor sees which tools each worker has. Supervisor can suggest token budgets per delegation.

### 14a: Tool-Aware Delegation

**File: `functions/src/agents/langgraph/supervisorGraph.ts`**

In the `supervisor_plan` node, enhance the `availableAgents` context to include tool information:

```typescript
const supervisorContext = {
  ...state.context,
  availableAgents: workerAgents.map((a) => ({
    name: a.name,
    role: a.role,
    description: a.description,
    tools: (a.toolIds ?? []).map((toolId) => {
      const toolDef = toolRegistry?.get(toolId)
      return toolDef
        ? { id: toolId, name: toolDef.name, description: toolDef.description }
        : { id: toolId }
    }),
  })),
  instruction:
    'You are a supervisor agent. Analyze the goal and create a structured delegation plan.\n\n' +
    'Each worker has specific tools available. Consider tool capabilities when assigning tasks.\n\n' +
    'For each worker, specify:\n' +
    '1. Which agent should handle the task (and why their tools make them suited)\n' +
    '2. What specific subtask they should accomplish\n' +
    '3. What you expect their output to contain\n' +
    '4. How their output feeds into the next step\n\n' +
    'Format: use clear headings per worker.',
}
```

**Important:** The `toolRegistry` is available via `config.toolRegistry` which is already passed through `SupervisorGraphConfig`. Just use it in the planning context.

### 14b: Budget Allocation

**File: `functions/src/agents/langgraph/supervisorGraph.ts`**

Add a `maxTokensPerWorker` field to `SupervisorGraphConfig`:

```typescript
export interface SupervisorGraphConfig {
  // ... existing fields ...
  maxTokensPerWorker?: number // Optional per-worker token budget
}
```

**File: `functions/src/agents/langgraph/utils.ts`**

The `AgentExecutionOptions` interface (line 71) already has `maxIterations` but not `maxTokens`. Add it:

```typescript
export interface AgentExecutionOptions {
  stepNumber?: number
  totalSteps?: number
  nodeId?: string
  additionalContext?: Record<string, unknown>
  maxIterations?: number
  maxTokens?: number // Per-delegation token budget
}
```

Then in `executeAgentWithEvents()`, if `options.maxTokens` is set, override the agent's `maxTokens`:

```typescript
const effectiveAgent: AgentConfig = {
  ...agent,
  modelProvider: resolved.provider as AgentConfig['modelProvider'],
  modelName: resolved.model,
  ...(options.maxTokens ? { maxTokens: options.maxTokens } : {}),
}
```

**Back in `supervisorGraph.ts`**, pass the budget to worker executions:

```typescript
const step = await executeAgentWithEvents(worker, state.goal, workerContext, execContext, {
  stepNumber: i + 2,
  totalSteps: workerAgents.length + 2,
  maxTokens: config.maxTokensPerWorker,
})
```

### 14c: Thread Config Through Executor

**File: `functions/src/agents/langgraph/executor.ts`**

In the `supervisor` case (lines 157-192), check if the workflow has `maxTokensPerWorker` and pass it through:

```typescript
const result = await executeSupervisorWorkflowLangGraph(
  {
    // ... existing fields ...
    maxTokensPerWorker: workflow.maxTokensPerWorker,
  },
  goal,
  context
)
```

**File: `packages/agents/src/domain/models.ts`**

Add to `Workflow` interface:

```typescript
maxTokensPerWorker?: number // Per-worker token budget for supervisor workflows
```

**File: `packages/agents/src/domain/validation.ts`**

Add to `WorkflowSchema`:

```typescript
maxTokensPerWorker: z.number().int().positive().optional(),
```

### 14d: Tests

**File: `functions/src/agents/__tests__/supervisorToolAware.test.ts`**

**Test cases:**

1. **Supervisor prompt includes worker tools** — verify that `availableAgents` in the planning context includes tool names and descriptions for each worker
2. **Supervisor prompt without tools** — when workers have no `toolIds`, the tools array is empty
3. **Tool registry lookup** — tools not found in registry still appear as `{ id: toolId }` (no crash)
4. **maxTokensPerWorker passed to workers** — verify `executeAgentWithEvents` is called with `maxTokens` in options
5. **maxTokensPerWorker not set** — verify `executeAgentWithEvents` is called without `maxTokens` in options
6. **maxTokens applied to agent** — verify the effective agent passed to the provider has `maxTokens` set

---

## Phase 15: Graph — Human-in-the-Loop Nodes

**Goal:** Add a `human_approval` node type that pauses execution and waits for user input.

### 15a: Domain Changes

**File: `packages/agents/src/domain/models.ts`**

Add `'human_approval'` to the `WorkflowNodeType` union (currently at line ~66-90). It should already have `'human_input'` — verify and add `'human_approval'` if it's different from `'human_input'`. If `'human_input'` already exists, we may be able to reuse it.

Check the `RunStatus` type — it should already include `'waiting_for_input'`. If not, add it.

Check the `Run` interface — it should already have `pendingInput?: { prompt: string; nodeId: string }`. If not, add it.

**File: `packages/agents/src/domain/validation.ts`**

Add `'human_approval'` to `WorkflowNodeTypeSchema` if not already present.

### 15b: Graph Execution — Pause & Resume

**File: `functions/src/agents/langgraph/genericGraph.ts`** (685 lines)

Read this file carefully first. Then:

1. **Handle `human_approval` nodes:** When the graph encounters a `human_approval` node:
   - Set run status to `'waiting_for_input'`
   - Emit a `status` event with `status: 'waiting_for_input'` and `details: { nodeId, prompt }`
   - Store the pending state: which node we're at, what comes next
   - **Return early** from the graph execution with `status: 'waiting_for_input'`

2. **The node callback** for `human_approval` should:
   - Check if user input has been provided in the state (e.g., `state.humanApproval`)
   - If no input yet: set status to `waiting_for_input` and return
   - If input provided: check if approved or rejected
     - Approved: continue to next node
     - Rejected: route to error/end (or follow rejection edge if defined)

3. **Resume logic:** The `Run` document will be updated by the frontend with `pendingInput.response`. The `runExecutor.ts` (or a separate resume trigger) will re-invoke the graph with the user's response in the state.

**Important:** Read the existing `genericGraph.ts` to understand how nodes are created from the `WorkflowGraph` definition. The `human_approval` node type needs to be handled alongside the existing `agent`, `tool`, `join`, and `end` node types.

### 15c: State Annotation Changes

**File: `functions/src/agents/langgraph/stateAnnotations.ts`**

If the graph workflow uses a state annotation, add:

```typescript
humanApproval: Annotation<{ approved: boolean; response?: string } | null>,
waitingAtNode: Annotation<string | null>,
```

### 15d: Tests

**File: `functions/src/agents/__tests__/humanApproval.test.ts`**

**Test cases:**

1. **Execution pauses at approval node** — graph stops with status `waiting_for_input`, `waitingAtNode` is set
2. **Execution resumes on approval** — graph continues to next node after approval
3. **Execution routes to end on rejection** — graph terminates or follows rejection edge
4. **No approval node** — graph executes normally without pausing
5. **Approval node at end of graph** — edge case: approval node before END
6. **pendingInput populated correctly** — Run's `pendingInput` has correct `nodeId` and `prompt`

---

## Phase 16: Graph — Loop Detection, Budget Guardrails & Error Recovery

**Goal:** Prevent runaway loops. Add error recovery edges.

### 16a: Domain Changes

**File: `packages/agents/src/domain/models.ts`**

Add to the `WorkflowGraph` interface (find it — should have `nodes` and `edges` arrays):

```typescript
maxVisitsPerNode?: number // Default 10; auto-terminate if any node exceeds this
```

Add `'error'` to the edge condition types if not already present. Check `WorkflowEdgeConditionType` or similar.

**File: `packages/agents/src/domain/validation.ts`**

Add to the relevant schema.

### 16b: Loop Detection

**File: `functions/src/agents/langgraph/genericGraph.ts`**

Add visit counting to the graph state:

```typescript
nodeVisitCounts: Annotation<Record<string, number>>({
  reducer: (current, update) => {
    const merged = { ...current }
    for (const [key, value] of Object.entries(update)) {
      merged[key] = (merged[key] ?? 0) + value
    }
    return merged
  },
  default: () => ({}),
}),
```

In each agent node callback:

1. Increment the visit count for the current node
2. Check if visit count exceeds `maxVisitsPerNode` (default 10)
3. If exceeded: log warning, set status to `completed` with a summary message, route to END
4. Also check if `totalEstimatedCost > workflow.maxBudget` (from Phase 12) — if exceeded, auto-terminate

### 16c: Error Recovery Edges

**File: `functions/src/agents/langgraph/genericGraph.ts`**

When building conditional edges:

1. Check if any outgoing edge has condition type `'error'`
2. Wrap the agent node execution in try/catch
3. On error: follow the `error` edge instead of the default edge
4. If no error edge exists: set status to `failed` and route to END

### 16d: Tests

**File: `functions/src/agents/__tests__/graphGuardrails.test.ts`**

**Test cases:**

1. **Loop detection triggers** — node visited > `maxVisitsPerNode` times, execution terminates with summary
2. **Normal loop completes** — node visited < limit, execution continues
3. **Budget guardrail triggers** — cost exceeds `maxBudget`, execution terminates
4. **Budget guardrail doesn't trigger** — cost under budget, continues normally
5. **Error recovery follows error edge** — agent throws, error edge followed
6. **Error without recovery edge** — agent throws, no error edge, status set to `failed`
7. **Default maxVisitsPerNode** — when not specified, defaults to 10

---

## Key Files Reference

| File                                                 | Purpose                                               |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `packages/agents/src/domain/models.ts`               | Domain types (Workflow, Run, AgentConfig, etc.)       |
| `packages/agents/src/domain/validation.ts`           | Zod schemas (must stay in sync with models.ts)        |
| `functions/src/agents/langgraph/supervisorGraph.ts`  | Supervisor workflow execution (Phases 13-14)          |
| `functions/src/agents/langgraph/genericGraph.ts`     | Graph/custom workflow execution (Phases 15-16)        |
| `functions/src/agents/langgraph/utils.ts`            | `executeAgentWithEvents()` — shared agent execution   |
| `functions/src/agents/langgraph/stateAnnotations.ts` | LangGraph state annotations                           |
| `functions/src/agents/langgraph/events.ts`           | Event factory functions                               |
| `functions/src/agents/langgraph/executor.ts`         | Routes workflow type to correct graph executor        |
| `functions/src/agents/providerService.ts`            | `executeWithProvider()` — unified provider API        |
| `functions/src/agents/toolExecutor.ts`               | `ToolRegistry`, `getAgentToolsFromRegistry()`         |
| `functions/src/agents/runEvents.ts`                  | `RunEventWriter` for Firestore events                 |
| `functions/src/agents/runExecutor.ts`                | Cloud Function trigger for run execution              |
| `functions/src/agents/workflowExecutor.ts`           | Workflow orchestration layer                          |
| `packages/agents/src/domain/aiTools.ts`              | Built-in tool definitions (toolId, name, description) |

---

## Execution Order

1. **Phase 13** — Supervisor planning + self-reflection (13a → 13b → 13c → 13d → quality gate → commit)
2. **Phase 14** — Tool-aware delegation + budget allocation (14a → 14b → 14c → 14d → quality gate → commit)
3. **Phase 15** — Graph human-in-the-loop nodes (15a → 15b → 15c → 15d → quality gate → commit)
4. **Phase 16** — Graph loop detection + budget guardrails + error recovery (16a → 16b → 16c → 16d → quality gate → commit)
5. **Final:** Run full quality gate across all changes, then do a quick code review of your own work.
