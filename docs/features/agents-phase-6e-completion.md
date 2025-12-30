# AI Agent Framework - Phase 6E: Advanced Orchestration

## Overview

**Status**: ✅ Complete (v1)  
**Date**: December 30, 2025  
**Objective**: Deliver graph-based workflows with conditional routing, joins, and human-in-the-loop
pauses, plus observability for every workflow step.

Phase 6E introduces a workflow graph executor with explicit join nodes, loop safeguards, and a
run-resume flow for human input. A lightweight UI view renders the workflow graph and exposes
workflow steps in run history.

---

## What Was Implemented

### 1. Graph Workflow Model + Validation

- Added `WorkflowGraph`, `WorkflowNode`, `WorkflowEdge`, and `WorkflowState` types.
- Expanded `RunStatus` to include `waiting_for_input`.
- Added schema validation for graph workflows and run state.

**Key files**:

- `packages/agents/src/domain/models.ts`
- `packages/agents/src/domain/validation.ts`
- `packages/agents/README.md`

---

### 2. Graph Executor + Join Aggregation

- Graph execution with explicit join nodes and multiple aggregation modes.
- Conditional routing (`always`, `equals`, `contains`, `regex`).
- Loop safeguards (max node visits + edge repeat limits).
- Workflow steps persisted to Firestore.

**Key files**:

- `functions/src/agents/workflowExecutor.ts`
- `functions/src/agents/runExecutor.ts`

---

### 3. Human-in-the-Loop Pauses

- Runs pause with `waiting_for_input` and a `pendingInput` payload.
- UI prompt collects user response and resumes the run.
- `onRunUpdated` trigger resumes paused runs.

**Key files**:

- `functions/src/agents/runExecutor.ts`
- `apps/web-vite/src/components/agents/RunCard.tsx`
- `apps/web-vite/src/pages/WorkspaceDetailPage.tsx`

---

### 4. UI Support + Graph Visualization

- Read-only workflow graph view in workspace details.
- Workflow steps listed in run cards.
- Light polish for graph styling and layout.

**Key files**:

- `apps/web-vite/src/components/agents/WorkflowGraphView.tsx`
- `apps/web-vite/src/hooks/useWorkflowSteps.ts`
- `apps/web-vite/src/pages/WorkspaceDetailPage.tsx`
- `apps/web-vite/src/globals.css`

---

## Data Model

Workflow steps are stored per run:

```
users/{userId}/runs/{runId}/workflowSteps/{workflowStepId}
```

---

## Verification

- Typecheck: packages + functions + web.
- Lint: functions + web.
- Tests: functions + web.
- Build: packages + functions + web.
- Deploy: functions, hosting, Firestore rules.

---

## Notes

- Graph layout is currently a deterministic depth-based layout; visual editing is deferred.
- Join aggregation supports `list`, `ranked`, and `consensus` modes (with placeholders for future
  scoring).
