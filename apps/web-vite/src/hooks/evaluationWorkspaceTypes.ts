export interface ManualReviewNote {
  noteId: string
  userId: string
  comparisonKey: string
  leftRunId: string
  rightRunId?: string
  cohortId?: string
  notes: string
  createdAtMs: number
  updatedAtMs: number
}

export interface BenchmarkRunAssignment {
  assignmentId: string
  userId: string
  cohortId: string
  testCaseId: string
  runId: string
  notes?: string
  createdAtMs: number
  updatedAtMs: number
}

export interface TestCaseReviewDecision {
  decisionId: string
  userId: string
  cohortId: string
  testCaseId: string
  winnerRunId?: string
  notes?: string
  createdAtMs: number
  updatedAtMs: number
}

export interface AutoAttachProposalFeedback {
  feedbackId: string
  userId: string
  cohortId: string
  testCaseId: string
  runId: string
  disposition: 'approved' | 'rejected'
  reason?: string
  createdAtMs: number
  updatedAtMs: number
}

export interface BenchmarkWorkflowSnapshot {
  workflowType: string
  runs: number
  avgQuality: number | null
  avgSteps: number | null
  avgCost: number | null
  avgTools: number | null
  avgRouting: number | null
  qualityScore: number | null
  efficiencyScore: number | null
  warnings: string[]
}

export interface BenchmarkSnapshot {
  snapshotId: string
  userId: string
  cohortId: string
  summary: BenchmarkWorkflowSnapshot[]
  notes?: string
  createdAtMs: number
  updatedAtMs: number
}

export interface CapabilityRunRecord {
  recordId: string
  userId: string
  suiteId: string
  testCaseId: string
  runId: string
  taskFamily?: string
  difficulty?: string
  isHoldout?: boolean
  passed: boolean
  qualityScore?: number | null
  scoreVariance?: number | null
  requiresHumanReview?: boolean
  notes?: string
  createdAtMs: number
  updatedAtMs: number
}

export interface CapabilityFamilySnapshot {
  taskFamily: string
  total: number
  passed: number
  avgScore: number | null
  holdout: number
  humanReview: number
}

export interface CapabilitySnapshot {
  snapshotId: string
  userId: string
  suiteId: string
  summary: CapabilityFamilySnapshot[]
  createdAtMs: number
  updatedAtMs: number
}

export interface AgentEvalRecord {
  recordId: string
  userId: string
  runId: string
  workflowType: string
  agentId: string
  agentName: string
  stepIndex: number
  provider?: string
  model?: string
  contextFingerprint?: string
  configFingerprint?: string
  promptFingerprint?: string
  contextSummary?: string
  handoffSummary?: string
  effectiveSystemPrompt?: string
  userPrompt?: string
  exactContextPayload?: string
  exactUpstreamHandoffPayload?: string
  outputSnapshot?: string
  promptTruncated?: boolean
  contextTruncated?: boolean
  handoffTruncated?: boolean
  outputTruncated?: boolean
  upstreamAgentId?: string
  upstreamStepIndex?: number
  outputHash?: string
  automaticScore?: number
  automaticJudgeSummary?: string
  automaticJudgeBreakdown?: Record<string, number>
  requiresReview?: boolean
  stepJudgeEvalResultId?: string
  stepJudgeRubricId?: string
  stepJudgeAggregateScore?: number
  stepJudgeCriterionScores?: Record<string, number>
  stepJudgeReasoning?: string
  stepJudgeRequiresHumanReview?: boolean
  stepJudgeScoreVariance?: number | null
  stepJudgeJudgeModel?: string
  stepJudgeJudgeProvider?: string
  stepJudgeEvaluatedAtMs?: number
  runtimeExperimentId?: string
  runtimeVariantId?: string
  runtimeVariantName?: string
  runtimeExperimentAllocationMode?: 'thompson' | 'winner'
  experimentId?: string
  variantId?: string
  contextVariantLabel?: string
  configVariantLabel?: string
  promptVariantLabel?: string
  notes?: string
  manualScore?: number
  aggregateRunScore?: number | null
  durationMs?: number
  tokensUsed?: number
  toolCallCount?: number
  routerDecisionCount?: number
  createdAtMs: number
  updatedAtMs: number
}

export interface AgentExperimentRun {
  experimentRunId: string
  userId: string
  experimentId: string
  variantId: string
  runId: string
  workflowType: string
  agentId: string
  agentName: string
  stepIndex: number
  agentEvalRecordId?: string
  score?: number | null
  outcome: 'passed' | 'failed' | 'pending_review'
  requiresReview?: boolean
  evaluatedAtMs?: number | null
  variantStatsAppliedAtMs?: number | null
  runtimeVariantName?: string
  runtimeExperimentAllocationMode?: 'thompson' | 'winner' | null
  createdAtMs: number
  updatedAtMs: number
}
