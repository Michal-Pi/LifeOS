# LifeOS Workflow Improvement Plan

> Updated: 2026-03-04 | Based on: Codebase audit, market comparison, pricing analysis, architectural review

---

## Philosophy: Quality-First, Cost-Smart

**Not all workflows are equal.** This plan applies a tiered cost philosophy:

- **Critical Workflows** (Dialectical, Deep Research, Expert Council): **Invest in quality.** Use the best models at every reasoning-heavy step. Reasonable costs are fine — these are the crown jewels that produce genuinely differentiated output. Optimize _structure_ (fewer redundant calls, better batching) but never downgrade model quality on reasoning steps.
- **Core Workflows** (Project Planning, Content Creation, Supervisor): **Balanced approach.** Use premium models for the steps that matter (planning, synthesis, critique) but save on mechanical steps (data gathering, formatting, routing).
- **Routine Workflows** (Quick Search, Calendar, Calculator, Summarizer): **Optimize aggressively.** These run frequently and don't need heavy reasoning. Use the cheapest models that produce acceptable output.

---

## Adjustments from Review (2026-03-04)

### Adjustment 1: Model Routing — Two Execution Modes

Each workflow supports **two execution modes** the user can toggle at run time:

| Mode                      | Behavior                                                                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **As-Designed** (default) | Uses the `modelTier` assigned per agent in the template (`thinking`, `balanced`, `fast`). The workflow runs exactly as its author intended.                                                         |
| **Cost-Saving**           | Overrides every agent to the cheapest tier that still produces acceptable output. Critical workflows are downgraded from `thinking` → `balanced` (never to `fast`). Routine workflows go to `fast`. |

Additionally, the user can **force a specific tier** (`thinking`, `balanced`, or `fast`) for _any_ workflow run, overriding both the template defaults and the mode. This acts as a manual dial: "run this entire workflow with thinking-class models."

**Implementation:** Add `executionMode: 'as_designed' | 'cost_saving'` and optional `tierOverride: 'thinking' | 'balanced' | 'fast' | null` to the `Run` config. The execution engine resolves the effective model for each agent at runtime: `tierOverride > executionMode mapping > agent template default`.

### Adjustment 2: Section 1.4 — Tools Update

- **`send_email_draft`**: ~~Already implemented~~ — the mailbox has full AI-assisted email drafting with multi-channel support (Gmail, Slack, LinkedIn, WhatsApp, Telegram), rich text via TipTap, and `MailboxAIToolsDropdown`. **Remove from plan.**
- **`generate_chart`**: TipTap already supports images via base64 embedding, drag-drop, and paste. Charts will be generated server-side (e.g., using a headless chart library like `chart.js` or `quickchart.io` API), rendered to PNG, and **inserted into TipTap as base64 images**. No TipTap extension changes needed — the existing `Image` extension with `allowBase64: true` handles this. The chart tool output can also be used standalone outside of notes.

### Adjustment 3: Workflow Composability — Agent Deduplication

When creating a workflow from a template, the system should **not blindly create new agent instances**. Instead:

1. Hash the agent config (systemPrompt + role + tools + modelProvider + modelName + temperature).
2. Check if an agent with the same hash already exists for the user.
3. If match found → reuse that `agentId` in the workflow's `agentIds` array.
4. If no match → create a new agent as before.

This prevents agent proliferation while still allowing users to customize agents independently later (customization breaks the hash, creating a fork).

### Adjustment 4: Section 2 Scope

Implement from Section 2:

- **2.1 High Value (all three):** Analysis Planner, KPI Tree Architect, Executive Summary Writer
- **2.2 Medium Value (two):** Segmentation Expert, Analytics Orchestrator

Skip: 2.3 Lower Value items.

### Adjustment 5: Section 3 Scope

Implement **all** improvements listed in Section 3 (3.1 through 3.12).

---

## Table of Contents

1. [Overall Improvements (Cross-Cutting)](#1-overall-improvements-cross-cutting)
2. [New Tool & Agent Ideas](#2-new-tool--agent-ideas)
3. [Per-Workflow Improvement Proposals](#3-per-workflow-improvement-proposals)
4. [Phased Implementation Plan](#4-phased-implementation-plan)

---

## 1. Overall Improvements (Cross-Cutting)

### 1.1 Model Routing & Tiered Cost Strategy

**Current State:** Each agent template hardcodes a specific model. No dynamic routing based on task complexity or workflow criticality.

**Proposal: Smart Model Routing with Two Execution Modes**

Add a `modelTier` field to agent configs (`fast`, `balanced`, `thinking`) instead of hardcoding model names. At runtime, resolve to a concrete model based on:

1. **Tier Override** (user forces `thinking`/`balanced`/`fast` for the whole run)
2. **Execution Mode** (`as_designed` uses template tiers; `cost_saving` downgrades)
3. **Agent Template Default** (fallback)

**Model Tier → Concrete Model Mapping:**

| Tier       | OpenAI       | Anthropic           | Google           | xAI                           |
| ---------- | ------------ | ------------------- | ---------------- | ----------------------------- |
| `thinking` | `o1`         | `claude-opus-4-6`   | `gemini-3-pro`   | `grok-4`                      |
| `balanced` | `gpt-5.2`    | `claude-sonnet-4-5` | `gemini-2.5-pro` | `grok-4-1-fast-non-reasoning` |
| `fast`     | `gpt-5-mini` | `claude-haiku-4-5`  | `gemini-3-flash` | `grok-3-mini`                 |

**Cost-Saving Mode Rules:**

| Workflow Criticality                                  | Template Tier | Cost-Saving Override        |
| ----------------------------------------------------- | ------------- | --------------------------- |
| Critical (Dialectical, Deep Research, Expert Council) | `thinking`    | → `balanced` (never `fast`) |
| Critical                                              | `balanced`    | → `balanced` (unchanged)    |
| Core (Supervisor, Project Planning, Content)          | `thinking`    | → `balanced`                |
| Core                                                  | `balanced`    | → `fast`                    |
| Routine (Quick Search, Calendar, Summarizer)          | any           | → `fast`                    |

### 1.2 Prompt Caching & Context Compression

| Change                                                                                                                              | Expected Impact                                | Effort |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------ |
| Enable Anthropic **prompt caching** for system prompts (auto-cached after 1024 tokens)                                              | 90% discount on cached input tokens            | Low    |
| Add **context summarization** between sequential agents — use a nano model to compress previous output before passing to next agent | 30-40% token reduction in later stages         | Medium |
| Implement **sliding window context** for long conversations (keep last N messages + compressed history)                             | Prevents context window overflow; reduces cost | Medium |

### 1.3 Evaluation & Quality Feedback Loop

| Change                                                                                                                                                            | Expected Impact                             | Effort |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------ |
| Build an **auto-evaluation pipeline**: after each run, use a cheap judge model to score output quality on 3 dimensions (relevance, completeness, accuracy)        | Enables data-driven model routing decisions | Medium |
| Store evaluation scores alongside runs in Firestore; surface trends in a dashboard                                                                                | Visibility into quality over time           | Medium |
| Use evaluation data to **auto-tune model selection** — if a `fast` model consistently scores >4/5 for a given agent template, keep it; if it drops, auto-escalate | Self-optimizing cost/quality tradeoff       | High   |

### 1.4 New Built-in Tools (High-ROI Additions)

| Tool                   | What It Does                                                     | Why It's Worth It                                                                                                                                        | Effort |
| ---------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **`code_interpreter`** | Execute Python/JS code for data analysis, charting, calculations | Enables data-driven agents, personal analytics, habit analysis                                                                                           | High   |
| **`update_todo`**      | Update/complete existing todos (currently only create/list)      | Closes the loop on task management workflows                                                                                                             | Low    |
| **`memory_recall`**    | Search user's past conversations and run outputs                 | Enables continuity across sessions; huge UX improvement                                                                                                  | Medium |
| **`generate_chart`**   | Generate charts (bar, line, pie) from data → PNG → base64 image  | Visual outputs for data analyst and research agents. Inserts into TipTap via existing `Image` extension (`allowBase64: true`). No editor changes needed. | Medium |
| **`webhook_call`**     | Make authenticated HTTP calls to user-configured endpoints       | Enables Zapier/Make-style integrations without custom tools                                                                                              | Medium |

### 1.5 Streaming & Real-Time UX

| Change                                                                       | Expected Impact                                         | Effort |
| ---------------------------------------------------------------------------- | ------------------------------------------------------- | ------ |
| Surface **real-time streaming** of agent outputs via Firestore onSnapshot    | Users see agents "thinking" live; much better UX        | Medium |
| Add **step-level progress indicators** (e.g., "Agent 3/5: Writing draft...") | Reduces perceived wait time                             | Low    |
| Show **cost accumulation in real-time** during run execution                 | Budget awareness; users can cancel expensive runs early | Low    |

### 1.6 Workflow Composability & Agent Deduplication

| Change                                                                                                                                         | Expected Impact                                                   | Effort |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------ |
| **Agent deduplication on workflow creation** — hash agent configs, reuse existing agents with identical configs instead of creating duplicates | Prevents agent proliferation; cleaner agent list                  | Medium |
| Allow workflows to reference other workflows as **sub-workflows** (new node type: `subworkflow`)                                               | Composability; DRY; complex workflows from simple building blocks | High   |
| Add **conditional branching** in sequential workflows (if-else based on output content)                                                        | More flexible workflows without full graph mode                   | Medium |

---

## 2. New Tool & Agent Ideas

### 2.1 High Value — Implement Now

#### Analysis Planner (workflow template)

- **What:** Structures analysis investigations with hypothesis generation, data requirements, and visualization plans before diving into data.
- **Adaptation:** Create a **"Personal Analytics Pipeline"** workflow template:
  1. Analysis Planner agent (define question + hypotheses)
  2. Personal Data Analyst agent (execute queries via `query_firestore`, `calculate`)
  3. Results Collector agent (structure findings)
  4. Executive Summary agent (produce actionable brief)
- **Model strategy:** Planner on `gpt-5-mini`, Data Analyst on `gemini-3-flash`, Summary on `claude-haiku-4-5`

#### KPI Tree Architect (agent template)

- **What:** Builds hierarchical metric decomposition trees using MECE principles.
- **Adaptation:** New **"Goal Decomposition Coach"** agent template with access to `query_firestore`, `list_todos`, `list_calendar_events`.
- **Model strategy:** `claude-sonnet-4-5` (needs strong reasoning for MECE decomposition)

#### Executive Summary Writer (agent template)

- **What:** Uses MAIN framework (Motive, Answer, Impact, Next steps) for concise executive summaries.
- **Adaptation:** Replace the generic "Executive Synthesizer" agent template with a MAIN-framework-aware version.
- **Model strategy:** `gpt-5-mini` (structured output)

### 2.2 Medium Value — Implement Now

#### Segmentation Expert (agent template)

- **What:** Segments contacts by behavioral, demographic, and value dimensions.
- **Adaptation:** New **"Network Segmentation"** agent with access to contact and calendar data. Auto-categorizes: "high-energy givers" vs "dormant connections" vs "new opportunities."
- **Model strategy:** `claude-sonnet-4-5`

#### Analytics Orchestrator (workflow routing)

- **What:** Routes users to the right analytics agent based on their question.
- **Adaptation:** Enhance the existing **Supervisor** workflow type with a pre-built "LifeOS Orchestrator" template that asks "what are you trying to accomplish?" and auto-selects the right workflow.
- **Model strategy:** `gpt-5-mini` for routing, delegate to appropriate agents

---

## 3. Per-Workflow Improvement Proposals

### 3.1 Sequential Workflows

| Improvement                                                                                                                                      | Expected Outcome                                                    | Priority |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | -------- |
| **Add early-exit conditions** — if agent N produces output containing a termination signal (e.g., "ANSWER_FOUND"), skip remaining agents         | Save 30-60% cost on workflows that find answers early               | High     |
| **Context compression between steps** — use gpt-5-nano to summarize agent N's output before passing to agent N+1                                 | Reduce token usage by 40% in later stages; prevent context overflow | High     |
| **Add quality gates** — after each agent, run a fast LLM check: "Does this output meet the brief? Score 1-5." If <3, retry with a stronger model | Catch quality issues early instead of propagating bad output        | Medium   |
| **Parallel pre-fetch** — if agent N+1 needs tools, start tool calls while agent N is still running                                               | 15-20% latency reduction                                            | Low      |

### 3.2 Parallel Workflows

| Improvement                                                                                     | Expected Outcome                                      | Priority |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------- |
| **Heterogeneous models for diversity** — use different providers for each parallel branch       | Better consensus; natural model diversity             | High     |
| **Adaptive fan-out** — for `consensus` merge, start with 3 agents; if consensus low, add 2 more | Save cost on easy questions; invest more on hard ones | Medium   |
| **Weighted merge** — assign weights based on historical quality scores                          | Better output quality from merge step                 | Medium   |
| **Budget-aware parallelism** — if budget tight, reduce fan-out                                  | Prevents budget overruns                              | Low      |

### 3.3 Supervisor Workflows

| Improvement                                                                                               | Expected Outcome                                         | Priority |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------- |
| **Planning phase** — supervisor creates explicit plan before delegating, shown to user                    | Transparency; better delegation; user can approve/modify | High     |
| **Self-reflection** — after each worker output, supervisor evaluates: "Did this achieve what I expected?" | Self-correcting; catches bad delegations                 | High     |
| **Tool-aware delegation** — supervisor sees which tools each worker has                                   | Better task-to-agent matching                            | Medium   |
| **Budget allocation** — supervisor assigns token budgets per delegation                                   | Prevents workers from burning budget                     | Medium   |

### 3.4 Graph (Custom) Workflows

| Improvement                                                                                     | Expected Outcome                      | Priority |
| ----------------------------------------------------------------------------------------------- | ------------------------------------- | -------- |
| **Human-in-the-loop approval nodes** — pause execution for user approval                        | Critical for high-stakes workflows    | High     |
| **Loop detection & budget guardrails** — auto-terminate if loop >N times or cost exceeds budget | Prevents runaway costs                | High     |
| **Checkpoint visualization** — green (done), yellow (current), gray (pending) nodes             | Users understand workflow state       | Medium   |
| **Template parameterization** — `{{variables}}` that users fill at run time                     | Reusable templates; better onboarding | Medium   |
| **Error recovery branches** — edges with error conditions                                       | Resilience; fewer failed runs         | Medium   |

### 3.5 Expert Council

| Improvement                                                                         | Expected Outcome                    | Priority |
| ----------------------------------------------------------------------------------- | ----------------------------------- | -------- |
| **Domain-specific judge rubrics** — auto-detect domain, use specialized rubrics     | Much better quality discrimination  | Critical |
| **Enforce model diversity** — council members must use different providers          | Genuine perspective diversity       | Critical |
| **Dynamic council composition** — auto-select best 3-4 models from historical data  | Best quality without manual config  | High     |
| **"Quick Council" mode** — 2 strong + 1 fast judge, skip chairman if high consensus | Faster on easy questions            | High     |
| **Cache-aware council** — return cached result for similar prompts                  | Near-zero cost for repeated queries | Medium   |
| **Disagreement deep-dive** — when consensus LOW, trigger follow-up reasoning round  | Better results on hard questions    | Medium   |

### 3.6 Deep Research

| Improvement                                                                     | Expected Outcome                          | Priority |
| ------------------------------------------------------------------------------- | ----------------------------------------- | -------- |
| **Batch source processing** — process 3-5 sources in one LLM call               | 50-70% fewer LLM calls, zero quality loss | Critical |
| **Parallel search execution** — SERP, Scholar, Semantic simultaneously          | 3x faster search phase                    | Critical |
| **Source quality scoring** — weight claims by domain authority, date, citations | Better answer quality                     | Critical |
| **Incremental KG updates** — reuse existing KG for follow-up research           | Deeper results on iterative research      | High     |
| **Multi-hop deep search** — launch follow-up searches to fill gaps              | More thorough coverage                    | High     |
| **Counterclaim strengthening** — dedicated adversarial agent step               | More balanced, trustworthy output         | High     |
| **Smart source prioritization** — rank sources before ingesting                 | Fewer wasted calls                        | Medium   |
| **Tiered mode** — "Quick Research" option (skip KG + Gap Analysis)              | Fast path for simple factual questions    | Medium   |

### 3.7 Dialectical (Hegelian)

| Improvement                                                                                                        | Expected Outcome                   | Priority |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | -------- |
| **Best-model-per-lens** — adversarial with Claude, economic with o1, behavioral with Gemini, political with Grok   | Best-in-class reasoning per lens   | Critical |
| **Multi-cycle progressive deepening** — Cycle 1 broad, Cycle 2 deep on HIGH contradictions, Cycle 3 single tension | Much deeper synthesis              | Critical |
| **Reusable concept library** — store versioned concepts, reuse in related topics                                   | Compounding intelligence           | High     |
| **Contradiction severity threshold** — only pursue HIGH severity for deeper cycles                                 | Better reasoning effort allocation | High     |
| **"Quick Dialectic"** — 2 lenses, 1 cycle, no KG                                                                   | Accessible for daily decisions     | High     |
| **Visual contradiction map** — show severity, relationships, resolution paths                                      | User understanding; trust          | Medium   |
| **Dialectical + Deep Research fusion** — theses trigger research sub-runs                                          | Evidence-grounded dialectics       | Medium   |

### 3.8 Project Planning

| Improvement                                                              | Expected Outcome                                | Priority |
| ------------------------------------------------------------------------ | ----------------------------------------------- | -------- |
| **Time-Aware Planner integration** — integrate into main workflow        | Realistic timelines grounded in user's schedule | High     |
| **Template-based output** — structured JSON, render as interactive Gantt | Professional presentation; editable plans       | High     |
| **"Quick Plan" mode** — skip Risk + Quality for simple projects          | 50% cost reduction on simple projects           | High     |
| **Iterative refinement loop** — auto-route back for fixes                | Self-correcting plans                           | Medium   |
| **Integration with todos** — auto-create todos from approved plan        | Plans become actionable immediately             | Medium   |
| **Historical calibration** — use past completion data for estimates      | More accurate estimates over time               | Low      |

### 3.9 Content Creation Pipeline

| Improvement                                                                                | Expected Outcome            | Priority |
| ------------------------------------------------------------------------------------------ | --------------------------- | -------- |
| **"Content Pipeline" workflow template** — Strategy → Research → Draft → Edit → SEO        | One-click content creation  | Critical |
| **Brand voice memory** — store user's writing style, inject into prompts                   | Consistent personal brand   | High     |
| **"LinkedIn Content Factory" workflow** — Idea → Research → Draft → Critique → Polish      | Highest-ROI social content  | High     |
| **Multi-format output** — one research → parallel: LinkedIn + blog + newsletter + X thread | 4x content from 1x research | Medium   |
| **SEO-first mode** — run SEO Specialist first to identify keywords                         | Content that actually ranks | Medium   |

### 3.10 Research Workflows

| Improvement                                                                                                    | Expected Outcome                     | Priority |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------- |
| **Smart Search Router** — auto-route by query type (factual → SERP, conceptual → Semantic, academic → Scholar) | Better results; simpler UX           | High     |
| **Source deduplication** — merge same source from multiple searches, boost score                               | Cleaner results                      | Medium   |
| **Search result caching** — SERP 24h, Semantic 72h                                                             | Save API costs                       | Medium   |
| **Multi-hop research** — recursive sub-question search                                                         | Deeper answers for complex questions | Medium   |
| **Citation quality scoring** — rank by authority, date, citations                                              | Trustworthy sources                  | Low      |

### 3.11 Productivity Workflows

| Improvement                                                                              | Expected Outcome                | Priority |
| ---------------------------------------------------------------------------------------- | ------------------------------- | -------- |
| **"Morning Brief" scheduled workflow** — daily: calendar → meetings → todos → priorities | Proactive daily assistance      | Critical |
| **"Weekly Review" scheduled workflow** — weekly: habits → notes → projects → reflection  | Automated self-reflection       | High     |
| **Knowledge Manager + Graph** — visualize note connections, suggest links                | Personal knowledge graph        | High     |
| **Calendar intelligence** — analyze meeting patterns, suggest optimizations              | Proactive calendar optimization | Medium   |
| **Cross-data insights** — correlate calendar, todos, habits                              | Data-driven self-optimization   | Medium   |

### 3.12 Marketing & Sales Coaching

| Improvement                                                                     | Expected Outcome                      | Priority |
| ------------------------------------------------------------------------------- | ------------------------------------- | -------- |
| **"Go-to-Market Pipeline" workflow** — Offer → Marketing → Content → Sales      | Complete business strategy in one run | High     |
| **Personalized coaching memory** — store business context across sessions       | Feels like a real coach               | High     |
| **Competitive intelligence integration** — pull real competitor data            | Data-grounded advice                  | Medium   |
| **Weekly content calendar generation** — 7-day plan with topics, formats, times | Actionable output                     | Medium   |

---

## 4. Phased Implementation Plan

Each phase is scoped to **≤20 minutes of agent coding time**. Every phase must pass the **quality gate** before moving to the next.

### Quality Gate (Required After Every Phase)

```
1. Code Review     — Read through all changed files for correctness and clarity
2. Architecture    — Verify changes follow existing patterns (ports/adapters, domain models, usecases)
3. Lint            — pnpm lint (must pass with zero errors)
4. TypeCheck       — pnpm typecheck (must pass with zero errors)
5. Test Suite      — Write tests for ALL new/changed logic (unit tests in Vitest)
6. Test Run        — pnpm test (must pass with zero failures)
7. Design System   — Any UI changes must use tokens from tokens.css, reuse existing components,
                     and match the neon/cyberpunk design language (dark/light mode)
```

---

### TRACK A: Foundation & Cross-Cutting (Phases 1–8)

#### Phase 1: Model Tier System — Domain Types

**Goal:** Add `modelTier`, `executionMode`, and `tierOverride` to domain models.

**Files to modify:**

- `packages/agents/src/domain/models.ts` — Add `ModelTier = 'thinking' | 'balanced' | 'fast'` type. Add `modelTier?: ModelTier` to `AgentConfig`. Add `executionMode: 'as_designed' | 'cost_saving'` and `tierOverride?: ModelTier | null` to `Run` interface.
- `packages/agents/src/domain/modelSettings.ts` — Add `MODEL_TIER_MAP: Record<ModelTier, Record<ModelProvider, string>>` mapping tiers to concrete models. Add `COST_SAVING_RULES` mapping workflow criticality to tier downgrade logic.

**Tests:** Unit tests for tier mapping and cost-saving downgrade logic.

---

#### Phase 2: Model Tier System — Runtime Resolution

**Goal:** The execution engine resolves the effective model for each agent at runtime.

**Files to modify:**

- `packages/agents/src/domain/modelSettings.ts` — Add `resolveEffectiveModel(agentConfig, executionMode, tierOverride, workflowCriticality): { provider, model }` function.
- `functions/src/agents/langgraph/utils.ts` — In `executeAgentWithEvents()`, call `resolveEffectiveModel()` to determine the actual model before calling the provider service. Pass `executionMode` and `tierOverride` from run config.
- `functions/src/agents/workflowExecutor.ts` — Thread `executionMode` and `tierOverride` from `Run` into `LangGraphExecutionConfig`.

**Tests:** Unit tests for `resolveEffectiveModel` with all combinations: as_designed, cost_saving, tier override, per-criticality rules.

---

#### Phase 3: Model Tier System — UI Controls

**Goal:** Users can select execution mode and tier override when starting a workflow run.

**Files to modify:**

- Web app: workflow run dialog/component — Add toggle for "As-Designed" vs "Cost-Saving" mode. Add optional dropdown for tier override ("Default", "Fast", "Balanced", "Thinking").
- Must use existing design system tokens (toggle styles, dropdown component patterns from the existing codebase).

**Tests:** Component tests for the new controls. Verify the values are passed through to the run config.

---

#### Phase 4: Agent Deduplication on Workflow Creation

**Goal:** When creating a workflow from a template, reuse existing identical agents instead of creating new ones.

**Files to modify:**

- `packages/agents/src/usecases/templateUsecases.ts` — In the workflow-from-template creation flow, before creating each agent: hash the agent config (systemPrompt + role + toolIds + modelProvider + modelName + temperature), query existing agents for matching hash, reuse if found.
- `packages/agents/src/domain/models.ts` — Add optional `configHash?: string` to `AgentConfig` for efficient lookup.
- Agent repository — Add `findByConfigHash(userId, hash)` method.

**Tests:** Unit tests: creating from template with no existing agents (creates new), creating with identical agent (reuses), creating with similar-but-different agent (creates new).

---

#### Phase 5: Prompt Caching — Anthropic

**Goal:** Enable prompt caching for Anthropic system prompts.

**Files to modify:**

- `functions/src/agents/anthropicService.ts` — Add `cache_control: { type: 'ephemeral' }` to system message blocks that exceed 1024 tokens. Track cache hit/miss in telemetry.
- `functions/src/agents/telemetry/` — Add cache hit/miss metrics.

**Tests:** Unit tests verifying cache_control is added to long system prompts and not to short ones.

---

#### Phase 6: Context Compression Between Sequential Agents

**Goal:** Compress agent output before passing to the next agent in sequential workflows.

**Files to modify:**

- `functions/src/agents/langgraph/sequentialGraph.ts` — After each agent node, add an optional compression step. Use a fast model (gpt-5-nano or grok-3-mini) to summarize the previous output if it exceeds a token threshold (e.g., 2000 tokens).
- `packages/agents/src/domain/models.ts` — Add `enableContextCompression?: boolean` to `Workflow` config (default: false for critical, true for routine).

**Tests:** Unit tests: compression triggers when output exceeds threshold, skips when under threshold, compressed output is passed to next agent.

---

#### Phase 7: Streaming & Real-Time Progress

**Goal:** Add step-level progress indicators and cost accumulation display.

**Files to modify:**

- `functions/src/agents/runEvents.ts` — Emit `step_started`, `step_completed` events with agent name, step index, total steps, cumulative cost.
- `functions/src/agents/langgraph/utils.ts` — Emit progress events from `executeAgentWithEvents()`.
- Web app: run detail/progress component — Subscribe to Firestore onSnapshot for run events. Display "Agent 3/5: Writing draft..." and running cost total.
- Use design system tokens for progress indicator styling.

**Tests:** Unit tests for event emission. Component tests for progress display.

---

#### Phase 8: Auto-Evaluation Pipeline

**Goal:** After each run, score output quality using a cheap judge model.

**Files to modify:**

- `functions/src/agents/evaluation.ts` (new) — `evaluateRunOutput(output, goal): { relevance, completeness, accuracy }` using gpt-5-nano. Returns scores 1-5 on each dimension.
- `functions/src/agents/workflowExecutor.ts` — After run completes, call `evaluateRunOutput()` and store scores on the `Run` document.
- `packages/agents/src/domain/models.ts` — Add `evaluationScores?: { relevance: number, completeness: number, accuracy: number }` to `Run`.

**Tests:** Unit tests for evaluation scoring. Integration test for post-run evaluation.

---

### TRACK B: Sequential, Parallel & Supervisor Workflows (Phases 9–14)

#### Phase 9: Sequential — Early-Exit Conditions

**Goal:** If an agent produces output containing a termination signal, skip remaining agents.

**Files to modify:**

- `functions/src/agents/langgraph/sequentialGraph.ts` — After each agent node, check output for `ANSWER_FOUND` or configurable termination patterns. If found, route directly to END node, skip remaining agents.
- `packages/agents/src/domain/models.ts` — Add `earlyExitPatterns?: string[]` to `Workflow` config.

**Tests:** Unit tests: early exit triggers on pattern match, full chain runs when no match, multiple pattern support.

---

#### Phase 10: Sequential — Quality Gates

**Goal:** After each agent, run a fast quality check. Retry with stronger model on low score.

**Files to modify:**

- `functions/src/agents/langgraph/sequentialGraph.ts` — After each agent, optionally invoke a fast judge (gpt-5-nano) to score output 1-5. If score < 3, retry the same agent with the next tier up (fast→balanced→thinking). Max 1 retry per step.
- `packages/agents/src/domain/models.ts` — Add `enableQualityGates?: boolean` to `Workflow`.

**Tests:** Unit tests: quality gate passes (continues), fails and retries with upgraded model, respects max retry limit.

---

#### Phase 11: Parallel — Heterogeneous Models & Adaptive Fan-Out

**Goal:** Use different providers per parallel branch. Adaptive fan-out for consensus mode.

**Files to modify:**

- `functions/src/agents/langgraph/parallelGraph.ts` — When workflow specifies `heterogeneousModels: true`, rotate providers across branches (Claude, GPT, Gemini, Grok). For `consensus` merge mode, if Kendall Tau < 0.6, spawn additional agents.
- `packages/agents/src/domain/models.ts` — Add `heterogeneousModels?: boolean` and `adaptiveFanOut?: boolean` to `Workflow`.

**Tests:** Unit tests: provider rotation works correctly, adaptive fan-out triggers on low consensus, doesn't trigger on high consensus.

---

#### Phase 12: Parallel — Weighted Merge & Budget-Aware Parallelism

**Goal:** Weight parallel agent outputs by historical quality. Reduce fan-out when budget is tight.

**Files to modify:**

- `functions/src/agents/langgraph/parallelGraph.ts` — In merge step, apply weights from historical evaluation scores (from Phase 8). Add budget check before fan-out: if remaining budget < estimated cost × fan-out, reduce fan-out count.
- `packages/agents/src/domain/models.ts` — Add `maxBudget?: number` to `Workflow`.

**Tests:** Unit tests: weighted merge produces different output than unweighted, budget-aware reduction triggers correctly.

---

#### Phase 13: Supervisor — Planning Phase & Self-Reflection

**Goal:** Supervisor creates an explicit plan before delegating. Evaluates worker output after each delegation.

**Files to modify:**

- `functions/src/agents/langgraph/supervisorGraph.ts` — Add `planning_phase` node before first delegation: supervisor generates plan ("I will use Agent A for X, then Agent B for Y, because Z"). Store plan in state. After each worker returns, add `reflection_phase`: supervisor evaluates "Did this achieve what I expected? Should I re-delegate?"
- Emit plan as a run event so UI can display it.

**Tests:** Unit tests: planning phase produces structured plan, reflection detects satisfactory output, reflection triggers re-delegation on poor output.

---

#### Phase 14: Supervisor — Tool-Aware Delegation & Budget Allocation

**Goal:** Supervisor sees worker tools. Assigns token budgets per delegation.

**Files to modify:**

- `functions/src/agents/langgraph/supervisorGraph.ts` — Include each worker's `toolIds` and tool descriptions in the supervisor's system prompt. Add `maxTokens` constraint per delegation in supervisor's routing decision.
- `functions/src/agents/langgraph/utils.ts` — Respect per-delegation `maxTokens` if set by supervisor.

**Tests:** Unit tests: supervisor prompt includes worker tools, token budget is enforced.

---

### TRACK C: Graph Workflows (Phases 15–17)

#### Phase 15: Graph — Human-in-the-Loop Nodes

**Goal:** Add a `human_approval` node type that pauses execution and waits for user input.

**Files to modify:**

- `packages/agents/src/domain/models.ts` — Add `'human_approval'` to `WorkflowGraphNodeType`.
- `functions/src/agents/langgraph/genericGraph.ts` — Handle `human_approval` nodes: set run status to `waiting_for_input`, emit event, store pending state. Resume logic when user provides approval/rejection/modification.
- Web app: graph workflow UI — Show approval dialog when `waiting_for_input` status detected. Use design system modal/dialog patterns.

**Tests:** Unit tests: execution pauses at approval node, resumes on approval, routes to error branch on rejection.

---

#### Phase 16: Graph — Loop Detection, Budget Guardrails & Error Recovery

**Goal:** Prevent runaway loops. Add error recovery edges.

**Files to modify:**

- `functions/src/agents/langgraph/genericGraph.ts` — Track visit count per node. If any node exceeds `maxVisits` (default 10) or total cost exceeds `maxBudget`, auto-terminate with summary. Add `error` edge condition type: if agent node throws, follow error edge instead of default.
- `packages/agents/src/domain/models.ts` — Add `maxVisitsPerNode?: number` to `WorkflowGraph`. Add `'error'` to edge condition types.

**Tests:** Unit tests: loop detection triggers, budget guardrail triggers, error recovery follows correct edge.

---

#### Phase 17: Graph — Checkpoint Visualization & Template Parameterization

**Goal:** Visual node status in UI. Template variables.

**Files to modify:**

- Web app: `WorkflowGraphView.tsx` or `InteractiveWorkflowGraph.tsx` — Color nodes based on execution state: green (completed), yellow (running), gray (pending), red (failed). Read state from run events.
- `packages/agents/src/domain/models.ts` — Add `parameters?: Record<string, { description: string, required: boolean }>` to `WorkflowTemplate`. At run time, resolve `{{variable}}` placeholders in agent prompts.
- `functions/src/agents/langgraph/genericGraph.ts` — Before execution, replace `{{variable}}` placeholders in all node prompts with user-provided values.
- Use design system tokens for node colors.

**Tests:** Unit tests: template variable resolution, missing required variable throws error. Component tests for node coloring.

---

### TRACK D: Expert Council (Phases 18–20)

#### Phase 18: Expert Council — Domain-Specific Judge Rubrics & Model Diversity

**Goal:** Judges use domain-specific rubrics. Council members must use different providers.

**Files to modify:**

- `functions/src/agents/expertCouncil.ts` — Add domain detection from prompt (research, creative, analytical, code, factual). Select rubric accordingly. Enforce that council `modelConfigs` use distinct `modelProvider` values; if not, auto-reassign to ensure diversity.
- `packages/agents/src/domain/models.ts` — Add `judgeRubricDomain?: 'research' | 'creative' | 'analytical' | 'code' | 'factual' | 'auto'` to `ExpertCouncilConfig`.

**Tests:** Unit tests: domain auto-detection from prompts, rubric selection per domain, diversity enforcement reassigns providers.

---

#### Phase 19: Expert Council — Dynamic Composition & Quick Mode

**Goal:** Auto-select best models from historical data. Quick mode for easy questions.

**Files to modify:**

- `functions/src/agents/expertCouncil.ts` — For `quick` mode: use 2 strong models + 1 fast judge. If consensus Kendall Tau > 0.8, skip chairman synthesis. For dynamic composition: query historical evaluation scores per model for the detected domain, select top performers.
- `packages/agents/src/domain/models.ts` — Ensure `ExpertCouncilConfig.mode` supports `'quick'`.

**Tests:** Unit tests: quick mode skips chairman on high consensus, doesn't skip on low consensus, dynamic composition selects from historical data.

---

#### Phase 20: Expert Council — Caching & Disagreement Deep-Dive

**Goal:** Cache similar prompt results. On low consensus, trigger reasoning follow-up.

**Files to modify:**

- `functions/src/agents/expertCouncil.ts` — Before execution, compute prompt embedding and check cache (Firestore) for cosine similarity > 0.9. If found, return cached result. On low consensus (Kendall Tau < 0.4), trigger follow-up: each model explains reasoning, then re-judge.
- Add cache storage/retrieval helpers.

**Tests:** Unit tests: cache hit returns cached result, cache miss executes normally, disagreement deep-dive triggers on low consensus, doesn't trigger on high consensus.

---

### TRACK E: Deep Research (Phases 21–25)

#### Phase 21: Deep Research — Batch Source Processing

**Goal:** Process 3-5 sources in a single LLM call instead of one per source.

**Files to modify:**

- `functions/src/agents/langgraph/deepResearchGraph.ts` — In `claim_extraction` node, batch sources into groups of 3-5. Concatenate source content with clear delimiters. Single LLM call per batch. Parse per-source claims from response.
- `functions/src/agents/deepResearch/` — Add batching utility.

**Tests:** Unit tests: batching groups sources correctly, claims are correctly attributed to individual sources, handles fewer sources than batch size.

---

#### Phase 22: Deep Research — Parallel Search & Smart Source Prioritization

**Goal:** Execute all search types simultaneously. Rank sources before ingesting.

**Files to modify:**

- `functions/src/agents/langgraph/deepResearchGraph.ts` — In `search_execution` node, use `Promise.all()` to run SERP, Scholar, and Semantic searches in parallel. After search, add a fast-model ranking step to score sources by likely relevance before ingesting. Skip obvious duplicates.
- `functions/src/agents/deepResearch/` — Add source ranking utility.

**Tests:** Unit tests: all searches execute in parallel, ranking orders sources correctly, duplicates are removed.

---

#### Phase 23: Deep Research — Source Quality Scoring & Counterclaim Strengthening

**Goal:** Weight claims by source quality. Add adversarial counterclaim agent step.

**Files to modify:**

- `functions/src/agents/langgraph/deepResearchGraph.ts` — In `kg_construction`, weight claims by source quality (domain authority, publication date, citation count). Add new `counterclaim_search` node between `gap_analysis` and `answer_generation`: use Claude Sonnet to find strongest counterarguments to main claims.
- `packages/agents/src/domain/deepResearchWorkflow.ts` — Add `sourceQualityScore` to source/claim types. Add counterclaim types.

**Tests:** Unit tests: source quality scoring affects claim weights, counterclaim agent produces adversarial arguments, answer generation incorporates counterclaims.

---

#### Phase 24: Deep Research — Multi-Hop Search & Incremental KG

**Goal:** Fill identified gaps with follow-up searches. Reuse KG for iterative research.

**Files to modify:**

- `functions/src/agents/langgraph/deepResearchGraph.ts` — After `gap_analysis`, if gaps identified with high priority, launch targeted follow-up searches (loop back to search_planning with refined queries). For incremental KG: check if a KG exists for the same topic (Firestore), load and extend it instead of rebuilding.
- `functions/src/agents/deepResearch/budgetController.ts` — Ensure multi-hop respects budget phases.

**Tests:** Unit tests: multi-hop triggers on identified gaps, respects budget limits, incremental KG loads existing graph, extends with new claims.

---

#### Phase 25: Deep Research — Quick Research Mode

**Goal:** Offer a lightweight "Quick Research" mode that skips KG and gap analysis.

**Files to modify:**

- `functions/src/agents/langgraph/deepResearchGraph.ts` — Add `quick` mode: Sense Making → Search → Source Ingestion → Answer Generation (skip claim extraction, KG, gap analysis, counterclaims). Route based on `deepResearchConfig.mode`.
- `packages/agents/src/domain/deepResearchWorkflow.ts` — Add `mode: 'full' | 'quick'` to config.
- Web app: deep research run dialog — Add mode toggle. Use design system components.

**Tests:** Unit tests: quick mode skips correct steps, full mode runs all steps, mode toggle is reflected in config.

---

### TRACK F: Dialectical Workflow (Phases 26–30)

#### Phase 26: Dialectical — Best-Model-Per-Lens

**Goal:** Each thesis lens uses the model that excels at that type of reasoning.

**Files to modify:**

- `packages/agents/src/domain/dialectical.ts` — Update lens presets to assign optimal models: adversarial/systems → `claude-sonnet-4-5`, economic/technical → `o1`, behavioral/historical → `gemini-2.5-pro`, political/ecological → `grok-4`.
- `functions/src/agents/langgraph/dialecticalGraph.ts` — When generating theses, use the lens-specific model from the preset instead of a uniform model.

**Tests:** Unit tests: each lens resolves to correct model, model override (from Phase 2) still works on top of per-lens defaults.

---

#### Phase 27: Dialectical — Multi-Cycle Progressive Deepening

**Goal:** Cycle 1 broad (3-4 lenses), Cycle 2 deep on HIGH contradictions only, Cycle 3 single tension.

**Files to modify:**

- `functions/src/agents/langgraph/dialecticalGraph.ts` — In meta-reflection, implement progressive deepening logic: Cycle 1 uses all configured lenses. Cycle 2 filters to only HIGH-severity contradictions. Cycle 3 (if needed) focuses on the single highest-severity unresolved tension.
- `functions/src/agents/metaReflection.ts` — Update continuation logic to pass contradiction severity filter to next cycle.
- `packages/agents/src/domain/dialectical.ts` — Add `contradictionSeverityFilter?: 'all' | 'high' | 'critical'` to cycle config.

**Tests:** Unit tests: Cycle 1 uses all lenses, Cycle 2 filters to HIGH, Cycle 3 focuses on single tension, termination on resolution.

---

#### Phase 28: Dialectical — Quick Dialectic Mode

**Goal:** Lightweight 2-lens, 1-cycle mode without KG for everyday decisions.

**Files to modify:**

- `packages/agents/src/domain/dialectical.ts` — Add `'quick'` to dialectical mode options. Quick config: 2 lenses (thesis + antithesis), 1 cycle max, no KG construction.
- `functions/src/agents/langgraph/dialecticalGraph.ts` — When mode is `quick`, skip KG-related nodes, limit to 1 cycle, use only 2 lenses.
- Web app: dialectical run dialog — Add mode toggle (Full / Quick). Use design system components.

**Tests:** Unit tests: quick mode uses only 2 lenses, skips KG, limits to 1 cycle, full mode unchanged.

---

#### Phase 29: Dialectical — Reusable Concept Library

**Goal:** Store versioned concepts from past runs. Reuse in new runs on related topics.

**Files to modify:**

- `packages/agents/src/domain/dialectical.ts` — Add `Concept` type with versioning (id, name, definition, version, sourceRunId, tags, createdAt, updatedAt).
- `packages/agents/src/ports/` — Add `conceptRepository.ts` interface (CRUD + `findByTags`, `findSimilar`).
- `functions/src/agents/langgraph/dialecticalGraph.ts` — At start of dialectical run, query concept library for related concepts (by topic tags). Inject as context for thesis generators. After synthesis, extract and store new/updated concepts.

**Tests:** Unit tests: concepts are stored after synthesis, related concepts are retrieved and injected, concept versioning works correctly.

---

#### Phase 30: Dialectical — Visual Contradiction Map & Deep Research Fusion

**Goal:** Enhanced visualization. Allow theses to trigger research sub-runs.

**Files to modify:**

- Web app: `DialecticalCycleVisualization` component — Enhance to show contradiction severity (color-coded), thesis relationships (edges), concept evolution across cycles, sublation resolution paths. Use design system tokens for colors.
- `functions/src/agents/langgraph/dialecticalGraph.ts` — In thesis generation, allow agents to emit `NEEDS_EVIDENCE` signal. If detected, launch a quick deep research sub-run (from Phase 25) to gather evidence before continuing.
- Must reuse existing `@xyflow/react` graph components and design system tokens.

**Tests:** Component tests for visualization. Unit tests: evidence request triggers sub-research, results feed back into thesis.

---

### TRACK G: New Tools (Phases 31–34)

#### Phase 31: `update_todo` Tool

**Goal:** Allow agents to update/complete existing todos, not just create/list.

**Files to modify:**

- `packages/agents/src/domain/aiTools.ts` — Add `update_todo` tool definition: accepts `todoId`, `updates` (status, title, priority, dueDate). Add `delete_todo` tool.
- `functions/src/agents/toolExecutor.ts` (or equivalent) — Implement execution: validate todo exists, apply updates, return confirmation.

**Tests:** Unit tests: update changes fields correctly, handles non-existent todo, delete removes todo.

---

#### Phase 32: `memory_recall` Tool

**Goal:** Search user's past conversations and run outputs for continuity.

**Files to modify:**

- `packages/agents/src/domain/aiTools.ts` — Add `memory_recall` tool definition: accepts `query` string, optional `timeRange`, optional `runType`. Returns matching past run outputs and conversation snippets.
- `functions/src/agents/toolExecutor.ts` — Implement: query Firestore runs collection with text search on `output` and `goal` fields, return top 5 matches with timestamps and context.

**Tests:** Unit tests: query returns relevant results, respects time range filter, handles empty results.

---

#### Phase 33: `generate_chart` Tool

**Goal:** Generate charts as PNG/base64 images for use in agents and TipTap notes.

**Files to modify:**

- `packages/agents/src/domain/aiTools.ts` — Add `generate_chart` tool definition: accepts `chartType` (bar, line, pie, scatter), `data` (array of {label, value} or {x, y}), `title`, `options`. Returns base64 PNG string.
- `functions/src/agents/toolExecutor.ts` — Implement: use QuickChart.io API (or similar server-side chart rendering) to generate chart PNG. Return as base64 string. The base64 image can be directly inserted into TipTap via the existing `Image` extension with `allowBase64: true`.

**Tests:** Unit tests: chart generation produces valid base64 PNG, handles all chart types, validates data format.

---

#### Phase 34: `code_interpreter` & `webhook_call` Tools

**Goal:** Execute code for data analysis. Make authenticated HTTP calls.

**Files to modify:**

- `packages/agents/src/domain/aiTools.ts` — Add `code_interpreter` tool: accepts `language` (python/javascript), `code` string. Returns stdout + result. Add `webhook_call` tool: accepts `url`, `method`, `headers`, `body`. Returns response.
- `functions/src/agents/toolExecutor.ts` — `code_interpreter`: execute in sandboxed environment (Cloud Functions or container). `webhook_call`: validate URL against user's allowed domains list, execute HTTP request, return response.
- Security: `webhook_call` must only call URLs from user's pre-configured allowed domains. `code_interpreter` must run in isolated sandbox with timeout.

**Tests:** Unit tests: code execution returns correct output, timeout is enforced, webhook validates allowed domains, rejects disallowed URLs.

---

### TRACK H: New Agent & Workflow Templates (Phases 35–40)

#### Phase 35: Analysis Planner & Executive Summary Writer Agent Templates

**Goal:** Create new agent templates for structured analytics and MAIN-framework summaries.

**Files to modify:**

- `packages/agents/src/domain/agentTemplates/` (or wherever built-in templates are defined) — Add `analysis_planner` template: role `planner`, system prompt with hypothesis generation methodology, tools: `query_firestore`, `calculate`. Add `executive_summary_writer` template: role `synthesizer`, system prompt with MAIN framework (Motive, Answer, Impact, Next steps), model: `gpt-5-mini`.

**Tests:** Unit tests: templates create valid agent configs, system prompts contain expected framework elements.

---

#### Phase 36: Goal Decomposition Coach & Network Segmentation Agent Templates

**Goal:** KPI tree decomposition and contact segmentation agents.

**Files to modify:**

- Add `goal_decomposition_coach` template: role `custom`, system prompt with MECE decomposition methodology, tools: `query_firestore`, `list_todos`, `list_calendar_events`, model: `claude-sonnet-4-5`.
- Add `network_segmentation` template: role `custom`, system prompt for behavioral/demographic/value segmentation of contacts, tools: contact and calendar query tools, model: `claude-sonnet-4-5`.

**Tests:** Unit tests: templates create valid configs, tool access is correct.

---

#### Phase 37: Analytics Orchestrator Workflow Template

**Goal:** Meta-orchestrator that routes users to the right analytics workflow.

**Files to modify:**

- Create a **Supervisor workflow template** called "LifeOS Analytics Orchestrator" with a supervisor agent that understands all available analytics workflows and routes based on user intent. Workers: Analysis Planner, Personal Data Analyst, Goal Decomposition Coach, Self-Cohort Analyst (if available).
- Supervisor model: `gpt-5-mini`, workers: per-template defaults.

**Tests:** Unit tests: orchestrator template creates valid workflow config, routing logic covers common analytics intents.

---

#### Phase 38: Personal Analytics Pipeline Workflow Template

**Goal:** End-to-end analytics pipeline from question to actionable brief.

**Files to modify:**

- Create a **Sequential workflow template**: Analysis Planner → Personal Data Analyst → Results Collector → Executive Summary Writer.
- Model strategy: Planner on `gpt-5-mini`, Analyst on `gemini-3-flash`, Collector on `gpt-5-mini`, Summary on `claude-haiku-4-5`.
- Enable context compression (Phase 6) by default.

**Tests:** Unit tests: template creates valid sequential workflow, agent order is correct, compression is enabled.

---

#### Phase 39: Content Pipeline & LinkedIn Content Factory Workflow Templates

**Goal:** One-click content creation workflows.

**Files to modify:**

- **Content Pipeline** (Sequential): Content Strategist → Content Research Analyst → Thought Leadership Writer → Content Polish Editor → SEO Specialist. Models: Strategist `gpt-5-mini`, Research `gemini-3-flash`, Writer `claude-sonnet-4-5`, Editor `claude-haiku-4-5`, SEO `gpt-5-mini`.
- **LinkedIn Content Factory** (Sequential): Topic Research (gpt-5-mini + serp_search) → Competitor Analysis (gemini-3-flash + serp) → Draft Writer (claude-sonnet-4-5) → LinkedIn Critic (gpt-5-mini) → Final Polish (claude-haiku-4-5).

**Tests:** Unit tests: templates create valid workflows, model assignments match spec.

---

#### Phase 40: Productivity & GTM Workflow Templates

**Goal:** Morning Brief, Weekly Review, and Go-to-Market Pipeline templates.

**Files to modify:**

- **Morning Brief** (Sequential): Calendar Check → Meeting Summary → Todo Review → Priority Suggestions. All agents on `gpt-5-nano` (cost-sensitive daily run). Tools: `list_calendar_events`, `list_todos`.
- **Weekly Review** (Sequential): Habit Analysis → Notes Summary → Project Progress → Reflection Prompts. Model: `gpt-5-mini`. Tools: `query_firestore`, `list_todos`, `list_calendar_events`.
- **Go-to-Market Pipeline** (Sequential): Offer Coach → Marketing Coach → Content Pipeline (sub-workflow) → Sales Coach. Models per spec in 3.12.

**Tests:** Unit tests: all templates create valid configs, tool access is correct.

---

### TRACK I: Workflow-Specific Improvements (Phases 41–48)

#### Phase 41: Project Planning — Time-Aware Integration & Quick Plan Mode

**Goal:** Integrate Time-Aware Planner into main workflow. Skip Risk + Quality for simple projects.

**Files to modify:**

- Update Project Planning workflow template: integrate Time-Aware Planner agent so plans are always grounded in user's real schedule. Add `quick` mode that uses only PM Coordinator + Structure Planner + Task Specialist (skip Risk Analyst + Quality Reviewer for projects with <5 tasks).
- `packages/agents/src/domain/models.ts` — Add `mode: 'full' | 'quick'` to `ProjectManagerConfig` if not already present.

**Tests:** Unit tests: quick mode skips correct agents, full mode runs all, time-aware planner is integrated.

---

#### Phase 42: Project Planning — Structured Output & Todo Integration

**Goal:** Enforce JSON output from planners. Auto-create todos from approved plan.

**Files to modify:**

- Update Structure Planner and Task Specialist agent system prompts to output structured JSON (task name, description, dependencies, estimated hours, milestone, assignee).
- After plan approval (new run event), auto-create LifeOS todos from the structured output using `create_todo` tool.
- Web app: plan review component — Render structured plan as interactive table/timeline. Use design system tokens.

**Tests:** Unit tests: structured output parses correctly, todos are created from plan, handles partial/failed todo creation.

---

#### Phase 43: Content Creation — Brand Voice Memory & SEO-First Mode

**Goal:** Store user's writing style. Run SEO first for blog content.

**Files to modify:**

- `packages/agents/src/domain/models.ts` — Add `brandVoice?: { tone: string, vocabulary: string[], structure: string, examples: string[] }` to user preferences or workflow config.
- Content Pipeline writer agents — Inject brand voice into system prompt when available.
- SEO-first mode: when enabled, run SEO Specialist first to identify keywords, then feed constraints to the writer agent.

**Tests:** Unit tests: brand voice is injected into prompts, SEO-first mode reorders agents correctly.

---

#### Phase 44: Content Creation — Multi-Format Output

**Goal:** One research input → parallel outputs in multiple formats.

**Files to modify:**

- Create a **Parallel workflow step** after research: fan out to LinkedIn post writer, blog article writer, newsletter writer, X thread writer. Each with format-specific system prompts. Merge results into a multi-format output document.
- Models: all writers on `claude-haiku-4-5` (parallel = cost-sensitive).

**Tests:** Unit tests: parallel fan-out produces all 4 formats, merge combines them correctly.

---

#### Phase 45: Research Workflows — Smart Search Router & Caching

**Goal:** Auto-route by query type. Cache search results.

**Files to modify:**

- `functions/src/agents/` — Add `searchRouter.ts`: classify query type (factual → SERP, conceptual → Semantic, academic → Scholar) using a fast model or keyword heuristics. Route to appropriate search tool.
- `functions/src/agents/` — Add search result caching: SERP results cached 24h, Semantic 72h in Firestore. Check cache before executing search.
- Source deduplication: when multiple searches return the same URL, merge and boost relevance score.

**Tests:** Unit tests: query classification routes correctly, cache hit returns cached results, cache miss executes search, deduplication merges and boosts.

---

#### Phase 46: Research Workflows — Multi-Hop Research & Citation Scoring

**Goal:** Recursive sub-question search. Rank sources by quality.

**Files to modify:**

- `functions/src/agents/` — Add multi-hop logic: after initial search, extract sub-questions from results. If complexity warrants, execute follow-up searches on sub-questions. Max 2 hops.
- Add citation quality scoring: score sources by domain authority (from a curated list), publication date recency, and citation count if available.

**Tests:** Unit tests: multi-hop extracts sub-questions, respects hop limit, citation scoring ranks sources correctly.

---

#### Phase 47: Productivity — Knowledge Manager Graph & Calendar Intelligence

**Goal:** Visualize note connections. Analyze meeting patterns.

**Files to modify:**

- Knowledge Manager agent — Add tool to query note connections and suggest new links based on content similarity (using embeddings or keyword overlap).
- Web app: enhance `NoteGraphView.tsx` — Show suggested links as dashed edges. Use design system tokens.
- Calendar intelligence: add agent logic to analyze meeting patterns: count meetings per week, identify recurring meetings, suggest cancellations based on user priorities.

**Tests:** Unit tests: note similarity detection works, calendar analysis produces correct statistics. Component tests for graph view.

---

#### Phase 48: Marketing & Sales — Coaching Memory & Competitive Intelligence

**Goal:** Store business context across sessions. Pull real competitor data.

**Files to modify:**

- Add `coachingContext` to user preferences or a dedicated Firestore collection: business description, target audience, past coaching decisions, competitive landscape.
- Marketing/Sales coaching agents — Inject coaching context into system prompts.
- Competitive intelligence: coaching agents use `serp_search` tool to pull real competitor data before making recommendations.
- Weekly content calendar: Marketing Coach outputs a structured 7-day plan with topics, formats, and posting times.

**Tests:** Unit tests: coaching context is injected, competitor data is fetched and used, content calendar has correct structure.

---

### TRACK J: Iterative Refinement & Historical Calibration (Phase 49)

#### Phase 49: Project Planning Refinement Loop & Historical Calibration

**Goal:** Auto-route back for fixes. Use past data for time estimates.

**Files to modify:**

- Project Planning workflow — After Quality Reviewer flags issues, auto-route back to relevant agent (Structure Planner or Task Specialist) for fixes. Max 1 refinement loop.
- Historical calibration: query past completed todos/projects to calibrate time estimates. E.g., if past "medium" tasks took 3h on average, use that as baseline.

**Tests:** Unit tests: refinement loop triggers on quality issues, respects max loop limit, historical calibration adjusts estimates correctly.

---

## Summary: Phase Count & Tracks

| Track                                 | Phases | Focus                                                                       |
| ------------------------------------- | ------ | --------------------------------------------------------------------------- |
| **A: Foundation**                     | 1–8    | Model routing, deduplication, caching, compression, streaming, evaluation   |
| **B: Sequential/Parallel/Supervisor** | 9–14   | Early exit, quality gates, heterogeneous models, planning, reflection       |
| **C: Graph Workflows**                | 15–17  | Human-in-the-loop, guardrails, visualization, parameterization              |
| **D: Expert Council**                 | 18–20  | Domain rubrics, diversity, dynamic composition, caching, deep-dive          |
| **E: Deep Research**                  | 21–25  | Batching, parallel search, quality scoring, counterclaims, quick mode       |
| **F: Dialectical**                    | 26–30  | Per-lens models, multi-cycle, quick mode, concept library, visualization    |
| **G: New Tools**                      | 31–34  | update_todo, memory_recall, generate_chart, code_interpreter, webhook_call  |
| **H: New Templates**                  | 35–40  | Agent templates, workflow templates (analytics, content, productivity, GTM) |
| **I: Workflow-Specific**              | 41–48  | Project planning, content creation, research, productivity, marketing       |
| **J: Refinement**                     | 49     | Iterative loops, historical calibration                                     |

**Total: 49 phases** | Each ≤20 min agent coding time | Quality gate after every phase

---

## Dependency Order

Phases should be executed in this order (within each track, phases are sequential; tracks can be parallelized where noted):

```
Track A (1-8) ← MUST complete first (foundation for all other tracks)
  │
  ├── Track B (9-14)    ← Can start after Phase 2
  ├── Track C (15-17)   ← Can start after Phase 2
  ├── Track D (18-20)   ← Can start after Phase 8
  ├── Track E (21-25)   ← Can start after Phase 2
  ├── Track F (26-30)   ← Can start after Phase 2
  ├── Track G (31-34)   ← Can start after Phase 2
  └── Track H (35-40)   ← Can start after Phase 4 (needs deduplication)
       │
       ├── Track I (41-48) ← After Track H + relevant workflow track
       └── Track J (49)    ← After Phase 42
```

---

## Estimated Overall Impact

If all phases are implemented:

| Metric                                      | Current         | Projected                | Change                                                                        |
| ------------------------------------------- | --------------- | ------------------------ | ----------------------------------------------------------------------------- |
| **Deep Research output quality**            | Good            | **Excellent**            | Source scoring, counterclaims, gap-filling, batching                          |
| **Dialectical output quality**              | Decent          | **Best-in-market**       | Per-lens models, multi-cycle, concept library                                 |
| **Expert Council quality**                  | Good            | **Significantly better** | Domain rubrics, model diversity, disagreement deep-dive                       |
| Deep Research cost (10 sources)             | ~$0.80-1.50     | ~$0.70-1.20              | Modest savings from structural efficiency                                     |
| Dialectical cost (full, 4 lenses, 2 cycles) | ~$0.50-1.00     | ~$1.00-2.50              | Higher — investing in quality                                                 |
| Dialectical cost (quick, 2 lenses)          | N/A             | ~$0.15-0.30              | New lightweight mode                                                          |
| Expert Council cost per turn                | ~$0.40-0.80     | ~$0.50-0.90              | Similar cost, much better output                                              |
| Routine workflow cost                       | ~$0.10-0.30     | ~$0.03-0.10              | **60-70% reduction**                                                          |
| Content pipeline cost                       | Manual chaining | ~$0.12/post              | New automated capability                                                      |
| Project Planning cost                       | ~$1.20-2.00     | ~$0.50-0.80              | Smarter model selection                                                       |
| Agent duplication                           | Unbounded       | Zero (hash-based reuse)  | Cleaner agent management                                                      |
| New workflow templates                      | 0               | 7                        | Content, LinkedIn, Morning Brief, Weekly Review, Analytics, GTM, Orchestrator |
| New agent templates                         | 0               | 4                        | Goal Decomposition, Analysis Planner, Executive Summary, Network Segmentation |
| New built-in tools                          | 0               | 5                        | update_todo, memory_recall, generate_chart, code_interpreter, webhook_call    |
