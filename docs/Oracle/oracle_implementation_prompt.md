# Oracle Implementation Planning — Claude Code Prompt

> **How to use this prompt:** Copy the entire contents of this file into a Claude Code session. Before running, ensure the three reference documents are in your project's `/specs` directory (or update paths below). Use Plan Mode (Shift+Tab) for the initial run.

---

## System Context

You are acting as a senior systems architect and implementation planner. You have access to three specification documents for a system called **Oracle** — an AI-powered scenario planning engine. Your task is to produce a phased implementation plan that follows spec-driven agentic development practices.

## Reference Documents

Read these three documents before producing any output. They are the authoritative specification — do not invent, modify, or assume anything not in them.

1. **`specs/oracle_v3_technical_design.md`** — The technical specification. Defines Oracle's four-phase pipeline (Decomposition → Trend Scanning → Scenario Development → Backcasting), its multi-model Expert Council architecture, agent roles, gate system, confidence scoring, and the Reasoning Ledger. This is the primary design authority.

2. **`specs/axiom_library.json`** — 142 curated mental models across economics, cognitive science, systems dynamics, organizational theory, game theory, and information theory. Each entry has a formal definition, mathematical formulation, boundary conditions, and application examples. Seven axioms are elevated to structural roles in Oracle's architecture (Inversion, Map vs. Territory, Second-Order Thinking, Circle of Competence, Lollapalooza Effect, Integrative Thinking, Resulting).

3. **`specs/axiom_cookbook.json`** — 21 analytical recipes organized by question type (Why is it this way? / What happens next? / What could go wrong? / How confident should we be? / What should we recommend?), plus 15 reusable reasoning techniques and a reverse-indexed pantry. This is the runtime reasoning playbook that tells agents which axioms to apply, in what order, and what traps to watch for.

## Your Task

Produce a complete implementation plan for Oracle. The plan must satisfy ALL of the following requirements:

### Requirement 1: Spec-Driven Development Structure

Follow the Specify → Plan → Task → Implement → Verify loop. For each implementation phase, produce:

- **Objective**: What this phase delivers
- **In-scope / Out-of-scope**: Bounded explicitly
- **Acceptance criteria**: Testable, not aspirational
- **Files expected**: What gets created or modified
- **Verification**: How you know this phase is done
- **Dependencies**: What must be complete before this phase starts

### Requirement 2: Maximize Reuse of Existing Components

Oracle's architecture relies heavily on LLM API calls orchestrated with structured prompts. Do NOT design a custom ML system. Instead, identify which components can be built from:

- **Claude API** (Anthropic Messages API with tool use) — for the Expert Council models, agent reasoning, and synthesis
- **Structured prompting** — the Axiom Cookbook recipes are essentially structured prompt templates that guide model reasoning
- **Existing libraries** — for JSON schema validation, confidence scoring, graph construction (causal maps), and document generation
- **MCP servers** — for connecting Oracle to external data sources (news APIs, financial data, research databases) during Phase 0 (Context Gathering) and Phase 2 (Trend Scanning)

For each component in the plan, explicitly state: **build, compose, or configure** — where "compose" means assembling existing tools/APIs and "configure" means parameterizing an existing system.

### Requirement 3: Agentic Development Workflow

The implementation itself will be built using AI coding agents (Claude Code primary, with Cursor and Codex as secondary). Structure the plan so that:

- Each task is completable in a single agent session (one task per session discipline)
- Tasks include verification commands, not just descriptions
- The plan identifies which tasks are parallelizable (can run in separate worktrees)
- Architecture Decision Records (ADRs) are specified for every significant choice
- A `CLAUDE.md` constitution is drafted as part of Phase 0 of the implementation

### Requirement 4: Architecture Decisions

For each of these decisions, provide 2–3 options with trade-offs and a recommendation:

1. **Runtime architecture**: Serverless functions vs. container orchestration vs. hybrid
2. **State management**: How the Reasoning Ledger persists across pipeline phases
3. **Model routing**: How the Expert Council selects and dispatches to different LLM providers
4. **Prompt management**: How Axiom Cookbook recipes become runtime prompts (template engine, prompt chain library, or custom)
5. **Output format**: How scenario portfolios are rendered and delivered
6. **Observability**: How to instrument the pipeline for debugging, cost tracking, and quality measurement

### Requirement 5: Component Mapping

Map every Oracle architectural component from the v3 spec to a concrete implementation unit. At minimum, cover:

| Oracle Concept | Implementation Unit |
|---|---|
| Phase 0: Context Gathering | ? |
| Phase 1: Decomposition (STEEP+V) | ? |
| Phase 2: Trend Scanning | ? |
| Phase 3: Scenario Development + Backcasting | ? |
| Expert Council (4-model) | ? |
| Model Router | ? |
| Axiom Library (142 entries) | ? |
| Axiom Cookbook (21 recipes, 15 techniques) | ? |
| Reasoning Ledger | ? |
| Gate System (A, B, C) | ? |
| Confidence Scoring (Bayesian) | ? |
| Consistency Checker | ? |
| Red Team Agent | ? |
| Rubric Evaluator | ? |
| Output Generator (scenario portfolios) | ? |

### Requirement 6: Implementation Phases

Structure the build into 4–6 phases, where each phase produces a working, testable increment. Suggested framing (adjust based on your analysis):

- **Phase 0 — Foundation**: Project setup, CLAUDE.md, ADRs, data models, prompt infrastructure, Axiom Library and Cookbook loaded as structured data
- **Phase 1 — Single-Model Pipeline**: One LLM running the full Oracle pipeline end-to-end, no Expert Council yet, basic Reasoning Ledger, one recipe per category
- **Phase 2 — Expert Council + Gates**: Multi-model routing, gate system, confidence scoring, consistency checking
- **Phase 3 — Full Cookbook Integration**: All 21 recipes as structured prompts, Red Team agent, Rubric Evaluator, complete Reasoning Ledger
- **Phase 4 — Production Hardening**: Observability, cost controls, output polish, caching, rate limiting, error handling

Each phase should end with a demo-able capability: Phase 1 produces a basic scenario portfolio from a user query. Phase 2 produces a scenario portfolio with confidence scores and gate results. And so on.

### Requirement 7: Task Decomposition

For Phase 0 and Phase 1, decompose into individual implementation tasks at the granularity an AI coding agent can execute in a single session. For Phases 2–4, decompose into epics (3–7 tasks each) with enough detail to write task-level specs later.

Each task needs:
- Task ID and name
- Description (2–3 sentences)
- Input: what the agent reads before starting
- Output: what the agent produces
- Acceptance criteria (testable)
- Verification command
- Estimated complexity (1–5 scale)
- Dependencies (other task IDs)

### Requirement 8: Risk Register

Identify the top 10 implementation risks. For each: description, likelihood (H/M/L), impact (H/M/L), mitigation strategy, and the earliest phase where it can be detected.

## Output Format

Produce a single markdown document with these sections:

1. Executive Summary (half-page)
2. Architecture Decisions (with ADR format per decision)
3. Component Map (table from Requirement 5, filled in)
4. Implementation Phases (from Requirement 6)
5. Task Breakdown — Phase 0 (from Requirement 7)
6. Task Breakdown — Phase 1 (from Requirement 7)
7. Epic Breakdown — Phases 2–4 (from Requirement 7)
8. CLAUDE.md Draft (the constitution file for the Oracle project)
9. Risk Register (from Requirement 8)
10. Appendix: Key Prompt Templates (3–5 example prompts showing how Cookbook recipes translate to actual API calls)

## Constraints

- Do NOT generate code. This is a planning document.
- Do NOT hallucinate capabilities. If you're unsure whether a library or API supports something, say so and flag it as a spike task.
- DO reference specific axiom IDs (AXM-xxx), recipe IDs (A1, B2, etc.), and technique IDs (T01, T15, etc.) when they inform architectural decisions.
- DO apply Oracle's own reasoning framework where useful — use Inversion (AXM-093) on the implementation plan itself: what would guarantee this build fails?
- Prioritize working software over comprehensive coverage. Phase 1 should be achievable in 2–3 weeks of agent-assisted development.
- Assume the builder has Claude Max, Claude Code, Cursor, and Codex available. Assume Next.js + TypeScript + Supabase as the default stack unless your analysis recommends otherwise (with ADR justification).

## Start

Read all three specification documents now. Then produce the implementation plan. Begin with the architecture decisions, as they constrain everything downstream.
