# LifeOS Workflow Improvement — Continuation Prompt (Phases 21–40)

> **Start here.** Phases 1–20 are complete and committed. Continue with Phase 21.
>
> **Master spec:** Read `WORKFLOW_IMPROVEMENT_PLAN.md` for full context. This prompt gives implementation guidance and file-level instructions. The plan has the detailed rationale, expected outcomes, and priority levels for each improvement.

---

## What Was Already Implemented (Phases 1–20)

### Phases 1–4: Model Tier System + Agent Deduplication

- `ModelTier`, `WorkflowExecutionMode`, `WorkflowCriticality` types
- `MODEL_TIER_MAP`, `COST_SAVING_RULES`, `resolveEffectiveModel()`
- Runtime resolution in all graph executors (sequential, parallel, supervisor, graph, dialectical, deep_research)
- UI controls (execution mode toggle + tier override dropdown) in `RunWorkflowModal.tsx`
- `hashAgentConfig()` — dual 32-bit FNV-1a hash (format: `cfghash_{h1}_{h2}`) + dedup in `templateInstantiation.ts`

### Phase 5: Prompt Caching — Anthropic

- `estimateTokenCount()`, `buildSystemPromptWithCaching()` with `cache_control` for >= 1024 tokens

### Phase 6: Context Compression Between Sequential Agents

- `compressAgentOutput()` in `sequentialGraph.ts` — gpt-4o-mini compresses output > 2000 tokens
- `isCompressionEnabled()` — defaults based on criticality

### Phase 7: Streaming & Real-Time Progress

- `step_started`/`step_completed` events, UI progress indicator in `RunDetailModal.tsx`

### Phase 8: Auto-Evaluation Pipeline

- `evaluateRunOutput()` in `evaluation.ts` — gpt-4o-mini scores relevance/completeness/accuracy 1-5
- Hooked into `runExecutor.ts` at Expert Council and workflow completion paths

### Phase 9: Early-Exit Conditions for Sequential Workflows

- `earlyExitPatterns?: string[]` on `Workflow`, pattern detection in `sequentialGraph.ts`

### Phase 10: Sequential — Quality Gates

- `scoreAgentOutput()`, `NEXT_TIER_UP` mapping, retry with upgraded tier if below threshold

### Phase 11: Parallel — Heterogeneous Models & Adaptive Fan-Out

- Provider rotation, Jaccard consensus, adaptive fan-out if consensus < 0.6

### Phase 12: Parallel — Weighted Merge & Budget-Aware Parallelism

- Budget-aware fan-out, merge strategies: `list`, `ranked`, `consensus`

### Phase 13: Supervisor — Planning Phase & Self-Reflection

- `supervisor_plan` event, self-reflection (SATISFACTORY/UNSATISFACTORY), `enableReflection`

### Phase 14: Supervisor — Tool-Aware Delegation & Budget Allocation

- Worker `toolIds` in supervisor prompt, `maxTokensPerWorker` constraint

### Phase 15: Graph — Human-in-the-Loop Nodes

- `human_approval` node type, `waiting_for_input` status, approval/rejection handling

### Phase 16: Graph — Loop Detection, Budget Guardrails & Error Recovery

- `nodeVisitCounts`, `maxNodeVisits`, `maxBudget` check, `error` edge condition type

### Phase 17: Graph — Checkpoint Visualization & Template Parameterization

- Progress bar in `InteractiveWorkflowGraph.tsx`, `TemplateParameter` type, `resolveTemplateParameters()`

### Phase 18: Expert Council — Domain-Specific Judge Rubrics & Model Diversity

- `detectPromptDomain()`, `JUDGE_RUBRICS`, `enforceProviderDiversity()`, local `TIER_MAP`/`inferTier()`

### Phase 19: Expert Council — Dynamic Composition & Quick Mode

- Quick mode: 2 models + 1 judge, skip chairman on Kendall Tau > 0.8
- `selectDynamicCouncil()` from historical analytics

### Phase 20: Expert Council — Caching & Disagreement Deep-Dive

- `normalizePromptForCache()` + dual-key cache lookup in `expertCouncilUsecases.ts`
- Disagreement deep-dive on Kendall Tau < 0.4 with reasoning follow-up round

---

## Important Patterns & Conventions

### Architecture & Code Organization

1. **Domain-Driven Design.** Domain types in `packages/agents/src/domain/`, execution in `functions/src/agents/`.
2. **Backward Compatibility.** All new fields are optional with sensible defaults.
3. **Model Resolution Pipeline.** `workflowExecutor.ts` → `LangGraphExecutionConfig` → `executor.ts` → graph config → `AgentExecutionContext` → `executeAgentWithEvents()` → `resolveEffectiveModel()` → `executeWithProvider()`.
4. **Zod Validation.** Domain types have Zod schemas in `packages/agents/src/domain/validation.ts`. Add new fields to schemas when modifying domain types.
5. **Event System.** Backend: `RunEventWriter` in `runEvents.ts`, factory functions in `langgraph/events.ts`. Frontend: `useRunEvents.ts` (Firestore onSnapshot).
6. **CSS tokens.** All colors/spacing from `apps/web-vite/src/tokens.css`. Never use raw hex/px.
7. **Cloud Functions safety.** Always `await` async operations. No fire-and-forget promises.

### Testing

8. **Vitest.** Functions tests in `functions/src/agents/__tests__/`. Domain tests in `packages/agents/src/domain/__tests__/`. Run with `pnpm --filter functions test` or `pnpm --filter @lifeos/agents test`.
9. **Pre-existing test failures** (not ours — ignore these):
   - `mailboxAITools.test.ts` — Firestore mock issue (`firestore.settings is not a function`)
   - `graphGuardrails.test.ts` — 2 tests expect `completed` but get `failed`
10. **Mock patterns:**
    - Use `vi.mock()` with factory for module mocking (hoisted automatically)
    - Use `mockReset()` (not `clearAllMocks()`) in `beforeEach`
    - Use call-counter pattern (`setupAgentOutputs()`) for reliable mock ordering
11. **Provider service.** `executeWithProvider()` in `providerService.ts` — unified API. Returns `{ output, tokensUsed, estimatedCost, iterationsUsed, provider, model }`.
12. **ToolRegistry.** `Map<string, ToolDefinition>` in `toolExecutor.ts`. Tools have `toolId`, `name`, `description`, `parameters` (JSON Schema), `execute` function. Agents reference via `toolIds?: ToolId[]`.

### Critical Cross-Package Patterns

13. **Cross-package imports (CRITICAL).** Type imports from `@lifeos/agents` work in `functions/`. **Value/function imports can fail at runtime in vitest.** If you need a function or constant from `@lifeos/agents` in `functions/src/agents/`, **inline it** rather than importing. This pattern was used for `TIER_MAP` and `inferTier()` in `expertCouncil.ts`.

14. **Vendored package pattern (CRITICAL).** `@lifeos/agents` resolves via symlink: `functions/node_modules/@lifeos/agents → ../../vendor/lifeos-agents` (NOT to `packages/agents/`). After ANY changes to `packages/agents/src/`:

    ```bash
    # 1. Rebuild the package
    pnpm --filter @lifeos/agents build
    # 2. Copy dist to vendor (REQUIRED for tests to see changes)
    cp packages/agents/dist/index.js functions/vendor/lifeos-agents/dist/index.js
    cp packages/agents/dist/index.d.ts functions/vendor/lifeos-agents/dist/index.d.ts
    # 3. Run tests with --no-cache to avoid stale modules
    pnpm --filter functions test -- --run --no-cache <test-file>
    ```

    **If you skip step 2, your changes to `packages/agents/` will NOT be visible in `functions/` tests.**

15. **Branded types.** `RunId` is `Id<'run'>` requiring format `run:${string}`. Use `as RunId` cast.

16. **Pre-commit hooks.** Run prettier (full codebase) and turbo lint. After hook-triggered formatting, re-stage files before re-committing.

### Existing Code Structure (Key Files)

17. **Deep Research files:**
    - `functions/src/agents/langgraph/deepResearchGraph.ts` (~1305 lines) — 10-node pipeline: sense_making → search_and_ingest → claim_extraction → thesis_generation → cross_negation → contradiction → sublation → dialectical_meta → gap_analysis → answer_generation. Outer loop (gap→search) + inner loop (meta→thesis).
    - `functions/src/agents/deepResearch/claimExtraction.ts` (~350 lines) — `extractClaimsFromSource()` per-source extraction
    - `functions/src/agents/deepResearch/sourceIngestion.ts` (~400 lines) — `executeSearchPlan()` (runs SERP/Scholar/Semantic), `ingestSources()`
    - `functions/src/agents/deepResearch/budgetController.ts` (~300 lines) — `createRunBudget()`, `recordSpend()`, `canAffordOperation()`, `estimateLLMCost()`, `shouldContinueGapLoop()`
    - `functions/src/agents/deepResearch/gapAnalysis.ts` (~300 lines) — `analyzeKnowledgeGaps()`
    - `functions/src/agents/deepResearch/answerGeneration.ts` (~250 lines) — `generateAnswer()`
    - `functions/src/agents/langgraph/stateAnnotations.ts` (~495 lines) — `DeepResearchStateAnnotation`, `DialecticalStateAnnotation`

18. **Deep Research domain types** (`packages/agents/src/domain/deepResearchWorkflow.ts`, ~266 lines):
    - `RunBudget` — maxBudgetUsd, spentUsd, phase (`full`/`reduced`/`minimal`/`exhausted`), gapIterationsUsed
    - `SourceRecord` — sourceId, url, title, relevanceScore, sourceType
    - `ExtractedClaim` — claimText, confidence, evidenceType, sourceId, sourceQuote, concepts[]
    - `SearchPlan` — serpQueries[], scholarQueries[], semanticQueries[]
    - `GapAnalysisResult` — gaps[], overallCoverageScore, shouldContinue, newSearchPlan?
    - `DeepResearchAnswer` — directAnswer, supportingClaims[], counterclaims[], citations[]

19. **Dialectical files:**
    - `functions/src/agents/langgraph/dialecticalGraph.ts` (~1200+ lines) — 6-phase cycle: retrieve_context → thesis_generation → cross_negation → contradiction_crystallization → sublation → meta_reflection. Convergence via velocity/density metrics. Optional KG with retrieval templates.
    - `packages/agents/src/domain/dialectical.ts` (~600+ lines) — Claim, Mechanism, Contradiction, Episode types. ThesisLens = economic/systems/adversarial/behavioral/historical/technical/political/ecological/custom. ContradictionTrackerType = LOGIC/PRAGMATIC/SEMANTIC/BOUNDARY. Severity = HIGH/MEDIUM/LOW.

20. **Tool system:**
    - `packages/agents/src/domain/aiTools.ts` (~359 lines) — AI tool configs (summarize, factCheck, linkedIn, writeWithAI, tagWithAI, suggestNoteTags). NOTE: These are UI/note tools, not the agent execution tools.
    - `functions/src/agents/toolExecutor.ts` (~700+ lines) — `ToolRegistry`, `registerTool()`, `getAgentTools()`, `getAgentToolsFromRegistry()`. Built-in search tools: `serp_search`, `search_scholar`, `semantic_search`, `read_url`, `scrape_url`, `parse_pdf` plus advanced/custom tools.

21. **Template presets:**
    - `apps/web-vite/src/agents/templatePresets.ts` (~47k+ lines) — `agentTemplatePresets` (agent templates) and workflow template presets. Each has `name`, `description`, `agentConfig`/`workflowConfig`, optional `parameters` for `{{variable}}` placeholders.

---

## Quality Gate (Run After Each Phase)

```bash
# 1. If you modified packages/agents/src/, rebuild and copy to vendor
pnpm --filter @lifeos/agents build && \
  cp packages/agents/dist/index.js functions/vendor/lifeos-agents/dist/index.js && \
  cp packages/agents/dist/index.d.ts functions/vendor/lifeos-agents/dist/index.d.ts

# 2. Lint
pnpm --filter functions lint

# 3. Typecheck both packages
pnpm --filter functions typecheck && pnpm --filter @lifeos/agents typecheck

# 4. Tests (ignore pre-existing mailboxAITools + graphGuardrails failures)
pnpm --filter functions test -- --run --no-cache && pnpm --filter @lifeos/agents test -- --run --no-cache

# 5. Web app typecheck (for UI changes only)
pnpm --filter web-vite typecheck
```

Commit each phase separately with format: `feat(agents): <description> (Phase N)`

---

## TRACK E: Deep Research (Phases 21–25)

### Phase 21: Deep Research — Batch Source Processing

**Goal:** Process 3-5 sources in a single LLM call instead of one per source. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 21 for rationale.

**Files to modify:**

**`functions/src/agents/deepResearch/claimExtraction.ts`** — Add new function:

```typescript
export async function extractClaimsFromSourceBatch(
  sources: SourceRecord[],
  contentMap: Record<string, string>,
  query: string,
  executeProvider: ProviderExecuteFn,
  budget: RunBudget,
  batchSize: number = 3
): Promise<{ claims: ExtractedClaim[]; updatedBudget: RunBudget }>
```

Implementation:

1. Group sources into batches of `batchSize`
2. For each batch, concatenate source content with clear delimiters (`--- SOURCE N [sourceId] ---`)
3. Truncate each source to 3000 chars
4. Single LLM call per batch with structured JSON output prompt
5. Parse per-source claims from response, map `sourceIndex` (1-indexed) back to correct `SourceRecord`
6. Budget check before each batch — skip remaining if insufficient
7. Keep existing `extractClaimsFromSource()` for backward compatibility

Add helpers: `buildBatchExtractionPrompt()` and `parseBatchExtractionOutput()`.

**`functions/src/agents/langgraph/deepResearchGraph.ts`** — In `createClaimExtractionNode` (around line 551), replace the per-source loop with `extractClaimsFromSourceBatch()`. Import from `../deepResearch/claimExtraction.js`.

**Tests:** `functions/src/agents/__tests__/batchClaimExtraction.test.ts`

1. Batching groups sources correctly (7 sources, batch 3 → 3 batches)
2. Single LLM call per batch (not per source)
3. Claims correctly attributed to individual sources
4. Handles fewer sources than batch size
5. Skips sources with no content in contentMap
6. Budget check stops processing when insufficient
7. Parse failure returns empty array (graceful)
8. Content truncated per source (3000 chars)

---

### Phase 22: Deep Research — Parallel Search & Smart Source Prioritization

**Goal:** Execute all search types simultaneously. Rank sources before ingesting. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 22.

**Files to modify:**

**`functions/src/agents/deepResearch/sourceIngestion.ts`** — In `executeSearchPlan()`:

1. Change sequential search calls to `Promise.all()` for SERP, Scholar, and Semantic searches
2. After search results return, add source deduplication by URL
3. Add a fast-model ranking step: score each source 1-5 for likely relevance using a cheap LLM (gpt-4o-mini or equivalent fast model). Sort by score descending before ingestion.

Add utility:

```typescript
export async function rankSourcesByRelevance(
  sources: SourceRecord[],
  query: string,
  executeProvider: ProviderExecuteFn
): Promise<SourceRecord[]>
```

**`functions/src/agents/deepResearch/sourceIngestion.ts`** — Add deduplication:

```typescript
function deduplicateSources(sources: SourceRecord[]): SourceRecord[]
// Merge by URL, keep highest relevanceScore
```

**Tests:** `functions/src/agents/__tests__/sourceRanking.test.ts`

1. All searches execute in parallel (verify Promise.all behavior via timing or mock call order)
2. Source ranking orders sources by relevance score
3. Duplicate URLs are merged (highest score kept)
4. Ranking handles empty results gracefully
5. Budget check applied to ranking LLM call

---

### Phase 23: Deep Research — Source Quality Scoring & Counterclaim Strengthening

**Goal:** Weight claims by source quality. Add adversarial counterclaim agent step. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 23.

**Files to modify:**

**`packages/agents/src/domain/deepResearchWorkflow.ts`** — Add to `SourceRecord`:

```typescript
sourceQualityScore?: number  // 0-1, computed from domain authority + date + citations
```

Add types:

```typescript
interface CounterclaimResult {
  originalClaimId: string
  counterargument: string
  strength: 'strong' | 'moderate' | 'weak'
  evidenceBasis: string
}
```

**`functions/src/agents/deepResearch/claimExtraction.ts`** (or new file `sourceQuality.ts`) — Add:

```typescript
export function computeSourceQualityScore(source: SourceRecord): number
// Factors: domain authority (curated list of high-authority domains scores higher),
// publication date recency (newer = higher for non-academic), citation count if available
```

Apply quality scores to extracted claims — multiply claim `confidence` by `sourceQualityScore`.

**`functions/src/agents/langgraph/deepResearchGraph.ts`** — Add new `counterclaim_search` node between `gap_analysis` and `answer_generation`:

- Use a thinking-tier model (Claude Sonnet or similar) as adversarial agent
- Input: top claims from KG
- Output: strongest counterarguments for each main claim
- Store as `CounterclaimResult[]` in state
- Wire into `answer_generation` prompt so final answer includes counterclaims

**`functions/src/agents/langgraph/stateAnnotations.ts`** — Add `counterclaims: CounterclaimResult[]` to `DeepResearchStateAnnotation`.

**Tests:** `functions/src/agents/__tests__/sourceQuality.test.ts`

1. High-authority domains get higher quality scores
2. Recent sources score higher than old ones
3. Quality score affects claim confidence
4. Counterclaim agent produces adversarial arguments
5. Answer generation incorporates counterclaims section

---

### Phase 24: Deep Research — Multi-Hop Search & Incremental KG

**Goal:** Fill gaps with follow-up searches. Reuse KG for iterative research. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 24.

**Files to modify:**

**`functions/src/agents/langgraph/deepResearchGraph.ts`** — In `gap_analysis` node:

1. When `gapAnalysis.shouldContinue === true` and gaps have high priority, generate targeted follow-up queries
2. Loop back to `search_and_ingest` with refined queries (the outer loop already exists — enhance the gap→search transition to use targeted queries rather than the original search plan)
3. Respect `maxRecursiveDepth` in `RunBudget` (already exists)

**Incremental KG** — In `createDeepResearchGraph()` setup:

1. Accept optional `existingKGSessionId` in config
2. If provided, load existing KG from Firestore before `sense_making`
3. Extend rather than rebuild — add new claims/mechanisms/contradictions
4. Store updated KG snapshot

**`functions/src/agents/deepResearch/budgetController.ts`** — Ensure `shouldContinueGapLoop()` considers multi-hop budget allocation (reserve some budget for follow-up searches).

**Tests:** `functions/src/agents/__tests__/multiHopSearch.test.ts`

1. Multi-hop triggers on identified high-priority gaps
2. Follow-up queries are more targeted than original
3. Respects max recursive depth
4. Budget limits stop multi-hop when exhausted
5. Incremental KG loads existing graph
6. Incremental KG extends with new claims (doesn't overwrite)

---

### Phase 25: Deep Research — Quick Research Mode

**Goal:** Lightweight mode skipping KG and gap analysis. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 25.

**Files to modify:**

**`packages/agents/src/domain/deepResearchWorkflow.ts`** — Add to config type:

```typescript
mode?: 'full' | 'quick'  // Default: 'full'
```

Add to Zod schema in `validation.ts`.

**`functions/src/agents/langgraph/deepResearchGraph.ts`** — When `mode === 'quick'`:

- Pipeline becomes: `sense_making` → `search_and_ingest` → `answer_generation`
- Skip: `claim_extraction`, `thesis_generation`, `cross_negation`, `contradiction`, `sublation`, `dialectical_meta`, `gap_analysis`, `counterclaim_search`
- Use conditional edges based on mode to route directly from search to answer

**Implementation approach:** In `createDeepResearchGraph()`, add conditional routing after `search_and_ingest`:

```typescript
// After search_and_ingest:
if (state.config.mode === 'quick') → answer_generation
else → claim_extraction (existing full pipeline)
```

**Tests:** `functions/src/agents/__tests__/quickResearch.test.ts`

1. Quick mode skips claim extraction, KG, gap analysis, dialectical phases
2. Quick mode still runs sense_making → search → answer_generation
3. Full mode runs all steps (unchanged)
4. Quick mode produces valid DeepResearchAnswer
5. Quick mode uses fewer LLM calls than full mode

---

## TRACK F: Dialectical Workflow (Phases 26–30)

### Phase 26: Dialectical — Best-Model-Per-Lens

**Goal:** Each thesis lens uses the model best at that reasoning type. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 26.

**Files to modify:**

**`packages/agents/src/domain/dialectical.ts`** — Add lens-to-model mapping:

```typescript
export const LENS_MODEL_PRESETS: Record<ThesisLens, { provider: string; modelName: string }> = {
  adversarial: { provider: 'anthropic', modelName: 'claude-sonnet-4-5' },
  systems: { provider: 'anthropic', modelName: 'claude-sonnet-4-5' },
  economic: { provider: 'openai', modelName: 'o1' },
  technical: { provider: 'openai', modelName: 'o1' },
  behavioral: { provider: 'google', modelName: 'gemini-2.5-pro' },
  historical: { provider: 'google', modelName: 'gemini-2.5-pro' },
  political: { provider: 'xai', modelName: 'grok-4' },
  ecological: { provider: 'xai', modelName: 'grok-4' },
  custom: { provider: 'openai', modelName: 'gpt-5.2' },
}
```

**IMPORTANT (Convention #13):** Since this is a domain type in `packages/agents/`, and `dialecticalGraph.ts` in `functions/` needs to use it at runtime, consider whether this import will work. If it's a plain constant export (no class instances or complex functions), it should work via the vendored copy. If not, inline the mapping in `dialecticalGraph.ts`.

**`functions/src/agents/langgraph/dialecticalGraph.ts`** — In the thesis generation node, when assigning a model to each thesis agent:

1. Look up the lens from the agent config
2. Use `LENS_MODEL_PRESETS[lens]` as the base model
3. Still allow `resolveEffectiveModel()` overrides on top (tierOverride > executionMode > lens preset)

**Tests:** `functions/src/agents/__tests__/dialecticalLensModels.test.ts`

1. Each lens resolves to its preset model
2. Tier override still works on top of lens preset
3. Custom lens uses default model
4. All 9 lens types have valid model presets

---

### Phase 27: Dialectical — Multi-Cycle Progressive Deepening

**Goal:** Progressive narrowing: Cycle 1 broad → Cycle 2 HIGH contradictions → Cycle 3 single tension. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 27.

**Files to modify:**

**`packages/agents/src/domain/dialectical.ts`** — Add:

```typescript
contradictionSeverityFilter?: 'all' | 'high' | 'critical'
```

to the cycle config type.

**`functions/src/agents/langgraph/dialecticalGraph.ts`** — In `meta_reflection` node:

1. **Cycle 1:** Use all configured lenses, severity filter = `all`
2. **Cycle 2:** Filter to only HIGH-severity contradictions. Reduce active lenses to those that produced HIGH contradictions.
3. **Cycle 3 (if needed):** Focus on single highest-severity unresolved tension. 1 lens only.
4. Implement by tracking cycle number in state and applying progressive filters.

**`functions/src/agents/metaReflection.ts`** (if exists, otherwise in `dialecticalGraph.ts`) — Update continuation logic to pass severity filter to next cycle.

**Tests:** `functions/src/agents/__tests__/dialecticalDeepening.test.ts`

1. Cycle 1 uses all lenses, no severity filter
2. Cycle 2 filters to HIGH severity contradictions only
3. Cycle 3 focuses on single highest-severity tension
4. Terminates when all tensions resolved or max cycles reached
5. Progressive deepening reduces active lens count

---

### Phase 28: Dialectical — Quick Dialectic Mode

**Goal:** Lightweight 2-lens, 1-cycle mode for everyday decisions. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 28.

**Files to modify:**

**`packages/agents/src/domain/dialectical.ts`** — Add `'quick'` to mode options. Quick config: 2 lenses (default: adversarial + economic), 1 cycle max, no KG construction.

**`functions/src/agents/langgraph/dialecticalGraph.ts`** — When mode is `quick`:

- Use only 2 lenses (first 2 from config, or defaults)
- Skip `retrieve_context` (no KG retrieval)
- Skip KG-related operations (no claim/mechanism storage)
- Force `maxCycles = 1`
- After sublation, go directly to output (skip meta_reflection loop-back)

**Tests:** `functions/src/agents/__tests__/quickDialectic.test.ts`

1. Quick mode uses only 2 lenses
2. Quick mode skips KG retrieval and construction
3. Quick mode limits to 1 cycle
4. Full mode remains unchanged
5. Quick mode produces valid synthesis output

---

### Phase 29: Dialectical — Reusable Concept Library

**Goal:** Store versioned concepts from past runs, reuse in new runs. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 29.

**Files to modify:**

**`packages/agents/src/domain/dialectical.ts`** — Add concept versioning type:

```typescript
interface StoredConcept {
  conceptId: string
  name: string
  definition: string
  version: number
  sourceRunId: string
  tags: string[]
  createdAt: number
  updatedAt: number
}
```

**`packages/agents/src/ports/`** — Add `conceptRepository.ts`:

```typescript
interface ConceptRepository {
  findByTags(userId: string, tags: string[]): Promise<StoredConcept[]>
  upsertConcept(userId: string, concept: StoredConcept): Promise<void>
  getConcepts(userId: string, conceptIds: string[]): Promise<StoredConcept[]>
}
```

**`functions/src/agents/langgraph/dialecticalGraph.ts`** — Two integration points:

1. **Start of run:** In `retrieve_context` (or before thesis_generation), query concept library for related concepts by topic tags. Inject as context for thesis generators.
2. **After synthesis:** Extract new/updated concepts from the synthesis output. Store in concept library with version increment.

**Implementation note:** The concept repository can be implemented as a Firestore collection `users/{userId}/concepts/{conceptId}`. Keep it simple — keyword-based tag matching is sufficient (no embeddings needed).

**Tests:** `functions/src/agents/__tests__/conceptLibrary.test.ts`

1. Concepts are stored after synthesis
2. Related concepts are retrieved by tags
3. Concept versioning increments on update
4. New concepts get version 1
5. Retrieved concepts are injected into thesis context

---

### Phase 30: Dialectical — Visual Contradiction Map & Deep Research Fusion

**Goal:** Enhanced contradiction visualization. Allow theses to trigger research sub-runs. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 30.

**Files to modify:**

**`apps/web-vite/src/components/agents/`** — Enhance `DialecticalCycleVisualization` (find the correct component):

1. Color-code contradictions by severity (HIGH=red, MEDIUM=yellow, LOW=green — use CSS tokens)
2. Show thesis relationships as edges
3. Show concept evolution across cycles
4. Show sublation resolution paths

**`functions/src/agents/langgraph/dialecticalGraph.ts`** — Deep Research fusion:

1. In thesis generation, allow agents to emit a `NEEDS_EVIDENCE` signal in their output
2. If detected, launch a **quick deep research sub-run** (from Phase 25) to gather evidence
3. Feed research results back into the thesis before continuing to cross-negation
4. This is opt-in: add `enableResearchFusion?: boolean` to dialectical config

**Tests:**

- Component tests for visualization (if feasible — otherwise visual inspection)
- `functions/src/agents/__tests__/dialecticalResearchFusion.test.ts`:
  1. NEEDS_EVIDENCE signal triggers quick research sub-run
  2. Research results feed back into thesis
  3. No sub-run when signal not present
  4. Research fusion respects budget

---

## TRACK G: New Tools (Phases 31–34)

### Phase 31: `update_todo` Tool

**Goal:** Allow agents to update/complete existing todos. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 31.

**Files to modify:**

**`packages/agents/src/domain/aiTools.ts`** — Add tool definitions:

```typescript
// Add to tool IDs / definitions
'update_todo': {
  name: 'update_todo',
  description: 'Update an existing todo item',
  parameters: {
    type: 'object',
    properties: {
      todoId: { type: 'string', description: 'ID of the todo to update' },
      updates: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          dueDate: { type: 'string', description: 'ISO date string' }
        }
      }
    },
    required: ['todoId', 'updates']
  }
}

'delete_todo': { /* similar structure, just todoId required */ }
```

**`functions/src/agents/toolExecutor.ts`** — Register new tools:

1. `update_todo`: Validate todo exists in Firestore, apply updates, return confirmation
2. `delete_todo`: Validate todo exists, delete, return confirmation

**Implementation:** Look at how existing tools like `create_todo` or `list_todos` are implemented in the tool executor. Follow the same Firestore access patterns.

**Tests:** `functions/src/agents/__tests__/todoTools.test.ts`

1. Update changes fields correctly
2. Update handles non-existent todo (returns error, doesn't crash)
3. Delete removes todo
4. Partial update (only status) works

---

### Phase 32: `memory_recall` Tool

**Goal:** Search past conversations and run outputs. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 32.

**Files to modify:**

**`packages/agents/src/domain/aiTools.ts`** — Add `memory_recall` tool definition:

- Parameters: `query` (string), optional `timeRange` (object with `from`/`to` ISO dates), optional `runType` (string)
- Returns: Array of matching past run outputs with timestamps and context

**`functions/src/agents/toolExecutor.ts`** — Implement:

1. Query Firestore `runs` collection for the user
2. Text search on `output` and `goal` fields (use Firestore compound queries or client-side filtering)
3. Filter by `timeRange` if provided
4. Filter by workflow type if `runType` provided
5. Return top 5 matches with: `runId`, `goal`, `output` (truncated to 500 chars), `completedAt`, `workflowType`

**Tests:** `functions/src/agents/__tests__/memoryRecallTool.test.ts`

1. Query returns relevant results matching search term
2. Respects time range filter
3. Respects runType filter
4. Returns top 5 results max
5. Handles empty results gracefully
6. Truncates long outputs

---

### Phase 33: `generate_chart` Tool

**Goal:** Generate charts as PNG/base64 images. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 33.

**Files to modify:**

**`packages/agents/src/domain/aiTools.ts`** — Add `generate_chart` tool definition:

- Parameters: `chartType` (bar/line/pie/scatter), `data` (array of `{label, value}` or `{x, y}`), `title` (string), optional `options` (colors, dimensions)
- Returns: base64 PNG string

**`functions/src/agents/toolExecutor.ts`** — Implement using QuickChart.io API:

1. Build chart config object from parameters
2. Call QuickChart.io API endpoint to render chart
3. Convert response to base64 PNG
4. Return base64 string (can be inserted into TipTap via existing `Image` extension with `allowBase64: true`)

**Alternative implementation:** If you prefer no external dependency, use a simple SVG-based approach:

- Generate SVG chart server-side (bar/line/pie are simple geometries)
- Convert to base64 data URI
- This avoids the QuickChart.io API dependency

**Tests:** `functions/src/agents/__tests__/chartTool.test.ts`

1. Bar chart generates valid base64 PNG (mock the API call)
2. Line chart generates valid output
3. Pie chart generates valid output
4. Validates data format (rejects malformed data)
5. Handles missing optional fields with defaults

---

### Phase 34: `code_interpreter` & `webhook_call` Tools

**Goal:** Execute code for data analysis. Make authenticated HTTP calls. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 34.

**Files to modify:**

**`packages/agents/src/domain/aiTools.ts`** — Add tool definitions:

`code_interpreter`:

- Parameters: `language` (python/javascript), `code` (string)
- Returns: `{ stdout: string, result: any, error?: string }`

`webhook_call`:

- Parameters: `url` (string), `method` (GET/POST/PUT/DELETE), optional `headers` (object), optional `body` (string/object)
- Returns: `{ statusCode: number, body: string, headers: object }`

**`functions/src/agents/toolExecutor.ts`** — Implement:

`code_interpreter`:

- **For JavaScript:** Use `vm.runInNewContext()` with timeout (5 seconds) and limited globals
- **For Python:** Skip for now (requires sandboxed environment). Return error message suggesting JavaScript.
- Capture stdout via custom console override
- **Security:** Run in isolated context, no filesystem/network access, enforce timeout

`webhook_call`:

- Validate URL against user's pre-configured allowed domains (store in user settings)
- Use `fetch()` to execute HTTP request
- **Security:** MUST validate against allowed domains list. Reject URLs not in the list.
- Return response with status code, body (truncated to 10KB), and headers

**Tests:** `functions/src/agents/__tests__/codeInterpreterTool.test.ts`

1. JavaScript execution returns correct output
2. Timeout is enforced (infinite loop terminates)
3. No filesystem access (attempt to read file fails)
4. stdout is captured correctly

`functions/src/agents/__tests__/webhookTool.test.ts` 5. Webhook validates allowed domains 6. Rejects disallowed URLs 7. Successful GET returns response 8. Successful POST sends body

---

## TRACK H: New Agent & Workflow Templates (Phases 35–40)

> **Important:** Template phases are primarily about adding entries to `apps/web-vite/src/agents/templatePresets.ts`. Study existing templates in that file to match the exact format. Each template needs: `name`, `description`, `agentConfig` (for agent templates) or `workflowConfig` (for workflow templates), model assignments, tool references, and system prompts.

### Phase 35: Analysis Planner & Executive Summary Writer Agent Templates

**Goal:** New agent templates for structured analytics and MAIN-framework summaries. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 35.

**`apps/web-vite/src/agents/templatePresets.ts`** — Add to `agentTemplatePresets`:

**Analysis Planner:**

- Name: `"Analysis Planner"`
- Role: `planner`
- System prompt: Structured hypothesis generation methodology. "You are an analysis planner. Given a question or goal, you: 1) Define the core question precisely, 2) Generate 2-3 testable hypotheses, 3) Identify data requirements for each hypothesis, 4) Suggest visualization plans for results."
- Tools: `query_firestore`, `calculate`
- Model: `gpt-5-mini` (fast tier)

**Executive Summary Writer:**

- Name: `"Executive Summary Writer"`
- Role: `synthesizer`
- System prompt: MAIN framework (Motive, Answer, Impact, Next steps). "You produce executive summaries using the MAIN framework: Motive (why this matters), Answer (the key finding), Impact (what changes), Next steps (concrete actions). Keep summaries under 500 words."
- Model: `gpt-5-mini` (fast tier)

**Tests:** `packages/agents/src/domain/__tests__/templatePresets.test.ts` (or `functions/src/agents/__tests__/templatePresets.test.ts`)

1. Analysis Planner template creates valid agent config
2. Executive Summary Writer template has MAIN framework in system prompt
3. Both templates have correct tool references

---

### Phase 36: Goal Decomposition Coach & Network Segmentation Agent Templates

**Goal:** KPI tree decomposition and contact segmentation agents. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 36.

**`apps/web-vite/src/agents/templatePresets.ts`** — Add:

**Goal Decomposition Coach:**

- Name: `"Goal Decomposition Coach"`
- Role: `custom`
- System prompt: MECE decomposition methodology. "You decompose goals into hierarchical KPI trees using MECE (Mutually Exclusive, Collectively Exhaustive) principles. Break down any goal into measurable sub-goals, identify leading/lagging indicators, and suggest tracking methods."
- Tools: `query_firestore`, `list_todos`, `list_calendar_events`
- Model: `claude-sonnet-4-5` (balanced tier)

**Network Segmentation:**

- Name: `"Network Segmentation Expert"`
- Role: `custom`
- System prompt: Behavioral/demographic/value segmentation. "You analyze the user's contacts and interactions to segment their network into actionable categories: high-energy givers, dormant connections, new opportunities, mentors, and collaborators."
- Tools: contact and calendar query tools (whatever exists)
- Model: `claude-sonnet-4-5` (balanced tier)

**Tests:** Similar to Phase 35 — validate templates create valid configs with correct tools.

---

### Phase 37: Analytics Orchestrator Workflow Template

**Goal:** Meta-orchestrator supervisor workflow. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 37.

**`apps/web-vite/src/agents/templatePresets.ts`** — Add workflow template:

**LifeOS Analytics Orchestrator:**

- Type: `supervisor`
- Supervisor agent: Routes user to right analytics workflow based on intent
- Supervisor model: `gpt-5-mini` (fast — routing only)
- Workers: Analysis Planner (from Phase 35), Goal Decomposition Coach (from Phase 36), any existing data analyst agents
- System prompt for supervisor: "You are the LifeOS Analytics Orchestrator. Based on the user's question, route to the appropriate analytics agent: use Analysis Planner for hypothesis-driven analysis, Goal Decomposition Coach for breaking down goals, or Data Analyst for direct data queries."

**Tests:** `functions/src/agents/__tests__/analyticsOrchestrator.test.ts`

1. Orchestrator template creates valid supervisor workflow config
2. All referenced worker agents exist in presets
3. Routing logic covers common analytics intents

---

### Phase 38: Personal Analytics Pipeline Workflow Template

**Goal:** End-to-end analytics pipeline. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 38.

**`apps/web-vite/src/agents/templatePresets.ts`** — Add workflow template:

**Personal Analytics Pipeline:**

- Type: `sequential`
- Steps: Analysis Planner → Personal Data Analyst → Results Collector → Executive Summary Writer
- Models: Planner `gpt-5-mini`, Analyst `gemini-3-flash`, Collector `gpt-5-mini`, Summary `claude-haiku-4-5`
- `enableContextCompression: true` (from Phase 6)
- Parameters: `{{question}}` — the analytics question to answer

**Tests:**

1. Template creates valid sequential workflow
2. Agent order is correct (4 agents in sequence)
3. Context compression is enabled by default
4. Template parameter `{{question}}` is defined

---

### Phase 39: Content Pipeline & LinkedIn Content Factory Workflow Templates

**Goal:** One-click content creation workflows. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 39.

**`apps/web-vite/src/agents/templatePresets.ts`** — Add two workflow templates:

**Content Pipeline:**

- Type: `sequential`
- Steps: Content Strategist → Content Research Analyst → Thought Leadership Writer → Content Polish Editor → SEO Specialist
- Models: Strategist `gpt-5-mini`, Research `gemini-3-flash`, Writer `claude-sonnet-4-5`, Editor `claude-haiku-4-5`, SEO `gpt-5-mini`
- Parameters: `{{topic}}`, `{{audience}}`, `{{format}}`

**LinkedIn Content Factory:**

- Type: `sequential`
- Steps: Topic Research → Competitor Analysis → Draft Writer → LinkedIn Critic → Final Polish
- Models: Research `gpt-5-mini` + serp_search, Competitor `gemini-3-flash` + serp_search, Writer `claude-sonnet-4-5`, Critic `gpt-5-mini`, Polish `claude-haiku-4-5`
- Parameters: `{{topic}}`, `{{industry}}`

**Agent templates needed:** If any of the above agents don't already exist in `agentTemplatePresets`, add them. Each needs a focused system prompt for its role.

**Tests:**

1. Content Pipeline template creates valid 5-step sequential workflow
2. LinkedIn Factory template creates valid 5-step sequential workflow
3. Model assignments match spec
4. Template parameters are defined

---

### Phase 40: Productivity & GTM Workflow Templates

**Goal:** Morning Brief, Weekly Review, Go-to-Market Pipeline. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 40.

**`apps/web-vite/src/agents/templatePresets.ts`** — Add three workflow templates:

**Morning Brief:**

- Type: `sequential`
- Steps: Calendar Check → Meeting Summary → Todo Review → Priority Suggestions
- All agents on `gpt-5-mini` (fast — cost-sensitive daily run)
- Tools: `list_calendar_events`, `list_todos`
- System prompts should be short and action-oriented (morning briefing style)

**Weekly Review:**

- Type: `sequential`
- Steps: Habit Analysis → Notes Summary → Project Progress → Reflection Prompts
- Model: `gpt-5-mini`
- Tools: `query_firestore`, `list_todos`, `list_calendar_events`
- System prompts focus on reflection and pattern identification

**Go-to-Market Pipeline:**

- Type: `sequential`
- Steps: Offer Coach → Marketing Coach → Content Strategy → Sales Coach
- Models: per `WORKFLOW_IMPROVEMENT_PLAN.md` Section 3.12 recommendations
- Parameters: `{{business}}`, `{{product}}`, `{{targetAudience}}`

**Agent templates needed:** Add any new agent templates (Morning Brief agents, Weekly Review agents, coaching agents) to `agentTemplatePresets`.

**Tests:**

1. Morning Brief template creates valid 4-step sequential workflow
2. Weekly Review template creates valid 4-step sequential workflow
3. GTM Pipeline template creates valid 4-step sequential workflow
4. All templates use cost-appropriate model tiers
5. Tool references are valid

---

## Key Files Reference

| File                                                    | Purpose                                                         |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| `packages/agents/src/domain/models.ts`                  | Domain types (Workflow, Run, AgentConfig, ExpertCouncilConfig)  |
| `packages/agents/src/domain/validation.ts`              | Zod schemas (sync with models.ts)                               |
| `packages/agents/src/domain/dialectical.ts`             | Dialectical types (Claim, Mechanism, Contradiction, ThesisLens) |
| `packages/agents/src/domain/deepResearchWorkflow.ts`    | Deep Research types (RunBudget, SourceRecord, ExtractedClaim)   |
| `packages/agents/src/domain/aiTools.ts`                 | AI tool definitions (add new tools here)                        |
| `packages/agents/src/ports/`                            | Repository interfaces (add conceptRepository here)              |
| `functions/src/agents/langgraph/deepResearchGraph.ts`   | Deep Research pipeline (10 nodes, 2 loops)                      |
| `functions/src/agents/langgraph/dialecticalGraph.ts`    | Dialectical pipeline (6-phase cycle)                            |
| `functions/src/agents/langgraph/stateAnnotations.ts`    | LangGraph state shapes                                          |
| `functions/src/agents/deepResearch/claimExtraction.ts`  | Claim extraction (add batch function)                           |
| `functions/src/agents/deepResearch/sourceIngestion.ts`  | Search execution + ingestion                                    |
| `functions/src/agents/deepResearch/budgetController.ts` | Budget tracking                                                 |
| `functions/src/agents/deepResearch/gapAnalysis.ts`      | Knowledge gap detection                                         |
| `functions/src/agents/deepResearch/answerGeneration.ts` | Final answer synthesis                                          |
| `functions/src/agents/toolExecutor.ts`                  | Tool registration & execution                                   |
| `functions/src/agents/providerService.ts`               | `executeWithProvider()` unified API                             |
| `apps/web-vite/src/agents/templatePresets.ts`           | Agent & workflow template definitions                           |
| `apps/web-vite/src/tokens.css`                          | CSS design tokens                                               |

---

## Execution Order

Execute phases sequentially within each track. All phases within a track depend on the previous one.

1. **Phase 21** — Deep Research: Batch Source Processing → quality gate → commit
2. **Phase 22** — Deep Research: Parallel Search & Source Prioritization → quality gate → commit
3. **Phase 23** — Deep Research: Source Quality Scoring & Counterclaims → quality gate → commit
4. **Phase 24** — Deep Research: Multi-Hop Search & Incremental KG → quality gate → commit
5. **Phase 25** — Deep Research: Quick Research Mode → quality gate → commit
6. **Phase 26** — Dialectical: Best-Model-Per-Lens → quality gate → commit
7. **Phase 27** — Dialectical: Multi-Cycle Progressive Deepening → quality gate → commit
8. **Phase 28** — Dialectical: Quick Dialectic Mode → quality gate → commit
9. **Phase 29** — Dialectical: Reusable Concept Library → quality gate → commit
10. **Phase 30** — Dialectical: Visual Contradiction Map & Research Fusion → quality gate → commit
11. **Phase 31** — New Tool: `update_todo` → quality gate → commit
12. **Phase 32** — New Tool: `memory_recall` → quality gate → commit
13. **Phase 33** — New Tool: `generate_chart` → quality gate → commit
14. **Phase 34** — New Tools: `code_interpreter` & `webhook_call` → quality gate → commit
15. **Phase 35** — Templates: Analysis Planner & Executive Summary Writer → quality gate → commit
16. **Phase 36** — Templates: Goal Decomposition Coach & Network Segmentation → quality gate → commit
17. **Phase 37** — Templates: Analytics Orchestrator → quality gate → commit
18. **Phase 38** — Templates: Personal Analytics Pipeline → quality gate → commit
19. **Phase 39** — Templates: Content Pipeline & LinkedIn Factory → quality gate → commit
20. **Phase 40** — Templates: Productivity & GTM Workflows → quality gate → commit

**Final:** Run full quality gate across all changes, then do a quick code review of your own work.
