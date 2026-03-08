# Phase 1: Bug Fixes & Guards — Agent Prompt

You are implementing Phase 1 of the Dialectical Workflow Improvement Plan. Read the full plan at `docs/DIALECTICAL_WORKFLOW_IMPROVEMENT_PLAN.md` for context, but you are ONLY implementing Phase 1. No architectural changes, no new graph topology, no new nodes, no feature flags. Only isolated correctness fixes.

## Constraints

- Every existing test must still pass after your changes.
- Do not change any graph topology or workflow structure.
- Do not add feature flags or new state annotation fields.
- Write unit tests for each fix (see test specs below).
- After all changes, run the verification gate and fix any failures before committing.

## Tasks

### Task 1A: Fix contradiction density formula

**File:** `functions/src/agents/metaReflection.ts`

Find the contradiction density calculation. It currently divides by agent count (number of thesis agents). This is wrong — it should divide by actual claim count from thesis graphs.

Replace the denominator with:
```ts
const totalClaims = theses.reduce((sum, t) => {
  if (t.graph) return sum + t.graph.nodes.filter(n => n.type === 'claim').length
  return sum + t.falsificationCriteria.length + t.decisionImplications.length
}, 0) + negations.reduce((sum, n) => sum + n.internalTensions.length + n.categoryAttacks.length, 0)
```

Use `Math.max(totalClaims, 1)` as denominator to avoid division by zero.

### Task 1B: Deterministic lens resolution

**Create:** `functions/src/agents/langgraph/dialecticalPrompts.ts` (new file)

This file will grow in Phase 2, but for now it only contains the `resolveThesisLens` helper:

```ts
import { AgentConfig } from '@lifeos/agents'

const LENS_PHRASE_MAP: Record<string, string> = {
  'economic thesis': 'economic',
  'systems thinking thesis': 'systems',
  'adversarial thesis': 'adversarial',
  'red-team thesis': 'adversarial',
  'technological thesis': 'technological',
  'geopolitical thesis': 'geopolitical',
  'social thesis': 'social',
}

export function resolveThesisLens(agent: AgentConfig, fallback = 'general'): string {
  if (agent.metadata?.lens) return agent.metadata.lens as string
  const prompt = agent.systemPrompt?.toLowerCase() ?? ''
  for (const [phrase, lens] of Object.entries(LENS_PHRASE_MAP)) {
    if (prompt.includes(phrase)) return lens
  }
  return fallback
}
```

Then update two files to use it:

1. **`functions/src/agents/langgraph/deepResearchGraph.ts`** — Find all occurrences of `systemPrompt?.match(/(\w+)\s+THESIS/i)?.[1]?.toLowerCase()` (there are 2: around lines 361 and 718). Replace each with `resolveThesisLens(agent)` (or the equivalent variable). Add the import.

2. **`functions/src/agents/langgraph/dialecticalGraph.ts`** — Find any occurrence of the same regex pattern and replace. If the existing code already uses a different lens resolution method, verify it's correct and leave it alone.

### Task 1C: KG duplicate claim guard

**File:** `functions/src/agents/knowledgeHypergraph.ts`

1. Add a new method to the `KnowledgeHypergraph` class:
```ts
findClaimByNormalizedText(text: string): Claim | null {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ')
  const claims = this.getNodesByType('claim')
  for (const node of claims) {
    const claim = node.data as Claim
    const existingNorm = claim.text.toLowerCase().trim().replace(/\s+/g, ' ')
    if (existingNorm === normalized) return claim
  }
  return null
}
```

2. Modify `addClaim()` to check for duplicates first. If a duplicate exists:
   - Do NOT create a new node
   - DO attach any missing source edges (if the new claim has a sourceId that isn't already linked)
   - Return the existing claim

Read the existing `addClaim` method carefully to understand the source edge logic before modifying.

### Task 1D: Duplicate causal edge guard

**File:** `functions/src/agents/deepResearch/claimExtraction.ts`

Find the section where causal_link edges are added (around lines 248-258). Before calling `kg.addEdge()`, check if an equivalent edge already exists:

```ts
const existingEdges = kg.getEdgesBetween(conceptIds[0], conceptIds[1])
const hasDuplicateCausal = existingEdges.some(e =>
  e.type === 'causal_link' && e.metadata?.claimId === kgClaim.claimId
)
if (!hasDuplicateCausal) {
  kg.addEdge(conceptIds[0], conceptIds[1], { ... })
}
```

Note: Check what method exists on KnowledgeHypergraph to get edges between two nodes. It might be `getEdgesBetween`, `edges`, or you may need to use `getNeighborhood` or the underlying graphlib API. Read `knowledgeHypergraph.ts` to find the right method.

### Task 1E: Pass searchToolKeys into WF2 search nodes

**File:** `functions/src/agents/langgraph/deepResearchGraph.ts`

1. Find `createSearchAndIngestNode` function definition. Its current signature is approximately:
```ts
function createSearchAndIngestNode(
  extractionAgent: AgentConfig,
  execContext: AgentExecutionContext,
  apiKeys: ProviderKeys
)
```

Add `searchToolKeys?: Record<string, string>` as a fourth parameter.

2. Inside the function, find where `toolContext` is constructed or where search tools are called, and ensure `searchToolKeys` is passed through.

3. Find where `createSearchAndIngestNode` is called in `createDeepResearchGraph`. The `searchToolKeys` should come from `execContext` or the workflow config — check how `dialecticalGraph.ts` passes `searchToolKeys` to its research path for the correct pattern, then replicate it.

## Tests to Write

### `functions/src/agents/langgraph/__tests__/dialecticalPrompts.test.ts`

```ts
describe('resolveThesisLens', () => {
  it('resolves "ECONOMIC THESIS" to economic', () => { ... })
  it('resolves "SYSTEMS THINKING THESIS" to systems (not thinking)', () => { ... })
  it('resolves "RED-TEAM THESIS" to adversarial (not team)', () => { ... })
  it('resolves "ADVERSARIAL THESIS" to adversarial', () => { ... })
  it('uses metadata.lens when present (overrides prompt)', () => { ... })
  it('falls back to "general" for unknown prompts', () => { ... })
})
```

### `functions/src/agents/__tests__/knowledgeHypergraph.dedup.test.ts`

```ts
describe('KG duplicate claim guard', () => {
  it('findClaimByNormalizedText returns null for no match', () => { ... })
  it('findClaimByNormalizedText finds exact match (case-insensitive, whitespace-normalized)', () => { ... })
  it('addClaim skips duplicate but returns existing claim', () => { ... })
  it('addClaim attaches missing source edge to existing claim', () => { ... })
  it('addClaim creates new claim when no duplicate exists', () => { ... })
})
```

### `functions/src/agents/deepResearch/__tests__/claimExtraction.dedup.test.ts`

```ts
describe('Duplicate causal edge guard', () => {
  it('does not re-insert causal_link edge for same claim between same concepts', () => { ... })
  it('allows causal_link edge for different claim between same concepts', () => { ... })
})
```

## Verification Gate

After all changes and tests are written, run:

```bash
cd functions && pnpm lint && pnpm typecheck && pnpm test -- --run
cd ../packages/agents && pnpm lint && pnpm typecheck && pnpm test -- --run
```

Fix any lint errors, type errors, or test failures before committing.

## Commit

Once everything passes:

```
fix(agents): correctness fixes — lens resolution, KG dedup guards, contradiction density, searchToolKeys
```
