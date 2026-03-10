# Evaluation Architecture and AGI Eval Plan

## Goal

Build a canonical evaluation evidence layer so workflow runs, agent steps, benchmark cases, and capability cases can be diagnosed, compared, exported, and tied to concrete improvement hypotheses.

## Why this matters

The current eval workspace is strong on review and comparison, but weaker on structured diagnosis. To improve workflows, refine agents, and expand system capabilities, we need reusable evidence packets that capture:

- what ran
- what changed
- what failed
- why it likely failed
- what fix is proposed
- whether the fix worked

## Product outcome

After this work, we should be able to:

1. Generate a self-contained `EvalCaseFile` from a workflow run, agent step, benchmark assignment, or capability execution.
2. Inspect exact workflow/agent lineage, checkpoints, assessments, failure tags, and hypotheses in one place.
3. Link follow-up experiments back to the problems they were intended to solve.
4. Export compact machine-readable review packets for external AI review.
5. Measure whether changes improve general thinking quality rather than only narrow workflow metrics.

## Scope

### In scope

- canonical `EvalCaseFile` schema
- failure taxonomy
- improvement hypothesis tracking
- workflow and agent lineage capture
- curated checkpoint snapshots
- case-file CRUD and export
- case review UI
- dashboard integration

### Out of scope for v1

- full raw-state snapshots at every node
- fully automated root-cause inference
- automatic patch generation from evals
- full replay engine redesign
- benchmark runner rewrite

## Core principles

1. One canonical evidence object per evaluated thing.
2. Capture curated state, not everything.
3. Improvement loops must be explicit.
4. Version lineage must be first-class.
5. Human and machine judgment must coexist.

## Technical design

### Canonical entities

- `EvalCaseFile`
- `EvalWorkflowLineage`
- `EvalAgentLineage`
- `EvalExecutionSummary`
- `EvalCheckpointSnapshot`
- `EvalFailureTagAssignment`
- `EvalImprovementHypothesis`
- `EvalCaseExportPacket`

### Storage design

Use the bucketed evaluation namespace:

- `users/{uid}/evaluationBuckets/default/caseFiles/{caseFileId}`
- `users/{uid}/evaluationBuckets/default/failureTaxonomy/{tagId}`
- `users/{uid}/evaluationBuckets/default/improvementHypotheses/{hypothesisId}`
- `users/{uid}/evaluationBuckets/default/caseFileExports/{exportId}`

### Generation sources

Case files should be creatable from:

- workflow runs
- agent eval records
- benchmark run assignments
- capability run records

### Checkpoint strategy

Capture curated checkpoints at:

- decomposition
- evidence gathering
- routing
- synthesis
- gate failure
- remediation
- final output
- exact agent step capture

### Failure taxonomy

Support structured tags across categories:

- reasoning
- evidence
- routing
- context
- synthesis
- calibration
- tool use
- workflow design
- agent design

### Hypothesis lifecycle

Statuses:

- `proposed`
- `accepted`
- `experimenting`
- `validated`
- `rejected`

### Export packets

Two outputs:

- JSON export for machines
- Markdown review packet for AI and human review

## Implementation phases

### Phase 1: Shared schema and path foundation

Deliverables:

- shared IDs and types for case files, failure tags, hypotheses, exports
- validation schemas
- centralized frontend/backend path helpers

Acceptance criteria:

- web and functions typecheck with the new shared types
- all new paths use the valid bucketed Firestore shape
- no hardcoded collection strings are introduced for case-file storage

### Phase 2: Case-file builder services

Deliverables:

- build from run
- build from agent record
- build from benchmark assignment
- build from capability execution
- curated checkpoint extraction

Acceptance criteria:

- each source can produce a degraded-but-valid case file
- lineage, execution summary, checkpoints, and assessments are present
- missing telemetry does not crash generation

### Phase 3: CRUD and export plumbing

Deliverables:

- persist and update case files
- persist failure tags and hypotheses
- JSON export
- Markdown export

Acceptance criteria:

- a case file can be saved, reloaded, and exported
- exports are self-contained enough for offline review

### Phase 4: Cases UI

Deliverables:

- `Cases` subview
- case list and filters
- case detail view
- case creation entry points from existing eval surfaces

Acceptance criteria:

- a reviewer can generate and inspect case files from the UI
- empty and degraded states render cleanly

### Phase 5: Improvement loop

Deliverables:

- failure tagging UI
- hypothesis creation/editing UI
- experiment linking
- validation/rejection tracking

Acceptance criteria:

- a weak run can be turned into a hypothesis without leaving evals
- a later experiment can be linked back to the hypothesis

### Phase 6: Dashboard integration

Deliverables:

- open case counts
- top failure tags
- unresolved hypothesis counts
- validated improvement counts
- capability-family regressions

Acceptance criteria:

- overview shows diagnostic signals, not only aggregate score and cost

### Phase 7: AI review packet workflow

Deliverables:

- export packet creator
- comparison packet for before/after cases
- reviewer-facing markdown summaries

Acceptance criteria:

- exported packets are suitable for external AI review
- before/after packets clearly show lineage and outcome deltas

## Detailed acceptance criteria

1. Any run or agent-step result can be turned into a self-contained case file.
2. Every case file identifies the exact workflow/agent/config/variant lineage.
3. Failure tags and hypotheses are structured, queryable, and source-attributed.
4. Follow-up experiments can be linked back to the problems they were meant to solve.
5. Case files can be exported as machine-readable review packets.
6. Overview can surface unresolved, high-value issues and regressions.
7. The system improves diagnosis quality, not just observability.

## Current implementation target

This pass implements Phase 1 only:

- shared case-file domain types
- validation schemas
- centralized path helpers

Subsequent passes should start with Phase 2: run-to-case-file generation.
