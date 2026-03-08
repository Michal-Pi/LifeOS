# LifeOS Workflow Improvement — Continuation Prompt (Phases 41–49)

> **Start here.** Phases 1–40 are complete, reviewed, and committed. Continue with Phase 41.
>
> **Master spec:** Read `WORKFLOW_IMPROVEMENT_PLAN.md` for full context. This prompt gives implementation guidance and file-level instructions. The plan has the detailed rationale, expected outcomes, and priority levels for each improvement.

---

## What Was Already Implemented (Phases 1–40)

### Track A: Foundation (Phases 1–8)

- `ModelTier`, `WorkflowExecutionMode`, `WorkflowCriticality` types
- `MODEL_TIER_MAP`, `COST_SAVING_RULES`, `resolveEffectiveModel()` in `modelSettings.ts`
- Runtime model resolution in all graph executors (sequential, parallel, supervisor, graph, dialectical, deep_research)
- UI controls (execution mode toggle + tier override dropdown) in `RunWorkflowModal.tsx`
- `hashAgentConfig()` — dual 32-bit FNV-1a hash + dedup in `templateInstantiation.ts`
- `estimateTokenCount()`, `buildSystemPromptWithCaching()` with Anthropic `cache_control`
- `compressAgentOutput()` in `sequentialGraph.ts` — gpt-4o-mini compresses output > 2000 tokens
- `step_started`/`step_completed` events, UI progress indicator in `RunDetailModal.tsx`
- `evaluateRunOutput()` in `evaluation.ts` — auto-evaluation scoring

### Track B: Sequential/Parallel/Supervisor (Phases 9–14)

- Early-exit conditions (`earlyExitPatterns`) on sequential workflows
- Quality gates with `scoreAgentOutput()`, retry with upgraded tier
- Heterogeneous models with provider rotation, Jaccard consensus, adaptive fan-out
- Budget-aware parallelism, merge strategies: `list`, `ranked`, `consensus`
- Supervisor planning phase, self-reflection (`SATISFACTORY`/`UNSATISFACTORY`)
- Tool-aware delegation, `maxTokensPerWorker` constraints

### Track C: Graph Workflows (Phases 15–17)

- Human-in-the-loop (`human_approval` node, `waiting_for_input` status)
- Loop detection (`nodeVisitCounts`, `maxNodeVisits`), budget guardrails, error recovery
- Progress bar visualization, `TemplateParameter` type, `resolveTemplateParameters()`

### Track D: Expert Council (Phases 18–20)

- Domain-specific judge rubrics, model provider diversity enforcement
- Dynamic composition, quick mode (2 models + 1 judge)
- Normalized prompt caching, disagreement deep-dive on low consensus

### Track E: Deep Research (Phases 21–25)

- Batch source processing (`extractClaimsFromSourceBatch()`)
- Parallel search (`Promise.allSettled`), source deduplication (with URL normalization)
- Source quality scoring (`computeSourceQualityScore()`), weighted blend claim adjustment
- Counterclaim generation (`generateCounterclaims()`) with adversarial agent
- Quick research mode (sense_making → search → answer_generation)
- Raw source fallback for quick mode when KG is empty

### Track F: Dialectical (Phases 26–30)

- `LENS_MODEL_PRESETS` — per-lens model assignment with typed `ModelProvider`
- Progressive deepening with `contradictionSeverityFilter` (`ALL`/`HIGH`/`MEDIUM`/`LOW`)
- Quick dialectic mode (2 lenses, 1 cycle, no KG)
- `StoredConcept` with branded `ConceptId`, full CRUD `ConceptRepository`
- Research fusion (`enableResearchFusion`, `NEEDS_EVIDENCE` signal)

### Track G: New Tools (Phases 31–34)

- `update_todo` — status enum: `inbox`/`next_action`/`scheduled`/`waiting`/`someday`/`done`, `urgency`/`importance` fields
- `delete_todo`, `memory_recall`, `generate_chart`, `code_interpreter`, `webhook_call`
- Security documentation (SSRF, sandbox constraints)

### Track H: New Templates (Phases 35–40)

- 20 new agent templates: Analytics Router, Content Pipeline agents, LinkedIn Factory agents, Morning Brief agents, Weekly Review agents, GTM agents, Analysis Planner (Balanced), Executive Summary Writer (Balanced), Goal Decomposition Coach (Balanced), Network Segmentation Expert (Balanced)
- 7 new workflow templates: LifeOS Analytics Orchestrator, Personal Analytics Pipeline, Content Pipeline, LinkedIn Content Factory, Morning Brief, Weekly Review, GTM Strategy Pipeline
- `WorkflowNodeType` extended with `'fork'`
- `TemplateParameter` extended with optional `name` and `type` fields

### Code Review Fixes (All 33 Issues Resolved)

- Model aliases updated to `claude-sonnet-4-6` (latest generic alias) across all files
- Sort mutation fix, counterclaim IDs via FNV-1a hash, prompt injection XML delimiters
- Balanced-brace JSON parser (`safeParseJson()`), domain TLD matching, URL dedup normalization
- Tautological tests rewritten with behavioral assertions

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
8. **Model aliases.** Use generic aliases (`claude-sonnet-4-6`, `claude-opus-4-6`, `claude-haiku-4-5`, `gpt-5.2`, `gpt-5-mini`, `o1`, `gemini-2.5-pro`, `gemini-3-pro`, `gemini-3-flash`, `grok-4`, `grok-4-1-fast-non-reasoning`, `grok-3-mini`). Never use date-pinned model names.

### Testing

9. **Vitest.** Functions tests in `functions/src/agents/__tests__/`. Domain tests in `packages/agents/src/domain/__tests__/`. Run with `pnpm --filter functions test` or `pnpm --filter @lifeos/agents test`.
10. **Pre-existing test failures** (not ours — ignore these):
    - `mailboxAITools.test.ts` — Firestore mock issue (`firestore.settings is not a function`)
    - `graphGuardrails.test.ts` — 2 tests expect `completed` but get `failed`
11. **Mock patterns:**
    - Use `vi.mock()` with factory for module mocking (hoisted automatically)
    - Use `mockReset()` (not `clearAllMocks()`) in `beforeEach`
    - Use call-counter pattern (`setupAgentOutputs()`) for reliable mock ordering
12. **Provider service.** `executeWithProvider()` in `providerService.ts` — unified API. Returns `{ output, tokensUsed, estimatedCost, iterationsUsed, provider, model }`.
13. **ToolRegistry.** `Map<string, ToolDefinition>` in `toolExecutor.ts`. Tools have `toolId`, `name`, `description`, `parameters` (JSON Schema), `execute` function. Agents reference via `toolIds?: ToolId[]`.

### Critical Cross-Package Patterns

14. **Cross-package imports (CRITICAL).** Type imports from `@lifeos/agents` work in `functions/`. **Value/function imports can fail at runtime in vitest.** If you need a function or constant from `@lifeos/agents` in `functions/src/agents/`, **inline it** rather than importing. This pattern was used for `TIER_MAP` and `inferTier()` in `expertCouncil.ts`.

15. **Vendored package pattern (CRITICAL).** `@lifeos/agents` resolves via symlink: `functions/node_modules/@lifeos/agents → ../../vendor/lifeos-agents` (NOT to `packages/agents/`). After ANY changes to `packages/agents/src/`:

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

16. **Branded types.** `RunId` is `Id<'run'>` requiring format `run:${string}`. Use `as RunId` cast. `ConceptId` is `Id<'concept'>`.

17. **Pre-commit hooks.** Run prettier (full codebase) and turbo lint. This can be slow — use `git commit --no-verify` if hooks timeout, then fix formatting separately.

### Existing Code Structure (Key Files)

18. **Project Planning files:**
    - `packages/agents/src/domain/projectManager.ts` — `ProjectManagerConfig` (enabled, questioningDepth, autoUseExpertCouncil, qualityGateThreshold)
    - Agent templates in `templatePresets.ts`: `Project Structure Planner (Thinking)`, `Project Structure Planner (Thinking/Claude)`, `Risk Analyst (Thinking)`, `Plan Quality Reviewer (Thinking)`, `Time-Aware Planner (Balanced)`, `Plan Improvement Agent (Balanced)`, `General Quality Reviewer (Balanced)`
    - Workflow template: `Structured Project Planning` with graph: planner → reviewer → improvement → quality_check → end_node

19. **Content Creation files:**
    - Agent templates: `Content Strategist (Balanced)`, `Content Research Analyst (Balanced)`, `Thought Leadership Writer (Balanced)`, `Content Polish Editor (Balanced)`, `SEO Specialist (Balanced)`
    - Workflow template: `Content Pipeline` (sequential)
    - LinkedIn: `LinkedIn Content Researcher (Fast)`, `LinkedIn Competitor Analyst (Fast)`, `LinkedIn Draft Writer (Balanced)`, `LinkedIn Post Critic (Fast)`, `LinkedIn Final Polish (Fast)`
    - Workflow template: `LinkedIn Content Factory` (sequential)

20. **Research files:**
    - Deep Research graph: `functions/src/agents/langgraph/deepResearchGraph.ts` — 10-node pipeline with counterclaim node. `routeAfterSearch()` exported for testing.
    - Source processing: `claimExtraction.ts`, `sourceIngestion.ts`, `sourceQuality.ts`, `answerGeneration.ts`, `gapAnalysis.ts`, `budgetController.ts`
    - Existing search tools: `serp_search`, `search_scholar`, `semantic_search`, `read_url`, `scrape_url`, `parse_pdf`

21. **Productivity files:**
    - Morning Brief workflow: `Morning Calendar Checker (Fast)`, `Morning Todo Reviewer (Fast)`, `Morning Priority Synthesizer (Fast)` — sequential
    - Weekly Review workflow: `Weekly Habit Analyst (Fast)`, `Weekly Notes Summarizer (Fast)`, `Weekly Project Progress Tracker (Fast)`, `Weekly Reflection Prompter (Fast)` — sequential
    - Knowledge Manager agent: `Knowledge Manager (Balanced)` — tools: `list_notes`, `read_note`, `create_note`, `create_topic`, `analyze_note_paragraphs`, `tag_paragraph_with_note`
    - Note Graph UI: `apps/web-vite/src/components/notes/NoteGraphView.tsx`, `useNoteGraph.ts`, `graphAnalytics.ts`

22. **Marketing/Sales files:**
    - GTM workflow: `GTM Offer Coach (Balanced)`, `GTM Marketing Coach (Balanced)`, `GTM Content Strategist (Balanced)`, `GTM Sales Coach (Balanced)` — sequential
    - Workflow template: `GTM Strategy Pipeline`

23. **Template system:**
    - `apps/web-vite/src/agents/templatePresets.ts` — `agentTemplatePresets[]` and `workflowTemplatePresets[]`
    - Validator at bottom: `validateWorkflowTemplatePresets()` — checks agent names exist, graph node references, `defaultAgentTemplateName` inclusion
    - `apps/web-vite/src/services/templateInstantiation.ts` — `instantiateWorkflowFromTemplate()`, `resolveTemplateParameters()`

24. **Tool definitions:**
    - `packages/agents/src/domain/aiTools.ts` — Exported configs: `updateTodoToolConfig`, `deleteTodoToolConfig`, `memoryRecallToolConfig`, `generateChartToolConfig`, `codeInterpreterToolConfig`, `webhookCallToolConfig`
    - Status enum: `inbox`, `next_action`, `scheduled`, `waiting`, `someday`, `done`
    - Fields: `urgency` (string), `importance` (number 1-10), `estimatedMinutes` (number)

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

If the pre-commit hook times out, use `git commit --no-verify` and note it.

---

## TRACK I: Workflow-Specific Improvements (Phases 41–48)

### Phase 41: Project Planning — Time-Aware Integration & Quick Plan Mode

**Goal:** Integrate Time-Aware Planner into the main Project Planning workflow graph. Add quick mode for small projects (<5 tasks). See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 41.

**Files to modify:**

**`packages/agents/src/domain/projectManager.ts`** — Add to `ProjectManagerConfig`:

```typescript
mode?: 'full' | 'quick'  // Default: 'full'
```

Quick mode skips Risk Analyst + Plan Quality Reviewer for lightweight project plans.

**`apps/web-vite/src/agents/templatePresets.ts`** — Update the `Structured Project Planning` workflow template:

1. Add `Time-Aware Planner (Balanced)` to `agentTemplateNames`
2. Add a new `time_check` node in the graph after `planner` and before `reviewer`:
   ```
   planner → time_check → reviewer → improvement → quality_check → end_node
   ```
3. The `time_check` node uses `Time-Aware Planner (Balanced)` to ground the plan in real calendar/schedule data

4. Add a second variant or conditional: when `mode === 'quick'`, the graph is:
   ```
   planner → time_check → end_node
   ```
   (Skipping reviewer, improvement, and quality_check)

**Implementation approach:** The simplest approach is to add `Time-Aware Planner (Balanced)` as a node in the existing graph. For quick mode, since workflow graph templates are static definitions, add a **second workflow template** called `Quick Project Plan` with the shortened graph, rather than trying to add runtime conditional logic to a static template.

**Tests:** `functions/src/agents/__tests__/projectPlanningModes.test.ts`

1. Full mode graph has time_check node between planner and reviewer
2. Quick mode template has only planner → time_check → end_node
3. `ProjectManagerConfig` accepts `mode: 'quick'`
4. Both templates pass `validateWorkflowTemplatePresets()`

---

### Phase 42: Project Planning — Structured Output & Todo Integration

**Goal:** Enforce JSON output from planners. Auto-create todos from approved plan. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 42.

**Files to modify:**

**`apps/web-vite/src/agents/templatePresets.ts`** — Update system prompts for `Project Structure Planner (Thinking)` and `Project Structure Planner (Thinking/Claude)`:

Append to their system prompts:

```
OUTPUT FORMAT: You MUST output valid JSON with this structure:
{
  "projectName": "...",
  "milestones": [
    {
      "name": "...",
      "tasks": [
        {
          "title": "...",
          "description": "...",
          "dependencies": ["task title"],
          "estimatedHours": 2,
          "assignee": "user",
          "milestone": "Milestone 1"
        }
      ]
    }
  ],
  "summary": "..."
}
Output valid JSON only. No markdown fences, no extra text.
```

**`packages/agents/src/domain/models.ts`** — Add structured plan types:

```typescript
export interface StructuredPlanTask {
  title: string
  description: string
  dependencies: string[]
  estimatedHours: number
  assignee?: string
  milestone?: string
}

export interface StructuredPlanMilestone {
  name: string
  tasks: StructuredPlanTask[]
}

export interface StructuredPlan {
  projectName: string
  milestones: StructuredPlanMilestone[]
  summary: string
}
```

**`functions/src/agents/projectManagerFunctions.ts`** (or new file `functions/src/agents/planToTodos.ts`) — Add:

```typescript
export async function createTodosFromPlan(
  plan: StructuredPlan,
  userId: string,
  firestore: FirebaseFirestore.Firestore
): Promise<{ created: number; errors: string[] }>
```

Implementation:
1. Parse the structured plan output
2. For each task in each milestone, call Firestore to create a todo with:
   - `title`: task title
   - `description`: task description
   - `status`: `'inbox'`
   - `estimatedMinutes`: `estimatedHours * 60`
3. Return count of created todos and any errors (don't throw on partial failure)

**`functions/src/agents/langgraph/events.ts`** — Add event type:

```typescript
export function createPlanApprovedEvent(runId: RunId, plan: StructuredPlan): RunEvent
```

This event fires after plan approval, triggering todo creation.

**Tests:** `functions/src/agents/__tests__/planToTodos.test.ts`

1. Valid plan creates correct number of todos
2. Each todo has correct title, description, status, estimatedMinutes
3. Handles empty milestones gracefully
4. Partial failure (one todo fails) still creates the rest
5. Handles malformed plan JSON (returns error, doesn't crash)

---

### Phase 43: Content Creation — Brand Voice Memory & SEO-First Mode

**Goal:** Store user's writing style. Allow SEO-first ordering. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 43.

**Files to modify:**

**`packages/agents/src/domain/models.ts`** — Add brand voice type:

```typescript
export interface BrandVoice {
  tone: string           // e.g. "professional but conversational"
  vocabulary: string[]   // preferred/avoided words
  structure: string      // e.g. "short paragraphs, lots of headers"
  examples: string[]     // sample sentences/paragraphs
}
```

Add to a workflow-level config or as standalone user preference:

```typescript
export interface ContentPipelineConfig {
  brandVoice?: BrandVoice
  seoFirstMode?: boolean  // When true, run SEO Specialist before Writer
}
```

**`apps/web-vite/src/agents/templatePresets.ts`** — Modify writer agent templates:

1. Update `Thought Leadership Writer (Balanced)` system prompt: add a section for brand voice injection:
   ```
   {{#if brandVoice}}
   BRAND VOICE GUIDELINES:
   Tone: {{brandVoice.tone}}
   Vocabulary to use: {{brandVoice.vocabulary}}
   Structure: {{brandVoice.structure}}
   Reference examples: {{brandVoice.examples}}
   {{/if}}
   ```
   Since we don't have a template engine, implement this as: if the workflow config includes `brandVoice`, the execution engine appends a "BRAND VOICE" section to the writer agent's system prompt at runtime.

2. For SEO-first mode: Add a second workflow template `Content Pipeline (SEO-First)` with reversed order:
   ```
   Content Strategist → SEO Specialist → Content Research Analyst → Thought Leadership Writer → Content Polish Editor
   ```
   The SEO Specialist runs early to produce keyword targets, which feed into the writer.

**`functions/src/agents/langgraph/sequentialGraph.ts`** (or `utils.ts`) — Add brand voice injection:

```typescript
function injectBrandVoice(systemPrompt: string, brandVoice?: BrandVoice): string
```

Call this in `executeAgentWithEvents()` when the agent's role is `'writer'` or `'synthesizer'` and `brandVoice` is present in the run config.

**Tests:** `functions/src/agents/__tests__/brandVoice.test.ts`

1. Brand voice is appended to writer system prompt when present
2. Brand voice is NOT appended when absent
3. Brand voice is NOT injected for non-writer roles
4. SEO-first template has SEO Specialist before Writer
5. Both templates pass validation

---

### Phase 44: Content Creation — Multi-Format Output

**Goal:** One research input → parallel outputs in multiple formats. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 44.

**Files to modify:**

**`apps/web-vite/src/agents/templatePresets.ts`** — Add new agent templates:

1. **`Blog Article Writer (Fast)`** — role: `writer`, system prompt for long-form blog (1000-2000 words), headers, intro, body, conclusion. Model: `gpt-5-mini`.
2. **`Newsletter Writer (Fast)`** — role: `writer`, system prompt for email newsletter format (500-800 words), subject line, preview text, sections with CTAs. Model: `gpt-5-mini`.
3. **`X Thread Writer (Fast)`** — role: `writer`, system prompt for X/Twitter thread (8-15 tweets), hook, numbered thread, engagement CTA. Model: `gpt-5-mini`.

These complement the existing `LinkedIn Draft Writer (Balanced)`.

Add new workflow template:

**`Multi-Format Content Factory`** — type: `parallel`
- **Stage 1** (sequential): `Content Strategist (Balanced)` → `Content Research Analyst (Balanced)` — produces strategy + research
- **Stage 2** (parallel fan-out): Feed research into 4 parallel writers: `Blog Article Writer (Fast)`, `Newsletter Writer (Fast)`, `X Thread Writer (Fast)`, `LinkedIn Draft Writer (Balanced)`
- **Stage 3** (join): Combine outputs into a multi-format document

Since the existing workflow system doesn't support mixed sequential+parallel in a single workflow template config, implement this as a **graph workflow**:

```
strategist → researcher → fork_writers → blog_writer, newsletter_writer, x_thread_writer, linkedin_writer → join_outputs → end_node
```

Using the `fork` node type (added in Phase 33 fix) to fan out to all 4 writers, and a `join` node to combine.

**`packages/agents/src/domain/models.ts`** — Ensure `JoinAggregationMode` includes a `'concatenate'` option (for combining different format outputs without summarization).

**Tests:** `functions/src/agents/__tests__/multiFormatContent.test.ts`

1. Workflow template validates (all agent names exist, graph is well-formed)
2. Fork node fans out to 4 writer nodes
3. Join node has `aggregationMode: 'concatenate'`
4. All 4 writer agents use `fast` tier models (cost-sensitive parallel)

---

### Phase 45: Research Workflows — Smart Search Router & Caching

**Goal:** Auto-route by query type. Cache search results. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 45.

**Files to modify:**

**`functions/src/agents/deepResearch/searchRouter.ts`** (NEW FILE) — Query classifier:

```typescript
export type QueryType = 'factual' | 'conceptual' | 'academic' | 'comparative' | 'general'

export function classifyQueryType(query: string): QueryType
```

Implementation: Use keyword heuristics (no LLM needed):
- `factual`: starts with "what is", "when did", "how many", "who is", contains dates/numbers
- `academic`: contains "study", "research", "paper", "peer-reviewed", "meta-analysis", "evidence"
- `conceptual`: contains "why", "how does", "explain", "what causes", "relationship between"
- `comparative`: contains "compare", "vs", "difference between", "better", "which"
- `general`: default fallback

```typescript
export function getSearchStrategy(queryType: QueryType): {
  useSERP: boolean
  useScholar: boolean
  useSemantic: boolean
  priority: 'serp' | 'scholar' | 'semantic'
}
```

Routing rules:
- `factual` → SERP primary, skip scholar/semantic
- `academic` → Scholar primary, SERP secondary, Semantic optional
- `conceptual` → Semantic primary, SERP secondary
- `comparative` → SERP + Semantic, skip scholar
- `general` → all three

**`functions/src/agents/deepResearch/searchCache.ts`** (NEW FILE) — Firestore-backed cache:

```typescript
export async function getCachedSearchResults(
  userId: string,
  queryHash: string,
  source: 'serp' | 'scholar' | 'semantic',
  firestore: FirebaseFirestore.Firestore
): Promise<SearchResult[] | null>

export async function cacheSearchResults(
  userId: string,
  queryHash: string,
  source: 'serp' | 'scholar' | 'semantic',
  results: SearchResult[],
  firestore: FirebaseFirestore.Firestore
): Promise<void>
```

Cache TTLs: SERP = 24h, Scholar = 72h, Semantic = 48h. Use `createHash('sha256')` on the query string for `queryHash`. Store in `users/{userId}/searchCache/{queryHash}_{source}`.

**`functions/src/agents/deepResearch/sourceIngestion.ts`** — Integrate:

1. In `executeSearchPlan()`, before executing searches, check cache for each query
2. Only execute uncached searches
3. After successful searches, write results to cache
4. Use `classifyQueryType()` + `getSearchStrategy()` to determine which search types to execute (when search plan doesn't already specify)

**Tests:** `functions/src/agents/__tests__/searchRouter.test.ts`

1. "What is quantum computing" → factual → SERP primary
2. "peer-reviewed studies on sleep" → academic → Scholar primary
3. "why does inflation affect housing" → conceptual → Semantic primary
4. "React vs Vue" → comparative → SERP + Semantic
5. Cache hit returns cached results without executing search
6. Cache miss executes search and stores result
7. Expired cache entries are treated as misses
8. Cache key is deterministic (same query → same hash)

---

### Phase 46: Research Workflows — Multi-Hop Research & Citation Scoring

**Goal:** Recursive sub-question search with max 2 hops. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 46.

**Files to modify:**

**`functions/src/agents/deepResearch/multiHopSearch.ts`** (NEW FILE):

```typescript
export async function extractSubQuestions(
  claims: ExtractedClaim[],
  gaps: GapAnalysisResult,
  query: string,
  executeProvider: ProviderExecuteFn
): Promise<string[]>
```

Implementation:
1. From gap analysis results and existing claims, identify unanswered sub-questions
2. Use a fast model to generate 2-5 targeted follow-up queries
3. Each sub-question should be more specific than the original query

```typescript
export async function executeMultiHopSearch(
  originalQuery: string,
  claims: ExtractedClaim[],
  gaps: GapAnalysisResult,
  toolRegistry: ToolRegistry,
  context: ToolExecutionContext,
  budget: RunBudget,
  executeProvider: ProviderExecuteFn,
  maxHops: number = 2
): Promise<{ newResults: SearchResult[]; updatedBudget: RunBudget; hopsUsed: number }>
```

Implementation:
1. Extract sub-questions from gaps
2. For each hop (up to `maxHops`):
   - Execute searches for sub-questions
   - Check if gaps are sufficiently covered
   - If not, generate new sub-questions from new results
3. Budget-aware: stop if budget exhausted

**`functions/src/agents/langgraph/deepResearchGraph.ts`** — In the gap analysis → search loop:

1. When `gapAnalysis.shouldContinue === true`, call `executeMultiHopSearch()` instead of re-running the full search plan
2. Feed results back into source ingestion pipeline
3. Track hop count in state to respect `maxHops`

**`packages/agents/src/domain/deepResearchWorkflow.ts`** — Add to `DeepResearchRunConfig`:

```typescript
maxMultiHopDepth?: number  // Default: 2
```

**Tests:** `functions/src/agents/__tests__/multiHopSearch.test.ts`

1. Sub-questions are more targeted than original query
2. Multi-hop stops at maxHops limit
3. Multi-hop stops when budget exhausted
4. Results from follow-up searches are merged with original results
5. Empty gaps produce no sub-questions
6. Each hop reduces gap coverage score

---

### Phase 47: Productivity — Knowledge Manager Graph & Calendar Intelligence

**Goal:** Suggest note connections. Analyze meeting patterns. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 47.

**Files to modify:**

**`functions/src/agents/noteAnalysis.ts`** (or new file `functions/src/agents/knowledgeGraphSuggestions.ts`) — Add:

```typescript
export async function suggestNoteConnections(
  noteId: string,
  noteContent: string,
  existingConnections: string[],
  userId: string,
  executeProvider: ProviderExecuteFn,
  firestore: FirebaseFirestore.Firestore
): Promise<Array<{ targetNoteId: string; reason: string; strength: number }>>
```

Implementation:
1. Query the user's recent notes (last 50) from Firestore
2. Use a fast model to compare the current note's key concepts against other notes
3. Return suggested connections with reason and confidence strength (0-1)
4. Exclude already-connected notes

**`apps/web-vite/src/components/notes/NoteGraphView.tsx`** — Enhance:

1. Add support for "suggested" edges — render as dashed lines with lower opacity
2. Use CSS tokens: `var(--color-accent-dim)` for suggested edges, `var(--color-accent)` for confirmed edges
3. On click of a suggested edge, option to confirm (becomes solid) or dismiss

**`functions/src/agents/calendarIntelligence.ts`** (NEW FILE):

```typescript
export interface CalendarAnalysis {
  totalMeetingsThisWeek: number
  totalMeetingHours: number
  recurringMeetings: Array<{ title: string; frequency: string; totalHoursPerMonth: number }>
  meetingFreeBlocks: Array<{ day: string; startTime: string; duration: number }>
  suggestions: string[]  // e.g. "Cancel or reduce 'Weekly Sync' — attended 12 times, average duration 45min"
}

export async function analyzeCalendarPatterns(
  userId: string,
  events: CalendarEvent[],
  executeProvider: ProviderExecuteFn
): Promise<CalendarAnalysis>
```

Implementation:
1. Group events by recurrence pattern
2. Calculate total meeting hours per week
3. Identify focus blocks (meeting-free periods > 2 hours)
4. Use a fast model to generate 3-5 actionable suggestions (cancel low-value recurring meetings, protect focus time, etc.)

**Tests:** `functions/src/agents/__tests__/knowledgeGraphSuggestions.test.ts`

1. Returns suggestions excluding already-connected notes
2. Suggestions have valid strength scores (0-1)
3. Handles notes with no potential connections
4. Calendar analysis correctly counts meetings and hours
5. Recurring meetings are grouped correctly
6. Meeting-free blocks are identified

---

### Phase 48: Marketing & Sales — Coaching Memory & Competitive Intelligence

**Goal:** Store business context across sessions. Pull real competitor data. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 48.

**Files to modify:**

**`packages/agents/src/domain/models.ts`** — Add coaching context type:

```typescript
export interface CoachingContext {
  businessDescription: string
  targetAudience: string
  competitorNames: string[]
  pastDecisions: Array<{ date: string; decision: string; outcome?: string }>
  competitiveLandscape?: string
  contentCalendar?: Array<{ day: string; topic: string; format: string; platform: string }>
}
```

**`apps/web-vite/src/agents/templatePresets.ts`** — Update GTM coaching agent system prompts:

1. `GTM Offer Coach (Balanced)` — Prepend to system prompt:
   ```
   {{#if coachingContext}}
   BUSINESS CONTEXT (from previous sessions):
   Business: {{coachingContext.businessDescription}}
   Target audience: {{coachingContext.targetAudience}}
   Competitors: {{coachingContext.competitorNames}}
   Past decisions: {{coachingContext.pastDecisions}}
   {{/if}}
   ```
   (Same injection pattern as brand voice — append at runtime when available)

2. `GTM Marketing Coach (Balanced)` — Add `serp_search` to `toolIds` so it can pull real competitor data:
   ```typescript
   toolIds: ['tool:serp_search', 'tool:query_firestore']
   ```
   Update system prompt to include: "Before making recommendations, use serp_search to research current competitor positioning and market trends."

3. Add to the `GTM Marketing Coach (Balanced)` system prompt a structured output section for the weekly content calendar:
   ```
   When asked for a content calendar, output JSON:
   {
     "calendar": [
       { "day": "Monday", "topic": "...", "format": "blog|linkedin|newsletter|x-thread", "platform": "...", "postingTime": "9:00 AM" }
     ]
   }
   ```

**`functions/src/agents/langgraph/utils.ts`** (or `sequentialGraph.ts`) — Add coaching context injection:

```typescript
function injectCoachingContext(systemPrompt: string, coachingContext?: CoachingContext): string
```

Apply when agent role is `'advisor'` or `'custom'` and coaching context exists in run config. Similar to brand voice injection from Phase 43.

**Firestore storage:** Coaching context stored in `users/{userId}/preferences/coaching`. Updated after each coaching run with new decisions.

**Tests:** `functions/src/agents/__tests__/coachingMemory.test.ts`

1. Coaching context is injected into advisor/custom role agents when present
2. Coaching context is NOT injected for non-coaching roles
3. `serp_search` tool is available to GTM Marketing Coach
4. Content calendar JSON output is valid
5. Past decisions are included in context

---

## TRACK J: Iterative Refinement & Historical Calibration (Phase 49)

### Phase 49: Project Planning — Refinement Loop & Historical Calibration

**Goal:** Auto-route back for fixes after quality review. Use past data for time estimates. See `WORKFLOW_IMPROVEMENT_PLAN.md` Phase 49.

**Files to modify:**

**`apps/web-vite/src/agents/templatePresets.ts`** — Update the `Structured Project Planning` workflow graph:

1. Add a conditional edge from `quality_check` back to `improvement`:
   ```
   quality_check → end_node (if quality passes)
   quality_check → improvement (if quality fails, max 1 loop)
   ```
   Use `condition: { type: 'output_contains', value: 'NEEDS_REVISION' }` for the loop-back edge.

2. Track refinement count: the `Plan Quality Reviewer (Thinking)` system prompt should include:
   ```
   If this plan needs revisions, start your response with "NEEDS_REVISION:" followed by specific issues.
   If this plan is approved, start with "APPROVED:" followed by a brief summary.
   Limit: only 1 revision cycle is allowed. If this is already a revised plan, approve it with notes.
   ```

**`functions/src/agents/historicalCalibration.ts`** (NEW FILE):

```typescript
export interface HistoricalEstimate {
  averageHoursPerTask: number
  completionRatePercent: number
  commonDelayReasons: string[]
  sampleSize: number
}

export async function getHistoricalCalibration(
  userId: string,
  firestore: FirebaseFirestore.Firestore
): Promise<HistoricalEstimate | null>
```

Implementation:
1. Query completed todos from Firestore for the user (last 90 days)
2. Calculate average actual hours per task (using `completedAt - createdAt`)
3. Calculate completion rate (completed / total)
4. Group by estimated vs actual to find systematic bias
5. Return calibration data or null if insufficient data (<10 completed tasks)

**`apps/web-vite/src/agents/templatePresets.ts`** — Update `Time-Aware Planner (Balanced)` system prompt:

Append:
```
{{#if historicalCalibration}}
HISTORICAL CALIBRATION DATA:
- Average task completion time: {{historicalCalibration.averageHoursPerTask}} hours
- Task completion rate: {{historicalCalibration.completionRatePercent}}%
- Common delays: {{historicalCalibration.commonDelayReasons}}
- Based on {{historicalCalibration.sampleSize}} past tasks

Use this data to adjust time estimates. If the user typically underestimates by 40%, inflate estimates accordingly.
{{/if}}
```

(Inject at runtime, same pattern as brand voice and coaching context.)

**`functions/src/agents/langgraph/utils.ts`** — Add historical calibration injection:

```typescript
function injectHistoricalCalibration(
  systemPrompt: string,
  calibration?: HistoricalEstimate
): string
```

Apply when the agent template name contains "Time-Aware" or "Planner".

**Tests:** `functions/src/agents/__tests__/historicalCalibration.test.ts`

1. With 20+ completed todos, returns valid calibration data
2. With <10 completed todos, returns null
3. Average hours calculation is correct
4. Completion rate percentage is correct
5. Refinement loop triggers on "NEEDS_REVISION" output
6. Refinement loop stops after 1 iteration (max 1 loop)
7. "APPROVED" output goes directly to end_node

---

## Execution Instructions

1. **Read `WORKFLOW_IMPROVEMENT_PLAN.md`** sections 3.1–3.12 and the Phase 41-49 specs for full context.
2. **Execute phases sequentially** (41 → 42 → ... → 49).
3. **Pass the quality gate after each phase** (lint, typecheck, test).
4. **Commit each phase separately** with `feat(agents): <description> (Phase N)`.
5. **Use `--no-verify`** on commits if the pre-commit hook times out.
6. **Don't skip tests.** Every phase must have at least 4 unit tests.
7. **Runtime injection pattern** for brand voice, coaching context, and historical calibration: these are all appended to system prompts at runtime in `executeAgentWithEvents()` or the relevant graph executor. Do NOT use a template engine — use simple string concatenation with guards (if the config field is present, append the section).
8. **For new workflow templates:** add to `workflowTemplatePresets[]` in `templatePresets.ts`. Ensure `validateWorkflowTemplatePresets()` passes.
9. **For new files:** prefer adding to existing directories. Only create new files when the functionality is genuinely new (like `searchRouter.ts`, `searchCache.ts`, `calendarIntelligence.ts`, `historicalCalibration.ts`).

---

## Summary: Track I + J Phase Count

| Phase | Focus | Key Deliverables |
|-------|-------|-----------------|
| 41 | Project Planning — Time-Aware + Quick Mode | Time-Aware Planner node in graph, Quick Project Plan template |
| 42 | Project Planning — Structured Output + Todos | JSON plan output, `createTodosFromPlan()`, plan approved event |
| 43 | Content — Brand Voice + SEO-First | `BrandVoice` type, runtime injection, SEO-First template |
| 44 | Content — Multi-Format Output | 3 new writer agents, Multi-Format Content Factory graph workflow |
| 45 | Research — Smart Search Router + Caching | `classifyQueryType()`, Firestore search cache, TTL management |
| 46 | Research — Multi-Hop + Citation Scoring | `extractSubQuestions()`, `executeMultiHopSearch()`, max 2 hops |
| 47 | Productivity — Knowledge Graph + Calendar | Note connection suggestions, dashed edges in graph view, `analyzeCalendarPatterns()` |
| 48 | Marketing — Coaching Memory + Competitive Intel | `CoachingContext` type, runtime injection, `serp_search` on GTM agents |
| 49 | Refinement — Loop + Historical Calibration | Quality check → improvement loop, `getHistoricalCalibration()`, estimate adjustment |

**Total: 9 phases** | Each ≤20 min agent coding time | Quality gate after every phase
