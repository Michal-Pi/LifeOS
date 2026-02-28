# Product Requirements Document: Hegelian Multi-Agent Dialectical Architecture

**Version:** 2.0 — Research-Informed Revision  
**Date:** February 2026  
**Author:** Mike (SVP Product) + Claude  
**Status:** Draft

---

## 1. Executive Summary

This document specifies a multi-agent AI architecture that implements Hegelian dialectical logic as a structured reasoning protocol for navigating deep uncertainty. Unlike conventional multi-agent debate systems that converge via voting or averaging, this system forces genuine conceptual change through productive contradiction, determinate negation, and sublation (Aufhebung).

The architecture is anchored by a 4-layer knowledge hypergraph that serves as persistent memory, enabling the system to accumulate learning across dialectical cycles rather than re-arguing from scratch.

**Version 2.0** incorporates eight improvements drawn from 2025 research in knowledge graphs, multi-agent debate, temporal memory, and reinforcement learning for graph reasoning.

---

## 2. Problem Statement

In highly uncertain, hard-to-discern environments (competitive strategy, geopolitics, product adoption forecasting, incident response), decision-makers face two failure modes:

1. **Empiricist drift** — endless data requests without conceptual progress. The system keeps asking for more information but never changes how it thinks about the problem.
2. **Narrative lock-in** — one coherent story dominates; contradictions get rationalized away. The system settles on a plausible-sounding frame and becomes blind to disconfirming evidence.

Existing multi-agent systems (Society of Minds, multi-agent debate) improve factual accuracy through voting and averaging, but they do not produce genuine conceptual change. Research confirms that standard MAD frameworks often fail to outperform simple majority voting when agents share the same model.

**What's needed:** a system that treats contradiction as signal (not noise), forces concept revision (not just belief adjustment), and makes the object of analysis itself revisable.

---

## 3. Design Philosophy

The system translates three core Hegelian principles into engineering constraints:

| Hegelian Principle           | Engineering Constraint                                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Productive Contradiction** | No consensus-seeking before contradictions are crystallized. The system must surface and sharpen tensions before resolving them.                                                                         |
| **Determinate Negation**     | Critiques must be specific and structure-preserving. "Might be wrong" is not valid negation. Every negation must specify what it preserves, what it rejects, and what rewrite operator would resolve it. |
| **Sublation (Aufhebung)**    | Synthesis is not selection. The output must contain the valid elements of both sides in a new conceptual structure. No averaging. Either reframe or regime-split.                                        |

---

## 4. Target Users & Use Cases

### Primary Users

- **Strategic decision-makers** operating under deep uncertainty (product strategy, competitive dynamics, market entry)
- **Intelligence analysts** synthesizing conflicting signals (geopolitical forecasting, threat assessment)
- **Research teams** navigating contested domains with competing theoretical frameworks

### Core Use Cases

**UC1: Competitive Strategy Under Uncertainty**  
A product leader needs to decide whether to invest in a new market segment. Signals are mixed: customer interviews suggest demand, but macro conditions suggest contraction. The system should not collapse this into "on balance, yes/no" but should identify the specific conceptual distinction that makes the conflict resolvable (e.g., latent demand vs effective demand under different regulatory regimes).

**UC2: Product Adoption Forecasting**  
A team is forecasting adoption of a new AI feature. Bull and bear cases are both internally coherent. The system should identify what category split or regime distinction would make both cases simultaneously correct under different conditions, and produce monitoring indicators for each regime.

**UC3: Incident Response Under Ambiguity**  
A system failure has multiple plausible root causes. The system should maintain competing hypotheses, surface the specific evidence that would discriminate between them, and produce action plans scoped to each hypothesis rather than a single best guess.

---

## 5. System Architecture

### 5.1 Architecture Overview

The system consists of four major subsystems:

1. **Dialectical Agent Layer** — Thesis, antithesis, and synthesis agents that execute the dialectical control loop
2. **Contradiction Tracking Layer** — Specialized agents that crystallize and rank tensions
3. **Meta-Reflection Layer** — Process monitoring, schema induction, and termination logic
4. **Knowledge Hypergraph** — 4-layer persistent memory substrate

See: `architecture-overview.mermaid` for the full system diagram.

### 5.2 Agent Roster

#### Thesis Agents (World-Positing)

- **Count:** 2–5 per cycle
- **Model diversity:** Each agent uses a different foundation model (Claude, GPT-4, Gemini, open-source). This is not optional — research shows model heterogeneity is the dominant driver of debate quality, outperforming protocol design.
- **Lens assignment:** Each agent is assigned an explicit inductive bias: economic/incentive, systems/feedback, adversarial/game-theoretic, behavioral/psychological, institutional/structural.
- **Output contract:** Every thesis must declare:
  - Concept graph (typed nodes and edges)
  - Causal model (mechanism chain)
  - Falsification criteria (what would count as evidence against)
  - Decision implications (what actions this framing recommends)
  - Unit of analysis and temporal grain (forced commensurability)
  - Regime assumptions (under what conditions this holds)

#### Antithesis Agents (Determinate Negation)

- **Count:** 1 per thesis minimum
- **Specialization:** Internal inconsistency, boundary conditions, incentive analysis, measurement validity
- **Output contract:** Every negation must:
  - Identify the thesis's internal tensions (A ∧ ¬A patterns)
  - Attack specific categories ("your notion of X conflates Y and Z")
  - Preserve what remains valid ("keep mechanism M, but boundary conditions are wrong")
  - Propose a rival framing explaining the same evidence
  - **Specify a typed rewrite operator** (SPLIT, MERGE, REVERSE_EDGE, ADD_MEDIATOR, SCOPE_TO_REGIME, TEMPORALIZE) — free-form text negation is not accepted

#### Contradiction Trackers (4 specialized sub-agents)

- **LogicTracker:** Formal contradiction detection (A ∧ ¬A)
- **PragmaticTracker:** Action-incompatibility (claims that can't jointly guide the same decision)
- **SemanticTracker:** Category equivocation and concept drift (same word, different meanings)
- **BoundaryTracker:** Assumption/regime mismatch (claim valid in R1 applied to R2)
- **Cross-verification:** Each tracker reviews the others' findings
- **Scoring:** All contradictions scored by "action distance" — how many KG edges separate this tension from a Decision node

#### Synthesis Agents (Aufhebung Engine)

- **Count:** 2 competing synthesizers
- **Heuristic diversity:** One optimizes for parsimony (fewer concepts), one for explanatory scope (more coverage)
- **Cross-negation:** Their outputs are also dialectically contested before the next cycle
- **Output contract:** Must express synthesis as a sequence of typed rewrite operators applied to the concept graph. No free-form text synthesis.
- **Triggers schema induction:** After synthesis, the Schema Induction Agent auto-clusters new concepts into ontology categories

#### Meta-Reflection Agent

- **Conceptual velocity tracking:** Rate of genuine category operations (splits, merges, new mediators) per cycle
- **Stuck loop detection:** Binary oscillation between two framings
- **Premature collapse detection:** Contradiction density dropping without corresponding concept change
- **Epistemic vs ontic discrimination:** Are we uncertain because we lack information, or because the system itself is volatile?
- **Protocol overrides:** Can trigger re-specification (change unit of analysis), abstraction shift (micro ↔ macro), mediating term introduction

See: `protocol-sequence.mermaid` for the full interaction sequence.  
See: `cycle-state.mermaid` for the state machine.

---

## 6. Knowledge Hypergraph Specification

### 6.1 Architecture: 4-Layer Design

The KG has four layers, progressing from raw data to high-level abstractions:

| Layer | Name                          | Change Rate | Contents                                                                                              |
| ----- | ----------------------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| 0     | Episodic Memory               | Append-only | Raw dialectical exchanges, timestamps, full agent outputs                                             |
| 1     | Semantic/Epistemic Hypergraph | Fast        | Claims, mechanisms, contradictions, evidence, decisions — with bi-temporal edges and n-ary hyperedges |
| 2     | Ontology Graph                | Slow        | Concepts, relations, regimes — self-evolving schema via induction                                     |
| 3     | Community Subgraph            | Periodic    | Auto-detected clusters of related entities with summaries                                             |

See: `kg-schema.mermaid` for the full schema diagram.

### 6.2 Bi-Temporal Edge Model

Every edge in Layer 1 carries four timestamps (adapted from Zep/Graphiti):

| Timestamp   | Meaning                                         |
| ----------- | ----------------------------------------------- |
| `t_valid`   | When the fact became true in the world          |
| `t_invalid` | When the fact stopped being true in the world   |
| `t_created` | When the system first learned/created this edge |
| `t_expired` | When the system invalidated this edge           |

This enables classification of contradictions as:

- **Synchronic:** Genuinely simultaneous incompatibility
- **Diachronic:** Temporal supersession (what seemed contradictory is sequential)
- **Regime shift:** Validity boundary changed

### 6.3 N-ary Hyperedges

Layer 1 uses hyperedges (not binary triples) to represent complex structures:

```
Mechanism Hyperedge: {
  type: "mechanism",
  participants: [RateNode, VCBurnNode, LayoffNode],
  causal_chain: "rates↑ → VC_burn↓ → layoffs↑",
  regime_scope: "post-tightening",
  evidence_set: [E1, E2, E3],
  assumptions: ["VC burn tolerance < 18mo runway"],
  t_valid: "2025-01-01",
  t_invalid: null,
  t_created: "2025-01-15T14:30:00Z",
  source_episode: "episode_007"
}
```

### 6.4 Node Types

**Layer 0 — Episodic:**

- `Episode`: raw dialectical exchange (thesis text, antithesis text, synthesis text, timestamps)

**Layer 1 — Semantic/Epistemic:**

- `Claim`: propositional commitment with confidence, regime_scope, status (ALIVE | SUPERSEDED | INVALIDATED)
- `Evidence`: observation, dataset, expert report with recency, quality, directness scores
- `Mechanism`: causal story fragment (as hyperedge)
- `Contradiction`: recorded incompatibility with type, severity, action_distance, resolution_status
- `Decision`: recommended action with rationale_claims, regime_conditions, reversibility
- `Prediction`: testable forecast with timestamp, threshold, monitoring_indicator

**Layer 2 — Ontology:**

- `Concept`: versioned category (v1 → v2 with explicit delta and split_from/merge_from provenance)
- `Relation`: typed edge (causes, enables, blocks, defines, refines)
- `Regime`: environmental condition set with indicators and active_probability

**Layer 3 — Community:**

- `Community`: cluster of strongly connected entities with summary and coherence_score

### 6.5 Dialectical Rewrite Operators

All concept change must be expressed through these six typed operators:

| Operator          | Signature               | Example                                                   |
| ----------------- | ----------------------- | --------------------------------------------------------- |
| `SPLIT`           | `split(C) → {C1, C2}`   | "Demand" → {"Latent Demand", "Effective Demand"}          |
| `MERGE`           | `merge(C1, C2) → C'`    | {"Price Signal", "Market Signal"} → "Market Indicator"    |
| `REVERSE_EDGE`    | `reverse(A→B) → (B→A)`  | "Regulation → Innovation" → "Innovation → Regulation"     |
| `ADD_MEDIATOR`    | `mediate(A→B) → A→M→B`  | "Rates → Layoffs" → "Rates → VC Burn → Layoffs"           |
| `SCOPE_TO_REGIME` | `scope(Claim, R)`       | "Growth slows" → "Growth slows IN post-tightening regime" |
| `TEMPORALIZE`     | `temporalize(C1 vs C2)` | Contradiction → "Phase 1: C1, then Phase 2: C2"           |

See: `rewrite-operators.mermaid` for visual examples.

### 6.6 Dynamic Schema Induction

After each synthesis cycle, the Schema Induction Agent:

1. Examines newly created/modified concepts in Layer 2
2. Runs conceptualization: auto-clusters concept instances into higher-order types
3. Generates schema diff: what changed and why
4. Produces competency questions: "what can this schema now express that it couldn't before?"
5. Versions the ontology (Layer 2) with full provenance

This is inspired by AutoSchemaKG, which achieves 92% semantic alignment with human-crafted schemas without manual intervention.

### 6.7 Retrieval Strategy: Heuristic Retrieval with Template Learning

Context retrieval uses a heuristic agent with template-based optimization. The agent operates in a multi-turn action loop:

1. **THINK:** Analyze the query, plan retrieval strategy (focused/exploratory/contrastive/historical)
2. **QUERY:** Formulate structured queries based on selected strategy
3. **RETRIEVE:** Execute traversal, receive subgraph context
4. **TERMINATE:** Return assembled context to dialectical agents

**Four Retrieval Strategies:**

| Strategy      | Behavior                                            | Best For                                   |
| ------------- | --------------------------------------------------- | ------------------------------------------ |
| `focused`     | Direct concept lookup, narrow traversal             | Specific claims, mechanism chains          |
| `exploratory` | Broad traversal, community-level exploration        | Early cycles, understanding problem space  |
| `contrastive` | Retrieve claims supporting AND contradicting thesis | Cross-negation phase, contradiction mining |
| `historical`  | Time-ordered traversal, regime evolution            | Temporal patterns, regime shift detection  |

**Template-Based Optimization:**

Instead of RL, templates encode successful retrieval patterns:

1. **Pattern Extraction:** After each dialectical cycle, extract successful retrieval sequences
2. **Template Auto-Derivation:** Cluster similar patterns into reusable templates
3. **Usage Tracking:** Record template success rates and quality scores

**Smart Template Selection:**

Templates are ranked by: `quality × successRate × log(usageCount + 1)`

**Progressive Attenuation:**

Early cycles use exploratory strategy (broad context), later cycles use focused strategy (narrow, action-relevant).

**Why Not RL:**

- Works immediately without training data
- Interpretable — templates can be inspected and debugged
- No fine-tuning infrastructure required
- Templates improve over time through usage tracking

---

## 7. Protocol Specification

### 7.1 Dialectical Cycle

Each cycle consists of six phases:

**Phase 1 — Thesis Generation**

- 2–5 heterogeneous agents generate competing framings
- Each thesis writes a concept subgraph to KG Layer 2 and claims to Layer 1
- Each thesis must declare unit of analysis and temporal grain
- Episode recorded in Layer 0

**Phase 2 — Cross-Negation**

- Each thesis must be determinately negated by at least one antithesis
- Negation must specify typed rewrite operator
- Negation edges written to KG Layer 1
- Moderate disagreement enforced (not maximal)

**Phase 3 — Contradiction Crystallization**

- 4 specialized trackers analyze all active contradictions
- Cross-verification round
- Minimal Inconsistent Set (MIS) computed
- Contradictions scored by action-distance and classified (synchronic/diachronic/regime_shift)

**Phase 4 — Sublation**

- 2 competing synthesizers propose graph rewrites
- Rewrites expressed as typed operator sequences
- Cross-negation of competing syntheses
- Winning synthesis executed on KG
- Schema induction triggered

**Phase 5 — Re-grounding**

- New thesis issues predictions with timestamps and thresholds
- Monitoring indicators defined
- Evidence polling loop activated (automated data collection for open tests)

**Phase 6 — Meta-Reflection**

- Conceptual velocity measured
- Process health assessed
- Termination/continuation/re-specification decision

### 7.2 Termination Criteria

The dialectic terminates when ANY of:

1. **Contradictions resolved:** All action-relevant tensions bounded into regime-scoped policies
2. **Velocity flatline:** No new category operations for 2+ consecutive cycles
3. **Action-distance threshold:** Remaining contradictions are far from any Decision node (tensions exist but don't affect choices)

### 7.3 Output Format

The system produces:

- **Regime-scoped decision policies:** "Under regime R1, do X; under R2, do Y"
- **Monitoring indicators:** Observable signals that discriminate between regimes
- **Provenance trace:** Every recommendation traces through KG back to evidence and episodes
- **Open tensions:** Explicitly documented unresolved contradictions with their action-distance scores
- **Concept evolution history:** How the system's categories changed during deliberation

---

## 8. Non-Functional Requirements

### 8.1 Performance

| Metric                                   | Target                               |
| ---------------------------------------- | ------------------------------------ |
| Cycle latency (all 6 phases)             | < 120 seconds                        |
| KG write throughput                      | > 100 edges/second                   |
| Retrieval latency (RL agent)             | < 5 seconds per think-retrieve cycle |
| Maximum cycles before forced termination | 10                                   |

### 8.2 Observability

- Full logging of all agent inputs/outputs per phase
- KG diff per cycle (what was added, modified, invalidated)
- Conceptual velocity chart over time
- Contradiction density chart over time
- Rewrite operator frequency distribution

### 8.3 Cost Management

- Heterogeneous model selection should consider cost: use expensive models (GPT-4, Claude) for synthesis/meta-reflection, cheaper models for initial thesis generation
- RL retrieval agent should use smaller fine-tuned model
- Prompt compression for KG context injection (learnable multi-scale compression per Agentic-KGR)

---

## 9. Research Foundations

This architecture draws from the following 2025 research:

| Paper                                            | Key Contribution                                      | Where Applied                              |
| ------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------ |
| Zep (Rasmussen et al. 2025)                      | Bi-temporal KG with episodic/semantic/community tiers | KG layer design, bi-temporal edges         |
| Agentic-KGR (Li et al. 2025)                     | Co-evolutionary RL between agents and KG              | RL training loop, dynamic schema expansion |
| AutoSchemaKG (Bai et al. 2025)                   | Schema-free KG construction with auto-induction       | Schema induction agent                     |
| "Can LLM Agents Really Debate?" (Wu et al. 2025) | Model heterogeneity > protocol design                 | Agent model diversity requirement          |
| Graph-R1 (Luo et al. 2025)                       | Agentic GraphRAG with RL-trained retrieval            | RL retrieval agent, hypergraph structure   |
| KARMA (Lu & Wang 2025)                           | Multi-agent KG enrichment with conflict resolution    | Specialized contradiction trackers         |
| AriGraph (IJCAI 2025)                            | Episodic + semantic memory for LLM agents             | Episodic memory layer                      |
| GraphRAG-R1 (Yu et al. 2025)                     | Process-constrained RL for graph reasoning            | RL reward design                           |

---

## 10. Implementation Roadmap

### Phase 1: Foundation ✅ COMPLETE

- [x] Set up Firestore + graphlib for knowledge hypergraph (adapted from Neo4j)
- [x] Implement 4-layer schema with bi-temporal edges
- [x] Build basic thesis/antithesis/synthesis pipeline with LangGraph
- [x] Implement typed rewrite operators

### Phase 2: Heterogeneity & Tracking ✅ COMPLETE

- [x] Add multi-model thesis generation (OpenAI, Anthropic, Google, xAI)
- [x] Implement 4 specialized contradiction trackers (LOGIC, PRAGMATIC, SEMANTIC, BOUNDARY)
- [x] Add competitive synthesis (2 synthesizers with parsimony/scope heuristics)
- [x] Build episodic memory layer

### Phase 3: Intelligence ✅ MOSTLY COMPLETE

- [x] Implement heuristic retrieval agent with template optimization (replaces RL approach)
- [x] Wire up structured output parsing with Zod schemas
- [x] Build meta-reflection with conceptual velocity tracking
- [ ] Add evidence polling loop (PENDING)
- [ ] Implement schema induction agent (PENDING)

### Phase 4: Optimization (PENDING)

- [ ] Template optimization feedback loop
- [ ] Prompt compression optimization
- [ ] Cost optimization (model routing by phase)
- [ ] Observability dashboard (currently using console logging + Firestore telemetry)

---

## 11. Success Metrics

| Metric                        | Definition                                                        | Target        |
| ----------------------------- | ----------------------------------------------------------------- | ------------- |
| Contradiction Resolution Rate | % of action-relevant contradictions resolved per session          | > 70%         |
| Conceptual Change Ratio       | Category operations per cycle (splits, merges, mediators)         | > 1.5 average |
| Prediction Tracking Accuracy  | % of regime-scoped predictions that track reality                 | > 60%         |
| Decision Reversals            | % of cases where dialectic changed the initial recommended action | > 30%         |
| Provenance Completeness       | % of recommendations fully traceable to evidence                  | 100%          |

---

## 12. Risks & Mitigations

| Risk                                                        | Impact                           | Mitigation                                                                  |
| ----------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------- |
| LLM conformity pressure (agents agree too easily)           | Low dialectical quality          | Model heterogeneity + moderate disagreement calibration + confidence hiding |
| KG bloat (too many concepts, claims, edges)                 | Slow retrieval, context overflow | Supersession pruning, prompt compression, community summarization           |
| Synthesis bottleneck (rewrite operators too constrained)    | Misses novel resolutions         | Allow "PROPOSE_NEW_OPERATOR" as escape hatch, reviewed by meta-reflection   |
| Cost explosion (multi-model × multi-agent × multi-cycle)    | Infeasible at scale              | Model routing by phase, RL-trained early termination, caching               |
| Schema induction drift (auto-ontology diverges from domain) | Meaningless categories           | Competency question validation, human review checkpoints                    |

---

_End of PRD_
