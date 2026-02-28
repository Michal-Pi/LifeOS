# Technical Design Document: Hegelian Multi-Agent Dialectical Architecture

**Version:** 2.0  
**Date:** February 2026  
**Status:** Draft

---

## 1. System Context

This document specifies the technical design for a multi-agent system implementing Hegelian dialectical logic over a persistent knowledge hypergraph. It is the engineering companion to the PRD and should be read alongside the Mermaid architecture diagrams.

### Related Diagrams

- `architecture-overview.mermaid` — Full system topology
- `kg-schema.mermaid` — 4-layer knowledge hypergraph schema
- `protocol-sequence.mermaid` — Agent interaction sequence
- `rewrite-operators.mermaid` — Typed sublation operators
- `cycle-state.mermaid` — Dialectical cycle state machine

---

## 2. Technology Stack

| Component            | Technology                                                                                          | Rationale                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Knowledge Hypergraph | Firestore (storage) + graphlib (in-memory graph operations)                                         | Firestore provides scalable document storage; graphlib enables fast traversal and hypergraph operations without dedicated graph DB |
| Agent Orchestration  | LangGraph (TypeScript)                                                                              | Stateful multi-agent workflows with cycles and conditional branching, integrated with Firebase Functions                           |
| LLM Backends         | Claude Sonnet 4.5 (synthesis, meta), GPT-4.1 (thesis), Gemini 2.5 Pro (thesis), Grok 3 (antithesis) | Model heterogeneity is architecturally required                                                                                    |
| Retrieval            | Heuristic agent with template-based optimization                                                    | Works immediately without training, interpretable templates, improves over time                                                    |
| Embeddings           | Provider-native embeddings (OpenAI, Anthropic, Google)                                              | Use same provider as generation for consistency                                                                                    |
| Observability        | Console logging + Firestore telemetry                                                               | Simple, built-in observability without external infrastructure                                                                     |
| API                  | Firebase Cloud Functions (TypeScript)                                                               | Serverless execution, integrated authentication, automatic scaling                                                                 |

---

## 3. Knowledge Hypergraph — Detailed Schema

### 3.1 Neo4j Data Model

Neo4j doesn't natively support hyperedges. We model them as intermediate "hyperedge nodes" connected to participants:

```cypher
// Mechanism hyperedge as intermediate node
CREATE (m:Mechanism {
  id: "mech_001",
  causal_chain: "rates↑ → VC_burn↓ → layoffs↑",
  regime_scope: "post-tightening",
  t_valid: datetime("2025-01-01"),
  t_invalid: null,
  t_created: datetime("2025-01-15T14:30:00Z"),
  t_expired: null,
  source_episode: "episode_007"
})

CREATE (rate:Entity {name: "Interest Rate", layer: "L2_ontology"})
CREATE (vcburn:Entity {name: "VC Burn Tolerance", layer: "L2_ontology"})
CREATE (layoffs:Entity {name: "Layoff Rate", layer: "L2_ontology"})

CREATE (rate)-[:PARTICIPATES_IN {role: "cause"}]->(m)
CREATE (vcburn)-[:PARTICIPATES_IN {role: "mediator"}]->(m)
CREATE (layoffs)-[:PARTICIPATES_IN {role: "effect"}]->(m)
```

### 3.2 Full Node Schema

#### Layer 0: Episodic

```cypher
CREATE (ep:Episode {
  id: "episode_007",
  cycle_number: 7,
  timestamp: datetime("2025-01-15T14:30:00Z"),
  raw_thesis_text: "...",
  raw_antithesis_text: "...",
  raw_synthesis_text: "...",
  thesis_models: ["claude-sonnet-4-5", "gpt-4-turbo"],
  antithesis_models: ["gemini-1.5-pro"],
  synthesis_models: ["claude-sonnet-4-5"],
  rewrite_operators_applied: ["SPLIT", "SCOPE_TO_REGIME"],
  conceptual_velocity: 2.3
})
```

#### Layer 1: Semantic/Epistemic

```cypher
// Claim
CREATE (c:Claim {
  id: "claim_042",
  text: "Regulation tightens in 6-12 months",
  confidence: 0.72,
  regime_scope: "EU_market",
  status: "ALIVE",  // ALIVE | SUPERSEDED | INVALIDATED
  author_agent: "thesis_alpha_gpt4",
  t_valid: datetime("2025-01-01"),
  t_invalid: null,
  t_created: datetime("2025-01-15T14:30:00Z"),
  t_expired: null,
  source_episode: "episode_007"
})

// Contradiction
CREATE (con:Contradiction {
  id: "contra_015",
  type: "SYNCHRONIC",  // SYNCHRONIC | DIACHRONIC | REGIME_SHIFT
  severity: "HIGH",
  action_distance: 2,
  resolution_status: "OPEN",  // OPEN | RESOLVED | BOUNDED
  description: "Claims 042 and 043 jointly imply contradictory actions",
  t_created: datetime("2025-01-15T15:00:00Z"),
  source_episode: "episode_007",
  tracker_agent: "pragmatic_tracker"
})

// Evidence
CREATE (e:Evidence {
  id: "evid_088",
  source: "Q3 2025 EU Regulatory Report",
  source_type: "GOVERNMENT_REPORT",
  recency: datetime("2025-10-01"),
  quality: "HIGH",
  directness: "DIRECT"
})

// Decision
CREATE (d:Decision {
  id: "dec_005",
  text: "Hedge EU market position by Q2",
  rationale_claims: ["claim_042", "claim_045"],
  regime_conditions: ["EU_tightening"],
  reversibility: "MEDIUM",
  confidence: 0.68
})

// Prediction
CREATE (p:Prediction {
  id: "pred_012",
  text: "EU regulatory announcement by July 2025",
  threshold: "formal_announcement",
  monitoring_indicator: "EU_commission_press_releases",
  deadline: datetime("2025-07-31"),
  status: "PENDING",  // PENDING | CONFIRMED | DISCONFIRMED
  source_claim: "claim_042"
})
```

#### Layer 2: Ontology

```cypher
// Concept (versioned)
CREATE (c:Concept {
  id: "concept_demand_v2a",
  name: "Latent Demand",
  version: 2,
  definition: "Expressed interest that has not converted to purchasing behavior",
  parent_version: "concept_demand_v1",
  split_from: "concept_demand_v1",
  created_in_episode: "episode_005",
  rewrite_operator: "SPLIT"
})

// Regime
CREATE (r:Regime {
  id: "regime_eu_tightening",
  name: "EU Regulatory Tightening",
  conditions: ["ECB rate > 4%", "Digital Markets Act enforcement"],
  indicators: ["EU_commission_press_releases", "fine_announcements"],
  active_probability: 0.65,
  t_valid: datetime("2024-06-01"),
  t_invalid: null
})
```

#### Layer 3: Community

```cypher
CREATE (com:Community {
  id: "community_eu_regulatory",
  summary: "Cluster of claims, mechanisms, and decisions related to EU regulatory dynamics and their impact on market strategy",
  member_count: 23,
  coherence_score: 0.82,
  last_updated: datetime("2025-01-15T16:00:00Z")
})
```

### 3.3 Key Relationship Types

```cypher
// Epistemic relationships (Layer 1)
(:Claim)-[:SUPPORTS {strength: 0.8, t_created: datetime()}]->(:Claim)
(:Evidence)-[:SUPPORTS {polarity: "positive"}]->(:Claim)
(:Evidence)-[:UNDERMINES {polarity: "negative"}]->(:Claim)
(:Claim)-[:CONTRADICTS]->(:Contradiction)
(:Claim)-[:SUPERSEDED_BY {reason: "concept split"}]->(:Claim)
(:Claim)-[:IMPLIES]->(:Decision)
(:Claim)-[:HOLDS_IN_REGIME]->(:Regime)

// Ontology relationships (Layer 2)
(:Concept)-[:SPLIT_INTO]->(:Concept)
(:Concept)-[:MERGED_FROM]->(:Concept)
(:Concept)-[:CAUSES {regime_scope: "...", strength: 0.7}]->(:Concept)
(:Concept)-[:ENABLES]->(:Concept)
(:Concept)-[:BLOCKS]->(:Concept)

// Cross-layer links
(:Episode)-[:PRODUCED]->(:Claim)
(:Episode)-[:PRODUCED]->(:Contradiction)
(:Claim)-[:GROUNDED_IN]->(:Concept)
(:Community)-[:CONTAINS]->(:Concept)
```

### 3.4 Bi-Temporal Query Patterns

```cypher
// Find all claims that were valid at time T but later invalidated
MATCH (c:Claim)
WHERE c.t_valid <= datetime("2025-03-01")
  AND (c.t_invalid IS NULL OR c.t_invalid > datetime("2025-03-01"))
  AND c.t_expired IS NOT NULL
RETURN c.text, c.t_valid, c.t_invalid, c.t_expired

// Find synchronic contradictions (both claims valid at same time)
MATCH (c1:Claim)-[:CONTRADICTS]->(con:Contradiction)<-[:CONTRADICTS]-(c2:Claim)
WHERE con.type = "SYNCHRONIC"
  AND c1.t_valid <= c2.t_valid
  AND (c1.t_invalid IS NULL OR c1.t_invalid > c2.t_valid)
RETURN c1.text, c2.text, con.action_distance

// Trace provenance from decision to evidence
MATCH path = (d:Decision)<-[:IMPLIES]-(c:Claim)<-[:SUPPORTS]-(e:Evidence)
WHERE d.id = "dec_005"
RETURN path
```

---

## 4. Agent Implementation

### 4.1 Agent Orchestration with LangGraph

The dialectical cycle is modeled as a LangGraph stateful graph with conditional edges:

```python
from langgraph.graph import StateGraph, END

class DialecticalState(TypedDict):
    cycle_number: int
    theses: list[ThesisOutput]
    negations: list[NegationOutput]
    contradictions: list[ContradictionOutput]
    synthesis: SynthesisOutput | None
    meta_decision: str  # "CONTINUE" | "TERMINATE" | "RESPECIFY"
    conceptual_velocity: float
    kg_diff: KGDiff

workflow = StateGraph(DialecticalState)

# Add nodes
workflow.add_node("retrieve_context", retrieve_context_node)
workflow.add_node("generate_theses", thesis_generation_node)
workflow.add_node("cross_negation", cross_negation_node)
workflow.add_node("crystallize_contradictions", contradiction_crystallization_node)
workflow.add_node("sublate", sublation_node)
workflow.add_node("meta_reflect", meta_reflection_node)

# Add edges
workflow.add_edge("retrieve_context", "generate_theses")
workflow.add_edge("generate_theses", "cross_negation")
workflow.add_edge("cross_negation", "crystallize_contradictions")
workflow.add_edge("crystallize_contradictions", "sublate")
workflow.add_edge("sublate", "meta_reflect")

# Conditional continuation
workflow.add_conditional_edges(
    "meta_reflect",
    route_meta_decision,
    {
        "CONTINUE": "retrieve_context",  # Loop back
        "TERMINATE": END,
        "RESPECIFY": "retrieve_context",  # With modified parameters
    }
)

workflow.set_entry_point("retrieve_context")
app = workflow.compile()
```

### 4.2 Thesis Agent Implementation

```python
class ThesisAgent:
    def __init__(self, model: str, lens: str, lens_prompt: str):
        self.model = model  # e.g., "claude-sonnet-4-5", "gpt-4-turbo"
        self.lens = lens    # e.g., "economic", "systems", "adversarial"
        self.lens_prompt = lens_prompt

    async def generate(
        self,
        context: RetrievedContext,
        prior_contradictions: list[Contradiction],
    ) -> ThesisOutput:
        prompt = self._build_prompt(context, prior_contradictions)
        response = await call_llm(self.model, prompt)
        return self._parse_thesis(response)

    def _build_prompt(self, context, contradictions) -> str:
        return f"""
You are a thesis-generating agent with an {self.lens} lens.
{self.lens_prompt}

CONTEXT FROM KNOWLEDGE GRAPH:
{context.serialize()}

KNOWN UNRESOLVED CONTRADICTIONS:
{[c.serialize() for c in contradictions]}

Generate a thesis that:
1. Declares your CONCEPT GRAPH (typed nodes and edges)
2. States your CAUSAL MODEL (mechanism chain)
3. Specifies FALSIFICATION CRITERIA (what would count against this)
4. States DECISION IMPLICATIONS (what actions this recommends)
5. Declares UNIT OF ANALYSIS and TEMPORAL GRAIN
6. Lists REGIME ASSUMPTIONS (conditions under which this holds)

Output as structured JSON matching ThesisOutput schema.
"""
```

### 4.3 Antithesis Agent — Typed Rewrite Constraint

```python
class AntithesisAgent:
    VALID_OPERATORS = [
        "SPLIT", "MERGE", "REVERSE_EDGE",
        "ADD_MEDIATOR", "SCOPE_TO_REGIME", "TEMPORALIZE"
    ]

    async def negate(
        self,
        thesis: ThesisOutput,
        kg_context: RetrievedContext,
    ) -> NegationOutput:
        prompt = f"""
You are a determinate negation agent specialized in {self.specialization}.

THESIS TO NEGATE:
{thesis.serialize()}

You MUST produce structured negation:
1. INTERNAL TENSIONS: Where does this thesis assume A and ¬A?
2. CATEGORY ATTACK: Which concept conflates distinct things?
3. PRESERVED VALID: What remains correct?
4. RIVAL FRAMING: Alternative explanation of the same evidence
5. REWRITE OPERATOR: You MUST specify one of:
   {self.VALID_OPERATORS}
   Free-form text negation is NOT accepted.

Output the operator as: OPERATOR(target, [args])
Example: SPLIT("demand") → {{"latent_demand", "effective_demand"}}
"""
        response = await call_llm(self.model, prompt)
        output = self._parse_negation(response)

        # Validate that a typed operator was specified
        if output.rewrite_operator not in self.VALID_OPERATORS:
            raise InvalidNegation("Must specify typed rewrite operator")

        return output
```

### 4.4 Contradiction Tracker — Specialized Sub-Agents

```python
class ContradictionTracker:
    def __init__(self):
        self.logic = LogicTracker()       # A ∧ ¬A detection
        self.pragmatic = PragmaticTracker()  # Action incompatibility
        self.semantic = SemanticTracker()    # Equivocation detection
        self.boundary = BoundaryTracker()    # Regime mismatch

    async def crystallize(
        self,
        claims: list[Claim],
        negations: list[NegationOutput],
        kg: KnowledgeHypergraph,
    ) -> CrystallizationOutput:
        # Run all trackers in parallel
        results = await asyncio.gather(
            self.logic.detect(claims, negations),
            self.pragmatic.detect(claims, kg.decisions),
            self.semantic.detect(claims, kg.concepts),
            self.boundary.detect(claims, kg.regimes),
        )

        # Cross-verification: each tracker reviews others' findings
        verified = await self._cross_verify(results)

        # Score by action-distance
        scored = await self._score_action_distance(verified, kg)

        # Compute Minimal Inconsistent Set
        mis = self._compute_mis(scored)

        return CrystallizationOutput(
            contradictions=verified,
            mis=mis,
            action_blocking_chains=scored,
        )

    async def _score_action_distance(
        self,
        contradictions: list[Contradiction],
        kg: KnowledgeHypergraph,
    ) -> list[ScoredContradiction]:
        """Score each contradiction by shortest path to any Decision node."""
        scored = []
        for c in contradictions:
            # BFS from contradiction to nearest Decision node
            distance = kg.shortest_path_to_type(c.id, "Decision")
            scored.append(ScoredContradiction(
                contradiction=c,
                action_distance=distance,
            ))
        return sorted(scored, key=lambda x: x.action_distance)
```

### 4.5 Synthesis Agent — Competitive Sublation

```python
class CompetitiveSynthesis:
    def __init__(self):
        self.alpha = SynthesisAgent(
            heuristic="parsimony",
            model="claude-sonnet-4-5",
            prompt="Prefer the simplest concept structure that resolves the contradiction."
        )
        self.beta = SynthesisAgent(
            heuristic="explanatory_scope",
            model="claude-sonnet-4-5",
            prompt="Prefer the concept structure that explains the most evidence."
        )

    async def sublate(
        self,
        mis: MinimalInconsistentSet,
        kg: KnowledgeHypergraph,
    ) -> SublationOutput:
        # Both synthesizers propose graph rewrites
        alpha_output = await self.alpha.propose_rewrites(mis, kg)
        beta_output = await self.beta.propose_rewrites(mis, kg)

        # Cross-negation of syntheses
        alpha_critique = await self.beta.critique(alpha_output)
        beta_critique = await self.alpha.critique(beta_output)

        # Select or merge based on critique quality
        final = await self._resolve_competing_syntheses(
            alpha_output, beta_output,
            alpha_critique, beta_critique,
        )

        # Validate: output must be expressible as typed operators
        self._validate_operators(final)

        return final

    def _validate_operators(self, output: SublationOutput):
        """Every concept change must be a typed rewrite operator."""
        for op in output.operators:
            assert op.type in [
                "SPLIT", "MERGE", "REVERSE_EDGE",
                "ADD_MEDIATOR", "SCOPE_TO_REGIME", "TEMPORALIZE"
            ], f"Invalid operator: {op.type}"
```

### 4.6 Meta-Reflection — Conceptual Velocity

```python
class MetaReflectionAgent:
    VELOCITY_THRESHOLD = 0.5  # min category ops per cycle
    FLATLINE_CYCLES = 2       # cycles with low velocity before termination
    MAX_CYCLES = 10

    async def reflect(
        self,
        state: DialecticalState,
        kg: KnowledgeHypergraph,
    ) -> MetaDecision:
        # Compute conceptual velocity
        velocity = self._compute_velocity(state.kg_diff)

        # Check termination conditions
        if state.cycle_number >= self.MAX_CYCLES:
            return MetaDecision("TERMINATE", "max_cycles_reached")

        if velocity < self.VELOCITY_THRESHOLD:
            if self._flatline_count(state) >= self.FLATLINE_CYCLES:
                return MetaDecision("TERMINATE", "velocity_flatlined")

        # Check for binary oscillation
        if self._detect_oscillation(state):
            return MetaDecision(
                "RESPECIFY",
                "binary_oscillation_detected",
                suggestion="change_unit_of_analysis"
            )

        # Check for premature collapse
        if self._detect_premature_collapse(state, kg):
            return MetaDecision(
                "RESPECIFY",
                "premature_collapse",
                suggestion="increase_disagreement_level"
            )

        return MetaDecision("CONTINUE")

    def _compute_velocity(self, kg_diff: KGDiff) -> float:
        """Category operations per cycle."""
        ops = sum([
            len(kg_diff.concept_splits),
            len(kg_diff.concept_merges),
            len(kg_diff.new_mediators),
            len(kg_diff.edge_reversals),
            len(kg_diff.regime_scopings),
            len(kg_diff.temporalizations),
        ])
        return ops  # Normalized per cycle
```

---

## 5. Heuristic Retrieval Agent

### 5.1 Action Space

The retrieval agent operates in a multi-turn loop with four actions:

| Action      | Description                                             |
| ----------- | ------------------------------------------------------- |
| `THINK`     | Analyze query, select retrieval strategy                |
| `QUERY`     | Formulate structured queries based on selected strategy |
| `RETRIEVE`  | Execute traversal, receive subgraph context             |
| `TERMINATE` | Return assembled context to dialectical agents          |

### 5.2 Four Retrieval Strategies

```typescript
type RetrievalStrategy = 'focused' | 'exploratory' | 'contrastive' | 'historical'

interface RetrievalConfig {
  strategy: RetrievalStrategy
  maxSteps: number
  maxDepth: number
  topK: number
}

// Strategy selection based on dialectical phase and cycle
function selectStrategy(phase: DialecticalPhase, cycleNumber: number): RetrievalStrategy {
  if (phase === 'cross_negation') return 'contrastive'
  if (cycleNumber <= 2) return 'exploratory' // Broad early
  return 'focused' // Narrow late
}
```

### 5.3 Template-Based Optimization

Instead of RL training, templates encode successful retrieval patterns:

```typescript
interface RetrievalTemplate {
  id: string
  name: string
  description: string
  pattern: {
    strategy: RetrievalStrategy
    concepts: string[] // Concept types to prioritize
    traversalDepth: number
    filters: Record<string, unknown>
  }
  usageCount: number
  successRate: number
  qualityScore: number // 0-1
}

// Template selection ranking
function rankTemplate(template: RetrievalTemplate): number {
  return template.qualityScore * template.successRate * Math.log(template.usageCount + 1)
}

// Auto-derive templates from successful retrievals
async function deriveTemplate(
  retrieval: SuccessfulRetrieval,
  dialecticalOutcome: DialecticalOutcome
): Promise<RetrievalTemplate> {
  const pattern = extractPattern(retrieval.steps)
  const quality = computeQuality(dialecticalOutcome)
  return {
    id: generateId(),
    name: `auto_${retrieval.strategy}_${Date.now()}`,
    pattern,
    usageCount: 1,
    successRate: 1.0,
    qualityScore: quality,
  }
}
```

### 5.4 Progressive Attenuation

Early cycles use broad retrieval, later cycles focus narrowly:

```typescript
function getAttenuatedSteps(
  template: RetrievalTemplate,
  context: { currentCycle: number; maxCycles: number }
): RetrievalStep[] {
  const progress = context.currentCycle / context.maxCycles
  const attenuation = 1 - progress // 1.0 early → 0.0 late

  // Broad early: more steps, deeper traversal
  // Narrow late: fewer steps, shallower traversal
  const maxSteps = Math.ceil(template.pattern.traversalDepth * (1 + attenuation))
  const topK = Math.ceil(10 * (1 + attenuation))

  return template.pattern.steps.slice(0, maxSteps).map((step) => ({
    ...step,
    topK,
  }))
}
```

### 5.5 Why Heuristic Over RL

| Aspect               | RL Approach            | Heuristic Approach            |
| -------------------- | ---------------------- | ----------------------------- |
| **Startup time**     | Requires training data | Works immediately             |
| **Interpretability** | Black box policy       | Inspectable templates         |
| **Infrastructure**   | Fine-tuning pipeline   | No additional infrastructure  |
| **Improvement**      | Batch retraining       | Continuous template evolution |
| **Debugging**        | Probe reward signals   | Examine template patterns     |

---

## 6. Schema Induction Agent

### 6.1 Auto-Clustering

After each synthesis cycle:

```python
class SchemaInductionAgent:
    async def induce(self, kg: KnowledgeHypergraph, kg_diff: KGDiff):
        # 1. Identify newly created/modified concepts
        new_concepts = kg_diff.new_concepts + kg_diff.modified_concepts

        # 2. Compute embeddings
        embeddings = [embed(c.definition) for c in new_concepts]

        # 3. Cluster into higher-order types
        clusters = hdbscan.cluster(embeddings)

        # 4. Generate type labels via LLM
        for cluster in clusters:
            label = await llm.generate(
                f"What higher-order category encompasses: "
                f"{[c.name for c in cluster.members]}?"
            )
            kg.create_concept_type(label, cluster.members)

        # 5. Version the ontology
        schema_diff = kg.compute_schema_diff()
        kg.version_ontology(schema_diff)

        # 6. Generate competency questions
        cqs = await self._generate_competency_questions(schema_diff)

        return SchemaInductionOutput(
            new_types=clusters,
            schema_diff=schema_diff,
            competency_questions=cqs,
        )
```

---

## 7. Evidence Polling Loop

### 7.1 Closed-Loop Grounding

When synthesis produces new predictions, the system automatically monitors for confirming/disconfirming evidence:

```python
class EvidencePollingLoop:
    async def activate(self, predictions: list[Prediction]):
        for pred in predictions:
            # Register monitoring job
            job = MonitoringJob(
                prediction_id=pred.id,
                indicator=pred.monitoring_indicator,
                threshold=pred.threshold,
                deadline=pred.deadline,
                check_interval=timedelta(hours=24),
            )
            await self.scheduler.register(job)

    async def check(self, job: MonitoringJob):
        """Called periodically by scheduler."""
        # Query external data source
        evidence = await self.data_sources.query(job.indicator)

        if evidence.matches(job.threshold):
            # Prediction confirmed
            await self.kg.update_prediction(
                job.prediction_id,
                status="CONFIRMED",
                evidence=evidence,
            )
            # Trigger re-entry into dialectic if this
            # confirms a regime change
            if self._regime_changing(evidence):
                await self.trigger_dialectic_reentry(evidence)

        elif evidence.contradicts(job.threshold) or job.past_deadline():
            # Prediction disconfirmed
            await self.kg.update_prediction(
                job.prediction_id,
                status="DISCONFIRMED",
                evidence=evidence,
            )
            # This invalidates downstream claims
            await self.kg.cascade_invalidation(job.prediction_id)
```

---

## 8. Observability & Metrics

### 8.1 Per-Cycle Metrics

| Metric                     | Source                                              | Alert Threshold                  |
| -------------------------- | --------------------------------------------------- | -------------------------------- |
| `conceptual_velocity`      | Count of rewrite operators applied                  | < 0.5 for 2 cycles               |
| `contradiction_density`    | Active contradictions / total claims                | > 0.8 (unresolvable)             |
| `action_distance_mean`     | Mean shortest path from contradictions to decisions | > 5 (irrelevant tensions)        |
| `synthesis_agreement_rate` | % cycles where both synthesizers agree              | > 0.9 (insufficient competition) |
| `model_conformity_rate`    | % negations that accept thesis without change       | > 0.7 (groupthink)               |
| `retrieval_efficiency`     | Useful tokens / total retrieved tokens              | < 0.3 (retrieval drift)          |

### 8.2 KG Health Metrics

| Metric               | Query                                                   | Alert                   |
| -------------------- | ------------------------------------------------------- | ----------------------- |
| `supersession_ratio` | Superseded claims / total claims                        | > 0.6 (excessive churn) |
| `orphan_concepts`    | Concepts with no claim links                            | > 20%                   |
| `schema_drift`       | Ontology changes without competency question validation | Any                     |
| `temporal_coherence` | Edges where t_valid > t_invalid                         | Any (data integrity)    |

---

## 9. Data Structures

### 9.1 Core Message Types

```python
@dataclass
class ThesisOutput:
    agent_id: str
    model: str
    lens: str
    concept_graph: dict          # Nodes and edges
    causal_model: list[str]      # Mechanism chain
    falsification_criteria: list[str]
    decision_implications: list[str]
    unit_of_analysis: str
    temporal_grain: str
    regime_assumptions: list[str]
    confidence: float

@dataclass
class NegationOutput:
    agent_id: str
    target_thesis: str
    internal_tensions: list[str]
    category_attacks: list[str]
    preserved_valid: list[str]
    rival_framing: str
    rewrite_operator: str        # Must be typed
    operator_args: dict

@dataclass
class ContradictionOutput:
    id: str
    type: str                    # SYNCHRONIC | DIACHRONIC | REGIME_SHIFT
    severity: str                # HIGH | MEDIUM | LOW
    action_distance: int
    participating_claims: list[str]
    tracker_agent: str
    description: str

@dataclass
class SublationOutput:
    operators: list[RewriteOperator]
    preserved_elements: list[str]
    negated_elements: list[str]
    new_concept_graph: dict
    new_claims: list[Claim]
    new_predictions: list[Prediction]
    schema_diff: dict | None

@dataclass
class RewriteOperator:
    type: str                    # SPLIT | MERGE | etc.
    target: str                  # Concept or edge ID
    args: dict                   # Operator-specific arguments
    rationale: str

@dataclass
class KGDiff:
    concept_splits: list[dict]
    concept_merges: list[dict]
    new_mediators: list[dict]
    edge_reversals: list[dict]
    regime_scopings: list[dict]
    temporalizations: list[dict]
    new_claims: list[Claim]
    superseded_claims: list[str]
    new_contradictions: list[Contradiction]
    resolved_contradictions: list[str]
    new_predictions: list[Prediction]
```

---

## 10. Deployment Architecture

```
┌─────────────────────────────────────────────┐
│                  API Gateway                 │
│              (FastAPI + Auth)                │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│           LangGraph Orchestrator             │
│     (Stateful dialectical cycle mgmt)        │
├──────┬──────┬──────┬──────┬──────┬──────────┤
│Thesis│Anti- │Contra│Synth-│Meta- │Schema    │
│Agents│thesis│dict. │esis  │Refl. │Induction │
│(3-5) │Agents│Track.│(×2)  │Agent │Agent     │
│      │(3-5) │(×4)  │      │      │          │
└──┬───┴──┬───┴──┬───┴──┬───┴──┬───┴──┬───────┘
   │      │      │      │      │      │
┌──▼──────▼──────▼──────▼──────▼──────▼───────┐
│           Neo4j Knowledge Hypergraph         │
│  ┌─────────┐ ┌─────────┐ ┌────────┐         │
│  │ FAISS   │ │ Temporal │ │ Schema │         │
│  │ Vector  │ │ Index    │ │ Version│         │
│  │ Index   │ │          │ │ Store  │         │
│  └─────────┘ └─────────┘ └────────┘         │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│         Evidence Polling Service             │
│     (Scheduled data collection)              │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│            Observability Stack               │
│   Prometheus │ Grafana │ LangSmith           │
└─────────────────────────────────────────────┘
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

| Component               | Test                                  |
| ----------------------- | ------------------------------------- |
| Rewrite operators       | Each operator produces valid KG diff  |
| Bi-temporal edges       | Invalidation cascades correctly       |
| Contradiction trackers  | Known contradiction patterns detected |
| Action-distance scoring | BFS produces correct shortest paths   |
| Schema induction        | Clustering produces coherent types    |

### 11.2 Integration Tests

| Test                   | Validation                                             |
| ---------------------- | ------------------------------------------------------ |
| Full dialectical cycle | 6 phases complete with valid KG state                  |
| Competitive synthesis  | Both synthesizers produce valid, competing rewrites    |
| Cross-negation         | Typed operators enforced (free-text rejected)          |
| Termination            | Velocity flatline triggers termination within 2 cycles |
| Evidence loop          | Prediction → monitoring → confirmation/disconfirmation |

### 11.3 Dialectical Quality Tests

| Test                               | Metric                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| Contradiction resolution benchmark | Known contradictions resolved correctly                                           |
| Concept change detection           | System changes categories (not just confidence) when given contradictory evidence |
| Regime discrimination              | System produces distinct policies for distinct regimes                            |
| Provenance completeness            | Every decision traces to evidence                                                 |
| Anti-conformity                    | Heterogeneous models produce genuinely different theses                           |

---

_End of Technical Design Document_
