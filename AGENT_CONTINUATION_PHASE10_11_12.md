# LifeOS Workflow Improvement — Continuation Prompt (Phases 10–12)

> **Start here.** Phases 1–9 are complete and committed, plus a code review pass that fixed critical/high/medium issues. Continue with Phase 10.

---

## What Was Already Implemented (Phases 1–9 + Review Fixes)

### Phases 1–4: Model Tier System + Agent Deduplication

- `ModelTier`, `WorkflowExecutionMode`, `WorkflowCriticality` types
- `MODEL_TIER_MAP`, `COST_SAVING_RULES`, `resolveEffectiveModel()`
- Runtime resolution in all graph executors (sequential, parallel, supervisor, graph, dialectical, deep_research)
- UI controls (execution mode toggle + tier override dropdown) in `RunWorkflowModal.tsx`
- `hashAgentConfig()` — uses dual 32-bit FNV-1a hash (format: `cfghash_{h1}_{h2}`) + deduplication in `templateInstantiation.ts`

### Phase 5: Prompt Caching — Anthropic

- `estimateTokenCount()` — rough heuristic (~1 token per 4 chars)
- `buildSystemPromptWithCaching()` — returns `TextBlockParam[]` with `cache_control` when >= 1024 estimated tokens
- `determineCacheStatus()`, `calculateCost()` updated with cache pricing
- Both `executeWithAnthropic` and `executeWithAnthropicStreaming` updated

### Phase 6: Context Compression Between Sequential Agents

- `enableContextCompression?: boolean` on `Workflow` interface + Zod schema
- `compressAgentOutput()` in `sequentialGraph.ts` — uses gpt-4o-mini to compress output > 2000 tokens
- `isCompressionEnabled()` — defaults based on criticality (routine → on, core/critical → off)
- Compression applied between sequential steps (not after last agent), skipped on early exit

### Phase 7: Streaming & Real-Time Progress

- `step_started` and `step_completed` event types in `runEvents.ts` and `events.ts`
- `stepStartedEvent()` and `stepCompletedEvent()` factory functions in `events.ts`
- `executeAgentWithEvents()` emits step progress events with step/total/cost/tokens/duration
- `totalSteps` added to `AgentExecutionOptions`
- UI progress indicator in `RunDetailModal.tsx` showing "Agent N/M: Name..." + cumulative cost
- Frontend `RunEventType` includes `step_started`, `step_completed`, `deep_research_phase`

### Phase 8: Auto-Evaluation Pipeline

- `evaluateRunOutput()` and `buildJudgeAgentConfig()` in `functions/src/agents/evaluation.ts`
- Judge uses gpt-4o-mini, temperature 0.1, scores relevance/completeness/accuracy 1-5
- Goal string sanitized (strip `{}"\\`, cap 500 chars) before interpolation into judge prompt
- Output truncated to 16000 chars for cost control
- `evaluationScores` field on `Run` interface + Zod schema
- Hooked into `runExecutor.ts` with `await` + try/catch (NOT fire-and-forget) at both Expert Council and workflow completion paths

### Phase 9: Early-Exit Conditions for Sequential Workflows

- `earlyExitPatterns?: string[]` on `Workflow` interface + Zod schema
- Pattern detection in `sequentialGraph.ts` agent node callback — checks `step.output.includes(pattern)`, skips remaining agents if match found (not on last agent)
- `addConditionalEdges` routes to END when `state.finalOutput !== null`
- `finalOutput` and `status` set to completed when early exit triggers

### Code Review Fixes (Post Phase 9)

- **Zod/TS sync:** Added `deep_research` to `WorkflowTypeSchema`, `llm_evaluate` to `WorkflowEdgeConditionTypeSchema`, 15 node types to `WorkflowNodeTypeSchema`, `prompt` to edge condition, `promptResolutionErrors` to `RunSchema`
- **CSS:** Fixed `--surface-secondary` → `--surface-muted` in `RunDetailModal.css`
- **Accessibility:** Added `role="dialog"`, `aria-modal`, `aria-labelledby` to RunDetailModal
- **Supervisor:** Fixed `totalSteps` calculation — synthesis step uses deterministic `workerAgents.length + 2` instead of `state.steps.length + 1`

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
   - `addConditionalEdges()` for branching logic (used in early exit)
   - Type assertions `as typeof START` needed for dynamic node names
9. **CSS tokens:** All colors/spacing from `apps/web-vite/src/tokens.css`. Never use raw hex/px in component CSS.
10. **Cloud Functions safety:** Always `await` async operations. No fire-and-forget promises — the function runtime may terminate before they complete.
11. **Mock patterns in tests:**
    - Use `vi.mock()` with factory for module mocking (hoisted automatically)
    - Use `mockReset()` (not `clearAllMocks()`) when tests use `mockResolvedValueOnce` — `clearAllMocks` doesn't clear queued values
    - Use call-counter pattern (`setupAgentOutputs()`) for reliable mock ordering
12. **Provider service:** `executeWithProvider()` in `functions/src/agents/providerService.ts` — unified API for all providers. Takes `AgentConfig`, goal string, context, and API keys. Returns `{ output, tokensUsed, estimatedCost, iterationsUsed, provider, model }`.

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

## Phase 10: Sequential — Quality Gates

**Goal:** After each sequential agent, optionally run a fast quality check. If score < 3, retry with a stronger model (one tier up). Max 1 retry per step.

### 10a: Domain Changes

**File: `packages/agents/src/domain/models.ts`**

Add to the `Workflow` interface (after `earlyExitPatterns`):

```typescript
enableQualityGates?: boolean // After each agent, score output 1-5; retry with stronger model if < 3
qualityGateThreshold?: number // Score threshold (default 3, range 1-5)
```

**File: `packages/agents/src/domain/validation.ts`**

Add to `WorkflowSchema` (after `earlyExitPatterns`):

```typescript
enableQualityGates: z.boolean().optional(),
qualityGateThreshold: z.number().int().min(1).max(5).optional(),
```

### 10b: Quality Gate Function

**File: `functions/src/agents/langgraph/sequentialGraph.ts`**

Add a `scoreAgentOutput()` function (or put in a new `qualityGate.ts` file if you prefer):

```typescript
async function scoreAgentOutput(
  output: string,
  goal: string,
  apiKeys: ProviderKeys
): Promise<number>
```

- Uses a cheap model (gpt-4o-mini, temperature 0.1)
- System prompt: "Score the following output 1-5 on how well it achieves the stated goal. Respond with ONLY a single integer 1-5."
- Goal is the `currentGoal` (which may be the original goal or previous agent's output)
- Parse the response as a number, return 3 on parse failure (safe default)

### 10c: Retry Logic in Sequential Graph

**File: `functions/src/agents/langgraph/sequentialGraph.ts`**

In the agent node callback (inside `createSequentialGraph`), after `executeAgentWithEvents()` returns `step`:

1. Check if quality gates are enabled: `workflow.enableQualityGates === true`
2. Skip quality gate on last agent (no retry benefit) and on early exit
3. Call `scoreAgentOutput(step.output, state.currentGoal, apiKeys)`
4. If score < threshold (default 3):
   - Log warning with score, agent name, step number
   - Determine upgraded tier: `fast → balanced`, `balanced → thinking`, `thinking → thinking` (no upgrade possible)
   - Re-execute the same agent with `resolveEffectiveModel()` using the upgraded tier as `tierOverride`
   - Use the retry's output (overwrite `step`), accumulate tokens/cost from both attempts
   - Emit a `step_completed` event with `details: { retried: true, originalScore, retryTier }`
5. If score >= threshold or already at thinking tier: continue normally

**Important:** Only 1 retry per step. Don't loop.

### 10d: Tests

**File: `functions/src/agents/__tests__/qualityGate.test.ts`**

Test cases:

1. Quality gate passes (score >= 3) — agent runs once, output used as-is
2. Quality gate fails (score < 3) — agent retries with upgraded model, retry output used
3. Quality gate disabled (`enableQualityGates: false` or undefined) — no scoring call made
4. Quality gate on last agent — no scoring call made (skip)
5. Quality gate with thinking tier — no retry possible (already highest), original output used
6. Quality gate with early exit — no scoring call made (skip)
7. `scoreAgentOutput` returns valid score on success
8. `scoreAgentOutput` returns 3 on parse failure (safe default)
9. Custom threshold (`qualityGateThreshold: 4`) — fails at score 3, passes at score 4
10. Tokens/cost accumulate from both original and retry attempts

Mock patterns: Follow the same pattern as `earlyExit.test.ts` — mock `executeAgentWithEvents` with `setupAgentOutputs()` call counter. Also mock `scoreAgentOutput` to return controllable scores.

---

## Phase 11: Parallel — Heterogeneous Models & Adaptive Fan-Out

**Goal:** Use different providers per parallel branch for diversity. For consensus mode, add agents if consensus is low.

### 11a: Domain Changes

**File: `packages/agents/src/domain/models.ts`**

Add to the `Workflow` interface (after `earlyExitPatterns` / quality gate fields):

```typescript
heterogeneousModels?: boolean // Rotate providers across parallel branches for diversity
adaptiveFanOut?: boolean // For consensus merge: if consensus low, spawn additional agents
```

**File: `packages/agents/src/domain/validation.ts`**

Add to `WorkflowSchema`:

```typescript
heterogeneousModels: z.boolean().optional(),
adaptiveFanOut: z.boolean().optional(),
```

### 11b: Provider Rotation

**File: `functions/src/agents/langgraph/parallelGraph.ts`**

Read the existing parallel graph implementation first. When `workflow.heterogeneousModels === true`:

1. Create a provider rotation array from available API keys: `['openai', 'anthropic', 'google', 'xai'].filter(p => apiKeys[p])`
2. For each parallel branch `i`, override the agent's `modelProvider` to `rotation[i % rotation.length]`
3. Use `resolveEffectiveModel()` to resolve the concrete model for the rotated provider (preserving the agent's `modelTier`)
4. Pass the resolved model through `executeAgentWithEvents()`

### 11c: Adaptive Fan-Out

**File: `functions/src/agents/langgraph/parallelGraph.ts`**

For `consensus` merge mode when `workflow.adaptiveFanOut === true`:

1. After initial parallel execution and merge, check consensus quality
2. Look at existing consensus metrics — if the parallel graph already calculates consensus score or Kendall Tau, use that
3. If consensus metric < 0.6 (low agreement):
   - Spawn 2 additional agents (from the agent pool, or duplicate existing agents with different providers)
   - Re-run merge with all outputs (original + additional)
   - Log the adaptive fan-out with original consensus and new consensus
4. Cap at 1 round of adaptive fan-out (don't loop)

**Important:** Read the existing `parallelGraph.ts` carefully before implementing. The exact mechanism depends on how merge/consensus is currently structured. If consensus metrics aren't already computed, you may need to add a simple agreement check.

### 11d: Tests

**File: `functions/src/agents/__tests__/parallelHeterogeneous.test.ts`**

Test cases:

1. Heterogeneous models enabled — each branch uses different provider (rotated)
2. Heterogeneous models disabled — all branches use same provider
3. Heterogeneous with fewer providers than branches — providers cycle
4. Heterogeneous respects model tier (tier preserved, only provider rotated)
5. Adaptive fan-out triggers on low consensus — additional agents spawned
6. Adaptive fan-out doesn't trigger on high consensus
7. Adaptive fan-out caps at 1 round
8. Adaptive fan-out disabled — no additional agents regardless of consensus

---

## Phase 12: Parallel — Weighted Merge & Budget-Aware Parallelism

**Goal:** Weight parallel agent outputs by historical quality scores. Reduce fan-out when budget is tight.

### 12a: Domain Changes

**File: `packages/agents/src/domain/models.ts`**

Add to the `Workflow` interface:

```typescript
maxBudget?: number // Maximum USD budget for this workflow run
```

**File: `packages/agents/src/domain/validation.ts`**

Add to `WorkflowSchema`:

```typescript
maxBudget: z.number().nonnegative().optional(),
```

### 12b: Weighted Merge

**File: `functions/src/agents/langgraph/parallelGraph.ts`**

In the merge/synthesis step:

1. Query historical evaluation scores for each agent from recent runs (Firestore query: `users/{userId}/workflows/*/runs` where agent participated, get `evaluationScores`)
2. Compute average quality score per agent (average of relevance + completeness + accuracy / 3)
3. If historical data available, include weights in the merge prompt: "Agent A (quality score 4.2/5): [output]" vs "Agent B (quality score 3.1/5): [output]"
4. If no historical data, fall back to equal weighting (current behavior)

**Keep it simple:** Don't overcomplicate the weighting. Just include the quality score as context for the merge agent to consider. The LLM can decide how to weight the inputs.

### 12c: Budget-Aware Fan-Out

**File: `functions/src/agents/langgraph/parallelGraph.ts`**

Before launching parallel branches:

1. If `workflow.maxBudget` is set:
   - Estimate cost per agent: use the model's per-token pricing × estimated tokens (rough heuristic: 2000 input + 1000 output tokens per agent)
   - If `estimatedTotalCost > maxBudget * 0.8` (80% of budget): reduce fan-out count by half (minimum 2 agents)
   - Log the budget-aware reduction
2. During merge step, include cumulative cost tracking
3. If budget exceeded mid-execution, log warning but don't abort (let current agents finish)

### 12d: Tests

**File: `functions/src/agents/__tests__/parallelWeightedMerge.test.ts`**

Test cases:

1. Weighted merge includes quality scores in merge prompt when historical data exists
2. Weighted merge falls back to equal weighting when no historical data
3. Budget-aware parallelism reduces fan-out when budget tight
4. Budget-aware parallelism doesn't reduce fan-out when budget ample
5. Budget-aware parallelism respects minimum fan-out of 2
6. Budget tracking accumulates during execution

---

## Key Files Reference

| File                                                 | Purpose                                             |
| ---------------------------------------------------- | --------------------------------------------------- |
| `packages/agents/src/domain/models.ts`               | Domain types (Workflow, Run, AgentConfig, etc.)     |
| `packages/agents/src/domain/validation.ts`           | Zod schemas (must stay in sync with models.ts)      |
| `functions/src/agents/langgraph/sequentialGraph.ts`  | Sequential workflow execution                       |
| `functions/src/agents/langgraph/parallelGraph.ts`    | Parallel workflow execution                         |
| `functions/src/agents/langgraph/supervisorGraph.ts`  | Supervisor workflow execution                       |
| `functions/src/agents/langgraph/utils.ts`            | `executeAgentWithEvents()` — shared agent execution |
| `functions/src/agents/langgraph/stateAnnotations.ts` | LangGraph state annotations                         |
| `functions/src/agents/langgraph/events.ts`           | Event factory functions                             |
| `functions/src/agents/providerService.ts`            | `executeWithProvider()` — unified provider API      |
| `functions/src/agents/evaluation.ts`                 | Auto-evaluation pipeline (Phase 8)                  |
| `functions/src/agents/runExecutor.ts`                | Cloud Function trigger for run execution            |
| `functions/src/agents/workflowExecutor.ts`           | Workflow orchestration layer                        |
| `functions/src/agents/runEvents.ts`                  | `RunEventWriter` for Firestore events               |
| `apps/web-vite/src/hooks/useRunEvents.ts`            | Frontend event subscription + RunEventType          |
| `apps/web-vite/src/tokens.css`                       | Design system CSS tokens                            |

---

## Execution Order

1. **Phase 10** — Sequential quality gates (10a → 10b → 10c → 10d → quality gate → commit)
2. **Phase 11** — Parallel heterogeneous models + adaptive fan-out (11a → 11b → 11c → 11d → quality gate → commit)
3. **Phase 12** — Parallel weighted merge + budget-aware parallelism (12a → 12b → 12c → 12d → quality gate → commit)
4. **Final:** Run full quality gate across all changes, then do a quick code review of your own work.
