# Evaluation Center — Implementation Plan

## 1. Objective

Build an **Evaluation Center** as a new "Evals" tab within the existing Agentic Workflows page (`AgenticWorkflowsPage`). The Evaluation Center provides a fully integrated set of tools to:

1. **Monitor** running workflows in real-time (progress, phase outputs, gate evaluations)
2. **Trace** completed runs at every level (node-by-node input/output state, events, metrics)
3. **Evaluate** workflow outputs using LLM-as-judge rubrics and golden test cases
4. **Compare** runs side-by-side and benchmark across workflow types
5. **Detect** quality drift and regression across runs over time

The system already has a rich evaluation domain model (`evaluation.ts`, 1380 lines, 42+ types) and comprehensive run event emission (18+ event types) — but zero UI. This plan surfaces all of that infrastructure.

---

## 2. Scope

### In Scope

- New "Evals" tab with 5 sub-views (Dashboard, Process Monitor, Trace Inspector, Eval Suites, Benchmarks)
- 23 new files (components, hooks, CSS)
- 2 modified files (AgenticWorkflowsPage.tsx, packages/agents/src/index.ts)
- Frontend only (React components + Firestore hooks) — no new backend Cloud Functions in this plan

### Out of Scope (deferred)

- Backend eval runner Cloud Function (`evalRunner.ts`)
- A/B experiment management UI (ExperimentViewer.tsx)
- Human labeling queue UI
- CI/CD eval integration
- Score trend charts with a chart library

---

## 3. Architecture

```
AgenticWorkflowsPage (existing, 5 tabs → 6 tabs)
  ├── WorkflowsTab (existing)
  ├── TemplatesTab (existing)
  ├── AgentsTab (existing)
  ├── ToolsTab (existing)
  └── EvalsTab (NEW) ← 5 sub-views via pill nav
        ├── Dashboard        — health overview, drift alerts, score trends
        ├── Process Monitor  — LIVE workflow progress, phase outputs, gate evals
        ├── Trace Inspector  — deep post-run node-by-node trace analysis
        ├── Eval Suites      — rubrics, golden test cases, suite runs
        └── Benchmarks       — side-by-side run comparison, cross-workflow benchmarks
```

### Key Existing Files to Reuse

| File                                                                  | Reuse                                                                                                                      |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `packages/agents/src/domain/evaluation.ts`                            | All domain types: EvalRubric, EvalResult, DriftAlert, DerivedTestCase, TrajectoryEval, ConsistencyResult, Experiment, etc. |
| `packages/agents/src/domain/models.ts`                                | Run, WorkflowState, evaluationScores, RunStatus, AgentExecutionStep                                                        |
| `apps/web-vite/src/hooks/useRunEvents.ts`                             | Pattern: real-time Firestore event subscription via `onSnapshot()`                                                         |
| `apps/web-vite/src/hooks/runEventUtils.ts`                            | `extractLiveCosts()`, `mapStatus()` — reuse directly                                                                       |
| `apps/web-vite/src/hooks/useDialecticalState.ts`                      | Pattern: reconstructing workflow-specific state from event stream                                                          |
| `apps/web-vite/src/hooks/useDeepResearchKGState.ts`                   | Pattern: reconstructing KG state from events                                                                               |
| `apps/web-vite/src/components/agents/KGGraphCanvas.tsx`               | Cytoscape.js wrapper — reuse for workflow process graph                                                                    |
| `apps/web-vite/src/styles/common.css`                                 | CSS classes: `.badge`, `.card`, `.modal-*`, `.filters`, `.empty-state`, `.section-tabs`                                    |
| `apps/web-vite/src/styles/components/KnowledgeGraphVisualization.css` | Metric card styling pattern (`.kg-stats-bar`)                                                                              |

---

## 4. Phases

---

### Phase 1: Foundation — EvalsTab + Dashboard

**Objective:** Add the "Evals" tab to the Agentic Workflows page with pill sub-navigation and a Dashboard sub-view showing eval health metrics, drift alerts, experiments, and recent results.

#### Step 1.1: Wire EvalsTab into AgenticWorkflowsPage

**Modify:** `apps/web-vite/src/pages/AgenticWorkflowsPage.tsx`

- Extend `AgenticTab` union: `'workflows' | 'templates' | 'agents' | 'tools' | 'evals'`
- Import `EvalsTab` from `@/components/agentic/EvalsTab`
- Add tab button with label "Evals" in the tab bar (after "Tools")
- Add conditional render block: `{activeTab === 'evals' && <EvalsTab ... />}`

**Create:** `apps/web-vite/src/components/agentic/EvalsTab.tsx`

- Internal sub-navigation: `type EvalSubView = 'dashboard' | 'process' | 'trace' | 'suites' | 'benchmarks'`
- Pill-style buttons using existing `.section-tabs` / `.section-tab` CSS classes
- Each sub-view rendered conditionally (same pattern as existing tabs)
- Props: `{ workflows, agents }` (passed from parent, consistent with other tabs)

#### Step 1.2: Eval Data Hooks

**Create:** `apps/web-vite/src/hooks/useEvalDashboard.ts`

- Subscribes to `users/{uid}/evalResults` (ordered by `createdAtMs desc`, limit 100)
- Subscribes to `users/{uid}/driftAlerts` (where `status == 'active'`)
- Subscribes to `users/{uid}/experiments` (where `status == 'running'`)
- Computes aggregate metrics per workflow type: avg score, success rate, avg cost, run count
- Returns: `{ evalResults, driftAlerts, activeExperiments, aggregateMetrics, isLoading }`

**Create:** `apps/web-vite/src/hooks/useEvalRubrics.ts`

- CRUD operations for `users/{uid}/evalRubrics` collection
- Uses Firestore `addDoc`, `updateDoc`, `deleteDoc` pattern
- Returns: `{ rubrics, createRubric, updateRubric, deleteRubric, isLoading }`

**Create:** `apps/web-vite/src/hooks/useEvalTestCases.ts`

- CRUD for `users/{uid}/evalTestCases` collection (maps to `DerivedTestCase` domain type)
- Filter by workflowType, isGolden, isActive
- `deriveFromRun(runId)` — fetches run data and pre-populates a test case
- Returns: `{ testCases, createTestCase, updateTestCase, deleteTestCase, deriveFromRun, isLoading }`

#### Step 1.3: Dashboard Sub-View

**Create:** `apps/web-vite/src/components/evals/EvalDashboard.tsx`

Layout (top to bottom):

1. **Health Overview** — 4 metric cards in a row: Avg Score, Success Rate, Avg Cost, Active Alerts
2. **Workflow Health Grid** — One card per workflow type showing score + trend + run count + success rate + avg cost
3. **Drift Alerts** — List of active drift alerts with severity badge + acknowledge/resolve actions
4. **Active Experiments** — A/B experiment progress cards (control vs variant scores, sample size, p-value)
5. **Recent Eval Results** — Sortable table: Run goal | Workflow type | Score | Pass/Fail | Cost | Date

**Create:** `apps/web-vite/src/components/evals/EvalMetricCard.tsx`

- Reusable stat card: value, label, trend arrow (up/down/flat), optional delta, optional severity color
- CSS class: `.eval-metric-card`

**Create:** `apps/web-vite/src/components/evals/WorkflowHealthGrid.tsx`

- Grid of per-workflow-type cards
- Each card: workflow type name + badge, avg score with trend, run count, success rate %, avg cost
- CSS grid: responsive 3 cols -> 2 -> 1

**Create:** `apps/web-vite/src/components/evals/DriftAlertList.tsx`

- Renders list of `DriftAlert` objects from `useEvalDashboard`
- Each alert: severity badge (info/warning/critical), metric name, baseline -> current values, age
- Actions: Acknowledge, Resolve (with optional resolution note), Ignore

#### Step 1.4: Dashboard CSS

**Create:** `apps/web-vite/src/styles/components/EvalCenter.css`

- Import in EvalsTab.tsx
- Sections: metric card grid, workflow health grid, drift alert cards, eval results table, sub-nav pills
- Uses existing CSS custom properties (`--accent`, `--success`, `--warning`, `--destructive`, etc.)
- Responsive breakpoints matching existing patterns

#### Phase 1 Acceptance Criteria

- [ ] "Evals" tab appears in AgenticWorkflowsPage tab bar and is clickable
- [ ] Pill sub-navigation renders with all 5 sub-views, default to "Dashboard"
- [ ] Dashboard renders with empty states when no eval data exists
- [ ] Metric cards, workflow health grid, drift alerts, and recent evals table all render
- [ ] Data hooks subscribe to correct Firestore paths without errors
- [ ] No console errors or warnings

#### Phase 1 Guardrails

1. **TypeScript**: Run `pnpm typecheck` from repo root — all 13 projects must pass
2. **Lint**: No new lint warnings in created files
3. **Build**: `cd apps/web-vite && pnpm build` succeeds
4. **Tests**: `cd packages/agents && pnpm test` — 155 tests pass (no domain model changes)
5. **Code Review Checklist**:
   - [ ] EvalsTab follows same prop pattern as WorkflowsTab/AgentsTab/TemplatesTab
   - [ ] Hooks properly clean up Firestore subscriptions in useEffect return
   - [ ] Empty states are handled gracefully (not blank screens)
   - [ ] CSS uses existing design system variables, no hardcoded colors
   - [ ] No new dependencies added
   - [ ] All imports use `@/` path aliases

---

### Phase 2: Live Process Monitor

**Objective:** Build a real-time dashboard showing running workflows' progress, phase outputs, and gate evaluations. This is the live debugging view — watch workflows execute step by step.

#### Step 2.1: Process Monitor Hook

**Create:** `apps/web-vite/src/hooks/useProcessMonitor.ts`

- Subscribes to active runs: `users/{uid}/runs` where `status in ['running', 'waiting_for_input', 'paused']`
- For each active run, subscribes to its event stream (reuse `useRunEvents` pattern)
- Reconstructs live `ProcessRunState` per workflow type:
  - Dialectical: cycle number, phase, velocity, density (reuse `useDialecticalState` logic)
  - Deep Research: budget phase, source count, claim count, coverage (reuse `useDeepResearchKGState` logic)
  - Oracle: current phase, gate results, council records, scenario count (parse `oracle_*` events)
  - Generic: current step, current agent, tool calls (parse `step_*` events)
- Extracts `PhaseOutput[]` from completed phase events
- Extracts `GateEvaluation[]` from gate result events
- Returns: `{ activeRuns: ProcessRunState[], completedRuns: Run[], isLoading }`

Key interfaces:

```typescript
interface ProcessRunState {
  run: Run
  workflowName: string
  workflowType: string
  currentPhase: string // Human-readable label
  phaseProgress: number // 0-1
  overallProgress: number // 0-1
  currentAgent: string
  currentAction: string // "thinking", "tool call: web_search", etc.
  phaseOutputs: PhaseOutput[]
  gateResults: GateEvaluation[]
  elapsedMs: number
  tokensUsed: number
  estimatedCost: number
  // Workflow-specific extensions
  dialectical?: { cycleNumber; phase; theses; velocity; density }
  deepResearch?: { budget; sourceCount; claimCount; coverage }
  oracle?: { phase; gatesPassed; councilRecords; scenarioCount }
}

interface PhaseOutput {
  phaseId: string
  phaseName: string
  phaseIcon: string
  status: 'completed' | 'running' | 'pending'
  output?: string
  durationMs?: number
  tokensUsed?: number
  cost?: number
}

interface GateEvaluation {
  gateName: string
  gateType: string
  passed: boolean
  score?: number
  reason?: string
  timestamp: number
}
```

#### Step 2.2: Process Monitor Components

**Create:** `apps/web-vite/src/components/evals/ProcessMonitor.tsx`

- Main component: lists active runs as ProcessCards, shows completed runs below
- Empty state: "No workflows currently running. Start a workflow to see live progress here."
- Auto-refresh indicator (green dot)

**Create:** `apps/web-vite/src/components/evals/ProcessCard.tsx`

- Full-width card for a single running workflow
- Sections:
  1. **Header**: workflow name, type badge, elapsed time, cost so far
  2. **Workflow Process Graph**: visual node-edge graph with live status highlighting
  3. **Phase Progress Bar**: horizontal segmented bar with phase icons
  4. **Phase Detail**: expandable panel for the currently active phase (agent, model, status text, metrics)
  5. **Gate Evaluations**: list of gate results (pass/fail badges, convergence rates, reasons)
  6. **Live Metrics Row**: 4 metric cards (workflow-specific: cycle/velocity for dialectical, budget/coverage for DR, etc.)

**Create:** `apps/web-vite/src/components/evals/WorkflowProcessGraph.tsx`

- Renders the workflow's node-edge graph with live status colors
- Uses Cytoscape.js (reuse KGGraphCanvas pattern) or React Flow (`@xyflow/react` already installed)
- Node states: completed (green, checkmark), running (blue, pulse animation), pending (gray), failed (red)
- Shows workflow-type-specific node labels
- Compact layout (not full-screen)

**Create:** `apps/web-vite/src/components/evals/PhaseProgressBar.tsx`

- Horizontal segmented progress bar
- Each segment = one phase with icon above and status below
- Segment states: completed (filled green), running (filled blue, animated), pending (empty gray)
- Phase icons per workflow type:
  - Dialectical: Explore, Thesis, Antithesis, Sublation, Meta, Reflect
  - Deep Research: Plan, Outline, Search, Ingest, Connect, Build, Gap, Write
  - Oracle: Frame, Investigate, Synthesize, Validate

**Create:** `apps/web-vite/src/components/evals/GateEvalPanel.tsx`

- Renders list of `GateEvaluation` objects
- Each gate: name, type badge, pass/fail icon, score (if available), reason (expandable)
- Empty state: "No gates evaluated yet"

#### Step 2.3: Process Monitor CSS

Add to `apps/web-vite/src/styles/components/EvalCenter.css`:

- `.process-card` — full-width stacked card with sections
- `.process-graph` — compact graph container with node status colors
- `.phase-progress-bar` — horizontal segmented bar with icons
- `.phase-segment` states: `.completed`, `.running`, `.pending`
- `.gate-eval-item` — gate result row with badge
- `.pulse-animation` — CSS keyframe for running nodes
- `.completed-runs-list` — compact clickable row list

#### Phase 2 Acceptance Criteria

- [ ] Process Monitor sub-view renders when clicking "Process" pill
- [ ] When no workflows are running, shows appropriate empty state
- [ ] When a workflow is running, a ProcessCard appears with:
  - [ ] Correct workflow name, type, elapsed time, cost
  - [ ] Workflow graph with correct node status highlighting (live updates)
  - [ ] Phase progress bar showing completed/running/pending phases
  - [ ] Current phase detail panel with agent and status info
  - [ ] Gate evaluations appear as gates are evaluated
  - [ ] Live metric cards update in real-time
- [ ] Multiple concurrent running workflows each get their own ProcessCard
- [ ] Completed runs (last 24h) appear below active runs
- [ ] Clicking a completed run navigates to Trace Inspector with that run selected

#### Phase 2 Guardrails

1. **TypeScript**: `pnpm typecheck` passes
2. **Build**: `cd apps/web-vite && pnpm build` succeeds
3. **Performance**: Process Monitor must not cause excessive re-renders. Verify:
   - Event subscriptions cleaned up on unmount
   - RAF batching used for high-frequency updates (follow `useKnowledgeGraph` pattern)
   - Only active ProcessCards subscribe to event streams
4. **Code Review Checklist**:
   - [ ] Subscription cleanup in every `useEffect` that calls `onSnapshot`
   - [ ] No memory leaks from multiple active subscriptions
   - [ ] Graph component uses Cytoscape.js or React Flow consistently (not both)
   - [ ] Phase icons are correct per workflow type
   - [ ] Pulse animation uses `will-change: opacity` for GPU acceleration
   - [ ] Firestore queries are indexed (check `firestore.indexes.json` if needed)

---

### Phase 3: Run Trace Inspector

**Objective:** Build a deep post-run analysis tool that shows the full execution trace of any completed run — node by node, with input/output state at each node, all events, cost breakdown, and workflow-specific annotations.

#### Step 3.1: Trace Data Hook

**Create:** `apps/web-vite/src/hooks/useRunTrace.ts`

- Takes `runId: string` parameter
- Subscribes to `users/{uid}/runs/{runId}/events` (ordered by `timestampMs asc`)
- Fetches the `Run` document for `workflowState`
- Processes events into structured `TraceNode[]`:
  ```typescript
  interface TraceNode {
    nodeId: string
    nodeName: string
    nodeType: 'agent' | 'tool' | 'gate' | 'phase' | 'council'
    startMs: number
    endMs: number
    durationMs: number
    tokensUsed: number
    estimatedCost: number
    provider?: string
    model?: string
    inputSnapshot?: string
    outputSnapshot?: string
    events: RunEvent[]
    status: 'completed' | 'failed' | 'running' | 'skipped'
    children?: TraceNode[] // Nested tool calls within agent nodes
    // Workflow-specific annotations
    phaseIcon?: string
    gateResult?: { passed: boolean; score?: number }
    cycleNumber?: number
    budgetPhase?: string
  }
  ```
- Groups events by `step_started`/`step_completed` boundaries
- Nests `tool_call`/`tool_result` events as children of their parent agent node
- Extracts workflow-specific phase transitions from `dialectical_phase`, `oracle_phase`, `deep_research_phase` events
- Returns: `{ trace: TraceNode[], run: Run, isLoading, totalCost, totalTokens, totalDuration }`

#### Step 3.2: Trace Inspector Components

**Create:** `apps/web-vite/src/components/evals/RunTraceInspector.tsx`

- Main component with 3 sections:
  1. **Run Selector** (top): Filterable list of runs (workflow type filter, status filter, goal search)
  2. **Trace Header** (below selector): Selected run's goal, type, status, duration, tokens, cost, eval score
  3. **Two-panel layout** (main area):
     - Left (40%): TraceTimeline
     - Right (60%): NodeDetailPanel

**Create:** `apps/web-vite/src/components/evals/TraceTimeline.tsx`

- Vertical timeline of `TraceNode` objects
- Each node rendered as: circle -> name -> duration + tokens -> connecting line to next
- Duration bars proportional to each node's time relative to total
- Cost color coding: green (cheap) -> yellow -> orange -> red (expensive)
- Cycle/phase boundary markers for dialectical workflows
- Gate result badges inline (pass/fail with convergence rate)
- Selected node highlighted with accent color
- Cost breakdown bar at bottom (horizontal stacked bar showing cost per node as %)
- Workflow-specific trace decorators:
  - **Dialectical**: Phase icons, cycle boundaries, velocity/density sparklines, meta-decision labels
  - **Deep Research**: Budget phase indicators, source/claim running totals, coverage % at gap nodes
  - **Oracle**: Phase labels (0-3), gate badges, council consensus, scenario count, per-phase cost
  - **Generic**: Agent routing decisions, parallel branch splits, supervisor delegation labels

**Create:** `apps/web-vite/src/components/evals/NodeDetailPanel.tsx`

- Right panel showing selected `TraceNode` details:
  1. **Header**: Node name, type badge, agent/tool name
  2. **Metrics row**: Duration, tokens, cost, model/provider
  3. **Input State** (collapsible): JSON viewer showing state entering this node
  4. **Output State** (collapsible): JSON viewer showing state leaving this node
  5. **Events list** (collapsible): All events within this node's timespan, with type badges and timestamps
  6. **Children** (if tool calls): Nested tool call details
  7. **Gate Details** (if gate node): Convergence rate, pass/fail, reason
  8. **Council Details** (if council node): Per-expert responses, consensus metrics

**Create:** `apps/web-vite/src/components/evals/StateViewer.tsx`

- Collapsible JSON viewer for state objects
- Monospace font, indented, syntax-highlighted (keys in one color, values in another)
- Truncates very long strings with expand button
- Copy-to-clipboard button
- Max height with scroll

#### Step 3.3: Trace Inspector CSS

Add to `apps/web-vite/src/styles/components/EvalCenter.css`:

- `.trace-inspector` — two-panel layout (40/60 split)
- `.trace-timeline` — vertical timeline with connecting lines
- `.trace-node` — node circle + label + metrics
- `.trace-node.selected` — accent border highlight
- `.trace-node-duration-bar` — proportional width bar
- `.cost-breakdown-bar` — horizontal stacked segments
- `.node-detail-panel` — right panel with scrollable sections
- `.state-viewer` — monospace, collapsible, syntax-highlighted JSON
- `.run-selector` — compact run list with filters

#### Phase 3 Acceptance Criteria

- [ ] Trace Inspector sub-view renders when clicking "Trace" pill
- [ ] Run selector shows all completed runs with filters (workflow type, status, search)
- [ ] Selecting a run populates the trace timeline with all execution nodes
- [ ] Each node shows: name, duration, token count, cost
- [ ] Clicking a node in the timeline shows its detail in the right panel
- [ ] Input/output state viewers show JSON content from the run's workflowState
- [ ] Events list shows all events within the selected node's timespan
- [ ] Cost breakdown bar shows proportional cost across all nodes
- [ ] Workflow-specific decorators render correctly:
  - [ ] Dialectical: cycle boundaries, phase icons, velocity/density
  - [ ] Deep Research: budget phases, source/claim counts, coverage %
  - [ ] Oracle: phase labels, gate results, council metrics
  - [ ] Generic: agent routing, parallel branches

#### Phase 3 Guardrails

1. **TypeScript**: `pnpm typecheck` passes
2. **Build**: `cd apps/web-vite && pnpm build` succeeds
3. **Performance**: Large traces (50+ nodes) must render without lag
   - Virtualize the timeline if > 100 nodes (use `react-window`, already installed)
   - State viewer must truncate large JSON objects (> 10KB) with lazy expand
4. **Code Review Checklist**:
   - [ ] TraceNode grouping correctly handles all 18+ event types
   - [ ] Children nesting correctly pairs `tool_call` with `tool_result` events
   - [ ] State viewer handles undefined/null state gracefully
   - [ ] Workflow-specific decorators are conditionally rendered based on `workflowType`
   - [ ] No raw JSON dumped without formatting
   - [ ] Copy-to-clipboard uses `navigator.clipboard.writeText()`

---

### Phase 4: Eval Suites

**Objective:** Build the rubric management and golden test case management UI, allowing users to create evaluation criteria and test cases that can be used to systematically evaluate workflow outputs.

#### Step 4.1: Rubric Management

**Create:** `apps/web-vite/src/components/evals/EvalSuiteManager.tsx`

- Two tabbed sections: "Rubrics" and "Test Cases"
- Rubrics section: grid of rubric cards, each showing name, workflow type, criteria summary, judge model, default badge
- Actions per rubric: Edit, Duplicate, Archive
- "+ New Rubric" button opens RubricEditorModal

**Create:** `apps/web-vite/src/components/evals/RubricEditorModal.tsx`

- Modal form to create/edit an `EvalRubric` (from `evaluation.ts`)
- Fields:
  - Name (text input)
  - Description (textarea)
  - Workflow Type (dropdown: all workflow types)
  - Judge Model (text input, e.g., "claude-sonnet-4-6")
  - Judge Provider (dropdown: openai, anthropic, google, xai)
  - System Prompt (optional textarea)
  - Is Default (checkbox)
- Dynamic criteria list:
  - Add/remove criteria rows
  - Each row: name, description, weight (0-1), prompt (textarea), score range (min/max)
  - Weight sum validation (must equal 1.0, show warning if not)
- Save button persists to Firestore via `useEvalRubrics` hook

#### Step 4.2: Golden Test Cases

- Test Cases section of EvalSuiteManager: grid/list of test cases
- Filter: workflow type, golden only, active only
- Each card shows: name/input, type, min score, max cost, pass/fail counts, last run date
- Actions: Run, Edit, View History, Derive from Run

**Create:** `apps/web-vite/src/components/evals/TestCaseEditorModal.tsx`

- Modal form to create/edit a `DerivedTestCase` (from `evaluation.ts`)
- Two modes:
  1. **Create from scratch**: input (goal text), context (JSON), workflowType, expectedOutput, minQualityScore, maxSteps, maxCost, tags, isGolden
  2. **Derive from Run**: select a completed run -> auto-populates input, context, expected output, step count, cost as thresholds
- Save to Firestore via `useEvalTestCases` hook

#### Step 4.3: Eval Suite Runner (Placeholder UI)

- "Run Suite" button in EvalSuiteManager header
- Opens a panel showing: select rubric, select test cases (checkboxes), run button
- Running state: progress bar showing N/M test cases completed
- Results table: test case | per-criterion scores | aggregate score | pass/fail | cost | duration
- **Backend deferred**: The actual execution logic is deferred. For now, the UI is built but shows "Backend not yet implemented" when Run is clicked.

#### Phase 4 Acceptance Criteria

- [ ] Eval Suites sub-view renders with two tabbed sections (Rubrics, Test Cases)
- [ ] Can create a new rubric with multiple criteria, weights sum to 1.0
- [ ] Created rubric appears in the rubrics list
- [ ] Can edit and archive existing rubrics
- [ ] Can create a test case from scratch with all fields
- [ ] Can derive a test case from an existing run (auto-populates fields)
- [ ] Test cases appear in the list with correct filter behavior
- [ ] Run Suite UI renders (even though backend is deferred)

#### Phase 4 Guardrails

1. **TypeScript**: `pnpm typecheck` passes
2. **Build**: `cd apps/web-vite && pnpm build` succeeds
3. **Firestore**: Verify rubrics and test cases persist and reload correctly
4. **Validation**:
   - [ ] Rubric criteria weights must sum to 1.0 (validated before save)
   - [ ] Test case minQualityScore must be 0-5
   - [ ] Test case maxCost must be positive
   - [ ] Required fields cannot be empty
5. **Code Review Checklist**:
   - [ ] Modal follows existing modal pattern (`.modal-overlay`, `.modal-content`, `.modal-header`, `.modal-body`, `.modal-actions`)
   - [ ] Form state properly reset on modal close
   - [ ] Duplicate rubric creates a deep copy with new ID
   - [ ] Archive sets `isArchived: true` instead of deleting
   - [ ] Derive-from-run correctly fetches run data and populates form

---

### Phase 5: Benchmarks & Comparison

**Objective:** Build side-by-side run comparison and cross-workflow benchmarking tools for analyzing performance across runs and workflow types.

#### Step 5.1: Run Comparison

**Create:** `apps/web-vite/src/components/evals/BenchmarkComparison.tsx`

- Two modes: "Compare Runs" and "Cross-Workflow Benchmarks" (tab toggle)
- **Compare Runs mode**:
  1. Two run selectors (dropdowns with search)
  2. Summary comparison: goal, type, score, tokens, cost, duration, steps — with delta values (absolute + %)
  3. Criterion comparison: if both runs have eval results, show per-criterion bar chart comparison
  4. Output diff: side-by-side markdown rendering of both outputs
- Delta coloring: green for improvements (higher score, lower cost), red for regressions

#### Step 5.2: Cross-Workflow Benchmarks

- **Cross-Workflow mode** (within BenchmarkComparison):
  1. Date range filter + workflow type filter
  2. Summary table: workflow type | run count | avg score | success rate | avg cost | avg duration
  3. Best/worst runs per workflow type (clickable -> opens in Trace Inspector)
  4. Score distribution per workflow type (simple horizontal bar showing min/avg/max)

#### Step 5.3: A/B Experiment Viewer (Placeholder)

- Shows list of experiments from `useEvalDashboard` hook
- Each experiment: name, hypothesis, workflow type, status, variant scores, sample sizes
- Placeholder for: promote winner, archive experiment actions
- **Full implementation deferred** — shows data if experiments exist, but creation/management is deferred

#### Phase 5 Acceptance Criteria

- [ ] Benchmarks sub-view renders with Compare Runs and Cross-Workflow tabs
- [ ] Can select two runs and see side-by-side comparison with deltas
- [ ] Deltas correctly colored (green=improvement, red=regression)
- [ ] Output diff renders both outputs side by side
- [ ] Cross-workflow view shows summary table with correct aggregations
- [ ] Date range filter works correctly
- [ ] Clicking a run in best/worst list opens Trace Inspector

#### Phase 5 Guardrails

1. **TypeScript**: `pnpm typecheck` passes
2. **Build**: `cd apps/web-vite && pnpm build` succeeds
3. **Code Review Checklist**:
   - [ ] Delta calculations are mathematically correct (positive = improvement)
   - [ ] Aggregations handle empty data gracefully (no NaN, no division by zero)
   - [ ] Run selector queries are bounded (limit results, no unbounded collection reads)
   - [ ] Output diff handles very long outputs (truncate with expand)
   - [ ] Cross-workflow table sorts correctly by each column

---

## 5. Files Summary

### New Files (24)

| #   | File                                                          | Phase | Purpose                                              |
| --- | ------------------------------------------------------------- | ----- | ---------------------------------------------------- |
| 1   | `apps/web-vite/src/components/agentic/EvalsTab.tsx`           | 1     | Main eval center tab with 5 sub-view pill navigation |
| 2   | `apps/web-vite/src/components/evals/EvalDashboard.tsx`        | 1     | Dashboard overview                                   |
| 3   | `apps/web-vite/src/components/evals/EvalMetricCard.tsx`       | 1     | Reusable stat card                                   |
| 4   | `apps/web-vite/src/components/evals/WorkflowHealthGrid.tsx`   | 1     | Per-workflow health cards                            |
| 5   | `apps/web-vite/src/components/evals/DriftAlertList.tsx`       | 1     | Drift alerts list                                    |
| 6   | `apps/web-vite/src/components/evals/ProcessMonitor.tsx`       | 2     | Live workflow progress dashboard                     |
| 7   | `apps/web-vite/src/components/evals/ProcessCard.tsx`          | 2     | Single running workflow card                         |
| 8   | `apps/web-vite/src/components/evals/WorkflowProcessGraph.tsx` | 2     | Visual graph with live node status                   |
| 9   | `apps/web-vite/src/components/evals/PhaseProgressBar.tsx`     | 2     | Horizontal phase progress                            |
| 10  | `apps/web-vite/src/components/evals/GateEvalPanel.tsx`        | 2     | Gate evaluation results display                      |
| 11  | `apps/web-vite/src/components/evals/RunTraceInspector.tsx`    | 3     | Deep post-run trace viewer                           |
| 12  | `apps/web-vite/src/components/evals/TraceTimeline.tsx`        | 3     | Vertical timeline of trace nodes                     |
| 13  | `apps/web-vite/src/components/evals/NodeDetailPanel.tsx`      | 3     | Node detail: state, events, metrics                  |
| 14  | `apps/web-vite/src/components/evals/StateViewer.tsx`          | 3     | Collapsible JSON state viewer                        |
| 15  | `apps/web-vite/src/components/evals/EvalSuiteManager.tsx`     | 4     | Rubric + test case management                        |
| 16  | `apps/web-vite/src/components/evals/RubricEditorModal.tsx`    | 4     | Create/edit eval rubric                              |
| 17  | `apps/web-vite/src/components/evals/TestCaseEditorModal.tsx`  | 4     | Create/edit golden test case                         |
| 18  | `apps/web-vite/src/components/evals/BenchmarkComparison.tsx`  | 5     | Run comparison + cross-workflow benchmarks           |
| 19  | `apps/web-vite/src/hooks/useEvalDashboard.ts`                 | 1     | Dashboard data hook                                  |
| 20  | `apps/web-vite/src/hooks/useEvalRubrics.ts`                   | 1     | Rubric CRUD hook                                     |
| 21  | `apps/web-vite/src/hooks/useEvalTestCases.ts`                 | 1     | Test case CRUD hook                                  |
| 22  | `apps/web-vite/src/hooks/useProcessMonitor.ts`                | 2     | Live process state hook                              |
| 23  | `apps/web-vite/src/hooks/useRunTrace.ts`                      | 3     | Trace data processing hook                           |
| 24  | `apps/web-vite/src/styles/components/EvalCenter.css`          | 1-5   | All eval center styling                              |

### Modified Files (2)

| File                                               | Change                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| `apps/web-vite/src/pages/AgenticWorkflowsPage.tsx` | Add `'evals'` to `AgenticTab` union, import+render EvalsTab, add tab button |
| `packages/agents/src/index.ts`                     | Verify evaluation.ts types are exported (add export if missing)             |

---

## 6. End-to-End Verification

After all phases are complete:

1. **Tab Navigation**: `/workflows` -> click each tab (Workflows, Templates, Agents, Tools, Evals) -> all render
2. **Sub-Navigation**: Evals tab -> click each pill (Dashboard, Process, Trace, Suites, Benchmarks) -> all render
3. **Dashboard**: Renders with empty states, no errors
4. **Process Monitor**: Start a workflow -> see it appear live in Process Monitor with updating metrics
5. **Trace Inspector**: Select a completed run -> see full trace timeline -> click nodes -> see detail panel
6. **Eval Suites**: Create a rubric -> create a test case -> both persist to Firestore -> both appear in lists
7. **Benchmarks**: Select two runs -> see side-by-side comparison with correct deltas
8. **TypeScript**: `pnpm typecheck` — all 13 projects pass
9. **Package Tests**: `cd packages/agents && pnpm test` — 155 tests pass
10. **Build**: `cd apps/web-vite && pnpm build` — succeeds with no errors
11. **No Console Errors**: Browser console clean during all interactions
