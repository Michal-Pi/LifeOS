/**
 * Centralized Collection Paths
 *
 * Single source of truth for all Firestore collection paths used across
 * the agent infrastructure. Eliminates duplicate path helper functions.
 */

// ----- Telemetry Collections -----

export const TelemetryPaths = {
  /** Run-level telemetry: users/{userId}/telemetryBuckets/default/runs/{telemetryId} */
  runs: (userId: string) => `users/${userId}/telemetryBuckets/default/runs`,

  /** Single run telemetry document */
  run: (userId: string, telemetryId: string) =>
    `users/${userId}/telemetryBuckets/default/runs/${telemetryId}`,

  /** Daily summaries: users/{userId}/telemetryBuckets/default/summaries/{date} */
  summaries: (userId: string) => `users/${userId}/telemetryBuckets/default/summaries`,

  /** Single summary document */
  summary: (userId: string, date: string) =>
    `users/${userId}/telemetryBuckets/default/summaries/${date}`,

  /** Component-level telemetry: users/{userId}/telemetryBuckets/default/components/{componentId} */
  components: (userId: string) => `users/${userId}/telemetryBuckets/default/components`,

  /** Single component telemetry document */
  component: (userId: string, componentId: string) =>
    `users/${userId}/telemetryBuckets/default/components/${componentId}`,
} as const

// ----- Evaluation Collections -----

export const EvaluationPaths = {
  /** Rubrics: users/{userId}/evaluationBuckets/default/rubrics/{rubricId} */
  rubrics: (userId: string) => `users/${userId}/evaluationBuckets/default/rubrics`,
  rubric: (userId: string, rubricId: string) =>
    `users/${userId}/evaluationBuckets/default/rubrics/${rubricId}`,

  /** Eval results: users/{userId}/evaluationBuckets/default/results/{resultId} */
  results: (userId: string) => `users/${userId}/evaluationBuckets/default/results`,
  result: (userId: string, resultId: string) =>
    `users/${userId}/evaluationBuckets/default/results/${resultId}`,

  /** Experiments: users/{userId}/evaluationBuckets/default/experiments/{experimentId} */
  experiments: (userId: string) => `users/${userId}/evaluationBuckets/default/experiments`,
  experiment: (userId: string, experimentId: string) =>
    `users/${userId}/evaluationBuckets/default/experiments/${experimentId}`,

  /** Variants: users/{userId}/evaluationBuckets/default/promptVariants/{variantId} */
  variants: (userId: string) => `users/${userId}/evaluationBuckets/default/promptVariants`,
  variant: (userId: string, variantId: string) =>
    `users/${userId}/evaluationBuckets/default/promptVariants/${variantId}`,

  /** Consistency checks: users/{userId}/evaluation/consistency/{checkId} */
  consistency: (userId: string) => `users/${userId}/evaluationBuckets/default/consistency`,
  consistencyCheck: (userId: string, checkId: string) =>
    `users/${userId}/evaluationBuckets/default/consistency/${checkId}`,

  /** Drift alerts: users/{userId}/evaluation/driftAlerts/{alertId} */
  driftAlerts: (userId: string) => `users/${userId}/evaluationBuckets/default/driftAlerts`,
  driftAlert: (userId: string, alertId: string) =>
    `users/${userId}/evaluationBuckets/default/driftAlerts/${alertId}`,

  /** Drift config: users/{userId}/evaluation/driftConfig/{workflowType} */
  driftConfigs: (userId: string) => `users/${userId}/evaluationBuckets/default/driftConfig`,
  driftConfig: (userId: string, workflowType: string) =>
    `users/${userId}/evaluationBuckets/default/driftConfig/${workflowType}`,

  /** Code evaluators: users/{userId}/evaluation/codeEvaluators/{evaluatorId} */
  codeEvaluators: (userId: string) => `users/${userId}/evaluationBuckets/default/codeEvaluators`,
  codeEvaluator: (userId: string, evaluatorId: string) =>
    `users/${userId}/evaluationBuckets/default/codeEvaluators/${evaluatorId}`,

  /** Code eval results: users/{userId}/evaluation/codeEvalResults/{resultId} */
  codeEvalResults: (userId: string) => `users/${userId}/evaluationBuckets/default/codeEvalResults`,
  codeEvalResult: (userId: string, resultId: string) =>
    `users/${userId}/evaluationBuckets/default/codeEvalResults/${resultId}`,

  /** Labeling queues: users/{userId}/evaluation/labelingQueues/{queueId} */
  labelingQueues: (userId: string) => `users/${userId}/evaluationBuckets/default/labelingQueues`,
  labelingQueue: (userId: string, queueId: string) =>
    `users/${userId}/evaluationBuckets/default/labelingQueues/${queueId}`,

  /** Labeling tasks: users/{userId}/evaluation/labelingTasks/{taskId} */
  labelingTasks: (userId: string) => `users/${userId}/evaluationBuckets/default/labelingTasks`,
  labelingTask: (userId: string, taskId: string) =>
    `users/${userId}/evaluationBuckets/default/labelingTasks/${taskId}`,

  /** Router evals: users/{userId}/evaluation/routerEvals/{evalId} */
  routerEvals: (userId: string) => `users/${userId}/evaluationBuckets/default/routerEvals`,
  routerEval: (userId: string, evalId: string) =>
    `users/${userId}/evaluationBuckets/default/routerEvals/${evalId}`,

  /** Tool evals: users/{userId}/evaluation/toolEvals/{evalId} */
  toolEvals: (userId: string) => `users/${userId}/evaluationBuckets/default/toolEvals`,
  toolEval: (userId: string, evalId: string) =>
    `users/${userId}/evaluationBuckets/default/toolEvals/${evalId}`,

  /** Memory evals: users/{userId}/evaluation/memoryEvals/{evalId} */
  memoryEvals: (userId: string) => `users/${userId}/evaluationBuckets/default/memoryEvals`,
  memoryEval: (userId: string, evalId: string) =>
    `users/${userId}/evaluationBuckets/default/memoryEvals/${evalId}`,

  /** Trajectory evals: users/{userId}/evaluation/trajectoryEvals/{evalId} */
  trajectoryEvals: (userId: string) => `users/${userId}/evaluationBuckets/default/trajectoryEvals`,
  trajectoryEval: (userId: string, evalId: string) =>
    `users/${userId}/evaluationBuckets/default/trajectoryEvals/${evalId}`,

  /** Test cases: users/{userId}/evaluation/testCases/{testCaseId} */
  testCases: (userId: string) => `users/${userId}/evaluationBuckets/default/testCases`,
  testCase: (userId: string, testCaseId: string) =>
    `users/${userId}/evaluationBuckets/default/testCases/${testCaseId}`,

  /** Regression results: users/{userId}/evaluation/regressionResults/{resultId} */
  regressionResults: (userId: string) =>
    `users/${userId}/evaluationBuckets/default/regressionResults`,
  regressionResult: (userId: string, resultId: string) =>
    `users/${userId}/evaluationBuckets/default/regressionResults/${resultId}`,

  /** Agent eval records: users/{userId}/evaluation/agentEvalRecords/{recordId} */
  agentEvalRecords: (userId: string) =>
    `users/${userId}/evaluationBuckets/default/agentEvalRecords`,
  agentEvalRecord: (userId: string, recordId: string) =>
    `users/${userId}/evaluationBuckets/default/agentEvalRecords/${recordId}`,

  /** Case files: users/{userId}/evaluationBuckets/default/caseFiles/{caseFileId} */
  caseFiles: (userId: string) => `users/${userId}/evaluationBuckets/default/caseFiles`,
  caseFile: (userId: string, caseFileId: string) =>
    `users/${userId}/evaluationBuckets/default/caseFiles/${caseFileId}`,

  /** Failure taxonomy: users/{userId}/evaluationBuckets/default/failureTaxonomy/{tagId} */
  failureTaxonomy: (userId: string) => `users/${userId}/evaluationBuckets/default/failureTaxonomy`,
  failureTaxonomyTag: (userId: string, tagId: string) =>
    `users/${userId}/evaluationBuckets/default/failureTaxonomy/${tagId}`,

  /** Improvement hypotheses: users/{userId}/evaluationBuckets/default/improvementHypotheses/{hypothesisId} */
  improvementHypotheses: (userId: string) =>
    `users/${userId}/evaluationBuckets/default/improvementHypotheses`,
  improvementHypothesis: (userId: string, hypothesisId: string) =>
    `users/${userId}/evaluationBuckets/default/improvementHypotheses/${hypothesisId}`,

  /** Case file exports: users/{userId}/evaluationBuckets/default/caseFileExports/{exportId} */
  caseFileExports: (userId: string) => `users/${userId}/evaluationBuckets/default/caseFileExports`,
  caseFileExport: (userId: string, exportId: string) =>
    `users/${userId}/evaluationBuckets/default/caseFileExports/${exportId}`,

  /** Agent experiment runs: users/{userId}/evaluation/agentExperimentRuns/{experimentRunId} */
  agentExperimentRuns: (userId: string) =>
    `users/${userId}/evaluationBuckets/default/agentExperimentRuns`,
  agentExperimentRun: (userId: string, experimentRunId: string) =>
    `users/${userId}/evaluationBuckets/default/agentExperimentRuns/${experimentRunId}`,
} as const

// ----- Workflow Collections -----

export const WorkflowPaths = {
  /** Workflows: users/{userId}/workflows/{workflowId} */
  workflows: (userId: string) => `users/${userId}/workflows`,
  workflow: (userId: string, workflowId: string) => `users/${userId}/workflows/${workflowId}`,

  /** Runs: users/{userId}/workflows/{workflowId}/runs/{runId} */
  runs: (userId: string, workflowId: string) => `users/${userId}/workflows/${workflowId}/runs`,
  run: (userId: string, workflowId: string, runId: string) =>
    `users/${userId}/workflows/${workflowId}/runs/${runId}`,

  /** Checkpoints: users/{userId}/workflows/{workflowId}/runs/{runId}/checkpoints/{threadId} */
  checkpoints: (userId: string, workflowId: string, runId: string) =>
    `users/${userId}/workflows/${workflowId}/runs/${runId}/checkpoints`,
  checkpoint: (userId: string, workflowId: string, runId: string, threadId: string) =>
    `users/${userId}/workflows/${workflowId}/runs/${runId}/checkpoints/${threadId}`,

  /** Checkpoint versions: .../checkpoints/{threadId}/versions/{versionId} */
  checkpointVersions: (userId: string, workflowId: string, runId: string, threadId: string) =>
    `users/${userId}/workflows/${workflowId}/runs/${runId}/checkpoints/${threadId}/versions`,
  checkpointVersion: (
    userId: string,
    workflowId: string,
    runId: string,
    threadId: string,
    versionId: string
  ) =>
    `users/${userId}/workflows/${workflowId}/runs/${runId}/checkpoints/${threadId}/versions/${versionId}`,

  /** Pending writes: .../checkpoints/{threadId}/pendingWrites/{taskId} */
  pendingWrites: (userId: string, workflowId: string, runId: string, threadId: string) =>
    `users/${userId}/workflows/${workflowId}/runs/${runId}/checkpoints/${threadId}/pendingWrites`,
  pendingWrite: (
    userId: string,
    workflowId: string,
    runId: string,
    threadId: string,
    taskId: string
  ) =>
    `users/${userId}/workflows/${workflowId}/runs/${runId}/checkpoints/${threadId}/pendingWrites/${taskId}`,
} as const

// ----- Agent Collections -----

export const AgentPaths = {
  /** Agents: users/{userId}/agents/{agentId} */
  agents: (userId: string) => `users/${userId}/agents`,
  agent: (userId: string, agentId: string) => `users/${userId}/agents/${agentId}`,

  /** Tool call records: users/{userId}/toolCalls/{recordId} */
  toolCalls: (userId: string) => `users/${userId}/toolCalls`,
  toolCall: (userId: string, recordId: string) => `users/${userId}/toolCalls/${recordId}`,
} as const

// ----- Example Library Collections -----

export const ExampleLibraryPaths = {
  /** Libraries: users/{userId}/exampleLibraries/{libraryId} */
  libraries: (userId: string) => `users/${userId}/exampleLibraries`,
  library: (userId: string, libraryId: string) => `users/${userId}/exampleLibraries/${libraryId}`,

  /** Examples within library: .../exampleLibraries/{libraryId}/examples/{exampleId} */
  examples: (userId: string, libraryId: string) =>
    `users/${userId}/exampleLibraries/${libraryId}/examples`,
  example: (userId: string, libraryId: string, exampleId: string) =>
    `users/${userId}/exampleLibraries/${libraryId}/examples/${exampleId}`,
} as const

// ----- Dialectical Collections (Future) -----

export const DialecticalPaths = {
  /** Sessions collection: users/{userId}/dialecticalSessions */
  sessions: (userId: string) => `users/${userId}/dialecticalSessions`,
  /** Session document: users/{userId}/dialecticalSessions/{sessionId} */
  session: (userId: string, sessionId: string) =>
    `users/${userId}/dialecticalSessions/${sessionId}`,

  /** Episodes collection: users/{userId}/dialecticalEpisodes */
  episodes: (userId: string) => `users/${userId}/dialecticalEpisodes`,
  episode: (userId: string, episodeId: string) =>
    `users/${userId}/dialecticalEpisodes/${episodeId}`,

  /** Claims collection: users/{userId}/dialecticalClaims */
  claims: (userId: string) => `users/${userId}/dialecticalClaims`,
  claim: (userId: string, claimId: string) => `users/${userId}/dialecticalClaims/${claimId}`,

  /** Concepts collection: users/{userId}/dialecticalConcepts */
  concepts: (userId: string) => `users/${userId}/dialecticalConcepts`,
  concept: (userId: string, conceptId: string) =>
    `users/${userId}/dialecticalConcepts/${conceptId}`,

  /** Contradictions collection: users/{userId}/dialecticalContradictions */
  contradictions: (userId: string) => `users/${userId}/dialecticalContradictions`,
  contradiction: (userId: string, contraId: string) =>
    `users/${userId}/dialecticalContradictions/${contraId}`,
} as const

// ----- Consolidated Export -----

export const Collections = {
  telemetry: TelemetryPaths,
  evaluation: EvaluationPaths,
  workflow: WorkflowPaths,
  agent: AgentPaths,
  exampleLibrary: ExampleLibraryPaths,
  dialectical: DialecticalPaths,
} as const
