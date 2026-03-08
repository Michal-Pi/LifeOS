# Oracle: Agentic Scenario Planning Engine

## Technical Design & Product Requirements — v3.0 (Simplified)

**Status:** Implementation-ready spec for coding agents
**Stack:** LangGraph · Claude/GPT/Gemini/Grok · graph-lib · Serper/Exa/Firecrawl/Jina
**Date:** March 2026

---

## Simplification Changelog (v2 → v3)

Seven structural simplifications that reduce implementation complexity ~40% without reducing output quality:

| Change                                                  | What was removed                                                                                                                                                                              | Why it's safe                                                                                                                                                                                                                            | Impact                                                         |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **One graph, not two**                                  | Separate Argument Graph (Toulmin). Merged into unified Knowledge Graph with claim/logic edge types.                                                                                           | The Reasoning Ledger already tracks logical provenance (claim → assumption → evidence). A separate Toulmin graph duplicated this. Logic edges (`supports`, `contradicts`, `depends_on`) live on the same graph as causal edges.          | −1 entire data structure, −1 build item, simpler graph queries |
| **Selective council, not universal**                    | Full 3-round Expert Council at every phase. Now reserved for 3 critical moments only.                                                                                                         | Within-phase work (trend enrichment, MCTS expansion) doesn't need four-model debate. A single strong model handles it. Council runs at: end of Phase 1, end of Phase 2, and final scenario review.                                       | ~60% fewer LLM calls, major cost reduction                     |
| **Enumerate-score-develop, not MCTS**                   | Full MCTS with UCB selection, backpropagation, tree data structure. Replaced with simpler morphological enumeration → parallel scoring → top-K development.                                   | MCTS shines in huge search spaces (game trees with millions of states). Scenario planning has 8–20 candidate skeletons after morphological filtering. Enumerate-and-score finds the same top scenarios without the algorithmic overhead. | −1 complex algorithm, much simpler Phase 3, easier to debug    |
| **One consistency checker, not four**                   | Separate Z3 solver, Logic Linter, Contradiction Detector, Citation Validator. Merged into single Consistency Checker with rule-based + LLM tiers.                                             | Z3/SMT is overkill for soft constraints (economic tendencies, not boolean logic). One checker with fast rule-based checks first, LLM confirmation for ambiguous cases, covers all four use cases.                                        | −3 build items, simpler evaluation layer                       |
| **Black Swan merged into Red Team**                     | Separate Black Swan Injector agent/step. Now a prompt augmentation on Red Team.                                                                                                               | It was functionally "Red Team for unknown unknowns." Adding "identify events with no current signal that would invalidate this scenario" to Red Team's prompt achieves the same output without a separate agent or pipeline step.        | −1 agent, −1 pipeline step                                     |
| **Structured output first, condensation as safety net** | Heavy Condenser as a core pipeline step for all agent outputs. Now agents are prompted with output schemas; Condenser only runs when agents deviate.                                          | If agents output structured JSON (claims, edges, scores), there's nothing to condense. The verbose-prose problem is a prompting problem, not an architecture problem. Fix it at the source.                                              | Simpler data flow, fewer LLM calls for condensation            |
| **18 tools → 12 tools**                                 | Dropped: standalone Contradiction Detector, standalone Citation Validator, standalone Continuous Logic Linter, standalone Black Swan Injector, Z3 integration, Evolutionary Scenario Refiner. | First four merged into other components. Z3 is over-engineered for v1. Evolutionary refiner is a v2 feature.                                                                                                                             | −6 build items, tighter scope                                  |

---

## 1. Problem Statement

Strategic leaders struggle to reason about future states of complex systems because analysis lacks first-principles grounding, trend analysis is narrative-driven, scenario planning ignores feedback loops and cross-impacts, reasoning is untraceable, and quality is inconsistent.

Oracle solves this by combining first-principles decomposition, systems dynamics modeling, evidence-grounded environmental scanning, and iterative causal simulation — orchestrated across four frontier LLMs with structured debate, stage gates, and a reasoning ledger that makes every conclusion auditable.

**Output:** A decision-ready portfolio of divergent future states with explicit causal chains, assumption maps, and strategic implications.

---

## 2. Design Principles

| Principle                        | Operationalization                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| **Reasoning over retrieval**     | Every claim traces to a first principle, causal mechanism, or cited source                |
| **Structured dissent**           | Multi-model disagreement is captured and preserved, not averaged away                     |
| **Transparent epistemics**       | Every output carries confidence scores, assumption register, provenance chain             |
| **Composable depth**             | Each phase runs independently or feeds the next. Depth scales with stakes                 |
| **Human-in-the-loop**            | Oracle proposes; humans approve at key gates                                              |
| **Structured output by default** | Agents output typed schemas, not prose. Minimizes downstream processing                   |
| **Stage-gated quality**          | Hard rubric thresholds at phase boundaries. Below threshold → refinement, not passthrough |

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   ORCHESTRATION LAYER                         │
│              LangGraph Supervisor + State Machine              │
│       Phase routing · Model selection · Gate enforcement       │
└─────────────────────────┬────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌────────────────────┐
│  AGENT LAYER │  │ INFRA LAYER  │  │ EVALUATION LAYER   │
│              │  │              │  │                    │
│  Phase 1–3   │  │  Search tools│  │  Rubric Evaluator  │
│  agents      │  │  Graph store │  │  Consistency       │
│  Expert      │  │  Evidence DB │  │  Checker           │
│  Council     │  │  Axiom Lib   │  │  Stage Gates       │
│  (selective) │  │  Model router│  │                    │
└──────┬───────┘  └──────┬───────┘  └────────┬───────────┘
       │                 │                    │
       └─────────────────┼────────────────────┘
                         ▼
         ┌───────────────────────────────┐
         │      REASONING LEDGER         │
         │  Claims · Assumptions ·       │
         │  Evidence · Dependencies ·    │
         │  Confidence · Test Results    │
         └───────────────┬───────────────┘
                         ▼
         ┌───────────────────────────────┐
         │      KNOWLEDGE GRAPH          │
         │  (Unified: causal + logic)    │
         │  Principles · Constraints ·   │
         │  Trends · Uncertainties ·     │
         │  supports/contradicts edges   │
         └───────────────────────────────┘
```

**Three layers, cleanly separated:**

**Orchestration** — LangGraph supervisor manages phase sequencing, model selection per task, state persistence, gate enforcement, and human gates. State is append-only with full provenance.

**Agent + Infrastructure** — Specialized agents per phase (but fewer than v2 — see Section 9). Tools provide search, graph, and reference data.

**Evaluation** — Rubric scoring + consistency checking at phase boundaries. One unified Consistency Checker handles contradictions, axiom violations, and scenario coherence.

---

## 4. The Reasoning Ledger

The single canonical traceability object. Every agent writes typed primitives with unique IDs.

```typescript
interface Claim {
  id: string // "CLM-001"
  type: 'descriptive' | 'causal' | 'forecast'
  text: string
  confidence: number // 0–1
  confidence_basis: 'data' | 'model_consensus' | 'expert_judgment' | 'speculative'
  assumptions: string[] // ASM IDs
  evidence_ids: string[] // EVD IDs
  dependencies: string[] // Other CLM IDs
  axiom_refs: string[] // AXM IDs (from Axiom Library)
  created_by: string // Agent + model
  phase: number
}

interface Assumption {
  id: string // "ASM-001"
  type: 'economic' | 'technical' | 'behavioral' | 'regulatory' | 'structural'
  statement: string
  sensitivity: 'high' | 'medium' | 'low'
  observables: string[] // What would confirm/deny
  confidence: number
}

interface Evidence {
  id: string // "EVD-001"
  source: string
  url: string
  date: string
  excerpt: string
  reliability: number // 0–1
  search_tool: 'serper' | 'exa' | 'firecrawl' | 'jina'
}
```

Any conclusion can be traced: `Conclusion → supporting claims → assumptions → evidence + axiom references`. No orphan claims allowed.

---

## 5. Unified Knowledge Graph

One graph handles both causal dynamics and logical relationships. Simpler to build, query, and maintain than separate graphs.

```typescript
interface GraphNode {
  id: string
  type: 'principle' | 'constraint' | 'trend' | 'uncertainty' | 'variable' | 'scenario_state'
  label: string
  ledger_ref?: string // Links to Reasoning Ledger claim
  properties: Record<string, any>
}

interface GraphEdge {
  source: string
  target: string
  type:
    | 'causes'
    | 'constrains'
    | 'disrupts'
    | 'reinforces'
    | 'resolves_as'
    | 'supports'
    | 'contradicts'
    | 'depends_on' // Logic edges on same graph
  polarity?: '+' | '-' | 'conditional'
  strength: number // 0–1
  lag?: 'immediate' | 'short' | 'medium' | 'long'
}

interface FeedbackLoop {
  id: string
  type: 'reinforcing' | 'balancing'
  nodes: string[]
  description: string
}
```

The `supports`, `contradicts`, `depends_on` edge types serve the role that the separate Argument Graph played in v2. Contradiction detection runs as a graph query (find nodes with both `supports` and `contradicts` edges to the same target), not a separate tool.

---

## 6. Axiom Library

Structured reference database of 142 formal laws across six domains. Phase 1 agents must cite entries from this library — "coordination costs" is insufficient; they must link to the specific law with its mathematical formulation.

```typescript
interface AxiomEntry {
  id: string // "AXM-001"
  name: string // "Brooks' Law"
  domain:
    | 'economics'
    | 'cognitive_science'
    | 'information_theory'
    | 'systems_dynamics'
    | 'game_theory'
    | 'organizational_theory'
  formal_definition: string
  mathematical_formulation?: string // e.g., "n(n-1)/2"
  boundary_conditions: string[]
  canonical_citations: string[]
  system_elevation?: SystemElevation // When the axiom shapes system behavior, not just reference
}
```

**Coverage:** Economics (35), Cognitive Science (49), Systems Dynamics (29), Organizational Theory (13), Game Theory (7), Information Theory (9).

**Source canon:** Poor Charlie's Almanack, Thinking Fast and Slow, Thinking in Systems, The Great Mental Models, Super Thinking, Thinking in Bets, Creating Great Choices, Clear Thinking, The Extended Mind.

Domain-specific packs loadable per industry.

### 6.2 Axiom Cookbook — From Reference to Reasoning Playbook

The Axiom Library stores what agents can cite. The Axiom Cookbook tells agents how to reason. Organized by analytical question, not by domain.

**Five recipe categories (21 recipes total):**

| Category | Question                      | Recipes                                                                                   | Primary Phase         |
| -------- | ----------------------------- | ----------------------------------------------------------------------------------------- | --------------------- |
| **A**    | "Why is it this way?"         | A1–A4 (market structure, org behavior, hidden barriers, binding constraint)               | Phase 1               |
| **B**    | "What happens next?"          | B1–B5 (trend trajectory, cost reduction impact, actor response, adoption, feedback loops) | Phase 2–3             |
| **C**    | "What could go wrong?"        | C1–C4 (inversion, extreme plausibility, blind spots, intervention backfire)               | Phase 3 (Red Team)    |
| **D**    | "How confident should we be?" | D1–D4 (calibration, narrative vs. evidence, consensus quality, confidence matching)       | All phases (Gates)    |
| **E**    | "What should we recommend?"   | E1–E4 (no-regret moves, options to buy, what to stop, competitive landscape)              | Phase 3 (Backcasting) |

**15 reusable techniques:** Incentive Chain Tracing, Second-Order Chain, Inversion Pass, Causal Loop Diagramming, Outside View First, Evidence Audit, Lollapalooza Scan, Binding Constraint Identification, Anti-Availability Search, Boundary Condition Check, Integrative Synthesis, Stakeholder Incentive Map, Threshold Identification, Real Options Framing, Temporal Decomposition.

**Agent routing:** Each recipe specifies which Oracle agents use it and in which phase. Agents receive relevant recipes in their context window, not the full cookbook.

### 6.1 System Elevations — Seven Axioms That Shape Architecture

Seven mental models are too important to be passive reference entries. They operate as structural principles within Oracle:

| Axiom                             | Elevation                             | How It Changes the System                                                                                                                                                                                                                                              |
| --------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inversion** (Munger)            | Red Team reasoning mode               | Mandatory in Red Team prompt: "List 3-5 conditions that guarantee this scenario fails. Do any currently hold?" Not optional — structural.                                                                                                                              |
| **Map vs. Territory** (Korzybski) | Epistemological principle             | Every output carries a "Model Limitations" section. Scenarios are explicitly framed as useful fictions for decision-making, not predictions.                                                                                                                           |
| **Second-Order Thinking**         | Phase 3 gate requirement              | Gate C sub-check: ≥90% of causal chains must have 3+ steps with the second-order discipline template. First-order-only claims fail the gate.                                                                                                                           |
| **Circle of Competence** (Munger) | Model routing + uncertainty detection | When Expert Council agreement < 40% AND average confidence < 0.5, flag as "potentially outside model competence" — surface raw disagreement to human rather than synthesizing false consensus.                                                                         |
| **Lollapalooza Effect** (Munger)  | Consistency Checker pattern           | When ≥3 causal edges in a scenario branch all reinforce the same direction with no identified balancing force, tag as lollapalooza candidate. Require the scenario to address: what prevents runaway? What historical precedent exists?                                |
| **Integrative Thinking** (Martin) | Expert Council synthesis mode         | When Council convergence < 75%, add Integrative Synthesis step: "Model A says X, Model B says Y. What would have to be true for both to be partially right? Construct a model C that resolves the tension." Produces novel insight rather than recording disagreement. |
| **Resulting** (Duke)              | Evaluation principle                  | Oracle's success metrics measure process quality (traceability, evidence coverage, reasoning depth), NOT predictive accuracy. Output template states: "Scenarios are evaluated on reasoning quality, not whether they come true."                                      |

---

## 7. Stage Gate System

### 7.1 Rubric Dimensions (scored 1–5)

| Dimension               | Definition                                                 |
| ----------------------- | ---------------------------------------------------------- |
| **Mechanistic clarity** | Explains _why_, not just _what_. Causal mechanisms named.  |
| **Completeness**        | Covers required analytical buckets                         |
| **Causal discipline**   | No correlation-as-causation. Boundary conditions explicit. |
| **Decision usefulness** | Highlights levers, thresholds, signposts                   |
| **Uncertainty hygiene** | Knowns vs. unknowns separated. Confidence calibrated.      |
| **Evidence quality**    | Claims cite evidence. No orphan claims.                    |

### 7.2 Gate Logic

```
stage_output → evaluator → score
  ├── ALL dimensions ≥ 3.0 AND avg ≥ 3.5 → PASS
  └── Below threshold → refinement loop (max 3) → then human escalation
```

### 7.3 Output Contract

Every phase outputs two layers:

| Layer             | Content                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| **Executive**     | 5–10 bullets: invariants, forces, levers, implications                                              |
| **Full Analysis** | Causal explanations, feedback loops, constraints, signposts, monitoring indicators, evidence chains |

(v2 had three layers. The "Operational" content — signposts, measures — folds into Full Analysis. Two layers are sufficient and simpler to enforce.)

---

## 8. Expert Council — Selective, Not Universal

**The core simplification:** The full four-model council protocol is expensive (~12 LLM calls per round). Most within-phase tasks don't need it. Reserve it for the three moments where multi-model epistemic diversity actually matters.

### 8.1 When Council Runs

| Moment                                 | Why it matters                                                                                                 | Protocol              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------- |
| **End of Phase 1**                     | First principles are the foundation everything builds on. Getting these wrong cascades through the entire run. | Full 3-round protocol |
| **End of Phase 2** (before Human Gate) | Trend/uncertainty classification determines which futures get explored. Mis-classification = wrong scenarios.  | Full 3-round protocol |
| **Final scenario review**              | Last check before output. Catches remaining inconsistencies, preserves minority positions.                     | Full 3-round protocol |

### 8.2 When a Single Model Suffices

| Task                            | Model  | Why one is enough                                     |
| ------------------------------- | ------ | ----------------------------------------------------- |
| Sub-question research (Phase 1) | Claude | Focused retrieval task, not judgment                  |
| Trend enrichment (Phase 2)      | GPT    | Structured data extraction from evidence              |
| Scenario causal extension       | Claude | Single-step reasoning, checked by consistency checker |
| Rubric evaluation               | GPT    | Structured scoring against defined criteria           |
| Narrative construction          | Claude | Creative synthesis, reviewed by council afterward     |

### 8.3 Council Protocol (when it runs)

**Round 1 — Independent generation:** Each LLM receives same prompt + context. No model sees others' output.

**Round 2 — Blind cross-evaluation:** Each scores the other three on logical validity, evidential support, completeness (0–1). Critiques must reference Ledger IDs.

**Round 3 — Revision:** Models see critiques and may revise. Revisions must be explicit.

**Convergence:** 4/4 agree → high confidence. 3/4 → moderate + dissent recorded. 2/2 split → genuine uncertainty, both preserved.

**Cost impact:** ~36 LLM calls total for council (3 sessions × 12 calls) vs. ~120+ in v2 (council at every major step). Same output quality for the decisions that matter.

---

## 9. Phase Design

### 9.0 Phase 0 — Scoping & Evidence Snapshot

**Objective:** Frame the question and build the evidence base.

**Process:**

1. Parse input into structured scope (topic, domain, time horizon, boundaries).
2. Parallel search across Serper, Exa, Firecrawl, Jina. Build Evidence Store.
3. Cluster evidence by STEEP+V category. Run targeted follow-up for gaps.

**Gate:** All STEEP+V categories have ≥3 sources. If not → targeted search loop.

**Model:** Single model (Claude) for orchestration. No council needed.

---

### 9.1 Phase 1 — First-Principles Decomposition

**Objective:** Why is the current system the way it is? Move from "what is" to "why must it be this way, and under what conditions would it be different."

**Reasoning Frameworks:** Aristotelian Four Causes, Constraint Analysis, Coasean Economics, Information Theory.

**Axiom Grounding Rule:** No first-principle claim accepted until it bottoms out at a named formal law from the Axiom Library. Branches ending at vague assertions flagged for deeper decomposition.

**Agent Team (simplified from 5 → 3 + Council):**

| Agent              | Model  | Role                                                                                     |
| ------------------ | ------ | ---------------------------------------------------------------------------------------- |
| **Decomposer**     | Claude | Breaks question into sub-questions via Tree-of-Thought. Traces each to axiom references. |
| **Systems Mapper** | Gemini | Maps feedback loops, constraints, and system structure into Knowledge Graph.             |
| **Verifier**       | GPT    | Chain-of-Verification on factual claims. Checks axiom grounding %.                       |

Then: **Expert Council** (full 3-round protocol) reviews the complete Phase 1 output. The Contrarian and Economist roles from v2 are handled by Grok and GPT _within the council_, not as separate always-on agents.

**Workflow:**

1. Decomposer generates sub-question tree with axiom scaffolding.
2. Systems Mapper builds initial Knowledge Graph.
3. Verifier runs CoVe + axiom grounding check.
4. **Expert Council** reviews, debates, synthesizes. Disagreements preserved as assumption forks.
5. All claims written to Ledger with IDs.

**Gate A:** Mechanistic clarity ≥ 3, Completeness ≥ 3, Causal discipline ≥ 3, Axiom grounding ≥ 80%.

---

### 9.2 Phase 2 — Trend & Uncertainty Identification

**Objective:** Identify forces that could change Phase 1's structural conditions. Distinguish trends (directional) from uncertainties (genuinely unknown).

**Agent Team (simplified from 5 → 3 + Council):**

| Agent                  | Model  | Role                                                                             |
| ---------------------- | ------ | -------------------------------------------------------------------------------- |
| **Scanner**            | Claude | Coordinates parallel STEEP+V search. Enriches signals with second-order effects. |
| **Impact Assessor**    | GPT    | Rates each signal on impact × uncertainty. Builds cross-impact matrix.           |
| **Weak Signal Hunter** | Grok   | Searches non-obvious sources for contrarian and emerging signals.                |

Then: **Expert Council** reviews trend/uncertainty classification and cross-impact matrix.

**Uncertainty Objects (first-class):**

```typescript
interface UncertaintyObject {
  id: string
  variable: string
  states: string[] // Discrete resolution options
  drivers: string[]
  impacts: string[]
  observables: string[] // Signposts
  controllability: 'none' | 'low' | 'medium' | 'high'
  time_to_resolution: string
}
```

**Cross-Impact Matrix:** Pairwise interactions between top trends and uncertainties. Trend A increases/decreases probability of Uncertainty B resolving in state X. Forces explicit interdependence thinking.

**🔒 Human Gate:** User approves critical uncertainties before Phase 3.

**Gate B:** Completeness (all STEEP+V) ≥ 3, Evidence quality ≥ 3, Uncertainty hygiene ≥ 3.

---

### 9.3 Phase 3 — Scenario Simulation & Synthesis

**Objective:** Generate internally consistent, divergent scenarios by exploring how critical uncertainties interact with first principles.

**The simplified simulation approach (Enumerate → Score → Develop):**

This replaces MCTS. The logic:

1. **Enumerate:** Take top 3–5 critical uncertainties (approved at Human Gate). Build morphological field of resolution combinations. Filter for internal consistency. Result: 8–20 candidate skeletons.

2. **Score (parallel):** For each candidate, a single agent (Claude) traces the causal chain: "If these uncertainties resolve this way, which Phase 1 principles are reinforced, which are disrupted, what new equilibrium emerges?" The Consistency Checker validates each against axioms and cross-impact matrix. Score on: internal consistency (0–1), plausibility (0–1), divergence from others (0–1).

3. **Select top K:** Choose 3–5 candidates maximizing plausibility × divergence.

4. **Develop in depth:** For each selected scenario, a full development pass:

**Agent Team (simplified from 5 → 3 + Council):**

| Agent                   | Model  | Role                                                                                                                                                                                    |
| ----------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scenario Developer**  | Claude | Extends causal chains (3+ steps per uncertainty). Builds full scenario narrative with assumption callouts.                                                                              |
| **Equilibrium Analyst** | Gemini | Tests stability. Identifies feedback loops, game-theoretic consistency.                                                                                                                 |
| **Red Team**            | Grok   | Attacks plausibility. Pre-mortem inversion. Historical counterexamples. **Also covers tail risks:** "What low-probability event with no current signal would invalidate this scenario?" |

**Second-order discipline:** Every consequence must include: 1st order effect, 2nd order feedback, countervailing force, required conditions.

5. **Expert Council** (full 3-round protocol) reviews complete scenario set. Final quality check.

6. **Backcasting:** For each scenario: "If this is true at [target year], what must have happened by [target-2]?" Identify no-regret moves, options to buy, hedges, kill criteria.

**Gate C:** Decision usefulness ≥ 4, Causal discipline ≥ 3, Uncertainty hygiene ≥ 3.

**Output:** Scenario Portfolio (3–5 scenarios, each with narrative + causal graph + assumption register + signposts + strategic implications + tail-risk annexes + council assessment).

---

## 10. Consistency Checker — One Tool, Not Four

Replaces: Z3 constraint solver, Logic Linter, Contradiction Detector, Citation Validator from v2.

### 10.1 Two-Tier Architecture

**Tier 1 — Rule-based (fast, deterministic, runs on every agent output):**

- **Axiom violation scan:** Does this claim contradict any Axiom Library entry? Pattern-match against axiom boundary conditions.
- **Graph contradiction check:** Query Knowledge Graph for nodes with both `supports` and `contradicts` edges to the same target.
- **Reference validation:** Do all cited Ledger IDs exist? Does the citation accurately represent the referenced item?
- **Structural checks:** Circular dependency detection in the graph. Orphan claim detection (claims with no evidence or axiom reference).

**Tier 2 — LLM confirmation (slower, runs only on Tier 1 flags):**

- When Tier 1 flags a potential issue, a single LLM call (~1K tokens) confirms whether it's a genuine violation or a false positive.
- Example: Tier 1 flags "scenario assumes team of 50 with low coordination cost" as an axiom violation. Tier 2 checks whether the scenario provides a structural mechanism (e.g., AI-mediated coordination) that resolves the apparent violation.

**Cost:** Tier 1 is near-zero cost (graph queries + pattern matching). Tier 2 adds ~1 LLM call per flag. Typical run: 5–15 flags, so 5–15 cheap LLM calls total.

---

## 11. Model Routing

| Model      | When it leads                                                               | When it assists                       |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------- |
| **Claude** | Phase 1 decomposition, Phase 3 scenario development, narrative construction | Council member in all sessions        |
| **GPT**    | Rubric evaluation, impact assessment, verification                          | Council member, structured extraction |
| **Gemini** | Systems mapping, equilibrium analysis, breadth scanning                     | Council member, completeness sweeps   |
| **Grok**   | Red Team (including tail risks), weak signal hunting                        | Council member, contrarian challenges |

Each assignment has a fallback. Routing is a config object, not hardcoded.

---

## 12. Context Management

### 12.1 Core Principle

No agent receives the full state. Every agent receives curated context within a token budget.

### 12.2 Three Memory Tiers

| Tier                                | Contents                                              | Access                          |
| ----------------------------------- | ----------------------------------------------------- | ------------------------------- |
| **Working Memory** (15–25K tokens)  | Task instructions + relevant items + current work     | Injected per agent call         |
| **Session Memory** (unbounded)      | Full Ledger, complete graph, council records          | Retrieved on demand             |
| **Phase Summaries** (~2K per phase) | Executive layer + key claim IDs + unresolved tensions | Injected as cross-phase context |

### 12.3 How It Works

1. **Structured output is the primary strategy.** Agents are prompted with explicit output schemas (JSON with typed fields). When agents comply, their output is already compact and structured — no condensation needed.
2. **Phase summaries** compress each phase's output to ~2K tokens after it passes its gate. Cheap/fast model extracts: executive bullets, top 15 claim IDs with one-liners, key assumptions, unresolved tensions.
3. **Retrieval** uses two strategies: semantic search over Ledger entries (for "find relevant claims about X") and graph traversal (for "what principles does this scenario affect?" → 2-hop neighborhood). Graph traversal is critical for Phase 3 — it surfaces structurally relevant Phase 1 context that semantic search might miss.
4. **On-demand retrieval:** Agents can request additional context (max 2 rounds) via a `needs_context` field.

### 12.4 Token Budgets

| Agent Type                                     | Budget | Rationale               |
| ---------------------------------------------- | ------ | ----------------------- |
| Focused task (research, scoring, verification) | 15K    | Narrow scope            |
| Lead (synthesis, narrative, council member)    | 25K    | Broader view            |
| Rubric evaluator                               | 20K    | Needs full stage output |

Budget is enforced: if retrieved items exceed budget, trim by lowest relevance × confidence. Never trim instructions or current work product.

---

## 13. Tool Stack

### 13.1 Existing

| Tool          | Use                                  |
| ------------- | ------------------------------------ |
| **Serper**    | Web search                           |
| **Exa**       | Semantic search (academic, frontier) |
| **Jina**      | Reader, embedding, retrieval         |
| **Firecrawl** | Deep scraping, JS-rendered pages     |
| **graph-lib** | Knowledge Graph                      |
| **LangGraph** | Orchestration                        |

### 13.2 To Build

| Tool                                  | Priority | Purpose                                                                                                                                                        |
| ------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reasoning Ledger Store**            | P0       | Claim/assumption/evidence CRUD with IDs. Why-tree traversal.                                                                                                   |
| **Axiom Library + Cookbook**          | P0       | 142 curated formal laws searchable by domain, plus Axiom Cookbook (21 recipes, 15 techniques) routing agents to the right axioms for each analytical question. |
| **Rubric Evaluator + Stage Gates**    | P0       | Scoring + pass/fail routing with refinement loops.                                                                                                             |
| **Consistency Checker**               | P0       | Two-tier: rule-based (graph queries, pattern match) + LLM confirmation.                                                                                        |
| **Causal Reasoning Engine**           | P1       | Wraps graph-lib with causal semantics. Counterfactual queries.                                                                                                 |
| **Cross-Impact Matrix Generator**     | P1       | Pairwise trend×uncertainty interaction computation.                                                                                                            |
| **Uncertainty Quantification Module** | P1       | Calibrated probability estimation. Brier score tracking.                                                                                                       |
| **Morphological Field Generator**     | P1       | Automated Zwicky box + consistency filtering.                                                                                                                  |
| **Signpost Generator**                | P1       | Every uncertainty must have observable indicators.                                                                                                             |
| **Scenario Visualization**            | P2       | Interactive graphs, drill-down from narrative to structure.                                                                                                    |
| **Export Generator**                  | P1       | PDF, MD, JSON, PPTX. Executive brief + scenario book + ledger.                                                                                                 |
| **Historical Analogy Database**       | P2       | Curated precedents for common strategic patterns.                                                                                                              |

**12 tools total** (down from 22 in v2). Same output quality. Dramatically less to build.

---

## 14. LangGraph State Schema

```typescript
interface OracleState {
  // ── Configuration ──
  run_id: string
  depth_mode: 'quick' | 'standard' | 'deep'
  scope: {
    topic: string
    domain: string
    time_horizon: string
    geography: string
    decision_context: string
    boundaries: { in_scope: string[]; out_of_scope: string[] }
  }

  // ── Phase 0 ──
  evidence_store: Evidence[]

  // ── Phase 1 ──
  knowledge_graph: { nodes: GraphNode[]; edges: GraphEdge[]; loops: FeedbackLoop[] }
  phase1_summary: PhaseSummary

  // ── Phase 2 ──
  trends: TrendObject[]
  uncertainties: UncertaintyObject[]
  cross_impact_matrix: { axes: string[]; interactions: CrossImpactEntry[] }
  human_gate_approved: boolean
  phase2_summary: PhaseSummary

  // ── Phase 3 ──
  scenario_portfolio: Scenario[]
  backcast_timelines: BackcastTimeline[]
  strategic_moves: StrategicMove[]
  phase3_summary: PhaseSummary

  // ── Cross-cutting ──
  reasoning_ledger: { claims: Claim[]; assumptions: Assumption[]; evidence: Evidence[] }
  axiom_library: AxiomEntry[] // Loaded at run start
  council_records: CouncilRecord[] // Only 3 sessions
  gate_results: GateResult[]
  cost_tracker: {
    total: number
    by_phase: Record<number, number>
    by_model: Record<string, number>
  }

  // ── Context Management ──
  phase_summaries: Record<number, PhaseSummary>
  current_phase: number
  refinement_counts: Record<string, number>
}

interface PhaseSummary {
  executive: string[] // 5–10 bullets
  key_claims: { id: string; summary: string; confidence: number }[] // Max 15
  key_assumptions: { id: string; statement: string; sensitivity: string }[]
  unresolved_tensions: string[]
  token_count: number // Target: ~2K
}

interface TrendObject {
  id: string
  statement: string
  STEEP_category: string
  direction: string
  momentum: 'accelerating' | 'steady' | 'decelerating'
  impact_score: number
  uncertainty_score: number
  evidence_ids: string[]
  causal_links: string[] // Phase 1 principle IDs affected
  second_order_effects: string[]
}

interface Scenario {
  id: string
  name: string
  premise: Record<string, string> // uncertainty_id → resolved state
  narrative: string
  reinforced_principles: string[]
  disrupted_principles: string[]
  feedback_loops: FeedbackLoop[]
  implications: string
  signposts: string[]
  tail_risks: string[] // From Red Team (replaces separate Black Swan annex)
  assumption_register: string[] // ASM IDs
  council_assessment: { agreement_rate: number; persistent_dissent: string[] }
  plausibility_score: number
  divergence_score: number
}

interface StrategicMove {
  type: 'no_regret' | 'option_to_buy' | 'hedge' | 'kill_criterion'
  description: string
  works_across: string[] // Scenario IDs
  timing: string
  ledger_refs: string[]
}

interface CrossImpactEntry {
  source_id: string
  target_id: string
  effect: 'increases' | 'decreases' | 'enables' | 'blocks' | 'neutral'
  strength: number
  mechanism: string
}
```

**14 interfaces** (down from 26 in v2). Covers the same data with less indirection.

---

## 15. Performance & Cost

| Metric             | Quick    | Standard  | Deep         |
| ------------------ | -------- | --------- | ------------ |
| End-to-end latency | <5 min   | <20 min   | <90 min      |
| LLM calls total    | 15–25    | 40–80     | 120–250      |
| Council sessions   | 1        | 3         | 3 (extended) |
| Search calls       | 10–20    | 30–60     | 80–150       |
| Scenarios produced | 2–3      | 3–5       | 5–7          |
| **Est. cost/run**  | **$2–5** | **$8–25** | **$35–90**   |

v2 estimated $15–40 for standard mode. v3 cuts this to $8–25 by using selective council and eliminating redundant validation calls. Same output quality — the three council sessions cover the decisions that actually matter.

---

## 16. Implementation Roadmap

### Sprint 0: Foundation (Weeks 1–3)

- LangGraph supervisor with state schema + phase routing
- Reasoning Ledger store (CRUD + Why-tree)
- Model router (4 providers + fallbacks + cost tracking)
- Tool integration (Serper, Exa, Jina, Firecrawl, graph-lib)
- Expert Council protocol (3-round, used selectively)
- Rubric Evaluator + Stage Gates
- Axiom Library (curate ~50–100 entries)
- Consistency Checker (Tier 1 rule-based)

### Sprint 1: Phase 1 (Weeks 4–6)

- Decomposer + Systems Mapper + Verifier agents
- Tree-of-Thought with axiom grounding enforcement
- Knowledge Graph construction
- Phase 1 stage gate + refinement loop + council session
- Phase summary generation

### Sprint 2: Phase 2 (Weeks 7–9)

- Scanner + Impact Assessor + Weak Signal Hunter agents
- Cross-Impact Matrix generator
- Uncertainty-as-first-class-object modeling
- Human Gate interface
- Phase 2 stage gate + council session

### Sprint 3: Phase 3 (Weeks 10–14)

- Morphological Field Generator
- Enumerate → Score → Develop pipeline
- Scenario Developer + Equilibrium Analyst + Red Team agents
- Backcasting + strategic moves
- Final council session
- Export generator (PDF, MD, JSON)
- End-to-end integration testing

### Sprint 4: Polish (Weeks 15–18)

- Scenario Visualization
- Causal Reasoning Engine (counterfactual queries)
- Historical Analogy Database
- Calibration tracking
- Signpost monitoring
- Performance optimization + cost tuning
- Documentation + pilots

---

## 17. Risks

| Risk                                      | Severity | Mitigation                                                                                                                                    |
| ----------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM hallucination in causal reasoning     | High     | CoVe on factual claims. Consistency Checker validates against axioms. Council cross-checking at critical points.                              |
| False consensus in council                | High     | Anonymized Round 2. Persistent Dissent Index. If zero dissent → flag groupthink.                                                              |
| Scenario quality with simpler enumeration | Medium   | Morphological filtering removes inconsistent combos. Parallel scoring catches weak candidates. Full development pass on top K provides depth. |
| Cost overrun                              | Medium   | Per-phase tracking with caps. Selective council. Cost estimate before run.                                                                    |
| User overwhelm                            | Medium   | Three depth modes. Executive summary always. Progressive disclosure.                                                                          |

---

## 18. Open Questions

1. Quantitative depth: distributions + Monte Carlo vs. qualitative states for v1?
2. Evidence policy: minimum citations per claim? Source quality thresholds?
3. Persistent memory: org-specific knowledge base across runs?
4. Axiom Library curation: who curates? Domain-specific packs per industry?
5. Human gates: async approval or synchronous only?
