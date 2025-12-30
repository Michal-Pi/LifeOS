# AI Agent Framework - Phase 6E: Advanced Orchestration (Plan + Architecture)

## Overview

**Status**: In Progress  
**Goal**: Introduce graph-based workflows with conditional routing, loop controls, and human-in-the-loop steps.  
**Scope**: Single-user workflows (no marketplace/community).

Phase 6E evolves orchestration beyond sequential/parallel/supervisor into a structured workflow graph
that supports branching, loops with guardrails, and manual user input.

---

## Design Goals

- **Deterministic and observable**: every transition and decision is persisted.
- **Safe**: loop detection, max-iteration ceilings, and explicit termination paths.
- **Composable**: reuse existing agent execution and tool calling pipeline.
- **Incremental UI**: workflow visualization and editor come after backend support.

## Non-Goals (v1)

- Marketplace/community workflows.
- Cross-user/shared workflows.
- Full visual editor (lightweight visualization only in v1).

---

## Architecture

### Recommended Open-Source Stack

- **Graph UI**: `@xyflow/react` (React Flow) for interactive composition
- **Layout**: `elkjs` for automatic hierarchical layouts (read-only view)
- **Execution**: `graphlib` for graph structure + custom executor
- **Conditions**: `json-logic-js` for edge condition evaluation

This keeps dependencies lightweight, preserves full control of execution semantics, and avoids
embedding a heavy workflow engine while still enabling a strong UI.

### 1. Workflow Graph Model

Introduce a `WorkflowGraph` as part of `Workspace` configuration. The graph has:

- **Nodes**: agent steps, tool steps, human-input steps, and join nodes.
- **Edges**: transitions with optional conditions. Parallel branches must converge on an explicit join node.

**Node types (v1)**:

- `agent`: execute a configured agent.
- `tool`: execute a specific tool with fixed params (optional in v1; can defer).
- `human_input`: pause run and request user input.
- `join`: wait for all upstream branches, then aggregate outputs.
- `end`: terminator node.

**Edge conditions (v1)**:

- `always`
- `equals` (on a named result key)
- `contains` (string contains)
- `regex` (string match)

**State input for conditions**:

- `lastAgentOutput`
- `namedOutput` (set by node metadata)
- `toolResult`
- `runContext` (static context + prior outputs)

### Join Node Aggregation (v1)

Join nodes support aggregation modes inspired by the `llm-council` panel-of-experts pattern:

- `list`: return an array of `{ agentId, agentName, role, output, confidence? }`
- `ranked`: keep list + add ordering hints (by confidence or evaluator score)
- `consensus`: include top consensus summary + preserve dissenting viewpoints

Join outputs are stored under `workflowState` and can be referenced by downstream edges.

### 2. Execution Engine

Extend `workflowExecutor.ts` with a **graph executor**:

1. Start at `graph.startNodeId`
2. Execute node (agent/tool/human_input/join/end)
3. Persist `nodeResult` in `Run` or subcollection
4. Evaluate outgoing edges
5. Pick next node (first matching edge)
6. Stop on `end` or when `maxIterations` reached

### 3. Loop Control

Add loop safeguards:

- `maxIterations` (existing workspace/run field)
- `maxNodeVisits` per node (new config)
- `maxTotalTokens` (optional)
- `loopDetection`: if the same edge repeats N times, halt with error

### 4. Human-in-the-Loop

Add `run.status = "waiting_for_input"` and a `run.pendingInput` payload.
UI will surface a prompt and allow user to respond; response resumes the run.

---

## Data Model Changes (Proposed)

### Workspace

Add optional workflow graph:

```
workspace.workflowType = "graph"
workspace.workflowGraph = {
  version: 1,
  startNodeId: "node_1",
  nodes: [
    { id, type, agentId?, toolId?, label?, outputKey?, aggregationMode? }
  ],
  edges: [
    { from, to, condition: { type, value?, key? } }
  ],
  limits: {
    maxNodeVisits?: number,
    maxEdgeRepeats?: number
  }
}
```

### Run

Add orchestration tracking:

```
run.workflowState = {
  currentNodeId,
  visitedCount: Record<string, number>,
  edgeHistory: Array<{ from, to, atMs }>
}
run.status = "running" | "completed" | "failed" | "waiting_for_input"
run.pendingInput?: { prompt, nodeId }
```

### Firestore

Persist detailed execution:

```
users/{userId}/runs/{runId}/workflowSteps/{stepId}
```

Each step stores `nodeId`, `type`, `input`, `output`, `error`, `durationMs`.

---

## UX / UI Plan

### Phase 6E.1 (v1)

- **Run Timeline**: include workflow step cards.
- **Human Input Modal** when `run.status = waiting_for_input`.
- **Read-only Graph View** (simple list or diagram).
- **Join Summary Card** showing aggregated expert outputs.

### Phase 6E.2 (later)

- Visual graph editor (drag/drop nodes, edges).
- Per-node configuration UI (prompt overrides, output mapping).
- Join node controls (aggregation mode, confidence rules).

---

## Implementation Plan

### Step 1: Domain + Model Extensions

- Add `WorkflowGraph` types + validation to `packages/agents`.
- Add new `workspace.workflowType = "graph"` option.

### Step 2: Backend Graph Executor

- New executor in `functions/src/agents/workflowExecutor.ts`.
- Step persistence under `workflowSteps`.
- Loop safeguards + error categories.
- Join execution with aggregation modes (`list`, `ranked`, `consensus`).

### Step 3: Frontend UI Support

- Read-only graph view in workspace details.
- Human input prompt flow (UI + Firestore update).
- Workflow step list in run details.
- Join summary rendering in run details.

### Step 4: Documentation + Tests

- Update progress summary + roadmap.
- Add unit tests for graph traversal and loop detection.

---

## Open Questions

1. Should graph workflows allow tool nodes in v1, or only agents + human input?
2. Should join nodes allow custom aggregation prompts per workspace?
3. How strict should condition evaluation be (e.g., first match only vs. multiple)?

---

## Risks & Mitigations

- **Infinite loops**: enforce max iterations + max node visits.
- **Debuggability**: persist every step with timestamps.
- **User confusion**: add clear UI indicators for “waiting for input”.

---

## Success Criteria

- Users can run graph-based workflows without breaking existing workflows.
- Runs pause/resume on human input.
- Clear run history showing node transitions and decisions.
- Parallel expert panels can aggregate into a consensus + dissent output.

---

## Preset: Panel of Experts (llm-council inspired)

**Structure**:

1. Fan-out to 3-5 expert agents in parallel
2. Join node aggregates outputs with `consensus` mode
3. Critic/evaluator agent reviews consensus + dissent
4. Final synthesizer produces output

**Join output structure**:

```
{
  consensus: string,
  dissent: Array<{ agentName, reason }>,
  experts: Array<{ agentId, agentName, role, output, confidence? }>
}
```
