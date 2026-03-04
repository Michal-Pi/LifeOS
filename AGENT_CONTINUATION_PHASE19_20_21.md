# LifeOS Workflow Improvement — Continuation Prompt (Phases 19–21)

> **Start here.** Phases 1–18 are complete and committed. Continue with Phase 19.

---

## What Was Already Implemented (Phases 1–18)

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

### Phase 11: Parallel — Heterogeneous Models & Adaptive Fan-Out

- `heterogeneousModels?: boolean` and `adaptiveFanOut?: boolean` on `Workflow`
- `getAvailableProviders()` — maps ProviderKeys to ModelProvider[] (note: key is `grok`, value is `'xai'`)
- `rotateAgentProvider()` — rotates provider across branches using `resolveEffectiveModel`
- `computeSimpleConsensus()` — Jaccard similarity of word sets (words > 3 chars)
- For consensus merge with `adaptiveFanOut`, spawns 2 additional agents if consensus < 0.6

### Phase 12: Parallel — Weighted Merge & Budget-Aware Parallelism

- `maxBudget?: number` on `Workflow`
- Budget-aware fan-out: estimates $0.03/agent, reduces to ceil(n/2) (min 2) if > 80% of maxBudget
- Merge strategies: `list`, `ranked`, `consensus`

### Phase 13: Supervisor — Planning Phase & Self-Reflection

- Enhanced planning prompt with structured delegation plan
- `supervisor_plan` event emission
- Self-reflection after each worker: supervisor evaluates output → SATISFACTORY/UNSATISFACTORY
- `reflectionResults` state with reducer
- `enableReflection?: boolean` on `SupervisorGraphConfig` (default true)

### Phase 14: Supervisor — Tool-Aware Delegation & Budget Allocation

- Supervisor prompt includes worker `toolIds` + tool descriptions from `ToolRegistry`
- `maxTokensPerWorker?: number` on `SupervisorGraphConfig` and `Workflow`
- `maxTokens` option in `AgentExecutionOptions`, applied in `executeAgentWithEvents()`

### Phase 15: Graph — Human-in-the-Loop Nodes

- `'human_approval'` node type in `WorkflowNodeType`
- Graph pauses at `human_approval` nodes, sets status `waiting_for_input`
- Emits `waiting_for_approval` event with `nodeId` and `prompt`
- Returns `pendingInput: { prompt, nodeId }` in result
- Approval/rejection handling with `humanApproval` state field

### Phase 16: Graph — Loop Detection, Budget Guardrails & Error Recovery

- `nodeVisitCounts` state with counting reducer
- Visit count check per node against `limits.maxNodeVisits` (default 10)
- Budget check against `workflow.maxBudget`
- `'error'` edge condition type — on agent throw, follows error edge if exists
- Try/catch around `compiledGraph.invoke()` in both `genericGraph.ts` and `supervisorGraph.ts`

### Phase 17: Graph — Checkpoint Visualization & Template Parameterization

- Progress bar in `InteractiveWorkflowGraph.tsx` showing completed/failed/running node counts
- `TemplateParameter` type + Zod schema for `{{variable}}` placeholders in workflow templates
- `resolveTemplateParameters()` in `genericGraph.ts` resolving goal & system prompt at runtime
- `validateTemplateParameters()` in `templateInstantiation.ts` for input validation

### Phase 18: Expert Council — Domain-Specific Judge Rubrics & Model Diversity

- `detectPromptDomain()` — keyword-based classification into research/creative/analytical/code/factual
- `JUDGE_RUBRICS` — 5 domain-specific evaluation criteria strings
- `enforceProviderDiversity()` — reassigns duplicate providers to unused ones at same tier
- `JudgeRubricDomain` type and `judgeRubricDomain`/`enforceProviderDiversity` fields on `ExpertCouncilConfig`
- Local `TIER_MAP` and `inferTier()` inlined in `expertCouncil.ts` (avoids cross-package runtime import issues)

---

## Important Patterns & Conventions

1. **Architecture:** Domain-Driven Design. Domain types in `packages/agents/src/domain/`, execution in `functions/src/agents/`.
2. **Backward Compatibility:** All new fields are optional with sensible defaults.
3. **Model Resolution Pipeline:** `workflowExecutor.ts` → `LangGraphExecutionConfig` → `executor.ts` → graph config → `AgentExecutionContext` → `executeAgentWithEvents()` → `resolveEffectiveModel()` → `executeWithProvider()`.
4. **Tests:** Vitest. Functions tests in `functions/src/agents/__tests__/`. Domain tests in `packages/agents/src/domain/__tests__/`. Run with `pnpm --filter functions test` or `pnpm --filter @lifeos/agents test`.
5. **Pre-existing test failures** (not ours): `functions/src/agents/__tests__/mailboxAITools.test.ts` fails due to Firestore mock issue (`firestore.settings is not a function`). `functions/src/agents/__tests__/graphGuardrails.test.ts` has 2 pre-existing failures (loop detection and budget guardrail tests expect `completed` but get `failed`). Ignore these.
6. **Zod Validation:** Domain types have Zod schemas in `packages/agents/src/domain/validation.ts`. Add new fields to schemas when modifying domain types.
7. **Event System:** Two layers:
   - **Backend:** `functions/src/agents/runEvents.ts` — `RunEventWriter` writes to Firestore. `functions/src/agents/langgraph/events.ts` — factory functions like `stepStartedEvent()`, `stepCompletedEvent()`.
   - **Frontend:** `apps/web-vite/src/hooks/useRunEvents.ts` — Firestore onSnapshot subscription.
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
13. **ToolRegistry:** `Map<string, ToolDefinition>` defined in `functions/src/agents/toolExecutor.ts`. Each tool has `toolId`, `name`, `description`. Agents reference tools via `toolIds?: ToolId[]` array.
14. **Cross-package imports:** Type imports from `@lifeos/agents` work fine in `functions/`. Value/function imports can fail at runtime in vitest. If you need a function or constant from `@lifeos/agents` in `functions/src/agents/`, **inline it** rather than importing. This was the pattern used for `TIER_MAP` and `inferTier()` in `expertCouncil.ts`.
15. **Expert Council pipeline invocation:** `runExecutor.ts` calls `createExpertCouncilPipeline()` → `executeExpertCouncilUsecase(repository, pipeline)` → `executeCouncil(userId, runId, goal, config, mode, workflowId, contextHash)`. The pipeline's `execute()` method in `expertCouncil.ts` runs the 3-stage pipeline (Stage 1: parallel council → Stage 2: judge reviews → Stage 3: chairman synthesis).
16. **CouncilAnalytics:** `expertCouncil.ts` has a `createExpertCouncilRepository()` with `getAnalytics(userId, workflowId)` that returns `CouncilAnalytics` from Firestore. The `modelStats` field is `Record<string, { timesUsed, averageRank, averageLatency, failureRate }>`.
17. **Consensus utilities:** `calculateAverageKendallTau()`, `calculateConsensusScore()`, `buildAggregateRanking()`, `findControversialResponses()` are in `packages/agents/src/usecases/expertCouncilUsecases.ts` and exported from `@lifeos/agents`. These are **function exports** — they can be imported as types work fine, but at runtime in `functions/` tests they might need mocking. The Expert Council pipeline already imports them successfully (line 7 of `expertCouncil.ts`), so they should work.

---

## Quality Gate (Run After Each Phase)

```bash
# Lint
pnpm --filter functions lint
# Typecheck both packages
pnpm --filter functions typecheck && pnpm --filter @lifeos/agents typecheck
# Tests (ignore pre-existing mailboxAITools + graphGuardrails failures)
pnpm --filter functions test && pnpm --filter @lifeos/agents test
# Web app typecheck (for UI changes)
pnpm --filter web-vite typecheck
```

Commit each phase separately with format: `feat(agents): <description> (Phase N)`

---

## Phase 19: Expert Council — Dynamic Composition & Quick Mode

**Goal:** Auto-select best models from historical data. Quick mode for easy questions.

### 19a: Quick Mode

**File: `functions/src/agents/expertCouncil.ts`** (~901 lines)

The `ExecutionMode` type already includes `'quick'`. Currently the pipeline handles `mode === 'single'` (line 679) and `mode === 'full' || mode === 'custom'` (line 499). Quick mode needs its own path.

**Quick mode behavior:**

1. **Stage 1:** Use only 2 strong council models (first 2 from `councilModels`) + skip any remaining
2. **Stage 2:** Use 1 fast judge (first from `judgeModels` or `councilModels`)
3. **Stage 3:** If Kendall Tau > 0.8 across judge rankings (high consensus), **skip chairman synthesis** — instead, return the top-ranked Stage 1 response directly as the final response. If consensus is low, run chairman as normal.

**Implementation approach:**

In the `execute()` method of the pipeline (~line 417):

1. Before Stage 1, if `mode === 'quick'`, slice `diverseModels` to first 2 models:

   ```typescript
   const activeModels = mode === 'quick' ? diverseModels.slice(0, 2) : diverseModels
   ```

   Use `activeModels` instead of `diverseModels` for Stage 1 execution.

2. Before Stage 2, if `mode === 'quick'`, use only 1 judge:

   ```typescript
   const activeJudges =
     mode === 'quick'
       ? (config.judgeModels ?? config.councilModels).slice(0, 1)
       : (config.judgeModels ?? config.councilModels)
   ```

3. After Stage 2 consensus is calculated, if `mode === 'quick'` and `kendallTau > 0.8`:
   - Skip Stage 3 (chairman)
   - Find the top-ranked response from `aggregateRanking[0]`
   - Use its `answerText` as `stage3.finalResponse`
   - Log that chairman was skipped due to high consensus

**Important:** The existing code structure already handles skipping Stage 2 in certain modes. Follow the same pattern for quick mode modifications.

### 19b: Dynamic Composition from Historical Data

**File: `functions/src/agents/expertCouncil.ts`**

Add a function that queries historical analytics to select the best-performing models for a given domain:

```typescript
export async function selectDynamicCouncil(
  userId: string,
  workflowId: WorkflowId,
  domain: JudgeRubricDomain,
  repository: ExpertCouncilRepository,
  availableModels: ExpertCouncilConfig['councilModels'],
  targetSize: number = 3
): Promise<ExpertCouncilConfig['councilModels']> {
  // 1. Get analytics from repository
  const analytics = await repository.getAnalytics(userId, workflowId)

  // 2. If insufficient data (< 5 turns), return first targetSize models as-is
  if (analytics.totalTurns < 5) {
    return availableModels.slice(0, targetSize)
  }

  // 3. Score each available model using modelStats from analytics
  //    Score = (1 / averageRank) * (1 - failureRate) — higher is better
  //    Models not in stats get a neutral score

  // 4. Sort by score descending, take top targetSize
  // 5. Ensure provider diversity (reuse enforceProviderDiversity)

  return selectedModels
}
```

**Where to integrate:** This is an **opt-in** feature. Add `enableDynamicComposition?: boolean` to `ExpertCouncilConfig` in `models.ts` and `validation.ts`. When enabled, call `selectDynamicCouncil()` before Stage 1 in the pipeline's `execute()` method.

**Note:** The `createExpertCouncilPipeline` doesn't currently receive the `repository`. For dynamic composition, the pipeline would need access to it. Two options:

- **Option A (preferred):** Accept an optional `repository` in the `createExpertCouncilPipeline` params. Only used when `enableDynamicComposition` is true.
- **Option B:** Move the dynamic selection logic to the usecase layer in `expertCouncilUsecases.ts`. But this would require re-configuring the council models before passing to the pipeline.

Go with **Option A** — add `repository?: ExpertCouncilRepository` to the `createExpertCouncilPipeline` params.

### 19c: Domain Config Updates

**File: `packages/agents/src/domain/models.ts`**

Add to `ExpertCouncilConfig` (around line 628):

```typescript
enableDynamicComposition?: boolean  // Auto-select best models from historical data (default: false)
```

**File: `packages/agents/src/domain/validation.ts`**

Add to `ExpertCouncilConfigSchema` (around line 220):

```typescript
enableDynamicComposition: z.boolean().optional(),
```

### 19d: Tests

**File: `functions/src/agents/__tests__/expertCouncilQuickMode.test.ts`** — New test file.

Mock patterns — follow same approach as `expertCouncilRubrics.test.ts`:

- Mock `providerService.js` — `executeWithProvider` returning configurable outputs
- Mock `logger.js`

**Test cases for Quick Mode:**

1. **Quick mode uses only 2 council models** — Verify only 2 Stage 1 responses are generated even when config has 3+ models
2. **Quick mode uses only 1 judge** — Verify only 1 Stage 2 review is generated
3. **Quick mode skips chairman on high consensus** — When Kendall Tau > 0.8, Stage 3 uses top-ranked response directly (no chairman LLM call)
4. **Quick mode runs chairman on low consensus** — When Kendall Tau <= 0.8, chairman runs as normal
5. **Full mode unchanged** — Full mode still uses all council models and judges

**Test cases for Dynamic Composition:**

6. **`selectDynamicCouncil` returns first N models when insufficient data** — < 5 turns → returns availableModels.slice(0, targetSize)
7. **`selectDynamicCouncil` selects best-performing models** — modelStats with varying averageRank → returns models sorted by score
8. **`selectDynamicCouncil` applies provider diversity** — Selected models go through `enforceProviderDiversity`

For testing `selectDynamicCouncil`, you'll need to mock the repository's `getAnalytics()` method. Create the repository mock directly (don't mock the Firestore):

```typescript
const mockRepository = {
  getAnalytics: vi.fn(),
  // ... other methods as needed
} as unknown as ExpertCouncilRepository
```

---

## Phase 20: Expert Council — Caching & Disagreement Deep-Dive

**Goal:** Cache similar prompt results. On low consensus, trigger reasoning follow-up.

### 20a: Prompt Similarity Caching

**File: `functions/src/agents/expertCouncil.ts`**

The caching infrastructure already exists:

- `createExpertCouncilRepository()` has `getCachedTurn()` and `setCachedTurn()` (lines 840-870)
- `executeExpertCouncilUsecase()` in `expertCouncilUsecases.ts` already checks cache before execution (lines 377-393) and stores results after (lines 404-406)
- `generateCacheKey()` creates deterministic hash from userId + prompt + config + mode
- `buildExpertCouncilContextHash()` hashes the context object

The existing cache is **exact-match** (prompt must hash identically). The plan calls for **similarity-based caching** (cosine similarity > 0.9).

**However**, implementing true embedding-based similarity requires:

- An embedding model call to compute prompt embeddings
- A vector similarity search in Firestore (or a vector DB)
- This is architecturally heavy for a single phase

**Practical approach:** Instead of full vector similarity, implement a **normalized prompt cache** that catches near-identical prompts:

1. Add a `normalizePromptForCache(prompt: string): string` function that:
   - Lowercases
   - Strips extra whitespace
   - Removes common filler words ("please", "can you", "I want to", "I need")
   - Trims to first 500 characters
   - Returns the normalized string

2. Generate a **secondary cache key** from the normalized prompt. Check both exact and normalized cache keys.

3. Add this logic to `expertCouncilUsecases.ts` in `executeExpertCouncilUsecase()`, before the existing exact-match cache check:

   ```typescript
   // Check normalized cache (catches near-identical prompts)
   const normalizedKey = generateCacheKey(userId, normalizePromptForCache(prompt), config, executionMode, workflowId, contextHash)
   if (config.enableCaching && normalizedKey !== cacheKey) {
     const normalizedCached = await repository.getCachedTurn(userId, normalizedKey)
     if (normalizedCached) { ... return cached turn ... }
   }
   ```

4. When storing cache, store under **both** exact and normalized keys.

**File: `packages/agents/src/usecases/expertCouncilUsecases.ts`** — Add `normalizePromptForCache()` and integrate into `executeExpertCouncilUsecase()`.

### 20b: Disagreement Deep-Dive

**File: `functions/src/agents/expertCouncil.ts`**

When Stage 2 consensus is LOW (Kendall Tau < 0.4), trigger a reasoning follow-up round before Stage 3:

1. After consensus metrics are calculated (~line 620), check if `kendallTau < 0.4` AND the number of successful reviews >= 2.

2. If triggered, run a **reasoning round**:
   - For each council model that produced a Stage 1 response, ask it to **explain its reasoning** given the other responses and the judge critiques
   - Prompt: "The judges disagreed significantly on the quality of responses. Here are the critiques: [critiques]. Your original response was: [response]. Explain your reasoning and address the criticisms."
   - Limit to first 3 models to control cost

3. Collect the reasoning outputs and append them to the Stage 3 chairman prompt as a new section: "REASONING FOLLOW-UP (triggered by low consensus):"

4. Add `enableDisagreementDeepDive?: boolean` to `ExpertCouncilConfig` (default: true when mode is `full`).

5. Track whether deep-dive was triggered in the turn result. Add `disagreementDeepDive?: { triggered: boolean; reasoningResponses: Array<{ modelId: string; reasoning: string }> }` to `ExpertCouncilTurn`.

**Implementation location:** After the consensus metrics block (~line 620) and before the Stage 3 prompt construction (~line 648). Insert the deep-dive logic in between.

### 20c: Domain Config Updates

**File: `packages/agents/src/domain/models.ts`**

Add to `ExpertCouncilConfig`:

```typescript
enableDisagreementDeepDive?: boolean  // Trigger reasoning follow-up on low consensus (default: true for full mode)
```

Add to `ExpertCouncilTurn`:

```typescript
disagreementDeepDive?: {
  triggered: boolean
  reasoningResponses: Array<{
    modelId: string
    reasoning: string
    tokensUsed?: number
    estimatedCost?: number
  }>
}
```

**File: `packages/agents/src/domain/validation.ts`**

Add to `ExpertCouncilConfigSchema`:

```typescript
enableDisagreementDeepDive: z.boolean().optional(),
```

### 20d: Tests

**File: `functions/src/agents/__tests__/expertCouncilCaching.test.ts`** — New test file.

Test cases for normalized caching:

1. **`normalizePromptForCache` strips filler words** — "Please can you research AI safety" → "research ai safety"
2. **`normalizePromptForCache` normalizes whitespace** — Multiple spaces/newlines → single spaces
3. **`normalizePromptForCache` lowercases and trims** — Consistent normalization
4. **Normalized cache hit returns cached result** — Near-identical prompt matches via normalized key
5. **Exact cache checked first** — Exact match takes priority over normalized

**File: `functions/src/agents/__tests__/expertCouncilDeepDive.test.ts`** — New test file.

Test cases for disagreement deep-dive:

6. **Deep-dive triggers when Kendall Tau < 0.4** — Reasoning follow-up runs, responses collected
7. **Deep-dive does NOT trigger when Kendall Tau >= 0.4** — Skipped, `disagreementDeepDive.triggered = false`
8. **Deep-dive does NOT trigger when `enableDisagreementDeepDive` is false** — Config override
9. **Deep-dive reasoning is included in chairman prompt** — Stage 3 prompt contains "REASONING FOLLOW-UP" section
10. **Deep-dive limits to 3 models** — Even with 5 council models, only 3 get reasoning prompts

---

## Phase 21: Deep Research — Batch Source Processing

**Goal:** Process 3-5 sources in a single LLM call instead of one per source.

### 21a: Batch Extraction Utility

**File: `functions/src/agents/deepResearch/claimExtraction.ts`** (~290 lines)

Currently, `extractClaimsFromSource()` processes one source at a time (line 82). The claim extraction node in `deepResearchGraph.ts` calls it in a loop (lines 572-591):

```typescript
for (const source of newSources) {
  const content = state.sourceContentMap[source.sourceId]
  if (!content) continue
  const { claims, updatedBudget } = await extractClaimsFromSource(source, content, ...)
  currentBudget = updatedBudget
  allClaims.push(...claims)
}
```

**Add a new batch extraction function:**

```typescript
export async function extractClaimsFromSourceBatch(
  sources: SourceRecord[],
  contentMap: Record<string, string>,
  query: string,
  executeProvider: ProviderExecuteFn,
  budget: RunBudget,
  batchSize: number = 3
): Promise<{ claims: ExtractedClaim[]; updatedBudget: RunBudget }> {
  let currentBudget = { ...budget }
  const allClaims: ExtractedClaim[] = []

  // Group sources into batches of batchSize
  const batches: SourceRecord[][] = []
  for (let i = 0; i < sources.length; i += batchSize) {
    batches.push(sources.slice(i, i + batchSize))
  }

  for (const batch of batches) {
    // Build combined prompt with clear source delimiters
    const combinedContent = batch
      .map((source, idx) => {
        const content = contentMap[source.sourceId]
        if (!content) return null
        return `--- SOURCE ${idx + 1} [${source.sourceId}] ---\nTitle: ${source.title ?? 'Untitled'}\nURL: ${source.url ?? 'N/A'}\n\n${content.substring(0, 3000)}\n--- END SOURCE ${idx + 1} ---`
      })
      .filter(Boolean)
      .join('\n\n')

    if (!combinedContent) continue

    // Estimate cost for batch call
    const estimatedInputTokens = Math.ceil(combinedContent.length / 4) + 200
    const estimatedOutputTokens = batch.length * 300 // ~300 tokens per source for claims
    const costEstimate = estimateLLMCost('extraction', estimatedInputTokens, estimatedOutputTokens)

    if (!canAffordOperation(currentBudget, costEstimate)) {
      log.warn('Budget insufficient for batch extraction, skipping remaining')
      break
    }

    // Single LLM call for the batch
    const batchPrompt = buildBatchExtractionPrompt(combinedContent, query, batch.length)
    const output = await executeProvider(EXTRACTION_SYSTEM_PROMPT, batchPrompt)

    // Parse per-source claims from the response
    const parsedClaims = parseBatchExtractionOutput(output, batch)
    allClaims.push(...parsedClaims)

    currentBudget = recordSpend(
      currentBudget,
      costEstimate,
      estimatedInputTokens + estimatedOutputTokens,
      'llm'
    )
  }

  return { claims: allClaims, updatedBudget: currentBudget }
}
```

**Add helper functions:**

```typescript
function buildBatchExtractionPrompt(
  combinedContent: string,
  query: string,
  sourceCount: number
): string {
  return `Research query: "${query}"

Extract atomic claims from EACH of the ${sourceCount} sources below. Group your output by source.

For each claim provide:
- sourceIndex: Which source (1-indexed) this claim came from
- claimText: The claim as a clear, self-contained statement
- confidence: 0-1 based on evidence strength
- evidenceType: one of "empirical", "theoretical", "anecdotal", "expert_opinion", "meta_analysis", "statistical", "review"
- sourceQuote: Exact quote supporting this claim (max 200 chars)
- concepts: Array of key concept names

Output valid JSON array:
[{"sourceIndex": 1, "claimText": "...", ...}, ...]

Sources:
${combinedContent}`
}

function parseBatchExtractionOutput(output: string, sources: SourceRecord[]): ExtractedClaim[] {
  // Parse JSON array from output
  // Map each claim's sourceIndex back to the correct SourceRecord
  // Build ExtractedClaim objects with proper source attribution
  // Handle parse failures gracefully (return empty array)
}
```

**Important:** The `parseBatchExtractionOutput` function must:

1. Parse the JSON array from the LLM output (handle markdown fences, partial JSON)
2. Map `sourceIndex` (1-indexed) back to the correct `SourceRecord` from the batch
3. Build proper `ExtractedClaim` objects with `sourceId`, `confidence`, `evidenceType` etc.
4. Use the existing `validateEvidenceType()` from `@lifeos/agents` for validation
5. Fall back gracefully — if parsing fails, return empty array (don't crash the pipeline)

### 21b: Integrate Batch Extraction into Deep Research Graph

**File: `functions/src/agents/langgraph/deepResearchGraph.ts`**

In the `createClaimExtractionNode` function (line 551), replace the per-source loop with the batch extraction:

**Before (lines 572-591):**

```typescript
const newSources = state.sources.slice(-20)
for (const source of newSources) {
  const content = state.sourceContentMap[source.sourceId]
  if (!content) continue
  const { claims, updatedBudget } = await extractClaimsFromSource(
    source,
    content,
    state.goal,
    providerFn,
    currentBudget
  )
  currentBudget = updatedBudget
  allClaims.push(...claims)
}
```

**After:**

```typescript
const newSources = state.sources.slice(-20)
const { claims: batchClaims, updatedBudget: postExtractionBudget } =
  await extractClaimsFromSourceBatch(
    newSources,
    state.sourceContentMap,
    state.goal,
    providerFn,
    currentBudget,
    3 // batch size
  )
allClaims.push(...batchClaims)
currentBudget = postExtractionBudget
```

Update the import at the top of `deepResearchGraph.ts` to include `extractClaimsFromSourceBatch` from `../deepResearch/claimExtraction.js`.

**Note:** The original `extractClaimsFromSource` should remain exported for backward compatibility (other code may use it). The batch function is additive.

### 21c: Tests

**File: `functions/src/agents/__tests__/batchClaimExtraction.test.ts`** — New test file.

Mock patterns:

- Mock the `ProviderExecuteFn` (it's just `(systemPrompt: string, userPrompt: string) => Promise<string>`)
- Mock `budgetController.js` for budget functions
- Mock `sourceIngestion.js` if needed for `chunkDocument`

Test cases:

1. **Batching groups sources correctly** — 7 sources with batch size 3 → 3 batches (3, 3, 1)
2. **Single LLM call per batch** — Verify provider function called once per batch (not once per source)
3. **Claims correctly attributed to individual sources** — `sourceIndex` in output maps to correct `SourceRecord`
4. **Handles fewer sources than batch size** — 2 sources with batch size 5 → 1 batch
5. **Skips sources with no content** — Sources missing from `contentMap` are skipped
6. **Budget check stops processing** — If budget insufficient, remaining batches are skipped
7. **Parse failure returns empty array** — Malformed LLM output doesn't crash, returns `[]`
8. **Content truncated per source** — Each source content limited to 3000 chars in prompt

---

## Key Files Reference

| File                                                    | Purpose                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| `packages/agents/src/domain/models.ts`                  | Domain types (Workflow, Run, AgentConfig, ExpertCouncilConfig, etc.) |
| `packages/agents/src/domain/validation.ts`              | Zod schemas (must stay in sync with models.ts)                       |
| `packages/agents/src/usecases/expertCouncilUsecases.ts` | Council pipeline orchestration, caching, ranking utilities           |
| `packages/agents/src/ports/expertCouncilRepository.ts`  | Repository interface (getCachedTurn, setCachedTurn, getAnalytics)    |
| `functions/src/agents/expertCouncil.ts`                 | Expert Council execution pipeline (Stage 1/2/3)                      |
| `functions/src/agents/evaluation.ts`                    | Auto-evaluation pipeline (evaluateRunOutput)                         |
| `functions/src/agents/runExecutor.ts`                   | Run execution trigger (calls Expert Council + workflow executor)     |
| `functions/src/agents/langgraph/deepResearchGraph.ts`   | Deep Research workflow graph (claim extraction node at line 551)     |
| `functions/src/agents/deepResearch/claimExtraction.ts`  | Claim extraction from sources (add batch function here)              |
| `functions/src/agents/deepResearch/budgetController.ts` | Budget tracking (recordSpend, canAffordOperation, estimateLLMCost)   |
| `functions/src/agents/providerService.ts`               | `executeWithProvider()` — unified provider API                       |

---

## Execution Order

1. **Phase 19** — Expert Council Quick Mode + Dynamic Composition (19a → 19b → 19c → 19d → quality gate → commit)
2. **Phase 20** — Expert Council Caching + Disagreement Deep-Dive (20a → 20b → 20c → 20d → quality gate → commit)
3. **Phase 21** — Deep Research Batch Source Processing (21a → 21b → 21c → quality gate → commit)
4. **Final:** Run full quality gate across all changes, then do a quick code review of your own work.
