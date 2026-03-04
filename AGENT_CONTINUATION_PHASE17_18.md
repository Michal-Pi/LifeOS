# LifeOS Workflow Improvement — Continuation Prompt (Phases 17–18)

> **Start here.** Phases 1–16 are complete and committed (plus a code review fix pass on all 14 findings). Continue with Phase 17.

---

## What Was Already Implemented (Phases 1–16)

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

### Code Review Fixes (post Phase 16)

- Finding 1: Pass `parallelMergeStrategy` from `executor.ts` to parallel graph
- Finding 2: Remove dead `qualityWeights` code from `parallelGraph.ts` + tests
- Finding 3: Try/catch around supervisor `invoke()` (mirrors genericGraph pattern)
- Finding 5: Improved catch block error message in genericGraph
- Finding 8: Wired `enableCheckpointing` through Workflow type, Zod schema, and all 7 executor cases
- Finding 9: Re-delegation TODO stub
- Finding 10: Added `workflowId` to `waiting_for_approval` event
- Finding 11: Documented compression provider choice (gpt-4o-mini)
- Finding 12: Fixed worker output keys to use `${worker.name}_output`
- Finding 13: Expanded `AgentRole` with 10 new roles (5 workflow-specific + 5 domain-specific), synced Zod schema
- Finding 14: Warning when iteration limit drops workers

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

## Phase 17: Graph — Checkpoint Visualization & Template Parameterization

**Goal:** Visual node execution status in UI. Template variables resolved at run time.

### 17a: Checkpoint Visualization — Enhance Existing Components

**IMPORTANT:** The visualization already partially exists. `InteractiveWorkflowGraph.tsx` already tracks execution status per node (`pending`, `running`, `completed`, `failed`) with `STATUS_COLORS`. The enhancement is to make it work with run events from Firestore.

**File: `apps/web-vite/src/components/agents/InteractiveWorkflowGraph.tsx`** (~272 lines)

Current implementation (lines 39-60) already defines:

```typescript
STATUS_COLORS = {
  completed: { bg: success - light, border: success, emoji: '✓' },
  running: { bg: warning - light, border: warning, emoji: '⏳' },
  failed: { bg: error - light, border: error, emoji: '✗' },
  pending: { bg: background - secondary, border: border - strong, emoji: '○' },
}
```

What needs to happen:

1. Read the component thoroughly and understand how it currently receives execution state.
2. It accepts `steps?: WorkflowStep[]` and `replayStepIndex?: number` (line 36). Verify it derives per-node status from step events.
3. **Enhancement:** Make node status derivation more robust — handle the case where step events come from `useRunEvents` (Firestore onSnapshot). Currently nodes may only show status if explicitly passed as props.
4. Add a **progress bar or fraction** (e.g., "3/7 nodes complete") below the graph. Use design system tokens for styling.
5. Add **duration labels** on completed nodes showing how long each node took (already partially done — verify and enhance).

**File: `apps/web-vite/src/styles/components/` — Create `InteractiveWorkflowGraph.css` if it doesn't exist.**

Keep styling minimal. Use CSS custom properties from `tokens.css`.

### 17b: Template Parameterization — Domain Changes

**File: `packages/agents/src/domain/models.ts`**

Add to the `WorkflowTemplate` interface (currently at lines 270-284):

```typescript
interface WorkflowTemplate {
  // ... existing fields ...
  parameters?: Record<
    string,
    {
      description: string
      required: boolean
      defaultValue?: string
    }
  >
}
```

This allows template authors to define variables like `{{topic}}`, `{{audience}}`, `{{tone}}` that users fill in when creating a workflow from the template.

**File: `packages/agents/src/domain/validation.ts`**

Add to the `WorkflowTemplateSchema`:

```typescript
parameters: z.record(
  z.object({
    description: z.string(),
    required: z.boolean(),
    defaultValue: z.string().optional(),
  })
).optional(),
```

### 17c: Template Parameterization — Resolution Logic

**File: `functions/src/agents/langgraph/genericGraph.ts`**

Before graph execution, resolve `{{variable}}` placeholders in all node prompts/labels. The context object passed to `executeLangGraphWorkflow` should contain the parameter values.

Add a utility function:

```typescript
function resolveTemplateParameters(text: string, parameters: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return parameters[key] ?? match // Leave unresolved if no value provided
  })
}
```

Apply this to:

1. Agent system prompts (in the node callback, before calling `executeAgentWithEvents`)
2. Node labels
3. Edge condition values/prompts

**Where to call it:** In the generic graph's node creation loop, when building the agent context. Check the `context` parameter passed to `executeGenericGraphWorkflowLangGraph` for a `templateParameters` key.

**File: `apps/web-vite/src/services/templateInstantiation.ts`**

When instantiating a workflow from a template with parameters:

1. Check if the template has `parameters`
2. For each required parameter without a `defaultValue`, ensure a value was provided
3. Store the resolved parameter values in the workflow's context or as a dedicated field

### 17d: Tests

**File: `packages/agents/src/domain/__tests__/validation.test.ts`** — Add test cases for `WorkflowTemplateSchema` with parameters (valid, missing required, with defaults).

**File: `functions/src/agents/__tests__/templateParameters.test.ts`** — New test file.

Test cases:

1. **`resolveTemplateParameters` replaces placeholders** — `{{topic}}` in text → replaced with value
2. **Unresolved placeholders left as-is** — `{{unknown}}` stays if no value provided
3. **Multiple placeholders in same string** — all resolved
4. **No placeholders** — text returned unchanged
5. **Empty parameters object** — all placeholders left as-is

---

## Phase 18: Expert Council — Domain-Specific Judge Rubrics & Model Diversity

**Goal:** Judges use domain-specific rubrics. Council members must use different providers.

### 18a: Domain Detection

**File: `functions/src/agents/expertCouncil.ts`** (~755 lines)

Add a domain detection function that classifies the user's prompt into a rubric domain:

```typescript
type JudgeRubricDomain = 'research' | 'creative' | 'analytical' | 'code' | 'factual'

function detectPromptDomain(prompt: string): JudgeRubricDomain {
  const lower = prompt.toLowerCase()

  // Code domain: programming keywords
  if (
    /\b(code|function|class|api|bug|implement|refactor|debug|typescript|python|javascript)\b/.test(
      lower
    )
  ) {
    return 'code'
  }

  // Research domain
  if (/\b(research|study|analyze|evidence|literature|findings|hypothesis|data)\b/.test(lower)) {
    return 'research'
  }

  // Creative domain
  if (/\b(write|draft|creative|story|blog|article|content|poem|essay|narrative)\b/.test(lower)) {
    return 'creative'
  }

  // Analytical domain
  if (
    /\b(analyze|compare|evaluate|assess|pros|cons|trade.?off|decision|strategy|framework)\b/.test(
      lower
    )
  ) {
    return 'analytical'
  }

  // Default to factual
  return 'factual'
}
```

### 18b: Domain-Specific Rubrics

**File: `functions/src/agents/expertCouncil.ts`**

Add rubric definitions. Each rubric defines the criteria judges should use:

```typescript
const JUDGE_RUBRICS: Record<JudgeRubricDomain, string> = {
  research:
    'Evaluate on: (1) Evidence quality and citation of sources, (2) Methodological rigor, ' +
    '(3) Completeness of literature coverage, (4) Objectivity and balance, (5) Actionable conclusions.',
  creative:
    'Evaluate on: (1) Originality and voice, (2) Engagement and readability, ' +
    '(3) Structure and flow, (4) Audience appropriateness, (5) Emotional resonance.',
  analytical:
    'Evaluate on: (1) Logical soundness, (2) Completeness of analysis, ' +
    '(3) Consideration of alternatives, (4) Data-driven reasoning, (5) Actionable recommendations.',
  code:
    'Evaluate on: (1) Correctness and bug-free execution, (2) Code quality and readability, ' +
    '(3) Performance considerations, (4) Edge case handling, (5) Best practices adherence.',
  factual:
    'Evaluate on: (1) Accuracy of facts, (2) Completeness, (3) Clarity and conciseness, ' +
    '(4) Recency of information, (5) Source reliability.',
}
```

**Integrate into Stage 2 (Judge Reviews).** Currently the judge prompt is constructed around lines 355-410. Inject the rubric into the judge's system prompt. Find where the judge's `systemPrompt` is built and prepend the domain-specific rubric:

```typescript
const domain =
  config.judgeRubricDomain === 'auto' || !config.judgeRubricDomain
    ? detectPromptDomain(userPrompt)
    : config.judgeRubricDomain

const rubric = JUDGE_RUBRICS[domain]
// Inject into judge system prompt: "Apply the following evaluation criteria: {rubric}"
```

### 18c: Model Diversity Enforcement

**File: `functions/src/agents/expertCouncil.ts`**

Add a diversity check and auto-reassignment function. Run this before Stage 1 execution:

```typescript
function enforceProviderDiversity(
  councilModels: ExpertCouncilConfig['councilModels'],
  availableProviders: string[]
): ExpertCouncilConfig['councilModels'] {
  const usedProviders = new Set<string>()
  const result = [...councilModels]

  for (let i = 0; i < result.length; i++) {
    if (usedProviders.has(result[i].provider)) {
      // Find an unused provider
      const unusedProvider = availableProviders.find((p) => !usedProviders.has(p))
      if (unusedProvider) {
        result[i] = { ...result[i], provider: unusedProvider }
        // Note: modelName will need to be resolved via MODEL_TIER_MAP for the new provider
      }
    }
    usedProviders.add(result[i].provider)
  }

  return result
}
```

**Important:** When reassigning a provider, you need to also update the `modelName` to match the new provider. Use `resolveEffectiveModel()` from `@lifeos/agents` (already used throughout the codebase) to get the correct model name for the provider at the same tier.

**Where to call it:** Before Stage 1 execution begins (~line 297). Log a warning when diversity enforcement reassigns a provider.

### 18d: Domain Config

**File: `packages/agents/src/domain/models.ts`**

Add to `ExpertCouncilConfig` (around lines 569-613):

```typescript
judgeRubricDomain?: 'research' | 'creative' | 'analytical' | 'code' | 'factual' | 'auto'
enforceProviderDiversity?: boolean  // Default: true
```

**File: `packages/agents/src/domain/validation.ts`**

Add to `ExpertCouncilConfigSchema`:

```typescript
judgeRubricDomain: z.enum(['research', 'creative', 'analytical', 'code', 'factual', 'auto']).optional(),
enforceProviderDiversity: z.boolean().optional(),
```

### 18e: Tests

**File: `functions/src/agents/__tests__/expertCouncilRubrics.test.ts`** — New test file.

Mock patterns — follow same approach as other agent tests:

- Mock `providerService.js` — `executeWithProvider` returning configurable outputs
- Mock `logger.js`
- Mock Firestore if needed for cache/analytics

Test cases:

1. **`detectPromptDomain` classifies code prompts correctly** — "Write a TypeScript function" → `code`
2. **`detectPromptDomain` classifies research prompts** — "Research the effects of..." → `research`
3. **`detectPromptDomain` classifies creative prompts** — "Write a blog post about..." → `creative`
4. **`detectPromptDomain` classifies analytical prompts** — "Compare the trade-offs between..." → `analytical`
5. **`detectPromptDomain` defaults to factual** — "What is the capital of France?" → `factual`
6. **Rubric injected into judge prompt** — When domain is `research`, judge system prompt contains "Evidence quality" criterion
7. **Auto-detection when `judgeRubricDomain` is 'auto'** — Uses `detectPromptDomain` to choose rubric
8. **Explicit domain overrides auto-detection** — `judgeRubricDomain: 'code'` uses code rubric regardless of prompt content
9. **`enforceProviderDiversity` reassigns duplicate providers** — If 3 models all use `openai`, reassigns 2 to different providers
10. **`enforceProviderDiversity` no-op when already diverse** — Different providers → no changes
11. **`enforceProviderDiversity` logs warning on reassignment** — Verify log.warn called

---

## Key Files Reference

| File                                                               | Purpose                                             |
| ------------------------------------------------------------------ | --------------------------------------------------- |
| `packages/agents/src/domain/models.ts`                             | Domain types (Workflow, Run, AgentConfig, etc.)     |
| `packages/agents/src/domain/validation.ts`                         | Zod schemas (must stay in sync with models.ts)      |
| `functions/src/agents/expertCouncil.ts`                            | Expert Council execution (Stage 1/2/3 pipeline)     |
| `functions/src/agents/langgraph/genericGraph.ts`                   | Graph/custom workflow execution                     |
| `functions/src/agents/langgraph/utils.ts`                          | `executeAgentWithEvents()` — shared agent execution |
| `functions/src/agents/langgraph/executor.ts`                       | Routes workflow type to correct graph executor      |
| `functions/src/agents/providerService.ts`                          | `executeWithProvider()` — unified provider API      |
| `apps/web-vite/src/components/agents/InteractiveWorkflowGraph.tsx` | Graph execution visualization (Phase 17a)           |
| `apps/web-vite/src/components/agents/workflowLayoutUtils.ts`       | Node colors, layout algorithm, constants            |
| `apps/web-vite/src/services/templateInstantiation.ts`              | Workflow-from-template creation (Phase 17c)         |
| `apps/web-vite/src/agents/templatePresets.ts`                      | Built-in template presets                           |

---

## Execution Order

1. **Phase 17** — Checkpoint visualization + template parameterization (17a → 17b → 17c → 17d → quality gate → commit)
2. **Phase 18** — Expert Council rubrics + diversity (18a → 18b → 18c → 18d → 18e → quality gate → commit)
3. **Final:** Run full quality gate across all changes, then do a quick code review of your own work.
