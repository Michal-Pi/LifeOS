/**
 * Evaluation Module Exports
 *
 * Provides the complete evaluation infrastructure for Phase 0.5:
 * - LLM-as-Judge for quality scoring
 * - A/B Testing with Thompson sampling
 * - Consistency evaluation
 * - Drift detection
 * - Code-based evaluators
 * - Human labeling workflow
 * - Component evaluation (router, tool, memory)
 * - Trajectory/efficiency evaluation
 * - Test case derivation
 */

// LLM-as-Judge
export {
  createRubric,
  getRubric,
  getDefaultRubric,
  listRubrics,
  evaluateOutput,
  getEvalResult,
  getEvalResultByRunId,
  listEvalResults,
  getAverageScores,
  DEFAULT_CRITERIA,
} from './llmJudge.js'

// A/B Testing
export {
  createExperiment,
  getExperiment,
  listExperiments,
  startExperiment,
  completeExperiment,
  createVariant,
  getVariant,
  listVariants,
  selectVariantThompson,
  recordVariantSample,
  checkSignificance,
  promoteVariant,
  getActiveVariantForAgent,
} from './abTesting.js'

// Consistency Evaluation
export {
  recordConsistencyCheck,
  getConsistencyCheck,
  listConsistencyChecks,
  getConsistencyStats,
  detectConsistencyDrift,
  hashContent,
} from './consistencyCheck.js'

// Drift Detection
export {
  getDriftDetectionConfig,
  updateDriftDetectionConfig,
  createDriftAlert,
  getDriftAlert,
  listDriftAlerts,
  acknowledgeDriftAlert,
  resolveDriftAlert,
  ignoreDriftAlert,
  detectDrift,
  detectDriftAllWorkflows,
  getDriftAlertsSummary,
} from './driftDetection.js'

// Code-Based Evaluators
export {
  createCodeEvaluator,
  getCodeEvaluator,
  listCodeEvaluators,
  updateCodeEvaluator,
  deleteCodeEvaluator,
  runCodeEvaluator,
  runCodeEvaluators,
  getCodeEvalResultsByRun,
  allCodeEvalsPassed,
  createDefaultCodeEvaluators,
} from './codeEvaluators.js'

// Human Labeling
export {
  createLabelingQueue,
  getLabelingQueue,
  getLabelingQueueByWorkflowType,
  listLabelingQueues,
  updateLabelingQueue,
  createLabelingTask,
  getLabelingTask,
  getLabelingTaskByRun,
  listLabelingTasks,
  getNextPendingTask,
  submitLabel,
  shouldQueueForLabeling,
  expirePendingTasks,
  createDefaultLabelingQueue,
} from './humanLabeling.js'

// Re-export from shared package for convenience
export { getDefaultLabelingQuestions } from '@lifeos/agents'

// Component Evaluation
export {
  recordRouterEval,
  recordRouterEvalFromTelemetry,
  getRouterEvalsByRun,
  getRouterAccuracyStats,
  recordToolEval,
  recordToolEvalFromTelemetry,
  getToolEvalsByRun,
  getToolEvalStats,
  getAllToolEvalStats,
  recordMemoryEval,
  recordMemoryEvalFromTelemetry,
  getMemoryEvalsByRun,
  getMemoryEvalStats,
  getComponentEvalSummary,
} from './componentEval.js'

// Trajectory & Efficiency Evaluation
export {
  evaluateTrajectory,
  getTrajectoryEvalByRun,
  listTrajectoryEvals,
  getTrajectoryStats,
  analyzeTrajectoryPatterns,
  deriveTestCase,
  getTestCase,
  listTestCases,
  updateTestCase,
  markTestCaseAsGolden,
  recordRegressionResult,
  getRegressionResultsByTestCase,
  evaluateAgainstTestCase,
} from './trajectoryEval.js'
