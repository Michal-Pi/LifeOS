# LifeOS Workflow Improvement Plan

> Generated: 2026-02-27 | Based on: Codebase audit, market comparison, pricing analysis

---

## Philosophy: Quality-First, Cost-Smart

**Not all workflows are equal.** This plan applies a tiered cost philosophy:

- **Critical Workflows** (Dialectical, Deep Research, Expert Council): **Invest in quality.** Use the best models at every reasoning-heavy step. Reasonable costs are fine — these are the crown jewels that produce genuinely differentiated output. Optimize _structure_ (fewer redundant calls, better batching) but never downgrade model quality on reasoning steps.
- **Core Workflows** (Project Planning, Content Creation, Supervisor): **Balanced approach.** Use premium models for the steps that matter (planning, synthesis, critique) but save on mechanical steps (data gathering, formatting, routing).
- **Routine Workflows** (Quick Search, Calendar, Calculator, Summarizer): **Optimize aggressively.** These run frequently and don't need heavy reasoning. Use the cheapest models that produce acceptable output.

---

## Table of Contents

1. [Overall Improvements (Cross-Cutting)](#1-overall-improvements-cross-cutting)
2. [New Tool Ideas from ThePowerOfAnalytics](#2-new-tool-ideas-from-thepowerofanalytics-claude-skills)
3. [Per-Workflow Improvement Proposals](#3-per-workflow-improvement-proposals)

---

## 1. Overall Improvements (Cross-Cutting)

### 1.1 Model Routing & Tiered Cost Strategy

**Current State:** Each agent template hardcodes a specific model (e.g., `gpt-5-mini`, `o1`). No dynamic routing based on task complexity or workflow criticality.

**Market Benchmark:** Leading platforms (OpenRouter, LiteLLM, Martian) implement **model cascading** — start with a cheap model, escalate to expensive only when quality is insufficient. OpenAI's own API supports `model_selection` with fallback chains.

**Proposal: Implement Smart Model Routing with Criticality Awareness**

| Change                                                                                                                 | Expected Impact                                                          | Effort |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------ |
| Add a `modelTier` field to agent configs (`fast`, `balanced`, `thinking`) instead of hardcoding model names            | Enables automatic upgrade/downgrade based on workflow criticality        | Medium |
| **For routine workflows only**: implement cascade routing — try `fast` first, escalate if quality check fails          | **30-50% cost reduction** on routine tasks; critical workflows untouched | Medium |
| Add **prompt caching** via Anthropic's cache_control or OpenAI's predicted_outputs                                     | **~50% savings** on repeated/similar prompts across all workflow tiers   | Low    |
| Use **Gemini 3 Flash** ($0.50/$3.00) and **Grok 4-1 Fast** ($0.20/$0.50) as defaults for routine/mechanical steps only | 20-40% savings on fast-tier agents                                       | Low    |

**Cost Comparison for a Typical 5-Agent Sequential Workflow (est. 15K tokens/agent):**

| Strategy               | Current Cost | With Cascade                     | Savings |
| ---------------------- | ------------ | -------------------------------- | ------- |
| All gpt-5.2            | ~$0.33       | ~$0.15 (3 fast + 2 balanced)     | 55%     |
| All o1 (thinking)      | ~$1.69       | ~$0.45 (4 balanced + 1 thinking) | 73%     |
| Mixed current defaults | ~$0.25       | ~$0.12                           | 52%     |

### 1.2 Prompt Caching & Context Compression

**Current State:** No prompt caching. System prompts are re-sent fully each turn. Long workflows accumulate context without compression.

**Proposal:**

| Change                                                                                                                              | Expected Impact                                | Effort |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------ |
| Enable Anthropic **prompt caching** for system prompts (auto-cached after 1024 tokens)                                              | 90% discount on cached input tokens            | Low    |
| Add **context summarization** between sequential agents — use a nano model to compress previous output before passing to next agent | 30-40% token reduction in later stages         | Medium |
| Implement **sliding window context** for long conversations (keep last N messages + compressed history)                             | Prevents context window overflow; reduces cost | Medium |

### 1.3 Evaluation & Quality Feedback Loop

**Current State:** Expert Council provides multi-model consensus and Borda voting, but there's no systematic **evaluation framework** that learns from past runs.

**Market Benchmark:** LangSmith, Braintrust, and Arize Phoenix all provide trace-based evaluation with LLM-as-judge scoring, dataset management, and regression testing. You already have `TraceViewer` and `LabelingInterface` components but they appear disconnected from a feedback loop.

**Proposal:**

| Change                                                                                                                                                                           | Expected Impact                             | Effort |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------ |
| Build an **auto-evaluation pipeline**: after each run, use a cheap judge model (gpt-5-nano or haiku) to score output quality on 3 dimensions (relevance, completeness, accuracy) | Enables data-driven model routing decisions | Medium |
| Store evaluation scores alongside runs in Firestore; surface trends in a dashboard                                                                                               | Visibility into quality over time           | Medium |
| Use evaluation data to **auto-tune model selection** — if a `fast` model consistently scores >4/5 for a given agent template, keep it; if it drops, auto-escalate                | Self-optimizing cost/quality tradeoff       | High   |

### 1.4 New Built-in Tools (High-ROI Additions)

| Tool                   | What It Does                                                     | Why It's Worth It                                              | Effort |
| ---------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- | ------ |
| **`code_interpreter`** | Execute Python/JS code for data analysis, charting, calculations | Enables data-driven agents, personal analytics, habit analysis | High   |
| **`send_email_draft`** | Create Gmail drafts (not send) via existing Google integration   | Natural extension of mailbox feature; safe (draft, not send)   | Low    |
| **`update_todo`**      | Update/complete existing todos (currently only create/list)      | Closes the loop on task management workflows                   | Low    |
| **`memory_recall`**    | Search user's past conversations and run outputs                 | Enables continuity across sessions; huge UX improvement        | Medium |
| **`generate_chart`**   | Generate simple charts (bar, line, pie) from data                | Visual outputs for data analyst and research agents            | Medium |
| **`webhook_call`**     | Make authenticated HTTP calls to user-configured endpoints       | Enables Zapier/Make-style integrations without custom tools    | Medium |

### 1.5 Streaming & Real-Time UX

**Current State:** Runs complete server-side, then results are shown. LangGraph has streaming capability but it's not fully surfaced.

**Proposal:**

| Change                                                                       | Expected Impact                                         | Effort |
| ---------------------------------------------------------------------------- | ------------------------------------------------------- | ------ |
| Surface **real-time streaming** of agent outputs via Firestore onSnapshot    | Users see agents "thinking" live; much better UX        | Medium |
| Add **step-level progress indicators** (e.g., "Agent 3/5: Writing draft...") | Reduces perceived wait time                             | Low    |
| Show **cost accumulation in real-time** during run execution                 | Budget awareness; users can cancel expensive runs early | Low    |

### 1.6 Workflow Composability & Reuse

**Current State:** 50+ agent templates but workflows are created from scratch each time. No "sub-workflow" or "workflow-as-tool" concept.

**Market Benchmark:** n8n, Make, and LangGraph all support sub-workflows/sub-graphs that can be embedded inside larger workflows.

**Proposal:**

| Change                                                                                           | Expected Impact                                                   | Effort |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------ |
| Allow workflows to reference other workflows as **sub-workflows** (new node type: `subworkflow`) | Composability; DRY; complex workflows from simple building blocks | High   |
| Create a **"Workflow Marketplace"** — curated library of community workflow templates            | Onboarding improvement; discovery of use cases                    | Medium |
| Add **conditional branching** in sequential workflows (if-else based on output content)          | More flexible workflows without full graph mode                   | Medium |

---

## 2. New Tool Ideas from ThePowerOfAnalytics Claude Skills

The [ThePowerOfAnalytics_ClaudeSkills](https://github.com/florianbonnet14/ThePowerOfAnalytics_ClaudeSkills) repo contains 10 analytics-focused skills. Here's an assessment of which are worth adapting for LifeOS:

### 2.1 High Value (Adapt Now)

#### **Analysis Planner** (adapt as a workflow template)

- **What it does:** Structures analysis investigations with hypothesis generation, data requirements, and visualization plans before diving into data
- **Why it fits LifeOS:** Your **Personal Data Analyst** agent currently has tools but no structured methodology. Wrapping it in an Analysis Planner workflow would produce dramatically better insights from the same tools.
- **Adaptation:** Create a **"Personal Analytics Pipeline"** workflow template:
  1. Analysis Planner agent (define question + hypotheses)
  2. Personal Data Analyst agent (execute queries via `query_firestore`, `calculate`)
  3. Results Collector agent (structure findings)
  4. Executive Summary agent (produce actionable brief)
- **Model strategy:** Planner on `gpt-5-mini`, Data Analyst on `gemini-3-flash` (cheap + good at structured data), Summary on `claude-haiku-4-5`
- **Expected outcome:** 10x better personal insights at ~$0.05/run

#### **KPI Tree Architect** (adapt as a new agent template)

- **What it does:** Builds hierarchical metric decomposition trees using MECE principles
- **Why it fits LifeOS:** Users tracking habits, fitness metrics, and project goals would benefit enormously from understanding which sub-metrics drive their outcomes. E.g., "Why is my productivity declining?" → decompose into sleep quality, exercise frequency, task completion rate, etc.
- **Adaptation:** New **"Goal Decomposition Coach"** agent template with access to `query_firestore`, `list_todos`, `list_calendar_events` to ground the analysis in real user data
- **Model strategy:** `claude-sonnet-4-5` (needs strong reasoning for MECE decomposition)
- **Expected outcome:** Unique differentiator — no personal productivity app does metric decomposition

#### **Executive Summary Writer** (adapt as agent template)

- **What it does:** Uses MAIN framework (Motive, Answer, Impact, Next steps) to create concise executive summaries
- **Why it fits LifeOS:** Perfect for the end of any research or analysis workflow. Currently your synthesizer agents are generic — this would give them structure.
- **Adaptation:** Replace the generic "Executive Synthesizer" agent template with a MAIN-framework-aware version
- **Model strategy:** `gpt-5-mini` (structured output, doesn't need heavy reasoning)
- **Expected outcome:** Consistently better-formatted, more actionable research outputs

### 2.2 Medium Value (Consider for V2)

#### **Cohort Analysis Specialist** (adapt for habit/training tracking)

- **What it does:** Groups users into cohorts and tracks behavior over time with retention tables
- **Why it fits LifeOS:** Not for "user" cohorts, but for **self-cohorts** — "How did my workout consistency in weeks when I slept >7h compare to weeks when I didn't?" This is a novel adaptation.
- **Adaptation:** New **"Self-Cohort Analyst"** agent that queries training, habit, and calendar data to build personal cohort tables
- **Expected outcome:** Deep self-knowledge insights that no fitness app provides

#### **Segmentation Expert** (adapt for contact CRM)

- **What it does:** Segments customers by behavioral, demographic, and value dimensions
- **Why it fits LifeOS:** Your CRM already has contacts, interactions, and circle suggestions. A segmentation layer would auto-categorize contacts: "high-energy givers" vs "dormant connections" vs "new opportunities"
- **Adaptation:** New **"Network Segmentation"** agent with access to contact and calendar data
- **Expected outcome:** Smarter relationship management with data-backed prioritization

#### **Analytics Orchestrator** (adapt as workflow routing logic)

- **What it does:** Routes users to the right analytics agent based on their question
- **Why it fits LifeOS:** You already have 50+ agent templates — a meta-orchestrator that asks "what are you trying to accomplish?" and auto-selects the right workflow would dramatically improve onboarding
- **Adaptation:** Enhance the existing **Supervisor** workflow type with a pre-built "LifeOS Orchestrator" template
- **Expected outcome:** Users don't need to understand the agent ecosystem; just describe their goal

### 2.3 Lower Value (Skip for Now)

| Skill                             | Reason to Deprioritize                                                  |
| --------------------------------- | ----------------------------------------------------------------------- |
| **North Star Metric Advisor**     | Too business-focused; personal metrics don't have a single "north star" |
| **Influential Factors Detective** | Overlaps with what the Personal Data Analyst + Analysis Planner can do  |
| **Analysis Results Collector**    | Useful but the adaptation as a workflow step (in 2.1 above) covers this |
| **Presentation Builder**          | LifeOS is a personal tool; presentation creation is out of scope        |

---

## 3. Per-Workflow Improvement Proposals

### 3.1 Sequential Workflows

**Current State:** Linear agent chain. Each agent receives the previous agent's full output as context. No conditional branching.

**Market Comparison:** LangGraph's `StateGraph`, CrewAI's sequential process, and AutoGen's `GroupChat` all support mid-chain decisions and early termination.

| Improvement                                                                                                                                                        | Expected Outcome                                                               | Priority |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------- |
| **Add early-exit conditions** — if agent N produces output containing a termination signal (e.g., "ANSWER_FOUND"), skip remaining agents                           | Save 30-60% cost on workflows that find answers early                          | High     |
| **Context compression between steps** — use gpt-5-nano ($0.05/M) to summarize agent N's output before passing to agent N+1                                         | Reduce token usage by 40% in later stages; prevent context overflow            | High     |
| **Add quality gates** — after each agent, run a fast LLM check: "Does this output meet the brief? Score 1-5." If <3, retry with a stronger model before continuing | Catch quality issues early instead of propagating bad output through the chain | Medium   |
| **Parallel pre-fetch** — if agent N+1 needs tools, start tool calls while agent N is still running (speculative execution)                                         | 15-20% latency reduction                                                       | Low      |

**Model Optimization:**

- First agent (context gathering): `gpt-5-mini` or `gemini-3-flash` — cheap, good at following instructions
- Middle agents (analysis/writing): `claude-sonnet-4-5` or `gpt-5.2` — best quality/price ratio
- Final agent (synthesis): `claude-haiku-4-5` — fast, structured output

### 3.2 Parallel Workflows

**Current State:** Fan-out to N agents in parallel, then merge with 5 strategies (list, ranked, consensus, synthesize, dedup_combine).

**Market Comparison:** This is already strong — matches OpenAI Swarm's fan-out and LangGraph's `Send()` API. The merge strategies are more sophisticated than most open-source alternatives.

| Improvement                                                                                                                                                                                        | Expected Outcome                                                                   | Priority |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| **Use heterogeneous models for diversity** — instead of N agents on the same model, use different providers for each parallel branch (Claude, GPT, Gemini, Grok) to maximize perspective diversity | Better consensus outcomes; natural model diversity without Expert Council overhead | High     |
| **Adaptive fan-out** — for `consensus` merge mode, start with 3 agents; if consensus score is low (Kendall Tau < 0.6), automatically add 2 more agents                                             | Save cost on easy questions; invest more on hard ones                              | Medium   |
| **Weighted merge** — allow assigning weights to parallel agents based on their historical quality scores for this type of task                                                                     | Better output quality from merge step                                              | Medium   |
| **Budget-aware parallelism** — if budget is tight, reduce fan-out from N to min(N, budget-allows)                                                                                                  | Prevents budget overruns on parallel workflows                                     | Low      |

**Model Optimization:**

- Parallel branches: Mix of `gpt-5-mini` ($0.25/$2.0), `gemini-3-flash` ($0.50/$3.0), `grok-4-1-fast` ($0.20/$0.50), `claude-haiku-4-5` ($1.0/$5.0)
- Merge agent: `claude-sonnet-4-5` (best at synthesis tasks)
- **Cost for 4-way parallel + merge: ~$0.08** (vs current ~$0.15 if all use balanced models)

### 3.3 Supervisor Workflows

**Current State:** One supervisor agent delegates to worker agents. Supervisor decides which agent to call next.

**Market Comparison:** LangGraph's supervisor pattern, CrewAI's hierarchical process. Your implementation matches the standard pattern but misses **planning** and **reflection** capabilities.

| Improvement                                                                                                                                                      | Expected Outcome                                                        | Priority |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| **Add a planning phase** — before delegating, supervisor creates an explicit plan: "I will use Agent A for X, then Agent B for Y, because Z." Show plan to user. | Transparency; better delegation decisions; user can approve/modify plan | High     |
| **Supervisor self-reflection** — after receiving each worker's output, supervisor evaluates: "Did this achieve what I expected? Should I re-delegate?"           | Self-correcting; catches bad delegations                                | High     |
| **Tool-aware delegation** — supervisor should see which tools each worker has, not just their names/descriptions                                                 | Better matching of tasks to agents                                      | Medium   |
| **Budget allocation** — supervisor assigns token budgets to each delegation ("Agent A: max 2000 tokens, this is a simple lookup")                                | Prevents workers from burning budget on verbose outputs                 | Medium   |

**Model Optimization:**

- Supervisor: `claude-sonnet-4-5` (best at reasoning about delegation, strong instruction following)
- Workers: Vary by role — researchers on `gpt-5-mini` + tools, writers on `claude-haiku-4-5`, analysts on `gemini-3-flash`
- **Estimated savings: 25-35%** vs current defaults

### 3.4 Graph (Custom) Workflows

**Current State:** Full DAG support with conditional edges, loops, join nodes, and named outputs. LangGraph-backed.

**Market Comparison:** This is the most architecturally advanced workflow type. Comparable to LangGraph's `StateGraph` and n8n's visual workflow builder. The visual builder (`CustomWorkflowBuilder`) is a strong differentiator.

| Improvement                                                                                                                                         | Expected Outcome                                         | Priority |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------- |
| **Add "human-in-the-loop" approval nodes** — a node type that pauses execution and asks the user to approve/modify/reject before continuing         | Critical for high-stakes workflows; market expectation   | High     |
| **Loop detection & budget guardrails** — if a loop iterates >N times or cost exceeds budget, auto-terminate with summary of what was done           | Prevents runaway costs on recursive graphs               | High     |
| **Checkpoint visualization** — show the graph with completed nodes highlighted green, current node yellow, pending nodes gray                       | Users understand where their workflow is and what's left | Medium   |
| **Template parameterization** — allow workflow templates to have `{{variables}}` that users fill in at run time (e.g., "Research topic: {{topic}}") | Reusable templates; better onboarding                    | Medium   |
| **Error recovery branches** — allow edges to have error conditions: "if Agent A fails, route to Agent B instead"                                    | Resilience; fewer failed runs                            | Medium   |

**Model Optimization for Graph Workflows:**

- Decision/routing nodes: `gpt-5-nano` or `grok-3-mini` (cheapest available, just needs to evaluate conditions)
- Heavy processing nodes: model should match the task (research, writing, analysis)
- Join/merge nodes: `claude-haiku-4-5` (good at combining structured outputs)

### 3.5 Expert Council (Consensus)

**Current State:** 3-stage pipeline (parallel responses → judge reviews → chairman synthesis). Borda voting. Kendall Tau concordance. Full analytics.

**Market Comparison:** This is **more sophisticated than most market implementations**. The closest comparisons are Mixture-of-Agents (MoA) from Together AI and Constitutional AI's multi-judge pattern. Your system adds chairman synthesis which is a nice touch. Expert Council is a **critical workflow** — its whole value proposition is that multiple strong models produce better answers than any single model. Downgrading models here undermines the point.

| Improvement                                                                                                                                                                                                                  | Expected Outcome                                                                                              | Priority |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------- |
| **Specialize judge prompts by domain** — instead of generic "evaluate quality", use domain-specific rubrics (research accuracy, writing quality, analytical rigor, code correctness). Auto-detect domain from the prompt.    | **Dramatically better discrimination** between good and mediocre responses — the single biggest quality lever | Critical |
| **Maximize model diversity in council** — enforce that council members use _different providers_. The value of multi-model comes from diverse training data, not from running the same provider 3 times                      | **Better consensus outcomes**; genuine perspective diversity                                                  | Critical |
| **Dynamic council composition** — based on the question type (factual, creative, analytical), auto-select the best 3-4 models from historical performance data for that domain                                               | Best quality without manual configuration                                                                     | High     |
| **"Quick Council" mode** — for the `quick` mode, use 2 strong models + 1 fast judge, skip chairman if consensus is high (Kendall Tau >0.8)                                                                                   | Faster results on easy questions; full quality on hard ones                                                   | High     |
| **Cache-aware council** — if the same prompt was asked recently (cosine similarity >0.9), return cached result instead of re-running council                                                                                 | Near-zero cost for repeated/similar questions                                                                 | Medium   |
| **Disagreement deep-dive** — when council consensus is LOW (Kendall Tau <0.4), automatically trigger a follow-up round where models explain their reasoning, then re-judge. This is where council adds the most unique value | **Better results on hard questions** — exactly where you want multi-model                                     | Medium   |

**Model Mix for Expert Council (Quality-First):**

| Stage                      | Current                               | Proposed                                                                             | Rationale                                                                                             |
| -------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Council (3-4 models)       | User-configured (often same provider) | 1x `claude-sonnet-4-5` + 1x `gpt-5.2` + 1x `gemini-2.5-pro` + 1x `grok-4` (optional) | **Maximum diversity** — each has different strengths                                                  |
| Judges (2 models)          | User-configured                       | `claude-haiku-4-5` + `gpt-5-mini`                                                    | Capable enough for nuanced quality assessment; not nano — judging quality requires real understanding |
| Chairman                   | User-configured                       | `claude-sonnet-4-5`                                                                  | Synthesis is hard; chairman needs to genuinely understand and merge perspectives                      |
| **Total per council turn** | ~$0.40-0.80                           | ~$0.50-0.90                                                                          | Comparable cost, **significantly better quality**                                                     |

### 3.6 Deep Research Workflow

**Current State:** 8-step pipeline: Sense Making → Search Planning → Search Execution → Source Ingestion → Claim Extraction → KG Construction → Gap Analysis → Answer Generation. Budget-controlled with phases (full/reduced/minimal/exhausted). Knowledge hypergraph.

**Market Comparison:**

- **OpenAI Deep Research:** Uses o3/o4 for planning, gpt-5 for execution, iterative search with 5-30 minute run times, produces 5-15 page reports
- **Perplexity Pro:** Fast search with 5-10 sources, instant answers, no knowledge graph but excellent source quality
- **Google Deep Research (Gemini):** Iterative search planning, Gemini 2.5 for analysis, outputs structured reports
- **Elicit/Consensus:** Academic-focused, claim extraction with confidence scores, systematic review capability

Your implementation is **architecturally superior** to most (knowledge hypergraph, claim extraction, confidence scoring). This is a **critical workflow** — the goal is to make it produce _the best possible research output_, not the cheapest. Structural optimizations (batching, parallelism) reduce waste without touching quality.

| Improvement                                                                                                                                                                           | Expected Outcome                                                                           | Priority |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| **Batch source processing** — process 3-5 sources in a single LLM call (concatenated) instead of one call per source during Claim Extraction                                          | **50-70% fewer LLM calls** without any quality loss (same model, same depth, just batched) | Critical |
| **Parallel search execution** — execute SERP, Scholar, and Semantic searches simultaneously instead of sequentially                                                                   | **3x faster** search phase; same result quality                                            | Critical |
| **Source quality scoring** — use domain authority, publication date, and citation count to weight claims during synthesis. Higher-quality sources get more weight in the final answer | **Better answer quality** — the most impactful improvement for output                      | Critical |
| **Incremental KG updates** — when doing follow-up research on the same topic, reuse existing knowledge graph instead of rebuilding from scratch                                       | **Deeper results** on iterative research; accumulated knowledge compounds                  | High     |
| **Multi-hop deep search** — after Gap Analysis, launch targeted follow-up searches to fill identified gaps (currently gaps are just noted, not pursued)                               | **More thorough coverage**; closer to exhaustive literature review quality                 | High     |
| **Counterclaim strengthening** — dedicate a separate agent step (using Claude Sonnet, which excels at adversarial thinking) specifically to finding strongest counterarguments        | **More balanced, trustworthy output** — the #1 quality differentiator vs Perplexity        | High     |
| **Smart source prioritization** — after Search Execution, use a fast model to rank sources by likely relevance before ingesting. Skip obvious duplicates/low-quality.                 | Structural efficiency — fewer wasted calls, same depth on good sources                     | Medium   |
| **Tiered mode** — offer "Quick Research" (skip KG + Gap Analysis, go straight to answer) as an _option_ for simple factual questions only                                             | Gives users a fast path when they don't need full depth                                    | Medium   |

**Model Assignment (Quality-First):**

| Stage                     | Current Default  | Proposed            | Rationale                                                                      |
| ------------------------- | ---------------- | ------------------- | ------------------------------------------------------------------------------ |
| Sense Making (planning)   | Balanced         | `claude-sonnet-4-5` | Best reasoning for research design; this step determines everything downstream |
| Search Planning           | Balanced         | `claude-sonnet-4-5` | Query quality = result quality; worth investing here                           |
| Search Execution          | N/A (tool calls) | N/A                 | No model needed                                                                |
| Source Ingestion          | Balanced         | `gemini-2.5-pro`    | Long-context champion; best at faithfully extracting from long documents       |
| Claim Extraction          | Balanced         | `claude-sonnet-4-5` | Accuracy of claims is the backbone of the KG; needs precision                  |
| KG Construction           | Balanced         | `gpt-5.2`           | Good at structured/graph relationships                                         |
| Gap Analysis              | Balanced         | `claude-sonnet-4-5` | Reasoning about what's _missing_ requires the strongest model                  |
| Counterclaim Search (NEW) | N/A              | `claude-sonnet-4-5` | Adversarial reasoning is Claude's strength                                     |
| Answer Generation         | Balanced         | `claude-sonnet-4-5` | Final output quality is paramount                                              |

**Estimated Impact (10-source research):**

|                | Current     | Improved             | Change                                       |
| -------------- | ----------- | -------------------- | -------------------------------------------- |
| LLM calls      | ~18-25      | ~12-16               | 30% fewer (batching, no quality reduction)   |
| Output quality | Good        | Significantly better | Source weighting, counterclaims, gap-filling |
| Estimated cost | ~$0.80-1.50 | ~$0.70-1.20          | Modest savings from structural efficiency    |
| Estimated time | ~3-5 min    | ~2-3.5 min           | Parallel search + batching                   |

### 3.7 Dialectical (Hegelian) Workflow

**Current State:** 6-phase cycle: Context Retrieval → Thesis Generation → Cross Negation → Contradiction Crystallization → Sublation → Meta-Reflection. Knowledge Hypergraph with 4 layers. Multiple thesis lenses (economic, systems, adversarial, behavioral, historical, technical, political, ecological). Phase 1 implementation.

**Market Comparison:** This is **genuinely novel** — no major platform offers dialectical reasoning as a first-class workflow. The closest are:

- **Constitutional AI debates** (Anthropic) — but limited to safety, not general reasoning
- **Debate-style evaluation** (various papers) — but without the sublation/synthesis loop
- **Socratic method agents** (research prototypes) — but without the formal Hegelian structure

This is a **crown jewel differentiator** — no one else has this. Invest in quality here. The goal is to produce reasoning output that genuinely couldn't be achieved by a single model call, no matter how good the model.

| Improvement                                                                                                                                                                                                                                                                             | Expected Outcome                                                                           | Priority |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| **Use different models for different lenses** — adversarial lens with Claude (best at finding flaws), economic/systems lens with GPT o1 (strong structured reasoning), behavioral with Gemini Pro (strong at nuance), historical/political with Grok (strong on current affairs/X data) | **Best-in-class reasoning per lens**; this is where multi-model actually adds unique value | Critical |
| **Multi-cycle with progressive deepening** — Cycle 1 uses 3-4 lenses for broad coverage, Cycle 2 only pursues HIGH-severity contradictions with deeper reasoning, Cycle 3 (if needed) focuses on a single unresolved tension                                                            | **Much deeper synthesis** on hard questions; efficient use of reasoning budget             | Critical |
| **Reusable concept library** — store versioned concepts from past dialectical runs; reuse in new runs on related topics. Over time the system builds accumulated philosophical "muscle"                                                                                                 | **Compounding intelligence** — unique to your platform; gets smarter with use              | High     |
| **Contradiction severity threshold** — only pursue HIGH severity contradictions for sublation in deeper cycles; LOG medium/low for context but focus reasoning resources on what matters                                                                                                | Better allocation of reasoning effort                                                      | High     |
| **"Quick Dialectic" option for casual use** — 2 lenses (thesis + antithesis only), 1 cycle, no KG. Offered as a lightweight mode for everyday decisions where full Hegelian treatment is overkill                                                                                       | Makes dialectical thinking accessible for daily use; spreads adoption                      | High     |
| **Visual contradiction map** — enhance `DialecticalCycleVisualization` to show contradiction severity, thesis relationships, concept evolution across cycles, and the sublation "resolution path"                                                                                       | Users _understand_ the reasoning; builds trust in the output                               | Medium   |
| **Dialectical + Deep Research fusion** — allow Thesis Generation to trigger Deep Research sub-runs when a lens needs evidence. E.g., "Economic lens: researching market data..."                                                                                                        | **Evidence-grounded dialectics** — theses backed by real data, not just model reasoning    | Medium   |

**Model Assignment (Quality-First — Each Lens Gets Its Best Model):**

| Phase                         | Current  | Proposed                  | Rationale                                                                                       |
| ----------------------------- | -------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| Thesis: Adversarial/Systems   | Balanced | `claude-sonnet-4-5`       | Claude is best at finding flaws and structural tensions                                         |
| Thesis: Economic/Technical    | Balanced | `o1`                      | o1's extended thinking excels at structured analytical reasoning                                |
| Thesis: Behavioral/Historical | Balanced | `gemini-2.5-pro`          | Strong at nuanced, context-heavy reasoning                                                      |
| Thesis: Political/Ecological  | Balanced | `grok-4`                  | Best for current-affairs-informed perspectives                                                  |
| Cross Negation                | Balanced | `claude-sonnet-4-5`       | Claude excels at adversarial critique                                                           |
| Contradiction Crystallization | Balanced | `claude-sonnet-4-5`       | Needs precision to correctly classify contradiction types                                       |
| Sublation                     | Balanced | `o1` or `claude-opus-4-6` | The hardest reasoning step — synthesizing contradictions requires the strongest model available |
| Meta-Reflection               | Balanced | `claude-sonnet-4-5`       | Needs genuine reflection on whether synthesis is adequate                                       |

**Cost Profile (Full Dialectic — 4 lenses, 2 cycles):**

|                        | Current (est.) | Quality-Optimized        | Change                                               |
| ---------------------- | -------------- | ------------------------ | ---------------------------------------------------- |
| LLM calls              | ~8-12          | ~10-14 (more thorough)   | Slightly more calls for deeper reasoning             |
| Output quality         | Decent         | **Significantly better** | Each lens uses its best model; multi-cycle deepening |
| Estimated cost         | ~$0.50-1.00    | ~$1.00-2.50              | Higher — but this IS the differentiator              |
| Quick Dialectic option | N/A            | ~$0.15-0.30              | Lightweight mode for everyday decisions              |

### 3.8 Project Planning (Supervisor-based)

**Current State:** Multi-agent workflow: Project Planning Coordinator → (delegates to) Project Structure Planner → Task Breakdown Specialist → Risk Analyst → Plan Quality Reviewer. Project Manager layer adds requirement extraction, conflict detection, user profiling.

**Market Comparison:**

- **Linear/Asana AI:** Auto-generate project plans from descriptions, but no multi-agent reasoning
- **Notion AI:** Single-model project planning, no delegation
- **CrewAI project planning template:** Similar multi-agent approach but without the PM context tracking

Your implementation is competitive. The PM context tracking (requirements, assumptions, decisions, conflicts, user profile) is a **strong differentiator**.

| Improvement                                                                                                                                                                                   | Expected Outcome                                    | Priority |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------- |
| **Use the Time-Aware Planner by default** — currently it's a separate agent; it should be integrated into the main planning workflow so plans are always grounded in the user's real schedule | Much more realistic timelines and milestone dates   | High     |
| **Template-based output** — enforce structured output (JSON) from Planner and Task Specialist agents, then render in the UI as interactive Gantt chart                                        | Professional presentation; editable plans           | High     |
| **"Quick Plan" mode** — skip Risk Analyst and Quality Reviewer for simple projects (<5 tasks); only use full pipeline for complex projects                                                    | 50% cost reduction on simple projects               | High     |
| **Iterative refinement loop** — after Quality Reviewer flags issues, auto-route back to relevant agent for fixes instead of just reporting issues                                             | Self-correcting plans; fewer manual iterations      | Medium   |
| **Integration with todos** — after plan approval, auto-create todos in LifeOS from the generated tasks                                                                                        | Close the loop; plans become actionable immediately | Medium   |
| **Historical calibration** — use past project completion data (from todos) to calibrate time estimates                                                                                        | More accurate estimates over time                   | Low      |

**Optimized Model Assignment:**

| Agent             | Current      | Proposed            | Rationale                                    |
| ----------------- | ------------ | ------------------- | -------------------------------------------- |
| PM Coordinator    | `gpt-5-mini` | `gpt-5-mini`        | Good enough for coordination/questions       |
| Structure Planner | `o1`         | `claude-sonnet-4-5` | Strong reasoning at 60% lower cost than o1   |
| Task Specialist   | `gpt-5-mini` | `gpt-5-mini`        | Structured output; cheap model sufficient    |
| Risk Analyst      | `o1`         | `gemini-2.5-pro`    | Good reasoning at 50% lower cost than o1     |
| Quality Reviewer  | `o1`         | `claude-haiku-4-5`  | Review/critique doesn't need heavy reasoning |

**Cost Comparison:**

|                 | Current (full pipeline)   | Optimized   | Savings    |
| --------------- | ------------------------- | ----------- | ---------- |
| All agents      | ~$1.20-2.00 (3x o1 calls) | ~$0.30-0.50 | **70-75%** |
| Quick Plan mode | N/A                       | ~$0.08-0.15 | N/A        |

### 3.9 Content Creation Pipeline

**Current State:** Multiple standalone agents: Content Strategist, Content Research Analyst, Thought Leadership Writer, Content Polish Editor, SEO Specialist, LinkedIn Post Critic. Not wired together as a cohesive workflow.

**Market Comparison:**

- **Jasper AI:** Full content pipeline with research → outline → draft → SEO → publish
- **Copy.ai Workflows:** Multi-step content creation with brand voice and competitive analysis
- **Writer.com:** Enterprise content platform with style guide enforcement and fact-checking

Your individual agents are strong but **lack a cohesive pipeline workflow**.

| Improvement                                                                                                                                                                             | Expected Outcome                                 | Priority |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------- |
| **Create a "Content Pipeline" workflow template** — wire together: Strategy → Research → Draft → Edit → SEO into a single sequential workflow                                           | One-click content creation; consistent quality   | Critical |
| **Add brand voice memory** — store user's writing style preferences (tone, vocabulary, structure) and inject into writer agent prompts                                                  | Consistent personal brand across all content     | High     |
| **LinkedIn optimization specialization** — the LinkedIn Post Critic is great; create a full "LinkedIn Content Factory" workflow: Idea → Research → Draft → Critique → Polish → Schedule | LinkedIn is highest-ROI social for professionals | High     |
| **Multi-format output** — one research input → parallel outputs: LinkedIn post + blog article + email newsletter + X thread                                                             | 4x content from 1x research investment           | Medium   |
| **SEO-first mode** — for blog content, run SEO Specialist first to identify keywords and SERP gaps, then feed those constraints to the writer                                           | Content that actually ranks; data-driven writing | Medium   |

**Proposed "LinkedIn Content Factory" Workflow:**

```
1. Topic Research (gpt-5-mini + serp_search)     ~$0.02
2. Competitor Analysis (gemini-3-flash + serp)    ~$0.02
3. Draft Writer (claude-sonnet-4-5)               ~$0.05
4. LinkedIn Critic (gpt-5-mini + serp_search)     ~$0.02
5. Final Polish (claude-haiku-4-5)                ~$0.01
                                          Total:  ~$0.12/post
```

### 3.10 Research Workflows (SERP, Semantic, Fact-Check)

**Current State:** Multiple research agent templates using different search strategies: SERP search, semantic search via Exa, scholar search, URL reading, PDF parsing. Quick Search Analyst for fast answers.

**Market Comparison:**

- **Perplexity:** Instant sourced answers with 5-10 high-quality sources
- **You.com:** Search + RAG with source citations
- **Tavily:** Purpose-built AI search API with relevance scoring

| Improvement                                                                                                                                                                      | Expected Outcome                            | Priority |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------- |
| **"Smart Search Router"** — instead of the user choosing SERP vs Semantic vs Scholar, auto-route based on query type (factual → SERP, conceptual → Semantic, academic → Scholar) | Better results; simpler UX                  | High     |
| **Source deduplication** — when multiple search methods return the same source, merge and boost its relevance score                                                              | Cleaner results; more efficient processing  | Medium   |
| **Search result caching** — cache SERP results for 24h; cache semantic results for 72h                                                                                           | Save API costs on repeated/similar searches | Medium   |
| **Multi-hop research** — for complex questions, extract sub-questions from initial results and search again (recursive search pattern)                                           | Deeper answers for complex questions        | Medium   |
| **Citation quality scoring** — rank sources by: domain authority, publication date, author credentials, citation count                                                           | Users can trust the quality of sources      | Low      |

**Model Optimization:**

- Quick Search: `grok-3-mini` ($0.10/$0.30) — cheapest available, perfect for simple lookups
- SERP Research: `gpt-5-mini` ($0.25/$2.0) — good at structured extraction
- Semantic Research: `gemini-3-flash` ($0.50/$3.0) — good at understanding concepts
- Fact Check: `claude-haiku-4-5` ($1.0/$5.0) — best at nuanced true/false reasoning

### 3.11 Productivity Workflows (Calendar, Knowledge, Calculator)

**Current State:** Calendar Assistant, Meeting Coordinator, Knowledge Manager, Quick Calculator, Quick Summarizer. These are standalone agents with relevant tools.

**Market Comparison:**

- **Notion AI:** Integrated knowledge management with Q&A over workspace
- **Reclaim.ai:** AI-powered calendar management with habit scheduling
- **Mem.ai:** AI-first note-taking with memory and connections

| Improvement                                                                                                                                                                                | Expected Outcome                                | Priority |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | -------- |
| **"Morning Brief" scheduled workflow** — auto-run daily: check calendar → summarize today's meetings → review overdue todos → suggest priorities                                           | Proactive daily assistance; killer feature      | Critical |
| **"Weekly Review" scheduled workflow** — auto-run weekly: analyze habit completion → summarize notes created → review project progress → generate reflection prompts                       | Self-improvement through automated reflection   | High     |
| **Knowledge Manager + Graph** — enhance Knowledge Manager to visualize note connections and suggest new links based on content similarity                                                  | Builds a personal knowledge graph automatically | High     |
| **Calendar intelligence** — Meeting Coordinator should analyze meeting patterns: "You have 23 meetings this week, 40% are recurring. Consider canceling X, Y, Z based on your priorities." | Proactive calendar optimization                 | Medium   |
| **Cross-data insights** — "Your productivity drops 30% on days with >4 meetings" (correlate calendar, todos, habits)                                                                       | Data-driven self-optimization                   | Medium   |

**Model Strategy:**

- Morning Brief: `gpt-5-nano` ($0.05/$0.40) — structured data summarization, run daily = cost-sensitive
- Weekly Review: `gpt-5-mini` ($0.25/$2.0) — needs some analysis capability
- Knowledge Manager: `gemini-3-flash` ($0.50/$3.0) — good at semantic similarity for link suggestions

### 3.12 Marketing & Sales Coaching Workflows

**Current State:** Offer Creation Coach, Marketing Pipeline Coach, Sales Pipeline Coach, LinkedIn Post Critic. All standalone agents.

**Market Comparison:**

- **HubSpot AI:** Sales coaching with deal analysis and email suggestions
- **Gong:** Conversation intelligence and coaching recommendations
- **Apollo.io:** AI-powered outreach and pipeline management

| Improvement                                                                                                                                         | Expected Outcome                                    | Priority |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------- |
| **"Go-to-Market Pipeline" workflow** — chain: Offer Coach → Marketing Coach → Content Pipeline → Sales Coach into a comprehensive GTM plan          | Complete business strategy in one run               | High     |
| **Personalized coaching memory** — store what the user's business is, their target audience, past decisions, and inject into every coaching session | Continuity across sessions; feels like a real coach | High     |
| **Competitive intelligence integration** — use `serp_search` to pull real competitor data into coaching recommendations                             | Data-grounded advice instead of generic frameworks  | Medium   |
| **Weekly content calendar generation** — Marketing Coach should output a specific 7-day content plan with topics, formats, and posting times        | Actionable output; ready to execute                 | Medium   |

---

## Summary: Priority Matrix

### Tier 1: Critical (Do First — Highest Impact)

**Quality Investments (Critical Workflows):**

| #   | Improvement                                      | Area           | Est. Effort | Expected Outcome                                                         |
| --- | ------------------------------------------------ | -------------- | ----------- | ------------------------------------------------------------------------ |
| 1   | Best-model-per-lens in Dialectical               | Dialectical    | Medium      | **Best-in-class reasoning** — each lens uses the model that excels at it |
| 2   | Domain-specific judge rubrics for Expert Council | Expert Council | Low         | **Much better quality discrimination** between responses                 |
| 3   | Counterclaim strengthening step in Deep Research | Deep Research  | Medium      | **More balanced, trustworthy** research output                           |
| 4   | Multi-cycle progressive deepening in Dialectical | Dialectical    | Medium      | **Significantly deeper** synthesis on hard questions                     |
| 5   | Source quality scoring in Deep Research          | Deep Research  | Low         | **Better answers** from the same sources                                 |
| 6   | Enforce model diversity in Expert Council        | Expert Council | Low         | **Genuine perspective diversity** — the whole point of multi-model       |

**Structural Efficiency (All Workflows):**

| #   | Improvement                                | Area          | Est. Effort | Expected Outcome                                    |
| --- | ------------------------------------------ | ------------- | ----------- | --------------------------------------------------- |
| 7   | Batch source processing in Deep Research   | Deep Research | Medium      | 50-70% fewer LLM calls, zero quality loss           |
| 8   | Parallel search execution in Deep Research | Deep Research | Low         | 3x faster search phase                              |
| 9   | Prompt caching (Anthropic, OpenAI)         | Cross-cutting | Low         | ~50% savings on cached tokens across all workflows  |
| 10  | "Content Pipeline" workflow template       | Content       | Low         | New capability — the agents exist, just need wiring |
| 11  | "Morning Brief" scheduled workflow         | Productivity  | Medium      | New capability — proactive daily intelligence       |

**Cost Optimization (Routine Workflows Only):**

| #   | Improvement                                       | Area          | Est. Effort | Expected Outcome                                     |
| --- | ------------------------------------------------- | ------------- | ----------- | ---------------------------------------------------- |
| 12  | Smart Model Routing for routine workflows         | Cross-cutting | Medium      | 30-50% savings on Quick Search, Calendar, Summarizer |
| 13  | Early-exit conditions in Sequential workflows     | Sequential    | Low         | 30-60% savings when answer is found early            |
| 14  | Analysis Planner agent (from ThePowerOfAnalytics) | New Tool      | Low         | New capability — structured analytics methodology    |

### Tier 2: High Priority (Strong Value)

| #   | Improvement                                          | Area           | Est. Effort | Expected Outcome                                             |
| --- | ---------------------------------------------------- | -------------- | ----------- | ------------------------------------------------------------ |
| 15  | Reusable concept library for Dialectical             | Dialectical    | Medium      | **Compounding intelligence** across sessions                 |
| 16  | Disagreement deep-dive in Expert Council             | Expert Council | Medium      | **Better results on hard questions** — where it matters most |
| 17  | Multi-hop deep search (gap-filling) in Deep Research | Deep Research  | Medium      | **More thorough** coverage; closer to systematic review      |
| 18  | Human-in-the-loop graph nodes                        | Graph          | Medium      | User control on high-stakes workflows                        |
| 19  | "LinkedIn Content Factory" workflow                  | Content        | Low         | New capability — highest-ROI social content                  |
| 20  | KPI Tree / Goal Decomposition agent                  | New Tool       | Low         | **Unique differentiator** — no personal app does this        |
| 21  | Supervisor planning phase                            | Supervisor     | Medium      | Better delegation quality + transparency                     |
| 22  | "Quick Dialectic" lightweight mode                   | Dialectical    | Low         | Makes dialectical thinking accessible for daily use          |
| 23  | "Weekly Review" scheduled workflow                   | Productivity   | Medium      | Automated self-reflection                                    |
| 24  | Context compression between agents (routine only)    | Cross-cutting  | Medium      | 30-40% token reduction in sequential chains                  |

### Tier 3: Medium Priority (Good Value)

| #   | Improvement                              | Area          | Est. Effort | Expected Outcome                       |
| --- | ---------------------------------------- | ------------- | ----------- | -------------------------------------- |
| 25  | Dialectical + Deep Research fusion       | Dialectical   | High        | Evidence-grounded dialectics           |
| 26  | Auto-evaluation pipeline                 | Cross-cutting | Medium      | Data-driven quality improvement        |
| 27  | Real-time streaming UX                   | Cross-cutting | Medium      | Better perceived performance           |
| 28  | Sub-workflow composability               | Graph         | High        | Complex workflows from building blocks |
| 29  | Visual contradiction map                 | Dialectical   | Medium      | User understanding of reasoning        |
| 30  | Incremental KG updates in Deep Research  | Deep Research | Medium      | Faster iterative research              |
| 31  | MAIN-framework Executive Summary agent   | New Tool      | Low         | Better formatted synthesis outputs     |
| 32  | Network Segmentation agent (CRM)         | New Tool      | Medium      | Smarter relationship management        |
| 33  | Self-Cohort Analyst (training)           | New Tool      | Medium      | Deep self-knowledge insights           |
| 34  | `update_todo` + `send_email_draft` tools | Tools         | Low         | Close the loop on task mgmt and email  |
| 35  | `memory_recall` tool                     | Tools         | Medium      | Session continuity                     |

---

## Estimated Overall Impact

If all Tier 1 + Tier 2 improvements are implemented:

| Metric                                      | Current               | Projected                | Change                                                                                             |
| ------------------------------------------- | --------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| **Deep Research output quality**            | Good                  | **Excellent**            | Source scoring, counterclaims, gap-filling, batching                                               |
| **Dialectical output quality**              | Decent                | **Best-in-market**       | Per-lens models, multi-cycle, concept library                                                      |
| **Expert Council quality**                  | Good                  | **Significantly better** | Domain rubrics, model diversity, disagreement deep-dive                                            |
| Deep Research cost (10 sources)             | ~$0.80-1.50           | ~$0.70-1.20              | Modest savings from structural efficiency                                                          |
| Dialectical cost (full, 4 lenses, 2 cycles) | ~$0.50-1.00           | ~$1.00-2.50              | Higher — investing in quality                                                                      |
| Dialectical cost (quick, 2 lenses)          | N/A                   | ~$0.15-0.30              | New lightweight mode                                                                               |
| Expert Council cost per turn                | ~$0.40-0.80           | ~$0.50-0.90              | Similar cost, much better output                                                                   |
| Routine workflow cost (search, calendar)    | ~$0.10-0.30           | ~$0.03-0.10              | **60-70% reduction**                                                                               |
| Content pipeline cost                       | Manual agent chaining | ~$0.12/post              | New automated capability                                                                           |
| Project Planning cost                       | ~$1.20-2.00           | ~$0.50-0.80              | Smarter model selection on mechanical steps                                                        |
| New workflow templates                      | 0                     | 5-7                      | Content Pipeline, LinkedIn Factory, Morning Brief, Weekly Review, Analytics Pipeline, GTM Pipeline |
| New agent templates                         | 0                     | 3-4                      | Goal Decomposition, Analysis Planner, MAIN Summary, Self-Cohort Analyst                            |
| New built-in tools                          | 0                     | 3-4                      | update_todo, send_email_draft, memory_recall, generate_chart                                       |
