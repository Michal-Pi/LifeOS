import type { EvalResult, Run, WorkflowState } from '@lifeos/agents'

export interface WorkflowMetricCard {
  label: string
  value: string
}

export interface WorkflowSummarySnapshot {
  workflowType: string
  runCount: number
  activeRuns: number
  successRate: number
  averageCost: number
  averageScore: number | null
  averageVariance: number | null
  humanReviewRate: number
  holdoutRunCount: number
  hardRunCount: number
  capabilityFamilies: string[]
}

export interface WorkflowTraceAnnotation {
  summaryBadges: string[]
  notes: string[]
}

export interface WorkflowComparisonHint {
  title: string
  detail: string
}

export interface WorkflowDetailItem {
  label: string
  value: string
}

export interface WorkflowDetailSection {
  title: string
  items: WorkflowDetailItem[]
}

export interface WorkflowBenchmarkFacet {
  key: string
  label: string
  value: string
}

export interface WorkflowEvalAdapterInput {
  workflowType?: string | null
  run?: Run | null
  workflowState?: WorkflowState | null
  result?: EvalResult | null
  recentRuns?: Run[]
  summary?: WorkflowSummarySnapshot | null
  eventCount?: number
  stepCount?: number | null
  toolCallCount?: number | null
  routerDecisionCount?: number | null
  outputLength?: number | null
}

export interface WorkflowEvalAdapter {
  workflowType: string
  buildOverviewMetrics(input: WorkflowEvalAdapterInput): WorkflowMetricCard[]
  buildTraceAnnotations(input: WorkflowEvalAdapterInput): WorkflowTraceAnnotation
  buildComparisonHints(input: WorkflowEvalAdapterInput): WorkflowComparisonHint[]
  buildDetailSections(input: WorkflowEvalAdapterInput): WorkflowDetailSection[]
  buildBenchmarkFacets(input: WorkflowEvalAdapterInput): WorkflowBenchmarkFacet[]
}

function formatScore(value: number | null | undefined): string {
  if (typeof value !== 'number') return 'n/a'
  return value.toFixed(2)
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number') return 'n/a'
  return `${Math.round(value * 100)}%`
}

function getResolvedWorkflowType(
  run?: Run | null,
  workflowState?: WorkflowState | null
): string | null {
  return (
    run?.workflowType ??
    (workflowState?.oracle
      ? 'oracle'
      : workflowState?.deepResearch
        ? 'deep_research'
        : workflowState?.dialectical
          ? 'dialectical'
          : null)
  )
}

function formatDurationMs(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a'
  if (value < 1000) return `${Math.round(value)}ms`
  const seconds = Math.round(value / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}m ${remainder}s`
}

function formatTimestamp(value?: number | null): string {
  if (typeof value !== 'number') return 'n/a'
  return new Date(value).toLocaleString()
}

function findMetricValue(source: unknown, candidates: string[]): unknown {
  if (!source || typeof source !== 'object') return undefined
  const record = source as Record<string, unknown>
  for (const candidate of candidates) {
    if (candidate in record) return record[candidate]
  }
  for (const value of Object.values(record)) {
    const nested = findMetricValue(value, candidates)
    if (typeof nested !== 'undefined') return nested
  }
  return undefined
}

function summarizeWorkflowState(workflowState?: WorkflowState | null): WorkflowDetailSection[] {
  if (!workflowState || typeof workflowState !== 'object') return []

  return Object.entries(workflowState)
    .filter(([, value]) => value && typeof value === 'object')
    .map(([sectionKey, value]) => {
      const record = value as Record<string, unknown>
      const items: WorkflowDetailItem[] = []

      for (const [key, entry] of Object.entries(record)) {
        if (typeof entry === 'number') {
          items.push({ label: key, value: String(entry) })
        } else if (typeof entry === 'string' || typeof entry === 'boolean') {
          items.push({ label: key, value: String(entry) })
        } else if (Array.isArray(entry)) {
          items.push({ label: key, value: String(entry.length) })
        } else if (entry && typeof entry === 'object') {
          const objectKeys = Object.keys(entry)
          if (objectKeys.length > 0 && objectKeys.length <= 6) {
            items.push({ label: key, value: objectKeys.join(', ') })
          } else {
            items.push({ label: key, value: `${objectKeys.length} fields` })
          }
        }

        if (items.length >= 8) break
      }

      return items.length > 0
        ? {
            title: sectionKey,
            items,
          }
        : null
    })
    .filter((section): section is WorkflowDetailSection => Boolean(section))
}

function buildGenericDetailSections(input: WorkflowEvalAdapterInput): WorkflowDetailSection[] {
  const { run, workflowState, result, eventCount } = input
  if (!run) return []

  const start = run.startedAtMs ?? run.createdAtMs ?? null
  const end = run.completedAtMs ?? Date.now()
  const durationMs = start ? end - start : null

  const execution: WorkflowDetailSection = {
    title: 'Execution',
    items: [
      { label: 'workflow', value: run.workflowType ?? 'unknown' },
      { label: 'status', value: run.status },
      { label: 'step', value: String(run.currentStep ?? 0) },
      {
        label: 'cost',
        value:
          typeof run.estimatedCost === 'number'
            ? `$${run.estimatedCost.toFixed(run.estimatedCost < 1 ? 3 : 2)}`
            : 'n/a',
      },
      { label: 'duration', value: formatDurationMs(durationMs) },
      { label: 'events', value: typeof eventCount === 'number' ? String(eventCount) : 'n/a' },
      { label: 'started', value: formatTimestamp(start) },
      { label: 'completed', value: formatTimestamp(run.completedAtMs ?? null) },
    ],
  }

  const evaluation: WorkflowDetailSection = {
    title: 'Evaluation',
    items: [
      { label: 'native score', value: formatScore(result?.aggregateScore) },
      { label: 'output length', value: String(run.output?.length ?? 0) },
      { label: 'error', value: run.error ?? 'none' },
    ],
  }

  const inferred: WorkflowDetailSection = {
    title: 'Inferred Facets',
    items: [
      {
        label: 'phase',
        value: String(findMetricValue(workflowState, ['currentPhase', 'phase']) ?? 'n/a'),
      },
      {
        label: 'claims',
        value: String(
          findMetricValue(workflowState, ['claims', 'extractedClaims']) instanceof Array
            ? (findMetricValue(workflowState, ['claims', 'extractedClaims']) as unknown[]).length
            : (findMetricValue(workflowState, ['claims', 'extractedClaims']) ?? 'n/a')
        ),
      },
      {
        label: 'sources',
        value: String(
          findMetricValue(workflowState, ['sources', 'evidence']) instanceof Array
            ? (findMetricValue(workflowState, ['sources', 'evidence']) as unknown[]).length
            : (findMetricValue(workflowState, ['sources', 'evidence']) ?? 'n/a')
        ),
      },
      {
        label: 'scenarios',
        value: String(
          findMetricValue(workflowState, ['scenarioPortfolio', 'scenarios']) instanceof Array
            ? (findMetricValue(workflowState, ['scenarioPortfolio', 'scenarios']) as unknown[])
                .length
            : (findMetricValue(workflowState, ['scenarioPortfolio', 'scenarios']) ?? 'n/a')
        ),
      },
      {
        label: 'contradictions',
        value: String(
          findMetricValue(workflowState, ['contradictions']) instanceof Array
            ? (findMetricValue(workflowState, ['contradictions']) as unknown[]).length
            : (findMetricValue(workflowState, ['contradictions']) ?? 'n/a')
        ),
      },
    ].filter((item) => item.value !== 'n/a'),
  }

  return [
    execution,
    evaluation,
    ...(inferred.items.length > 0 ? [inferred] : []),
    ...summarizeWorkflowState(workflowState),
  ]
}

function buildGenericBenchmarkFacets(input: WorkflowEvalAdapterInput): WorkflowBenchmarkFacet[] {
  const {
    run,
    workflowState,
    result,
    stepCount,
    toolCallCount,
    routerDecisionCount,
    outputLength,
  } = input
  if (!run) return []

  const sources = findMetricValue(workflowState, ['sources', 'evidence'])
  const claims = findMetricValue(workflowState, ['claims', 'extractedClaims'])
  const contradictions = findMetricValue(workflowState, ['contradictions'])
  const scenarios = findMetricValue(workflowState, ['scenarioPortfolio', 'scenarios'])

  return [
    { key: 'quality', label: 'Quality', value: formatScore(result?.aggregateScore) },
    {
      key: 'cost',
      label: 'Cost',
      value:
        typeof run.estimatedCost === 'number'
          ? `$${run.estimatedCost.toFixed(run.estimatedCost < 1 ? 3 : 2)}`
          : 'n/a',
    },
    { key: 'steps', label: 'Steps', value: String(stepCount ?? run.currentStep ?? 0) },
    { key: 'tools', label: 'Tool calls', value: String(toolCallCount ?? 'n/a') },
    { key: 'routing', label: 'Router decisions', value: String(routerDecisionCount ?? 'n/a') },
    {
      key: 'output',
      label: 'Output chars',
      value: String(outputLength ?? run.output?.length ?? 0),
    },
    {
      key: 'sources',
      label: 'Sources / evidence',
      value: Array.isArray(sources) ? String(sources.length) : String(sources ?? 'n/a'),
    },
    {
      key: 'claims',
      label: 'Claims',
      value: Array.isArray(claims) ? String(claims.length) : String(claims ?? 'n/a'),
    },
    {
      key: 'contradictions',
      label: 'Contradictions',
      value: Array.isArray(contradictions)
        ? String(contradictions.length)
        : String(contradictions ?? 'n/a'),
    },
    {
      key: 'scenarios',
      label: 'Scenarios',
      value: Array.isArray(scenarios) ? String(scenarios.length) : String(scenarios ?? 'n/a'),
    },
  ]
}

const defaultAdapter: WorkflowEvalAdapter = {
  workflowType: 'default',
  buildOverviewMetrics({ recentRuns = [], result, summary }) {
    const completed = recentRuns.filter((run) => run.status === 'completed')
    return [
      { label: 'Runs', value: String(summary?.runCount ?? recentRuns.length) },
      { label: 'Completed', value: String(completed.length) },
      { label: 'Latest Score', value: formatScore(result?.aggregateScore) },
      { label: 'Variance', value: formatScore(summary?.averageVariance ?? null) },
      { label: 'Human Review', value: formatPercent(summary?.humanReviewRate ?? null) },
    ]
  },
  buildTraceAnnotations({ run, result }) {
    return {
      summaryBadges: [
        `Status: ${run?.status ?? 'unknown'}`,
        `Score: ${formatScore(result?.aggregateScore)}`,
      ],
      notes: run?.output ? [`Output length: ${run.output.length} chars`] : [],
    }
  },
  buildComparisonHints({ result }) {
    return [
      {
        title: 'Generic quality comparison',
        detail:
          typeof result?.aggregateScore === 'number'
            ? `Latest judged score ${result.aggregateScore.toFixed(2)}`
            : 'No judged score available for this run.',
      },
    ]
  },
  buildDetailSections(input) {
    return buildGenericDetailSections(input)
  },
  buildBenchmarkFacets(input) {
    return buildGenericBenchmarkFacets(input)
  },
}

const oracleAdapter: WorkflowEvalAdapter = {
  workflowType: 'oracle',
  buildOverviewMetrics({ recentRuns = [], workflowState, result, summary }) {
    const oracleRuns = recentRuns.filter((run) => run.workflowType === 'oracle')
    const oracle = workflowState?.oracle
    const gateResults = oracle?.gateResults ?? []
    const passed = gateResults.filter((gate) => gate.passed).length
    return [
      { label: 'Oracle Runs', value: String(summary?.runCount ?? oracleRuns.length) },
      { label: 'Gate Passes', value: `${passed}/${gateResults.length}` },
      {
        label: 'Axiom Grounding',
        value: formatPercent(oracle?.remediationDelta?.axiomGroundingAfter),
      },
      { label: 'Latest Score', value: formatScore(result?.aggregateScore) },
      { label: 'Human Review', value: formatPercent(summary?.humanReviewRate ?? null) },
    ]
  },
  buildTraceAnnotations({ workflowState, result }) {
    const oracle = workflowState?.oracle
    const gateResults = oracle?.gateResults ?? []
    const latestGate = gateResults[gateResults.length - 1]
    return {
      summaryBadges: [
        `Phase: ${oracle?.currentPhase ?? 'unknown'}`,
        `Gates: ${gateResults.filter((gate) => gate.passed).length}/${gateResults.length}`,
        `Scenarios: ${oracle?.scenarioPortfolio.length ?? 0}`,
        `Score: ${formatScore(result?.aggregateScore)}`,
      ],
      notes: [
        `Uncertainties: ${oracle?.uncertainties.length ?? 0}`,
        `Council sessions: ${oracle?.councilRecords.length ?? 0}`,
        `Latest gate feedback: ${latestGate?.feedback ?? 'n/a'}`,
      ],
    }
  },
  buildComparisonHints({ workflowState }) {
    const oracle = workflowState?.oracle
    return [
      {
        title: 'Scenario quality',
        detail: `Compare mechanistic detail, uncertainty hygiene, and actionability across ${oracle?.scenarioPortfolio.length ?? 0} scenarios.`,
      },
      {
        title: 'Reasoning ledger',
        detail: `Check claims (${oracle?.claims.length ?? 0}), KG edges (${oracle?.knowledgeGraph.edges.length ?? 0}), and evidence traceability.`,
      },
    ]
  },
  buildDetailSections(input) {
    return buildGenericDetailSections(input)
  },
  buildBenchmarkFacets(input) {
    return buildGenericBenchmarkFacets(input)
  },
}

const deepResearchAdapter: WorkflowEvalAdapter = {
  workflowType: 'deep_research',
  buildOverviewMetrics({ recentRuns = [], workflowState, result, summary }) {
    const runs = recentRuns.filter((run) => run.workflowType === 'deep_research')
    const dr = workflowState?.deepResearch as
      | {
          budget?: { phase?: string }
          sources?: unknown[]
          extractedClaims?: unknown[]
          kgSnapshots?: unknown[]
          gapIterationsUsed?: number
        }
      | undefined
    return [
      { label: 'DR Runs', value: String(summary?.runCount ?? runs.length) },
      { label: 'Budget Phase', value: dr?.budget?.phase ?? 'n/a' },
      { label: 'Sources', value: String(dr?.sources?.length ?? 0) },
      { label: 'Claims', value: String(dr?.extractedClaims?.length ?? 0) },
      { label: 'Latest Score', value: formatScore(result?.aggregateScore) },
      { label: 'Variance', value: formatScore(summary?.averageVariance ?? null) },
    ]
  },
  buildTraceAnnotations({ workflowState, result }) {
    const dr = workflowState?.deepResearch as
      | {
          budget?: { phase?: string }
          sources?: unknown[]
          extractedClaims?: unknown[]
          kgSnapshots?: unknown[]
          gapIterationsUsed?: number
        }
      | undefined
    return {
      summaryBadges: [
        `Budget: ${dr?.budget?.phase ?? 'unknown'}`,
        `Sources: ${dr?.sources?.length ?? 0}`,
        `Claims: ${dr?.extractedClaims?.length ?? 0}`,
        `Score: ${formatScore(result?.aggregateScore)}`,
      ],
      notes: [
        `Gap iterations: ${dr?.gapIterationsUsed ?? 0}`,
        `KG snapshots: ${dr?.kgSnapshots?.length ?? 0}`,
      ],
    }
  },
  buildComparisonHints({ workflowState }) {
    const dr = workflowState?.deepResearch as
      | { sources?: unknown[]; extractedClaims?: unknown[]; gapIterationsUsed?: number }
      | undefined
    return [
      {
        title: 'Research coverage',
        detail: `Compare source breadth (${dr?.sources?.length ?? 0}) and extracted claims (${dr?.extractedClaims?.length ?? 0}).`,
      },
      {
        title: 'Loop efficiency',
        detail: `Gap iterations used: ${dr?.gapIterationsUsed ?? 0}. Lower is not always better if evidence quality suffers.`,
      },
    ]
  },
  buildDetailSections(input) {
    return buildGenericDetailSections(input)
  },
  buildBenchmarkFacets(input) {
    return buildGenericBenchmarkFacets(input)
  },
}

const dialecticalAdapter: WorkflowEvalAdapter = {
  workflowType: 'dialectical',
  buildOverviewMetrics({ recentRuns = [], workflowState, result, summary }) {
    const runs = recentRuns.filter((run) => run.workflowType === 'dialectical')
    const dialectical = workflowState?.dialectical as
      | {
          cycleNumber?: number
          contradictions?: unknown[]
          conceptualVelocity?: number
          metaDecision?: string
        }
      | undefined
    return [
      { label: 'Dialectical Runs', value: String(summary?.runCount ?? runs.length) },
      { label: 'Cycles', value: String(dialectical?.cycleNumber ?? 0) },
      { label: 'Contradictions', value: String(dialectical?.contradictions?.length ?? 0) },
      { label: 'Velocity', value: String(dialectical?.conceptualVelocity ?? 0) },
      { label: 'Latest Score', value: formatScore(result?.aggregateScore) },
      { label: 'Holdout Runs', value: String(summary?.holdoutRunCount ?? 0) },
    ]
  },
  buildTraceAnnotations({ workflowState, result }) {
    const dialectical = workflowState?.dialectical as
      | {
          cycleNumber?: number
          phase?: string
          contradictions?: unknown[]
          conceptualVelocity?: number
          metaDecision?: string
        }
      | undefined
    return {
      summaryBadges: [
        `Cycle: ${dialectical?.cycleNumber ?? 0}`,
        `Phase: ${dialectical?.phase ?? 'unknown'}`,
        `Meta: ${dialectical?.metaDecision ?? 'pending'}`,
        `Score: ${formatScore(result?.aggregateScore)}`,
      ],
      notes: [
        `Contradictions: ${dialectical?.contradictions?.length ?? 0}`,
        `Conceptual velocity: ${dialectical?.conceptualVelocity ?? 0}`,
      ],
    }
  },
  buildComparisonHints({ workflowState }) {
    const dialectical = workflowState?.dialectical as
      | { contradictions?: unknown[]; conceptualVelocity?: number; metaDecision?: string }
      | undefined
    return [
      {
        title: 'Contradiction handling',
        detail: `Compare contradiction density (${dialectical?.contradictions?.length ?? 0}) and whether the meta decision stayed productive.`,
      },
      {
        title: 'Conceptual progress',
        detail: `Conceptual velocity is ${dialectical?.conceptualVelocity ?? 0}; inspect if the synthesis actually moved the graph.`,
      },
    ]
  },
  buildDetailSections(input) {
    return buildGenericDetailSections(input)
  },
  buildBenchmarkFacets(input) {
    return buildGenericBenchmarkFacets(input)
  },
}

const registry: Record<string, WorkflowEvalAdapter> = {
  oracle: oracleAdapter,
  deep_research: deepResearchAdapter,
  dialectical: dialecticalAdapter,
  default: defaultAdapter,
}

export function getWorkflowEvalAdapter(
  workflowType?: string | null,
  workflowState?: WorkflowState | null
): WorkflowEvalAdapter {
  const resolved = workflowType ?? getResolvedWorkflowType(undefined, workflowState)
  return (resolved && registry[resolved]) || defaultAdapter
}

export function resolveWorkflowType(
  run?: Run | null,
  workflowState?: WorkflowState | null
): string | null {
  return getResolvedWorkflowType(run, workflowState)
}
