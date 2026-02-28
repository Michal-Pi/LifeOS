/**
 * Deep Research Pipeline
 *
 * Budget-aware research workflow that:
 * - Searches web + academic + semantic sources
 * - Extracts atomic claims into a KnowledgeHypergraph
 * - Runs dialectical reasoning on extracted evidence
 * - Identifies knowledge gaps and loops for more sources
 * - Produces structured answers with full source traceability
 */

export {
  createRunBudget,
  getBudgetPhase,
  recordSpend,
  canAffordOperation,
  estimateLLMCost,
  getMaxSourcesForPhase,
  getRelevanceThreshold,
  shouldContinueGapLoop,
  recordGapIteration,
  estimateRemainingOperations,
} from './budgetController.js'
export { executeSearchPlan, ingestSources, chunkDocument } from './sourceIngestion.js'
export {
  extractClaimsFromSource,
  mapClaimsToKG,
  type ProviderExecuteFn,
} from './claimExtraction.js'
export { analyzeKnowledgeGaps } from './gapAnalysis.js'
export { generateAnswer } from './answerGeneration.js'
