# Code Review: Agents, Workflows & Tools

This document summarizes potential bugs, code smells, and improvement opportunities across the agents, workflows, and tools codebase.

---

## 1. Bugs

### 1.1 Workflow update: defaultAgentId not validated when agentIds is omitted

**Location:** `packages/agents/src/usecases/workflowUsecases.ts` (lines 109–116)

**Issue:** The check `updates.defaultAgentId && updates.agentIds && !updates.agentIds.includes(updates.defaultAgentId)` only runs when **both** `defaultAgentId` and `agentIds` are present in `updates`. If the client only sends `defaultAgentId` (e.g. changing default agent without changing the list), validation is skipped. The repository then merges with existing workflow, and the new default agent may not be in the current `agentIds` list.

**Fix:** When `defaultAgentId` is in `updates`, resolve the effective agent list (e.g. `updates.agentIds ?? existing.agentIds` after a get) and validate that `defaultAgentId` is in that list.

---

### 1.2 Retry attempt Firestore update not awaited (tool executor)

**Location:** `functions/src/agents/toolExecutor.ts` (lines 319–324)

**Issue:** Inside the retry callback, `toolCallDocRef.update({ retryAttempt: attempt })` is not awaited. Retry attempt counts may not be persisted before the next attempt or before the final status update.

```typescript
;(attempt, error, delayMs) => {
  retryAttempt = attempt
  // ...
  toolCallDocRef.update({
    retryAttempt: attempt,
  })
}
```

**Fix:** Await the update: `await toolCallDocRef.update({ retryAttempt: attempt })`. Ensure the callback is async or that the retry helper supports an async callback.

---

### 1.3 Run events collection path vs run document path

**Location:** Backend `functions/src/agents/runEvents.ts` (line 70); frontend `apps/web-vite/src/hooks/useRunEvents.ts` (line 65)

**Observation:** Run documents live at `users/{userId}/workflows/{workflowId}/runs/{runId}` while events are at `users/{userId}/runs/{runId}/events`. Both backend and frontend use the same events path and the same `runId`, so behavior is consistent. No bug, but worth documenting: `runId` is the logical run identifier and events are stored under the user’s `runs` collection, not under the workflow.

---

## 2. Validation gaps

### 2.1 Workflow graph: startNodeId not validated against nodes

**Locations:**

- `packages/agents/src/domain/validation.ts` – `WorkflowSchema` has `workflowGraph` with `startNodeId` and `nodes` but no refinement that `startNodeId` is in `nodes`.
- Runtime: `functions/src/agents/workflowExecutor.ts` and `functions/src/agents/langgraph/genericGraph.ts` use `graphDef.startNodeId` as the initial node; if it’s missing from the graph, execution fails with “Workflow node X not found”.

**Recommendation:** Add a Zod `.refine()` (or equivalent) so that when `workflowGraph` is present, `graphDef.nodes.some(n => n.id === graphDef.startNodeId)`. Optionally validate that every edge `from`/`to` references a node id.

---

## 3. Security & safety

### 3.1 Custom tool execution (vm sandbox)

**Location:** `functions/src/agents/customTools.ts` (lines 84–105)

**Issue:** User-defined JavaScript is run with `vm.runInNewContext()`. The sandbox exposes `fetch`, `console`, `Date`, `Math`, and a limited `context`. Node’s `vm` is not a full security boundary; escape or misuse could still risk the process (e.g. prototype tricks, async timing). No explicit timeout or CPU limit is shown for the tool execution.

**Recommendations:**

- Document that custom tools are “trusted but limited” and not a full multi-tenant sandbox.
- Consider a timeout (and if possible resource limits) around the tool execution.
- Consider restricting or auditing which globals are exposed.

---

### 3.2 code_interpreter built-in tool

**Location:** `functions/src/agents/toolExecutor.ts` (lines 479–506)

**Issue:** Uses Node’s `vm` with a small sandbox and a timeout. Similar to custom tools: `vm` is not a strong isolation boundary. The sandbox includes `console` and allows arbitrary code execution within the timeout.

**Recommendation:** Treat as trusted/user-level execution; document the risk and consider stricter limits or a dedicated sandbox (e.g. isolated-vm, worker threads, or external runner) if untrusted users can define or trigger code.

---

## 4. Code smells & maintainability

### 4.1 Duplicate workflow execution paths (LangGraph vs legacy)

**Location:** `functions/src/agents/workflowExecutor.ts`

**Issue:** Two full execution paths (LangGraph and legacy sequential/parallel/supervisor/graph) with similar responsibilities. Feature flag `USE_LANGGRAPH` and “legacy” comments make the intent clear, but long-term maintenance and behavioral parity are harder.

**Recommendation:** Plan a single path (e.g. LangGraph-only) and deprecate legacy; or extract shared helpers and document which path is canonical for each workflow type.

---

### 4.2 Tool repository interface and userId

**Location:** `packages/agents/src/ports/toolRepository.ts`; `apps/web-vite/src/adapters/agents/firestoreToolRepository.ts`

**Issue:** `update(toolId, updates)` does not take `userId` as a separate argument; the Firestore adapter requires `updates.userId`. The usecase always injects `userId` into `updates`, so current callers are fine, but the port does not express the requirement and other adapters might not enforce it.

**Recommendation:** Either add `userId` to the port’s `update` signature, or document that `updates` must contain `userId` for adapters that need it.

---

### 4.3 Large monolithic files

**Locations:**

- `functions/src/agents/workflowExecutor.ts` (~1,040 lines)
- `functions/src/agents/toolExecutor.ts` (~550 lines)
- `functions/src/agents/langgraph/genericGraph.ts` (large)

**Recommendation:** Split by responsibility (e.g. sequential/parallel/supervisor/graph executors, tool registration vs execution, graph build vs run). Improves readability and testing.

---

### 4.4 Magic strings for tool IDs and research tools

**Location:** `functions/src/agents/workflowExecutor.ts` (lines 914–924)

**Issue:** `RESEARCH_TOOL_IDS` and `skipResearch` logic use hardcoded tool ID strings. Adding or renaming a research tool requires updating this set.

**Recommendation:** Centralize tool IDs (e.g. constants or a small registry) and derive “research” tools from that so the list is defined in one place.

---

## 5. Testing & robustness

### 5.1 Run executor: providerKeys shape

**Location:** `functions/src/agents/runExecutor.ts` (lines 355–361)

**Issue:** An object with `openai`, `anthropic`, `google`, `grok` is passed into `executeWorkflow`. If `ProviderKeys` or downstream code assumes a different shape or required keys, type or runtime errors could occur.

**Recommendation:** Align `ProviderKeys` (or the execution API) with what `loadProviderKeys` returns and what each executor expects; add unit tests that stub provider keys and run a minimal workflow.

---

### 5.2 Join node logic in graph executor (legacy)

**Location:** `functions/src/agents/workflowExecutor.ts` (e.g. around 836–843)

**Issue:** Join nodes use `incomingCount = graph.inEdges(edge.to)?.length ?? 0` and compare `buffer.length >= incomingCount`. If the graph has multiple edges from the same node to the same join, or self-loops, the “all predecessors done” condition might be wrong.

**Recommendation:** Clarify the intended semantics (unique predecessor nodes vs edge count) and add tests for joins with multiple edges or cycles; adjust the condition if needed.

---

## 6. Summary table

| Category   | Severity | Item                                               | Location (primary)                           |
| ---------- | -------- | -------------------------------------------------- | -------------------------------------------- |
| Bug        | Medium   | defaultAgentId not validated when agentIds omitted | workflowUsecases.ts                          |
| Bug        | Medium   | Retry attempt update not awaited                   | toolExecutor.ts                              |
| Validation | Medium   | workflowGraph startNodeId not in nodes             | validation.ts / workflowExecutor             |
| Security   | Medium   | Custom tool vm sandbox / code_interpreter          | customTools.ts, toolExecutor.ts              |
| Smell      | Low      | Duplicate LangGraph vs legacy paths                | workflowExecutor.ts                          |
| Smell      | Low      | ToolRepository update userId contract              | toolRepository port + adapter                |
| Smell      | Low      | Large monolithic executor files                    | workflowExecutor, toolExecutor, genericGraph |
| Smell      | Low      | Magic strings for research tool IDs                | workflowExecutor.ts                          |

---

## 7. Suggested order of work

1. **Quick wins:** Await retry attempt update (1.2).
2. **Validation:** Add defaultAgentId validation in workflow update (1.1) and workflow graph startNodeId (2.1).
3. **Safety:** Harden custom tool and code_interpreter execution (timeout, docs, optional sandboxing) (3.1, 3.2).
4. **Maintainability:** Centralize tool IDs, then consider splitting large files and clarifying ToolRepository contract.

If you want, the next step can be concrete patches for items 1.1, 1.2, and the validation refinements in (2.1).
