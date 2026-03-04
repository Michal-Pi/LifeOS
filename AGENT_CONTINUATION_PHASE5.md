# LifeOS Workflow Improvement — Continuation Prompt (Phase 5+)

> **Start here.** Phases 1–4 are complete and committed. Continue with Phase 5.

---

## What Was Already Implemented (Phases 1–4)

### Phase 1: Model Tier System — Domain Types

**Files modified:**

- `packages/agents/src/domain/models.ts` — Added types: `ModelTier = 'thinking' | 'balanced' | 'fast'`, `WorkflowExecutionMode = 'as_designed' | 'cost_saving'`, `WorkflowCriticality = 'critical' | 'core' | 'routine'`. Added fields: `modelTier?: ModelTier` on `AgentConfig`, `executionMode?: WorkflowExecutionMode` and `tierOverride?: ModelTier | null` on `Run`, `criticality?: WorkflowCriticality` on `Workflow`, `configHash?: string` on `AgentConfig`.
- `packages/agents/src/domain/modelSettings.ts` — Added `MODEL_TIER_MAP` (maps tiers → concrete model names per provider), `COST_SAVING_RULES` (maps criticality × tier → effective tier), `resolveEffectiveModel()` (priority: tierOverride > executionMode > agent modelTier > `inferTierFromModel` legacy fallback), `inferTierFromModel()`.
- `packages/agents/src/domain/validation.ts` — Added Zod schemas: `ModelTierSchema`, `WorkflowExecutionModeSchema`, `WorkflowCriticalitySchema`. Added `modelTier`, `configHash` to `AgentConfigSchema`, `criticality` to `WorkflowSchema`, `executionMode`/`tierOverride` to `RunSchema`.
- `packages/agents/src/domain/__tests__/modelTierSystem.test.ts` — 34 tests covering MODEL_TIER_MAP, inferTierFromModel, resolveEffectiveModel (all modes/tiers/overrides/criticalities), COST_SAVING_RULES.

### Phase 2: Model Tier System — Runtime Resolution

**Files modified:**

- `functions/src/agents/langgraph/utils.ts` — Added `executionMode?`, `tierOverride?`, `workflowCriticality?` to `AgentExecutionContext`. In `executeAgentWithEvents()`, calls `resolveEffectiveModel()` and creates `effectiveAgent` with resolved model before passing to provider.
- `functions/src/agents/langgraph/executor.ts` — Added `executionMode`, `tierOverride`, `workflowCriticality` to `LangGraphExecutionConfig`. Threads all 3 fields into every sub-executor call (sequential, parallel, supervisor, graph, dialectical, deep_research, default).
- `functions/src/agents/langgraph/{sequentialGraph,parallelGraph,supervisorGraph,genericGraph,dialecticalGraph,deepResearchGraph}.ts` — Each file: added 3 fields to its config interface, destructured them, threaded into `AgentExecutionContext`.
- `functions/src/agents/workflowExecutor.ts` — Passes `run.executionMode`, `run.tierOverride`, `workflow.criticality` into `LangGraphExecutionConfig`.

### Phase 3: Model Tier System — UI Controls

**Files modified:**

- `apps/web-vite/src/components/agents/RunWorkflowModal.tsx` — Added Execution Mode toggle (As-Designed / Cost-Saving) using existing `.input-mode-toggle` CSS pattern. Added Tier Override `<Select>` dropdown with 4 options (Default, Fast, Balanced, Thinking). State wired to `CreateRunInput`.

### Phase 4: Agent Deduplication on Workflow Creation

**Files modified:**

- `packages/agents/src/domain/models.ts` — Added `hashAgentConfig()` function (deterministic `cfghash_*` strings from systemPrompt + role + toolIds + modelProvider + modelName + temperature + modelTier).
- `packages/agents/src/ports/agentRepository.ts` — Added optional `findByConfigHash?(userId, hash)` to interface.
- `apps/web-vite/src/services/templateInstantiation.ts` — Enhanced `isExactAgentMatch()` with config hash fast path. Enhanced `findMatchingAgent()` to try hash match before name match. Agent creation now includes `configHash`.
- `packages/agents/src/domain/__tests__/hashAgentConfig.test.ts` — 13 tests covering deterministic hashing, different inputs → different hashes, tool order independence, default handling.

---

## Important Patterns & Conventions

1. **Architecture:** Domain-Driven Design. Domain types in `packages/*/src/domain/`, ports in `packages/*/src/ports/`, execution in `functions/src/agents/`.
2. **Naming:** `WorkflowExecutionMode` (not `ExecutionMode` — that's already taken by Expert Council's `'full' | 'quick' | 'single' | 'custom'`).
3. **Backward Compatibility:** All new fields are optional. New functions use defaults (`executionMode='as_designed'`, `workflowCriticality='core'`, `temperature=0.7`, `modelTier='balanced'`).
4. **Model Resolution Pipeline:** `workflowExecutor.ts` → `LangGraphExecutionConfig` → `executor.ts` → graph-specific config → `AgentExecutionContext` → `executeAgentWithEvents()` → `resolveEffectiveModel()` → `executeWithProvider()`.
5. **Tests:** Vitest in `packages/agents/src/domain/__tests__/`. Run with `pnpm --filter @lifeos/agents test`. Root `pnpm test` doesn't exist; use `pnpm turbo test`.
6. **Pre-existing test failures** (not ours): `functions/` tests fail due to Firestore mock issue. `web-vite/` has 7 pre-existing failing test files (GlobalSearch, ResearchPage, noteOutbox). Ignore these.
7. **UI Design System:** Neon/cyberpunk dark/light mode. Use tokens from `tokens.css`. Reuse existing component patterns (`.input-mode-toggle`, Radix Select, etc.).
8. **Zod Validation:** All domain types have corresponding Zod schemas in `validation.ts`.

---

## Quality Gate (Required After Every Phase)

```
1. Code Review     — Read through all changed files for correctness and clarity
2. Architecture    — Verify changes follow existing patterns (ports/adapters, domain models, usecases)
3. Lint            — pnpm lint (must pass with zero errors)
4. TypeCheck       — pnpm typecheck (must pass with zero errors)
5. Test Suite      — Write tests for ALL new/changed logic (unit tests in Vitest)
6. Test Run        — pnpm test (must pass with zero failures, excluding known pre-existing failures)
7. Design System   — Any UI changes must use tokens from tokens.css, reuse existing components
```

---

## Phases To Implement

Implement the following phases in order. Each phase is scoped to ≤20 minutes of coding. Commit after each phase passes the quality gate.

### Phase 5: Prompt Caching — Anthropic

**Goal:** Enable prompt caching for Anthropic system prompts.

**Files to modify:**

- `functions/src/agents/anthropicService.ts` — Add `cache_control: { type: 'ephemeral' }` to system message blocks that exceed 1024 tokens. Track cache hit/miss in telemetry.
- `functions/src/agents/telemetry/` — Add cache hit/miss metrics.

**Tests:** Unit tests verifying cache_control is added to long system prompts and not to short ones.

---

### Phase 6: Context Compression Between Sequential Agents

**Goal:** Compress agent output before passing to the next agent in sequential workflows.

**Files to modify:**

- `functions/src/agents/langgraph/sequentialGraph.ts` — After each agent node, add an optional compression step. Use a fast model (gpt-5-nano or grok-3-mini) to summarize the previous output if it exceeds a token threshold (e.g., 2000 tokens).
- `packages/agents/src/domain/models.ts` — Add `enableContextCompression?: boolean` to `Workflow` config (default: false for critical, true for routine).

**Tests:** Unit tests: compression triggers when output exceeds threshold, skips when under threshold, compressed output is passed to next agent.

---

### Phase 7: Streaming & Real-Time Progress

**Goal:** Add step-level progress indicators and cost accumulation display.

**Files to modify:**

- `functions/src/agents/runEvents.ts` — Emit `step_started`, `step_completed` events with agent name, step index, total steps, cumulative cost.
- `functions/src/agents/langgraph/utils.ts` — Emit progress events from `executeAgentWithEvents()`.
- Web app: run detail/progress component — Subscribe to Firestore onSnapshot for run events. Display "Agent 3/5: Writing draft..." and running cost total.
- Use design system tokens for progress indicator styling.

**Tests:** Unit tests for event emission. Component tests for progress display.

---

### Phase 8: Auto-Evaluation Pipeline

**Goal:** After each run, score output quality using a cheap judge model.

**Files to modify:**

- `functions/src/agents/evaluation.ts` (new) — `evaluateRunOutput(output, goal): { relevance, completeness, accuracy }` using gpt-5-nano. Returns scores 1-5 on each dimension.
- `functions/src/agents/workflowExecutor.ts` — After run completes, call `evaluateRunOutput()` and store scores on the `Run` document.
- `packages/agents/src/domain/models.ts` — Add `evaluationScores?: { relevance: number, completeness: number, accuracy: number }` to `Run`.

**Tests:** Unit tests for evaluation scoring. Integration test for post-run evaluation.

---

### Phases 9–49

Refer to `WORKFLOW_IMPROVEMENT_PLAN.md` § 4 "Phased Implementation Plan" for full details on Phases 9 through 49. The plan document contains:

- **Track B (Phases 9–14):** Sequential early-exit, quality gates, parallel heterogeneous models, weighted merge, supervisor planning/reflection, tool-aware delegation.
- **Track C (Phases 15–17):** Graph human-in-the-loop nodes, loop detection/budget guardrails, checkpoint visualization, template parameterization.
- **Track D (Phases 18–20):** Expert Council domain-specific rubrics, model diversity, dynamic composition, quick mode, caching, disagreement deep-dive.
- **Track E (Phases 21–25):** Deep Research batch source processing, parallel search, source quality scoring, counterclaims, multi-hop, quick mode.
- **Track F (Phases 26–30):** Dialectical best-model-per-lens, multi-cycle deepening, quick mode, concept library, contradiction visualization, research fusion.
- **Track G (Phases 31–34):** New tools — update_todo, memory_recall, generate_chart, code_interpreter, webhook_call.
- **Track H (Phases 35–40):** New agent/workflow templates — analytics, content, productivity, GTM.
- **Track I (Phases 41–48):** Workflow-specific improvements — project planning, content creation, research, productivity, marketing.
- **Track J (Phase 49):** Refinement loops, historical calibration.

**Dependency order:** Track A (1–8) first, then B–G can run in parallel, H after Phase 4, I after H, J after Phase 42.

---

## How To Start

1. Read `WORKFLOW_IMPROVEMENT_PLAN.md` for the full plan context.
2. Read the files listed in Phase 5 to understand the current code.
3. Implement Phase 5 following the quality gate.
4. Commit with format: `feat(agents): <description> (Phase N)`
5. Continue to Phase 6, and so on.

Each phase should be a self-contained commit. Do not batch multiple phases into one commit.
