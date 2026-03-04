# LifeOS Workflow Improvement — Continuation Prompt (Phases 8–9)

> **Start here.** Phases 1–7 are complete and committed. Continue with Phase 8.

---

## What Was Already Implemented (Phases 1–7)

### Phases 1–4: Model Tier System + Agent Deduplication

- `ModelTier`, `WorkflowExecutionMode`, `WorkflowCriticality` types
- `MODEL_TIER_MAP`, `COST_SAVING_RULES`, `resolveEffectiveModel()`
- Runtime resolution in all graph executors (sequential, parallel, supervisor, graph, dialectical, deep_research)
- UI controls (execution mode toggle + tier override dropdown) in `RunWorkflowModal.tsx`
- `hashAgentConfig()` + deduplication in `templateInstantiation.ts`

### Phase 5: Prompt Caching — Anthropic

- `estimateTokenCount()` — rough heuristic (~1 token per 4 chars)
- `buildSystemPromptWithCaching()` — returns `TextBlockParam[]` with `cache_control` when >= 1024 estimated tokens
- `determineCacheStatus()`, `calculateCost()` updated with cache pricing
- Both `executeWithAnthropic` and `executeWithAnthropicStreaming` updated

### Phase 6: Context Compression Between Sequential Agents

- `enableContextCompression?: boolean` on `Workflow` interface + Zod schema
- `compressAgentOutput()` in `sequentialGraph.ts` — uses gpt-4o-mini to compress output > 2000 tokens
- `isCompressionEnabled()` — defaults based on criticality (routine → on, core/critical → off)
- Compression applied between sequential steps (not after last agent)

### Phase 7: Streaming & Real-Time Progress

- `step_started` and `step_completed` event types in `runEvents.ts` and `events.ts`
- `stepStartedEvent()` and `stepCompletedEvent()` factory functions in `events.ts`
- `executeAgentWithEvents()` emits step progress events with step/total/cost/tokens/duration
- `totalSteps` added to `AgentExecutionOptions`
- UI progress indicator in `RunDetailModal.tsx` showing "Agent N/M: Name..." + cumulative cost
- `totalSteps` passed from sequential (`agents.length`) and supervisor (`workerAgents.length + 2`)

---

## Important Patterns & Conventions

1. **Architecture:** Domain-Driven Design. Domain types in `packages/agents/src/domain/`, execution in `functions/src/agents/`.
2. **Backward Compatibility:** All new fields are optional with sensible defaults.
3. **Model Resolution Pipeline:** `workflowExecutor.ts` → `LangGraphExecutionConfig` → `executor.ts` → graph config → `AgentExecutionContext` → `executeAgentWithEvents()` → `resolveEffectiveModel()` → `executeWithProvider()`.
4. **Tests:** Vitest. Functions tests in `functions/src/agents/__tests__/`. Domain tests in `packages/agents/src/domain/__tests__/`. Run with `pnpm --filter functions test` or `pnpm --filter @lifeos/agents test`.
5. **Pre-existing test failures** (not ours): `functions/src/agents/__tests__/mailboxAITools.test.ts` fails due to Firestore mock issue (`firestore.settings is not a function`). Ignore this.
6. **Zod Validation:** Domain types have Zod schemas in `packages/agents/src/domain/validation.ts`. Add new fields to schemas when modifying domain types.
7. **Event System:** Two layers:
   - `functions/src/agents/runEvents.ts` — **Infrastructure**: Firestore-backed event writer (`RunEventWriter`), handles token batching/flushing
   - `functions/src/agents/langgraph/events.ts` — **Event schemas**: `WorkflowEventType` union type + event creator functions
8. **Run Lifecycle:** `runExecutor.ts` → `executeWorkflow()` → `executeLangGraphWorkflow()` → graph executor. After completion, `runExecutor.ts` updates the Run document in Firestore with `status: 'completed'`, `output`, `tokensUsed`, `estimatedCost`, `completedAtMs`.
9. **Mock patterns:** `vi.mock()` factories are hoisted to top of file — inline values directly, don't reference module-level variables. Use `vi.mocked()` for type-safe mock access.

---

## Quality Gate (Required After Every Phase)

```
1. Code Review     — Read through all changed files for correctness and clarity
2. Architecture    — Verify changes follow existing patterns (ports/adapters, domain models, usecases)
3. Lint            — pnpm --filter functions lint (must pass with zero errors)
4. TypeCheck       — pnpm --filter functions typecheck && pnpm --filter @lifeos/agents typecheck (must pass)
5. Test Suite      — Write tests for ALL new/changed logic (unit tests in Vitest)
6. Test Run        — pnpm --filter functions test && pnpm --filter @lifeos/agents test (must pass, excluding known pre-existing failures)
```

---

## Phase 8: Auto-Evaluation Pipeline

**Goal:** After each completed run, score output quality using a cheap judge model on 3 dimensions (relevance, completeness, accuracy). Store scores on the Run document.

### 8a. Domain Model Changes

**File: `packages/agents/src/domain/models.ts`**

Add `evaluationScores` to the `Run` interface (after `estimatedCost` field, ~line 307):

```typescript
// Evaluation
evaluationScores?: {
  relevance: number     // 1-5: How relevant is the output to the goal?
  completeness: number  // 1-5: Does it fully address the goal?
  accuracy: number      // 1-5: Is the content factually sound?
  evaluatedAtMs: number // When evaluation was performed
}
```

**File: `packages/agents/src/domain/validation.ts`**

Add `evaluationScores` to the Run Zod schema. Find the `RunSchema` (search for `z.object` containing `runId`) and add:

```typescript
evaluationScores: z.object({
  relevance: z.number().min(1).max(5),
  completeness: z.number().min(1).max(5),
  accuracy: z.number().min(1).max(5),
  evaluatedAtMs: z.number().int().positive(),
}).optional(),
```

### 8b. Evaluation Logic

**File: `functions/src/agents/evaluation.ts`** (new)

Create a new evaluation module that scores run output quality:

```typescript
import type { ProviderKeys } from './providerService.js'
import type { AgentConfig } from '@lifeos/agents'
import { executeWithProvider } from './providerService.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('Evaluation')

export interface EvaluationScores {
  relevance: number
  completeness: number
  accuracy: number
  evaluatedAtMs: number
}

/**
 * Evaluate run output quality using a cheap judge model.
 * Returns scores 1-5 on relevance, completeness, and accuracy.
 * Returns null if evaluation fails (non-critical — should never block runs).
 */
export async function evaluateRunOutput(
  output: string,
  goal: string,
  apiKeys: ProviderKeys
): Promise<EvaluationScores | null> {
  // ... implementation
}
```

**Implementation details:**

1. Create a judge agent config:
   - `agentId: '__run_evaluator__'`
   - `modelProvider: 'openai'`, `modelName: 'gpt-4o-mini'` (cheapest)
   - `temperature: 0.1` (consistent scoring)
   - System prompt:

     ```
     You are a quality evaluation judge. Score the following agent output on 3 dimensions, each 1-5:
     - Relevance: How relevant is the output to the stated goal?
     - Completeness: Does the output fully address all aspects of the goal?
     - Accuracy: Is the content factually sound and well-reasoned?

     Respond ONLY with JSON in this exact format, no other text:
     {"relevance": N, "completeness": N, "accuracy": N}
     ```

2. The goal passed to `executeWithProvider` should be:

   ```
   Goal: ${goal}

   Output to evaluate:
   ${output}
   ```

3. Parse the JSON response. Use `JSON.parse()` with a try-catch. Validate each score is 1-5. If parsing fails or scores are out of range, return `null`.

4. **Truncate output** if it exceeds ~4000 tokens (roughly 16000 chars) to keep evaluation costs low. Only evaluate the first 16000 chars.

5. Wrap everything in try-catch and return `null` on any error. Log the error but never throw — evaluation must never block the run.

### 8c. Hook Into Run Completion

**File: `functions/src/agents/runExecutor.ts`**

After the run completes successfully (after the `runRef.update({ status: 'completed', ... })` call at ~line 523), add the evaluation step:

```typescript
// Auto-evaluate output quality (non-blocking, fire-and-forget)
import { evaluateRunOutput } from './evaluation.js'

// ... after the runRef.update({ status: 'completed' ... }) call:
// Evaluate output quality asynchronously (don't await — fire-and-forget)
evaluateRunOutput(result.output, run.goal, apiKeys)
  .then(async (scores) => {
    if (scores) {
      await runRef.update({ evaluationScores: scores })
      log.info('Run evaluation complete', {
        runId,
        relevance: scores.relevance,
        completeness: scores.completeness,
        accuracy: scores.accuracy,
      })
    }
  })
  .catch((err) => {
    log.warn('Run evaluation failed (non-critical)', { runId, error: err })
  })
```

**Important:** The evaluation is fire-and-forget. It runs asynchronously after the run is marked as completed. The user sees their result immediately; the evaluation scores appear on the run document shortly after. This ensures evaluation never slows down the run.

Also add the evaluation after the Expert Council completion path (~line 289, after `runRef.update({ status: 'completed' ... })`):

```typescript
evaluateRunOutput(turn.stage3.finalResponse, run.goal, apiKeys)
  .then(async (scores) => {
    if (scores) {
      await runRef.update({ evaluationScores: scores })
    }
  })
  .catch((err) => log.warn('Expert Council evaluation failed', { runId, error: err }))
```

### 8d. Tests

**File: `functions/src/agents/__tests__/evaluation.test.ts`** (new)

Write unit tests:

1. **Successful evaluation** — mock `executeWithProvider` to return valid JSON `{"relevance": 4, "completeness": 3, "accuracy": 5}`, verify returned scores match
2. **Invalid JSON response** — mock provider to return non-JSON text, verify returns `null`
3. **Scores out of range** — mock provider to return `{"relevance": 7, "completeness": 0, "accuracy": 3}`, verify returns `null`
4. **Provider error** — mock provider to throw, verify returns `null` (never throws)
5. **Output truncation** — pass a very long output (>16000 chars), verify the prompt passed to provider is truncated
6. **Judge agent config** — verify the agent config uses `gpt-4o-mini`, low temperature

**Testing approach:** Mock `../providerService.js` using `vi.mock()` with inline values. The evaluate function calls `executeWithProvider`, so mock that.

---

## Phase 9: Sequential — Early-Exit Conditions

**Goal:** If a sequential agent produces output containing a termination signal (e.g., `ANSWER_FOUND`), skip remaining agents and complete the workflow early.

### 9a. Domain Model Changes

**File: `packages/agents/src/domain/models.ts`**

Add `earlyExitPatterns` to the `Workflow` interface (after `enableContextCompression`, ~line 210):

```typescript
earlyExitPatterns?: string[] // If agent output contains any of these patterns, skip remaining agents
```

**File: `packages/agents/src/domain/validation.ts`**

Add to `WorkflowSchema` after `enableContextCompression`:

```typescript
earlyExitPatterns: z.array(z.string().min(1)).optional(),
```

### 9b. Early-Exit Logic in Sequential Graph

**File: `functions/src/agents/langgraph/sequentialGraph.ts`**

The current sequential graph has a linear structure: `START -> agent_0 -> agent_1 -> ... -> agent_n -> END`. To support early exit, we need to replace the fixed edges with **conditional edges** after each agent node (except the last).

**Changes needed:**

1. Add an `earlyExitDetected` boolean field to the state return (add it to the `SequentialState` type or handle it via the node return).

2. In each agent node callback (inside the `for` loop, ~line 145), after agent execution, check if the output matches any early-exit pattern:

```typescript
// Check for early exit patterns
const earlyExitPatterns = workflow.earlyExitPatterns ?? []
const shouldEarlyExit =
  !isLastAgent &&
  earlyExitPatterns.length > 0 &&
  earlyExitPatterns.some((pattern) => step.output.includes(pattern))

if (shouldEarlyExit) {
  log.info('Early exit triggered', {
    step: i + 1,
    totalSteps: agents.length,
    agentName: agent.name,
    pattern: earlyExitPatterns.find((p) => step.output.includes(p)),
  })
}

return {
  currentAgentIndex: i + 1,
  currentGoal: outputForNext,
  steps: [step],
  totalTokensUsed: step.tokensUsed,
  totalEstimatedCost: step.estimatedCost,
  lastOutput: step.output,
  finalOutput: isLastAgent || shouldEarlyExit ? step.output : null,
  status: isLastAgent || shouldEarlyExit ? 'completed' : 'running',
}
```

3. Replace the fixed edges between agents with **conditional edges**. Instead of:

```typescript
graph.addEdge(`agent_${i}`, `agent_${i + 1}`)
```

Use conditional edges for non-last agents:

```typescript
for (let i = 0; i < agents.length - 1; i++) {
  graph.addConditionalEdges(
    `agent_${i}` as typeof START,
    (state: SequentialState) => {
      // If workflow completed early, go to END
      if (state.status === 'completed') {
        return END
      }
      return `agent_${i + 1}`
    },
    // Map of possible destinations (needed by LangGraph for type validation)
    {
      [END]: END,
      [`agent_${i + 1}`]: `agent_${i + 1}` as typeof START,
    }
  )
}
```

Keep the final agent edge as a direct edge to END:

```typescript
graph.addEdge(`agent_${agents.length - 1}` as typeof START, END)
```

**Check `SequentialState` annotation** in `stateAnnotations.ts`: Ensure `status` field is available on the state. If it's not directly accessible, you may need to add it or use `finalOutput` as the signal (if `finalOutput` is non-null, exit early).

### 9c. State Annotation Update (if needed)

**File: `functions/src/agents/langgraph/stateAnnotations.ts`**

Check the `SequentialStateAnnotation`. If `status` is not already part of the annotation, the conditional edge should use `finalOutput` instead:

```typescript
;(state: SequentialState) => {
  if (state.finalOutput !== null && state.finalOutput !== undefined) {
    return END
  }
  return `agent_${i + 1}`
}
```

This avoids needing to modify the state annotation. Use whichever signal is already available.

### 9d. Tests

**File: `functions/src/agents/__tests__/earlyExit.test.ts`** (new)

Write unit tests:

1. **Early exit triggers on pattern match** — create a sequential workflow with 3 agents, set `earlyExitPatterns: ['ANSWER_FOUND']`, mock first agent to return output containing 'ANSWER_FOUND'. Verify only 1 agent was executed (not all 3).
2. **Full chain runs when no match** — same setup but no pattern in output. Verify all 3 agents execute.
3. **Multiple patterns supported** — test with `earlyExitPatterns: ['DONE', 'ANSWER_FOUND']`, output contains 'DONE'. Verify early exit triggers.
4. **No early exit when patterns array is empty** — `earlyExitPatterns: []`. Verify all agents run.
5. **No early exit on last agent** — output of last agent contains pattern. Verify it completes normally (shouldn't matter since it's already the last).
6. **Early exit preserves output** — verify the final output is the output of the agent that triggered early exit (not empty or undefined).

**Testing approach:** Since we're testing the graph behavior, the simplest approach is to mock `executeAgentWithEvents` via `vi.mock('./utils.js')` and call `executeSequentialWorkflowLangGraph` directly. Each mock call can return different outputs to simulate the early-exit scenario. Count how many times the mock was called to verify early exit.

Alternatively, test at a lower level: test the early-exit detection logic as a pure function if extracted. But the graph integration is the most important thing to verify.

**Mock setup:**

```typescript
vi.mock('../providerService.js', () => ({
  executeWithProvider: vi.fn().mockResolvedValue({
    output: 'test output',
    tokensUsed: 100,
    estimatedCost: 0.01,
    iterationsUsed: 1,
    provider: 'openai',
    model: 'gpt-4o-mini',
  }),
  executeWithProviderStreaming: vi.fn().mockResolvedValue({ ... }),
}))

vi.mock('@lifeos/agents', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    resolveEffectiveModel: vi.fn().mockReturnValue({
      provider: 'openai',
      model: 'gpt-4o-mini',
    }),
  }
})
```

Control the output of each agent step by making `executeWithProvider` return different values on successive calls using `.mockResolvedValueOnce()`.

---

## Key Files Summary

| Phase | File                                                 | Action                                   |
| ----- | ---------------------------------------------------- | ---------------------------------------- |
| 8     | `packages/agents/src/domain/models.ts`               | Add `evaluationScores` to `Run`          |
| 8     | `packages/agents/src/domain/validation.ts`           | Add to `RunSchema`                       |
| 8     | `functions/src/agents/evaluation.ts`                 | New — `evaluateRunOutput()`              |
| 8     | `functions/src/agents/runExecutor.ts`                | Hook evaluation after run completion     |
| 8     | `functions/src/agents/__tests__/evaluation.test.ts`  | New test file                            |
| 9     | `packages/agents/src/domain/models.ts`               | Add `earlyExitPatterns` to `Workflow`    |
| 9     | `packages/agents/src/domain/validation.ts`           | Add to `WorkflowSchema`                  |
| 9     | `functions/src/agents/langgraph/sequentialGraph.ts`  | Add early-exit logic + conditional edges |
| 9     | `functions/src/agents/langgraph/stateAnnotations.ts` | Check/update if needed                   |
| 9     | `functions/src/agents/__tests__/earlyExit.test.ts`   | New test file                            |

---

## How To Execute

1. Read all files listed above before making changes.
2. Implement Phase 8 first, run quality gate, commit: `feat(agents): add auto-evaluation pipeline for run output quality (Phase 8)`
3. Implement Phase 9, run quality gate, commit: `feat(agents): add early-exit conditions for sequential workflows (Phase 9)`
4. Each phase is a separate commit. Do not batch.
5. Quality gate for each phase: `pnpm --filter functions lint && pnpm --filter functions typecheck && pnpm --filter @lifeos/agents typecheck && pnpm --filter functions test && pnpm --filter @lifeos/agents test`
