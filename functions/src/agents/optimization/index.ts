/**
 * Optimization Module
 *
 * Data-driven workflow optimization without LLM fine-tuning.
 * Provides continuous improvement through:
 * - Prompt variant A/B testing and auto-promotion
 * - Few-shot example selection and curation
 * - Retrieval pattern template derivation
 * - Orchestration tuning and recommendations
 * - Automated drift response
 */

// ----- Prompt Optimization -----
export {
  // Version management
  createOptimizedPromptVersion,
  getActiveOptimizedPromptVersion,
  getOptimizedPromptVersion,
  listOptimizedPromptVersions,
  rollbackOptimizedPromptVersion,
  // A/B analysis
  analyzeExperimentForPromotion,
  autoPromoteWinner,
  checkExperimentsForPromotion,
  // Events
  listOptimizationEvents,
} from './promptOptimizer.js'

// ----- Example Selection -----
export {
  // Selection
  selectExamples,
  trackExampleUsage,
  // Auto-promotion
  shouldPromoteToExample,
  promoteToExample,
  approvePendingPromotion,
  rejectPendingPromotion,
  listPendingPromotions,
  // Pruning
  identifyExamplesForPruning,
  pruneExamples,
  // Stats
  getLibraryStats,
  getExampleSelectionStats,
} from './exampleSelector.js'

// ----- Retrieval Templates -----
export {
  // Template CRUD
  createRetrievalTemplate,
  getRetrievalTemplate,
  listRetrievalTemplates,
  updateRetrievalTemplate,
  deleteRetrievalTemplate,
  // Pattern extraction
  extractRetrievalTrace,
  detectPatterns,
  deriveTemplates,
  // Usage tracking
  recordTemplateUsage,
  getTemplateEffectiveness,
  // Selection
  selectBestTemplate,
  getAttenuatedSteps,
  // Maintenance
  checkRunsForTemplateDerivation,
} from './retrievalTemplates.js'

// ----- Orchestration Tuning -----
export {
  // Recommendations
  createRecommendation,
  getRecommendation,
  listRecommendations,
  updateRecommendationStatus,
  // Analysis
  analyzeBottlenecks,
  analyzeCostQuality,
  generateRecommendations,
  analyzeTemperatureTuning,
  // Maintenance
  expireOldRecommendations,
  getOptimizationSummary,
} from './orchestrationTuner.js'

// ----- Drift Response -----
export {
  // Rule management
  createRule,
  getRule,
  listRules,
  updateRule,
  deleteRule,
  // Default rules
  getDefaultRules,
  initializeDefaultRules,
  // Rule matching
  findMatchingRules,
  // Execution
  executeRule,
  processPendingAlerts,
  // Effectiveness
  updateExecutionEffectiveness,
  getRuleEffectiveness,
  getDriftResponseSummary,
} from './driftResponse.js'
