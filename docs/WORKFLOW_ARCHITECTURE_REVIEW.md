# LifeOS Agentic Workflow Architecture Review & World-Class UX Plan

**Date**: 2026-03-10
**Scope**: Architectural review of the LifeOS graph execution engine, competitive benchmarking against n8n, Make.com, Langflow, Flowise, Rivet, Dify.ai, CrewAI, AutoGen, and LangGraph Studio, with a phased improvement plan.

---

## Part 1: Current Architecture Assessment

### What We Have

LifeOS runs a **LangGraph StateGraph-based execution engine** supporting 7 workflow types, from simple sequential chains to the 22-node Oracle scenario planning pipeline. The architecture is structured as:

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React + Vite)                            │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────────┐  │
│  │Workflow  │ │Run Detail│ │ KG Graph Canvas     │  │
│  │Page (5   │ │Modal +   │ │ (Cytoscape.js)      │  │
│  │tabs)     │ │Streaming │ │                     │  │
│  └──────────┘ └──────────┘ └─────────────────────┘  │
│  ┌──────────────────────────────────────────────┐   │
│  │ CustomWorkflowBuilder (React Flow / XYFlow)  │   │
│  │  ├─ BuilderNodePalette (7 node types + ops)  │   │
│  │  ├─ BuilderCustomNode (color-coded, rich)    │   │
│  │  ├─ NodePropertiesPanel (slide-in config)    │   │
│  │  ├─ customWorkflowBuilderReducer (40+ acts)  │   │
│  │  └─ useUndoableReducer (50-state undo/redo)  │   │
│  └──────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────┤
│  Firebase Functions (Execution Layer)               │
│  ┌──────────────────────────────────────────────┐   │
│  │ executor.ts → routes to specialized graphs   │   │
│  │  ├─ genericGraph.ts    (custom DAGs)         │   │
│  │  ├─ dialecticalGraph.ts (6-phase Hegelian)   │   │
│  │  ├─ deepResearchGraph  (KG + gap analysis)   │   │
│  │  └─ oracleGraph.ts     (4-phase scenarios)   │   │
│  ├──────────────────────────────────────────────┤   │
│  │ Supporting Systems                           │   │
│  │  ├─ runEvents.ts       (real-time streaming) │   │
│  │  ├─ llmJudge.ts        (LLM evaluation)      │   │
│  │  ├─ trajectoryEval.ts  (efficiency analysis) │   │
│  │  └─ providerService.ts (multi-provider LLM)  │   │
│  └──────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────┤
│  Domain Layer (packages/agents)                     │
│  models.ts, oracleWorkflow.ts, evaluation.ts,       │
│  validation.ts                                      │
├─────────────────────────────────────────────────────┤
│  Persistence: Firestore (state, events, checkpoints)│
└─────────────────────────────────────────────────────┘
```

### Strengths (Where We Already Lead)

| Capability                  | LifeOS                                                                                                                                                                                                                   | Industry Benchmark                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **Multi-model consensus**   | Expert Council with Borda ranking, Kendall's tau, disagreement deep-dives                                                                                                                                                | No competitor has this. CrewAI has multi-agent but not multi-model consensus.          |
| **Reasoning depth**         | Oracle 22-node pipeline with 3 gates, axiom grounding, consistency checking                                                                                                                                              | n8n/Make.com don't have reasoning pipelines at all. Dify has basic chains.             |
| **Dialectical reasoning**   | 6-phase Hegelian cycle with conceptual velocity tracking                                                                                                                                                                 | Unique — no competitor implements dialectical synthesis.                               |
| **Evaluation framework**    | LLM Judge (6 rubric criteria) + trajectory evaluation + benchmark suites                                                                                                                                                 | Only LangSmith/Braintrust offer comparable eval. n8n/Make.com have zero eval.          |
| **Cost optimization**       | Budget modes, model tier routing, criticality-based cost control, per-node tracking                                                                                                                                      | n8n has basic token counting. Make.com charges per operation. No cost-aware execution. |
| **Human-in-the-loop**       | Human gates, constraint pauses, council review, input requests                                                                                                                                                           | n8n has Wait nodes. Make.com lacks HITL entirely.                                      |
| **Knowledge artifacts**     | Knowledge Hypergraph (claims, edges, feedback loops), cross-impact matrices                                                                                                                                              | Only deep_research tools like Elicit produce structured knowledge.                     |
| **Real-time observability** | RunEventWriter with 15+ event types, token streaming, phase progression                                                                                                                                                  | LangSmith has tracing. n8n has execution data. Our event granularity is superior.      |
| **Visual workflow builder** | React Flow canvas (CustomWorkflowBuilder) with drag-and-drop, 7 node types, parallel splits, conditional branches, auto-layout (Dagre), undo/redo (50-state), copy/paste, bypass/mute, cost estimation, properties panel | n8n has a comparable canvas. Make.com has radial layout. We're competitive here.       |

### Weaknesses (Where Competitors Beat Us)

| Gap                                 | What Competitors Do                                                                                                            | Our Current State                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Per-node data inspection**        | n8n: Click any node after execution → see input/output data. Pin data for testing. LangGraph Studio: Full state at every node. | RunDetailModal shows streaming output but not per-node state snapshots. The visual builder shows design-time config but no runtime data overlay. |
| **Partial execution / pin data**    | n8n: Execute from any node using pinned upstream data. LangGraph Studio: Replay from any checkpoint with state editing.        | Checkpoint resume exists in the engine but isn't exposed as "run from node X" or "pin this node's output" in the UI.                             |
| **Typed ports**                     | Langflow: Ports typed as "LLM", "Prompt", "Tool" — only compatible types connect.                                              | Canvas allows any-to-any connections. No type validation prevents invalid topologies at design time.                                             |
| **Error workflows**                 | n8n: Dedicated error trigger workflow auto-fires on failure.                                                                   | errorCategory tracking exists but no automated error-triggered remediation workflows.                                                            |
| **Workflow versioning**             | n8n Cloud: Version history with restore. Dify: Full prompt version control.                                                    | No version history for workflows or prompt templates.                                                                                            |
| **Template marketplace**            | n8n: 1000+ community templates. Make.com: Template gallery with categories. Flowise: Marketplace.                              | WorkflowTemplate type exists but no browseable gallery or community sharing.                                                                     |
| **Integration breadth**             | n8n: 400+ integrations. Make.com: 1500+ apps.                                                                                  | Custom tool registry — powerful but manual.                                                                                                      |
| **Expression system**               | n8n: `{{ $json.field }}` with autocomplete and live preview.                                                                   | `{{variable}}` template parameters with no autocomplete or preview.                                                                              |
| **Variable binding / data mapper**  | Make.com: Visual drag-and-drop field mapper between nodes. n8n: Expression autocomplete with upstream data.                    | No visual variable binding or data flow mapping between nodes.                                                                                   |
| **Search in node palette**          | n8n: Searchable node palette. Rivet: Filterable node library.                                                                  | Node palette has fixed list of 7 types, no search.                                                                                               |
| **Drag from palette to canvas**     | n8n/Langflow/Flowise: Drag node type from palette directly onto canvas.                                                        | Must select a node first, then use palette to add after it.                                                                                      |
| **Breakpoints / step debugging**    | LangGraph Studio: Set breakpoints, step through execution. Rivet: Step-through mode.                                           | No breakpoint or step-through debugging capability.                                                                                              |
| **Node annotations / sticky notes** | n8n: Sticky notes on canvas for documentation.                                                                                 | No annotation or comment system on the canvas.                                                                                                   |

---

## Part 2: Competitive Deep Dive

### Tier 1: General Workflow Orchestration (n8n, Make.com)

**n8n** — The open-source standard for visual workflow automation.

- **Architecture**: Node-based DAG with item-level routing. Each connection carries `INodeExecutionData[]`. Nodes have multiple typed inputs/outputs. Worker queue (Redis/BullMQ) for horizontal scaling.
- **Killer UX features**: (1) Per-node data preview after execution — the most praised feature. (2) Pin data for iterative development. (3) Partial execution from any node. (4) Expression editor with live preview and autocomplete.
- **AI capabilities**: LangChain.js integration via AI Agent node. Black-box execution — intermediate reasoning steps not visible. No multi-model, no evaluation.
- **Weaknesses**: No retry with backoff. Binary data is clunky. Agent node is opaque. No evaluation framework. Canvas struggles at 50+ nodes.
- **Key lesson**: Data transparency at every node is what makes n8n addictive.

**Make.com** — Best-in-class visual design for non-technical users.

- **Architecture**: Scenario-based execution with modules connected in a pipeline. Circular/radial layout is distinctive. Operations-based pricing (each module execution = 1 operation).
- **Killer UX features**: (1) Visual data mapper with drag-and-drop field mapping between modules. (2) Error handling routes — dedicated error paths per module. (3) Iterator/aggregator modules for batch processing. (4) Scheduling with cron + webhook triggers.
- **AI capabilities**: Basic — HTTP module to call LLM APIs. Some native AI modules (OpenAI, etc.) but no agent orchestration.
- **Weaknesses**: Proprietary, expensive at scale. No self-hosting. Limited programmability. No AI-native features.
- **Key lesson**: Visual data mapping between nodes is intuitive and reduces errors.

### Tier 2: AI-Native Workflow Builders (Langflow, Flowise, Rivet, Dify)

**Langflow** — LangChain visual builder, now part of DataStax.

- **Architecture**: React Flow canvas that compiles to LangChain component graphs. Drag-and-drop LangChain components (LLMs, prompts, chains, agents, tools, memory, vector stores).
- **Killer UX features**: (1) Type-safe port connections — ports are typed (e.g., "LLM", "Prompt", "Tool") and only compatible types can connect. (2) Playground chat for testing. (3) API export — every flow gets a REST API automatically.
- **Evaluation**: Basic — playground testing only. No structured evaluation or benchmarking.
- **Key lesson**: Typed ports prevent invalid connections and guide users toward valid compositions.

**Flowise** — LangChain/LlamaIndex visual builder, open-source.

- **Architecture**: Chatflow vs Agentflow distinction. React Flow canvas. Marketplace for sharing flows.
- **Killer UX features**: (1) Chatflow/Agentflow split simplifies mental model. (2) Marketplace with community-shared flows. (3) Document store management UI.
- **Evaluation**: None built-in.
- **Key lesson**: Separating "simple chains" from "agent loops" in the UI reduces cognitive load.

**Rivet (by Ironclad)** — Purpose-built for AI workflow debugging.

- **Architecture**: Node graph with strong typing. Designed specifically for prompt engineering and AI pipeline debugging.
- **Killer UX features**: (1) **Batch test runner** — run a flow against a dataset and see pass/fail per case. (2) **Side-by-side comparison** — compare outputs across different prompt versions or model configs. (3) **Variable interpolation preview** — see exactly what the LLM receives. (4) **Token counting per node** — cost visibility at every step.
- **Evaluation**: First-class — batch evaluation with assertions, dataset-driven testing, output comparison.
- **Key lesson**: Rivet proves that evaluation-first UX is viable and powerful for AI workflows.

**Dify.ai** — Full LLMOps platform.

- **Architecture**: Workflow builder + RAG pipeline builder + agent builder + prompt IDE. All-in-one platform.
- **Killer UX features**: (1) **Prompt IDE** with version control, variable management, and A/B testing. (2) **RAG pipeline builder** with chunking strategy visualization. (3) **Annotation/feedback UI** for human-in-the-loop evaluation. (4) **Usage analytics dashboard** with cost, latency, and quality metrics.
- **Evaluation**: Built-in — dataset-driven evaluation, human annotation queues, quality scoring.
- **Key lesson**: Treating prompts as versioned artifacts with A/B testing is essential for production AI.

### Tier 3: Multi-Agent Frameworks (CrewAI, AutoGen, LangGraph Studio)

**CrewAI** — Role-based multi-agent orchestration.

- **Architecture**: Crew → Agent → Task model. Agents have roles, goals, backstories. Tasks have descriptions, expected outputs, assigned agents. Sequential or hierarchical process types.
- **Key innovation**: Role-playing prompting — agents adopt personas and collaborate. Manager agent delegates in hierarchical mode.
- **Evaluation**: None built-in.
- **Key lesson**: Role/persona abstraction makes multi-agent workflows intuitive to design.

**AutoGen / AG2** — Microsoft's conversation-based multi-agent framework.

- **Architecture**: Agents communicate via conversation patterns. ConversableAgent base class. GroupChat for multi-agent coordination.
- **Key innovation**: Conversation as the orchestration primitive (vs. graph edges). Agents negotiate, debate, and converge.
- **Evaluation**: None built-in beyond conversation logging.
- **Key lesson**: Conversation-based orchestration is natural for reasoning tasks (your dialectical workflow already does this).

**LangGraph Studio** — LangChain's visual debugger for LangGraph graphs.

- **Architecture**: Desktop app that connects to a running LangGraph server. Visualizes the state graph, shows state at each node, allows time-travel debugging.
- **Killer UX features**: (1) **Time-travel debugging** — step backward/forward through graph execution. (2) **State inspection at every node** — see the full state object after each node runs. (3) **Breakpoints** — pause execution at any node. (4) **State editing** — modify state mid-execution and resume. (5) **Thread management** — manage multiple concurrent conversation threads.
- **Evaluation**: Not built in (defers to LangSmith for evaluation).
- **Key lesson**: Since LifeOS already uses LangGraph, Studio-style debugging (time-travel, state inspection, breakpoints) is the most relevant competitive benchmark.

### Tier 4: Evaluation & Observability Platforms (LangSmith, Braintrust, Humanloop)

**LangSmith** — LangChain's observability platform.

- **Trace view**: Nested span tree showing every LLM call, tool invocation, and retriever query. Click any span to see full input/output.
- **Evaluation**: Dataset-driven eval with custom evaluators. Pairwise comparison. Regression testing.
- **Prompt playground**: Test prompts with variable substitution, model switching, and temperature tuning.

**Braintrust** — AI product evaluation platform.

- **Scoring**: Custom scorer functions. Side-by-side experiment comparison. Statistical significance testing.
- **Prompt management**: Versioned prompts with deployment slots (staging/production).
- **Logging**: Production trace collection with sampling and filtering.

**Humanloop** — Prompt management + evaluation.

- **Prompt versioning**: Full version history with diff view. Deploy prompts independently of code.
- **Evaluation**: Automated + human evaluation pipelines. Annotation queues. Inter-annotator agreement metrics.
- **Monitoring**: Production quality monitoring with alert thresholds.

---

## Part 3: Gap Analysis Scorecard

Rating: 1 (missing) → 5 (world-class)

| Capability                 | LifeOS | n8n | Make.com | Langflow | Rivet | Dify | LangSmith |
| -------------------------- | ------ | --- | -------- | -------- | ----- | ---- | --------- |
| Visual workflow builder    | 4      | 5   | 5        | 4        | 4     | 4    | 2         |
| Per-node state inspection  | 2      | 5   | 3        | 3        | 5     | 3    | 5         |
| Partial execution / replay | 2      | 4   | 2        | 2        | 3     | 2    | 4         |
| AI reasoning depth         | 5      | 2   | 1        | 3        | 3     | 3    | N/A       |
| Multi-model consensus      | 5      | 1   | 1        | 1        | 1     | 1    | N/A       |
| Evaluation framework       | 4      | 1   | 1        | 1        | 4     | 3    | 5         |
| Cost optimization          | 5      | 2   | 2        | 1        | 2     | 3    | 2         |
| Human-in-the-loop          | 4      | 3   | 1        | 1        | 1     | 3    | 2         |
| Real-time observability    | 4      | 3   | 2        | 2        | 3     | 3    | 5         |
| Prompt versioning          | 1      | 1   | 1        | 1        | 2     | 4    | 3         |
| Template marketplace       | 1      | 4   | 5        | 3        | 2     | 3    | N/A       |
| Error recovery automation  | 2      | 3   | 3        | 1        | 1     | 2    | N/A       |
| Integration breadth        | 2      | 5   | 5        | 3        | 1     | 3    | N/A       |
| Workflow versioning        | 1      | 3   | 2        | 2        | 3     | 4    | N/A       |
| Undo/redo                  | 4      | 4   | 3        | 3        | 5     | 3    | N/A       |

**LifeOS score: 46/75 (61%)**
**Best-in-class composite: 75/75**

**LifeOS dominates in AI reasoning, multi-model consensus, cost optimization, and now has a competitive visual builder. The biggest remaining gaps are per-node state inspection, prompt versioning, workflow versioning, and template marketplace.**

### Visual Builder Detailed Assessment: LifeOS (4/5) vs n8n (5/5)

**What LifeOS already has (matching or exceeding competitors):**

- React Flow canvas with drag-and-drop, pan, zoom, minimap, controls
- 7 node types with color-coded custom components (agent, tool, human_input, join, end, research, subworkflow)
- Node palette sidebar with structural operations (parallel split, conditional branch)
- Properties panel (slide-in right panel) with agent selection, prompt editing, output keys, aggregation modes
- Edge condition editor (5 types: always, equals, contains, regex, llm_evaluate)
- Undo/redo with 50-state history + keyboard shortcuts
- Copy/paste nodes preserving internal edges
- Multi-select (shift+click, box select) with bulk operations
- Node bypass and mute with visual indicators (opacity, dashed borders, diagonal stripes)
- Node grouping
- Auto-layout (Dagre + BFS fallback)
- Per-node cost estimation with workflow total
- Agent versioning from inline prompt editing
- Graph JSON import/export
- Graph mode (JSON + visual hybrid) and Custom mode (pure visual)

**What n8n has that LifeOS doesn't (the gap from 4 → 5):**

- **Per-node data preview after execution** — click any node to see runtime input/output (killer feature)
- **Pin data** — freeze a node's output for downstream iterative development
- **Partial execution** — run from any node using pinned upstream data
- **Drag from palette to canvas** — LifeOS requires selecting a node first, then adding after it
- **Searchable node palette** — important when node types grow
- **Typed ports** — prevent invalid connections at design time
- **Sticky notes / annotations** — documentation inline with the workflow
- **Node data badges on edges** — show item counts flowing between nodes
- **Variable data mapper** — visual field mapping between node outputs/inputs

---

## Part 4: World-Class Improvement Plan

### Design Principles

1. **Reasoning transparency** — Every intermediate state must be inspectable, replayable, and comparable
2. **Composition over configuration** — Visual drag-and-drop composition of agents, tools, and gates
3. **Evaluation-first** — Every workflow run produces scored, comparable artifacts
4. **Progressive disclosure** — Simple workflows stay simple; complexity reveals itself on demand
5. **Cost-aware by default** — Budget constraints, tier routing, and cost projections are always visible

### Phase 1: State Inspector & Replay (Foundation — 4-6 weeks)

**Goal**: Achieve n8n/LangGraph Studio parity on execution transparency.

**1.1 — Per-Node State Timeline**

- Add a `StateTimeline` component to RunDetailModal
- For each node in the execution, show a collapsible card with:
  - Node name, type, duration, token count, cost
  - Input state snapshot (what the node received)
  - Output state delta (what the node changed)
  - For Oracle: claims added, KG edges added, gate scores
- Data source: Extend `RunEventWriter` to emit `node_state_snapshot` events with serialized state deltas
- Clicking a state card opens a full JSON inspector (react-json-view or similar)

**1.2 — State Diff View**

- Side-by-side diff between any two node states (like git diff for state)
- Useful for understanding what each node contributed
- Highlight: new claims (green), modified edges (yellow), removed items (red)

**1.3 — Checkpoint Resume UI**

- Expose existing FirestoreCheckpointer in the UI
- "Resume from here" button on any completed node in the state timeline
- Pre-populates state from the checkpoint, lets user modify inputs before resuming
- For Oracle: "Re-run from Gate B" without repeating Phase 1

**1.4 — Pin State for Testing**

- Allow users to "pin" a node's output state as test data
- When running the workflow, skip upstream nodes and inject pinned state
- Critical for iterative Oracle development: pin Gate A results, iterate on Phase 2

**Files to modify**:

- `apps/web-vite/src/components/agents/RunDetailModal.tsx` — Add StateTimeline tab
- `functions/src/agents/runEvents.ts` — Add `node_state_snapshot` event type
- `functions/src/agents/langgraph/genericGraph.ts` — Emit state snapshots after each node
- `functions/src/agents/langgraph/oracleGraph.ts` — Emit state snapshots after each node
- New: `apps/web-vite/src/components/agents/StateTimeline.tsx`
- New: `apps/web-vite/src/components/agents/StateDiffView.tsx`

---

### Phase 2: Visual Builder Enhancements (Closing the n8n Gap — 4-6 weeks)

**Goal**: Elevate the existing CustomWorkflowBuilder from 4/5 to 5/5 by adding the features that make n8n/LangGraph Studio sticky.

**Existing foundation** (already built in `CustomWorkflowBuilder.tsx`, `BuilderCustomNode.tsx`, `BuilderNodePalette.tsx`, `NodePropertiesPanel.tsx`, `customWorkflowBuilderReducer.ts`, `useUndoableReducer.ts`):

- React Flow canvas with pan/zoom/minimap/controls
- 7 node types with color-coded custom nodes
- Undo/redo (50-state), copy/paste, multi-select, bypass/mute
- Auto-layout (Dagre), parallel splits, conditional branches
- Node properties panel, edge condition editor, cost estimation

**2.1 — Runtime Data Overlay on Canvas (highest-impact gap)**

- After a run completes, overlay execution data onto the design canvas
- Each node shows: duration badge, token count, cost, pass/fail status
- Click any node → split properties panel into Design | Runtime tabs
- Runtime tab shows: input state snapshot, output state delta, full JSON inspector
- Edges show: which path was taken (highlight active edges, dim inactive)
- This is the single most impactful feature n8n has that we don't

**2.2 — Pin Data for Testing**

- Right-click a node after execution → "Pin output"
- Pinned nodes show a pin icon and frozen output badge
- When running the workflow, skip all nodes upstream of pinned nodes
- Inject pinned state data directly into downstream nodes
- Critical for Oracle: pin Gate A output → iterate on Phase 2 without re-running Phase 1
- Store pinned data in Firestore per workflow per node

**2.3 — Drag from Palette to Canvas**

- Enable drag-and-drop from BuilderNodePalette directly onto the canvas
- On drop: create node at drop position, auto-connect to nearest upstream node
- Currently requires selecting a node first, then clicking palette to add after it
- This is the most natural interaction pattern — all competitors support it

**2.4 — Searchable Node Palette**

- Add search input at top of BuilderNodePalette
- Filter node types as user types
- Show recently used nodes at top
- Important for future growth when more node types are added (gate, council, etc.)

**2.5 — Typed Ports with Connection Validation**

- Add port type metadata to node handles (e.g., agent outputs `state`, join expects `state[]`)
- On connection drag, visually indicate valid targets (glow) and invalid targets (red X)
- Prevent invalid connections from being created (with toast explaining why)
- Reduces user errors for complex graph topologies

**2.6 — Sticky Notes / Canvas Annotations**

- Add a "Note" node type (non-executable) for documentation
- Free-text with markdown support
- Resizable, color-coded, positioned freely on canvas
- Useful for documenting Oracle phases, explaining gate criteria, etc.

**2.7 — Edge Data Badges**

- After execution, show small badges on edges with data flow indicators
- For Oracle: "12 claims", "3 trends", "gate: PASS (4.2/5)"
- Gives immediate visual feedback on data flowing through the graph

**Files to modify**:

- `apps/web-vite/src/components/agents/CustomWorkflowBuilder.tsx` — Runtime overlay, drag-from-palette, sticky notes
- `apps/web-vite/src/components/agents/BuilderCustomNode.tsx` — Runtime data display, pin icon, data badges
- `apps/web-vite/src/components/agents/BuilderNodePalette.tsx` — Search, drag source, recently used
- `apps/web-vite/src/components/agents/NodePropertiesPanel.tsx` — Design/Runtime tabs, JSON inspector
- `apps/web-vite/src/components/agents/customWorkflowBuilderReducer.ts` — Pin data actions, sticky note actions
- New: `apps/web-vite/src/components/agents/StickyNoteNode.tsx`
- New: `apps/web-vite/src/hooks/useWorkflowRunOverlay.ts` — Load run data and overlay on canvas

---

### Phase 3: Prompt Engineering Studio (6-8 weeks)

**Goal**: Treat prompts as versioned, testable, deployable artifacts (Dify/Humanloop pattern).

**3.1 — Prompt Version Control**

- Every prompt builder function (12 in Oracle, dialectical prompts, etc.) becomes a versioned artifact
- Version history with diff view (Monaco editor with inline diff)
- Deploy slots: `draft` → `staging` → `production`
- Rollback to any previous version with one click

**3.2 — Prompt Playground**

- Select any prompt template → fill in variables → execute against any model
- Side-by-side comparison: same prompt, different models (or same model, different temperatures)
- Token counter and cost estimator per execution
- Save interesting outputs as evaluation test cases

**3.3 — Variable Autocomplete & Preview**

- In the prompt editor, `{{` triggers autocomplete dropdown showing available state fields
- For Oracle: `{{claims}}`, `{{knowledgeGraph}}`, `{{phaseSummaries}}`, `{{trends}}`, etc.
- Live preview panel shows the fully resolved prompt with current state values
- Highlight sections that exceed token limits

**3.4 — Prompt A/B Testing**

- Create variant prompts for any node
- Run both variants on the same input, compare outputs side-by-side
- Statistical significance testing on evaluation scores across N runs
- Auto-promote winning variant to production

**Files to create**:

- `apps/web-vite/src/components/prompt-studio/PromptEditor.tsx`
- `apps/web-vite/src/components/prompt-studio/PromptVersionHistory.tsx`
- `apps/web-vite/src/components/prompt-studio/PromptPlayground.tsx`
- `apps/web-vite/src/components/prompt-studio/PromptComparison.tsx`
- `apps/web-vite/src/components/prompt-studio/VariableAutocomplete.tsx`
- Domain: `packages/agents/src/domain/promptVersion.ts`
- Persistence: `functions/src/agents/promptVersionRepository.ts`

---

### ~~Phase 4: Evaluation Dashboard 2.0~~ — DEFERRED

> **Note**: Evaluation is being built as a separate evaluator service. Experiment tracking, batch evaluation, pairwise comparison, quality dashboards, and golden test cases will be handled there. Not in scope for this plan.

---

### Phase 4: Error Recovery & Automation (3-4 weeks)

**Goal**: Turn error handling from reactive to proactive (n8n error workflow + Oracle remediation pattern generalized).

**4.1 — Error Workflow Triggers**

- Define "on error" workflows that auto-trigger when a run fails
- Configurable per-workflow and per-error-category
- Error workflow receives: failed run ID, error category, error details, last successful state
- Common patterns: retry with different model, alert user, log to monitoring, adjust parameters

**4.2 — Automated Retry with Backoff**

- Per-node retry configuration: max attempts, backoff strategy (linear, exponential, constant)
- Retry on specific error categories: `network`, `rate_limit`, `timeout`
- Don't retry on: `validation`, `auth`, `internal`
- Fallback model: if primary model fails N times, automatically try fallback

**4.3 — Circuit Breaker Pattern**

- Track failure rates per model/provider over rolling windows
- If failure rate exceeds threshold, temporarily route to fallback provider
- Auto-heal: test primary provider periodically, restore when healthy
- Dashboard showing circuit breaker status per provider

**4.4 — Generalized Remediation Plans**

- Extend Oracle's `GateRemediationPlan` pattern to all workflow types
- When a node fails quality thresholds, generate a structured remediation plan
- Remediation plan includes: what to fix, which node to retry, expected improvement
- Auto-execute remediation or present to user for approval

**Files to modify/create**:

- `packages/agents/src/domain/models.ts` — Add ErrorWorkflow type, RetryConfig
- `functions/src/agents/langgraph/genericGraph.ts` — Retry logic, circuit breaker
- `functions/src/agents/errorWorkflowExecutor.ts` — Error workflow runner
- `apps/web-vite/src/components/agents/ErrorWorkflowConfig.tsx`

---

### Phase 5: Workflow Versioning & Collaboration (4-6 weeks)

**Goal**: Production-grade workflow lifecycle management.

**5.1 — Workflow Version History**

- Every save creates a new version (auto-versioning)
- Version list with timestamps, diff between versions
- Restore any previous version
- Tag versions: "v1.0-production", "experiment-new-prompts", etc.

**5.2 — Workflow Diff View**

- Visual diff of two workflow versions on the canvas
- Green nodes = added, red = removed, yellow = modified
- Edge diff: new connections, removed connections, changed conditions
- Config diff: parameter changes highlighted

**5.3 — Workflow Branching**

- Create a branch of a workflow for experimentation
- Run experiments on the branch without affecting production
- Merge branch back (with conflict resolution if both changed)

**5.4 — Template Gallery**

- Curated gallery of workflow templates organized by use case
- Categories: Strategic Analysis, Research, Creative, Technical, Decision Support
- One-click import with parameter customization
- Community sharing (future): publish your workflows as templates

**Files to create**:

- `packages/agents/src/domain/workflowVersion.ts`
- `functions/src/agents/workflowVersionRepository.ts`
- `apps/web-vite/src/components/workflow-builder/VersionHistory.tsx`
- `apps/web-vite/src/components/workflow-builder/WorkflowDiff.tsx`
- `apps/web-vite/src/components/workflow-builder/TemplateGallery.tsx`

---

### Phase 6: Advanced Observability (3-4 weeks)

**Goal**: LangSmith-level tracing with cost-aware instrumentation.

**6.1 — Trace Waterfall View**

- Nested span tree (like Chrome DevTools Network tab) for each run
- Spans: workflow → phase → node → LLM call → tool call
- Each span shows: duration, tokens, cost, status
- Click any span to see full input/output

**6.2 — Cost Projection**

- Before running: estimate total cost based on workflow config, input size, and model pricing
- During run: real-time cost accumulation with projection to completion
- After run: actual vs. estimated cost comparison
- Budget alerts: warn when approaching limits

**6.3 — Performance Profiling**

- Identify bottleneck nodes (longest duration, highest token usage)
- Compare node performance across runs
- Suggest optimizations: "Node X uses 40% of budget — consider downgrading to balanced tier"

**6.4 — Anomaly Detection**

- Statistical baselines for cost, duration, and quality per workflow
- Alert when a run deviates significantly from baseline
- Useful for detecting: prompt drift, model degradation, data quality issues

**Files to create**:

- `apps/web-vite/src/components/observability/TraceWaterfall.tsx`
- `apps/web-vite/src/components/observability/CostProjection.tsx`
- `apps/web-vite/src/components/observability/PerformanceProfile.tsx`
- `apps/web-vite/src/hooks/useTraceData.ts`

---

## Part 5: Priority Matrix

### Phase 0 (Prerequisite): Code Review & Cleanup

Before adding features, fix bugs, code smells, and architectural issues in the existing graph execution engine and visual builder. Clean foundation = faster iteration.

### Must-Have (Phases 1-2): Foundation for world-class UX

| Phase                    | Effort  | Impact        | Dependencies                     |
| ------------------------ | ------- | ------------- | -------------------------------- |
| 1.1 State Timeline       | 2 weeks | Very High     | RunEvent extension               |
| 1.2 State Diff           | 1 week  | High          | State Timeline                   |
| 1.3 Checkpoint Resume UI | 2 weeks | Very High     | Existing checkpointer            |
| 2.1 Runtime Data Overlay | 3 weeks | **Very High** | State Timeline + existing canvas |
| 2.2 Pin Data for Testing | 2 weeks | Very High     | Runtime overlay                  |
| 2.3 Drag from Palette    | 1 week  | Medium        | Existing canvas                  |

### Should-Have (Phase 3): Differentiation

| Phase                 | Effort  | Impact    | Dependencies      |
| --------------------- | ------- | --------- | ----------------- |
| 3.1 Prompt Versioning | 3 weeks | Very High | New domain type   |
| 3.2 Prompt Playground | 2 weeks | High      | Prompt Versioning |

### Nice-to-Have (Phases 4-6): Production hardening

| Phase                   | Effort  | Impact | Dependencies    |
| ----------------------- | ------- | ------ | --------------- |
| 4.1 Error Workflows     | 2 weeks | High   | New domain type |
| 4.2 Retry with Backoff  | 1 week  | Medium | genericGraph    |
| 5.1 Workflow Versioning | 3 weeks | High   | New domain type |
| 6.1 Trace Waterfall     | 3 weeks | High   | RunEvent data   |

---

## Part 6: Architectural Recommendations

### 1. Leverage the Existing React Flow Canvas

The CustomWorkflowBuilder already uses `@xyflow/react` v12.10.0 with a sophisticated reducer (40+ actions), auto-layout (Dagre), and undo/redo. **Do not rebuild — extend.** The highest-ROI investment is adding runtime data overlay and pin data on top of the existing canvas.

### 2. Unify State Snapshots into the Event System

Rather than creating a separate state snapshot storage, extend your existing `RunEventWriter` with a `node_state_snapshot` event type. This keeps the event stream as the single source of truth and enables the State Timeline component to work with the same Firestore listener pattern you already use for streaming.

### 3. Separate Prompt Storage from Code

Currently, prompt builders are TypeScript functions in `oraclePrompts.ts`. For versioning and A/B testing, prompts need to be stored as data (Firestore documents) rather than code. The prompt builder functions become template resolvers that fetch the active prompt version and interpolate variables.

### 4. Keep the Existing useReducer + useUndoableReducer Pattern

The `customWorkflowBuilderReducer.ts` (40+ actions, 572 lines) with `useUndoableReducer` (50-state snapshot history) is already well-architected. No need to migrate to Zustand — the current pattern works well with React Flow and keeps state management explicit. For the runtime overlay, add a separate `useWorkflowRunOverlay` hook that merges run event data onto the canvas state without polluting the design-time reducer.

### 5. Build the Evaluation Dashboard on TanStack Table

For the experiment tracking and batch evaluation views, TanStack Table (React Table v8) provides virtualized rendering, sorting, filtering, grouping, and column resizing — all needed for the evaluation matrix views.

---

## Part 7: Success Metrics

### UX Quality Metrics

| Metric                     | Current              | Phase 1 Target          | Phase 2 Target                   | World-Class |
| -------------------------- | -------------------- | ----------------------- | -------------------------------- | ----------- |
| Time to create a workflow  | ~3 min (canvas)      | ~3 min                  | ~2 min (drag-from-palette)       | < 1 min     |
| Time to debug a failed run | ~5 min (log reading) | ~1 min (state timeline) | ~15s (runtime overlay on canvas) | < 10s       |
| Time to compare two runs   | Not possible         | ~2 min                  | ~30s (pairwise)                  | < 15s       |
| Prompt iteration cycle     | Deploy code change   | Deploy code change      | ~30s (playground)                | < 10s       |
| Error recovery time        | Manual investigation | ~2 min (resume UI)      | ~30s (pin data + partial run)    | Automated   |

### Competitive Position After Full Implementation

| Capability              | Current Rank | After Phase 2                | After Phase 6                |
| ----------------------- | ------------ | ---------------------------- | ---------------------------- |
| Visual workflow builder | 3rd          | 1st (with runtime overlay)   | 1st                          |
| Execution debugging     | 5th          | 2nd                          | 1st                          |
| AI reasoning depth      | 1st          | 1st                          | 1st                          |
| Evaluation framework    | 3rd          | (separate evaluator service) | (separate evaluator service) |
| Cost optimization       | 1st          | 1st                          | 1st                          |
| Overall UX              | 3rd          | 2nd                          | 1st                          |

---

## Appendix: Competitive Platform Summary Table

| Platform             | Category           | Pricing                    | Best For                          | Key Weakness                                |
| -------------------- | ------------------ | -------------------------- | --------------------------------- | ------------------------------------------- |
| **n8n**              | General automation | Free (self-host) / $20+/mo | Visual workflow building          | No AI evaluation                            |
| **Make.com**         | General automation | $9+/mo (per operation)     | Non-technical users               | No AI-native features                       |
| **Langflow**         | AI builder         | Free (open-source)         | LangChain prototyping             | No evaluation, limited state management     |
| **Flowise**          | AI builder         | Free (open-source)         | RAG pipeline building             | No evaluation, simple chains only           |
| **Rivet**            | AI debugging       | Free (open-source)         | Prompt engineering, batch testing | No multi-agent, limited scope               |
| **Dify.ai**          | LLMOps platform    | Free + $59+/mo             | Full AI lifecycle                 | Opinionated, vendor lock-in risk            |
| **CrewAI**           | Multi-agent        | Free (open-source)         | Role-based agent teams            | No visual builder, no evaluation            |
| **AutoGen**          | Multi-agent        | Free (open-source)         | Conversation-based agents         | Code-only, no visual UX                     |
| **LangGraph Studio** | Debugging          | Free (with LangSmith)      | LangGraph debugging               | Desktop-only, no workflow building          |
| **LangSmith**        | Observability      | Free + $39+/mo             | Tracing + evaluation              | No workflow building, LangChain-centric     |
| **LifeOS**           | AI reasoning       | Custom                     | Deep strategic analysis           | UX gaps in runtime data overlay + debugging |
