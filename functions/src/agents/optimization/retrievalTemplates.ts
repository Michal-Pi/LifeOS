/**
 * Retrieval Templates - Pattern-Based Retrieval Optimization
 *
 * Analyzes retrieval patterns from successful runs and builds reusable templates:
 * - Pattern extraction from high-quality runs
 * - Template derivation based on frequency and quality
 * - Template usage tracking and effectiveness measurement
 * - Progressive retrieval attenuation (broad early → narrow late)
 */

import { getFirestore } from 'firebase-admin/firestore'
import { v4 as uuidv4 } from 'uuid'
import type {
  RetrievalTemplate,
  RetrievalTemplateId,
  RetrievalStep,
  RetrievalTemplateDerivationRequest,
  OptimizationEvent,
} from '@lifeos/agents'
import { EvaluationPaths, TelemetryPaths } from '../shared/collectionPaths.js'
import { asId } from '@lifeos/agents'
import type { RunId } from '@lifeos/agents'

// ----- Collection Paths -----

function getTemplatesPath(userId: string): string {
  return `users/${userId}/optimization/retrievalTemplates`
}

function getTemplateUsagePath(userId: string): string {
  return `users/${userId}/optimization/templateUsage`
}

function getOptimizationEventsPath(userId: string): string {
  return `users/${userId}/optimization/events`
}

// ----- Retrieval Pattern Types -----

/**
 * A detected retrieval action from a run's trace
 */
interface DetectedRetrievalAction {
  action: RetrievalStep['action']
  queryType?: 'keyword' | 'semantic' | 'graph' | 'hybrid'
  queryTemplate?: string
  filterCriteria?: Record<string, unknown>
  expansionHops?: number
  expansionType?: 'neighbors' | 'similar' | 'related'
  durationMs: number
  resultCount?: number
}

/**
 * A retrieval trace extracted from a run
 */
interface RetrievalTrace {
  runId: RunId
  workflowType: string
  taskType?: string
  actions: DetectedRetrievalAction[]
  qualityScore: number
  contradictionClarity?: number
  synthesisNovelty?: number
}

/**
 * A candidate pattern extracted from traces
 */
interface CandidatePattern {
  steps: RetrievalStep[]
  frequency: number
  avgQuality: number
  sourceRunIds: RunId[]
  avgContradictionClarity?: number
  avgSynthesisNovelty?: number
}

/**
 * Template usage record
 */
interface TemplateUsageRecord {
  usageId: string
  templateId: RetrievalTemplateId
  runId: RunId
  workflowType: string
  qualityScore: number
  wasSuccessful: boolean
  durationMs: number
  usedAtMs: number
}

/**
 * Template effectiveness stats
 */
interface TemplateEffectiveness {
  templateId: RetrievalTemplateId
  usageCount: number
  successRate: number
  avgQualityScore: number
  avgQualityImprovement: number // vs baseline
  avgDurationMs: number
  lastUsedMs: number
}

// ----- Template CRUD -----

/**
 * Create a new retrieval template
 */
export async function createRetrievalTemplate(
  userId: string,
  data: Omit<
    RetrievalTemplate,
    'templateId' | 'createdAtMs' | 'updatedAtMs' | 'usageCount' | 'successRate'
  >
): Promise<RetrievalTemplate> {
  const db = getFirestore()
  const templateId = `tmpl_${uuidv4()}` as RetrievalTemplateId
  const now = Date.now()

  const template: RetrievalTemplate = {
    ...data,
    templateId,
    usageCount: 0,
    successRate: 0,
    createdAtMs: now,
    updatedAtMs: now,
  }

  await db.doc(`${getTemplatesPath(userId)}/${templateId}`).set(template)

  // Log optimization event
  await logOptimizationEvent(userId, {
    eventType: 'template_derived',
    description: `Created retrieval template: ${data.name}`,
    workflowType: data.workflowType,
    details: {
      templateId,
      stepCount: data.steps.length,
      sourceRunCount: data.sourceRunCount,
      avgOutputQuality: data.avgOutputQuality,
    },
    triggeredBy: 'system',
  })

  return template
}

/**
 * Get a retrieval template by ID
 */
export async function getRetrievalTemplate(
  userId: string,
  templateId: RetrievalTemplateId
): Promise<RetrievalTemplate | null> {
  const db = getFirestore()
  const doc = await db.doc(`${getTemplatesPath(userId)}/${templateId}`).get()

  if (!doc.exists) {
    return null
  }

  return doc.data() as RetrievalTemplate
}

/**
 * List retrieval templates for a workflow type
 */
export async function listRetrievalTemplates(
  userId: string,
  options: {
    workflowType?: string
    taskType?: string
    activeOnly?: boolean
    validatedOnly?: boolean
    limit?: number
  } = {}
): Promise<RetrievalTemplate[]> {
  const db = getFirestore()
  let query = db.collection(getTemplatesPath(userId)).orderBy('avgOutputQuality', 'desc')

  if (options.workflowType) {
    query = query.where('workflowType', '==', options.workflowType)
  }

  if (options.taskType) {
    query = query.where('taskType', '==', options.taskType)
  }

  if (options.activeOnly) {
    query = query.where('isActive', '==', true)
  }

  if (options.validatedOnly) {
    query = query.where('validatedByUser', '==', true)
  }

  if (options.limit) {
    query = query.limit(options.limit)
  }

  const snapshot = await query.get()
  return snapshot.docs.map((doc) => doc.data() as RetrievalTemplate)
}

/**
 * Update a retrieval template
 */
export async function updateRetrievalTemplate(
  userId: string,
  templateId: RetrievalTemplateId,
  updates: Partial<
    Pick<RetrievalTemplate, 'name' | 'description' | 'isActive' | 'validatedByUser' | 'steps'>
  >
): Promise<RetrievalTemplate | null> {
  const db = getFirestore()
  const docRef = db.doc(`${getTemplatesPath(userId)}/${templateId}`)
  const doc = await docRef.get()

  if (!doc.exists) {
    return null
  }

  const updateData = {
    ...updates,
    updatedAtMs: Date.now(),
  }

  await docRef.update(updateData)

  const updated = await docRef.get()
  return updated.data() as RetrievalTemplate
}

/**
 * Delete a retrieval template
 */
export async function deleteRetrievalTemplate(
  userId: string,
  templateId: RetrievalTemplateId
): Promise<boolean> {
  const db = getFirestore()
  const docRef = db.doc(`${getTemplatesPath(userId)}/${templateId}`)
  const doc = await docRef.get()

  if (!doc.exists) {
    return false
  }

  await docRef.delete()
  return true
}

// ----- Pattern Extraction -----

/**
 * Extract retrieval trace from a run's telemetry
 * This analyzes the run's tool calls and steps to identify retrieval actions
 */
export async function extractRetrievalTrace(
  userId: string,
  runId: RunId
): Promise<RetrievalTrace | null> {
  const db = getFirestore()

  // Get run telemetry
  const telemetryDoc = await db.doc(TelemetryPaths.run(userId, runId)).get()
  if (!telemetryDoc.exists) {
    return null
  }

  const telemetry = telemetryDoc.data()
  if (!telemetry) {
    return null
  }

  // Get evaluation results for quality scores
  const evalSnapshot = await db
    .collection(EvaluationPaths.results(userId))
    .where('runId', '==', runId)
    .limit(1)
    .get()

  const evalResult = evalSnapshot.docs[0]?.data()

  // Extract retrieval actions from steps
  const actions: DetectedRetrievalAction[] = []
  const steps = telemetry.steps || []

  for (const step of steps) {
    const action = classifyStepAsRetrievalAction(step)
    if (action) {
      actions.push(action)
    }
  }

  if (actions.length === 0) {
    return null
  }

  return {
    runId,
    workflowType: telemetry.workflowType || 'unknown',
    taskType: telemetry.taskType,
    actions,
    qualityScore: evalResult?.aggregateScore ?? telemetry.qualityScore ?? 0,
    contradictionClarity: evalResult?.criterionScores?.contradictionClarity,
    synthesisNovelty: evalResult?.criterionScores?.synthesisNovelty,
  }
}

/**
 * Classify a step as a retrieval action based on its properties
 */
function classifyStepAsRetrievalAction(step: {
  toolCalls?: Array<{ toolName: string; input?: unknown; output?: unknown }>
  agentRole?: string
  output?: string
  durationMs?: number
}): DetectedRetrievalAction | null {
  // Check tool calls for retrieval-related tools
  if (step.toolCalls) {
    for (const toolCall of step.toolCalls) {
      const action = classifyToolCallAsRetrieval(toolCall)
      if (action) {
        return {
          ...action,
          durationMs: step.durationMs || 0,
        }
      }
    }
  }

  // Check agent role for retrieval-related agents
  if (step.agentRole) {
    const action = classifyAgentRoleAsRetrieval(step.agentRole, step.output)
    if (action) {
      return {
        ...action,
        durationMs: step.durationMs || 0,
      }
    }
  }

  return null
}

/**
 * Classify a tool call as a retrieval action
 */
function classifyToolCallAsRetrieval(toolCall: {
  toolName: string
  input?: unknown
  output?: unknown
}): Omit<DetectedRetrievalAction, 'durationMs'> | null {
  const { toolName, input, output } = toolCall
  const inputObj = input as Record<string, unknown> | undefined
  const outputObj = output as Record<string, unknown> | undefined

  // Knowledge graph queries
  if (toolName === 'queryKnowledgeGraph' || toolName === 'query_knowledge_graph') {
    return {
      action: 'QUERY',
      queryType: (inputObj?.queryType as 'keyword' | 'semantic' | 'graph' | 'hybrid') || 'semantic',
      queryTemplate: inputObj?.query as string | undefined,
      resultCount: Array.isArray(outputObj?.results) ? outputObj.results.length : undefined,
    }
  }

  // Document retrieval
  if (
    toolName === 'retrieveDocuments' ||
    toolName === 'retrieve_documents' ||
    toolName === 'searchNotes'
  ) {
    return {
      action: 'RETRIEVE',
      queryType: 'semantic',
      queryTemplate: inputObj?.query as string | undefined,
      resultCount: Array.isArray(outputObj?.documents) ? outputObj.documents.length : undefined,
    }
  }

  // Graph expansion
  if (
    toolName === 'expandNode' ||
    toolName === 'expand_node' ||
    toolName === 'getRelatedConcepts'
  ) {
    return {
      action: 'EXPAND',
      expansionType:
        (inputObj?.expansionType as 'neighbors' | 'similar' | 'related') || 'neighbors',
      expansionHops: (inputObj?.hops as number) || 1,
      resultCount: Array.isArray(outputObj?.nodes) ? outputObj.nodes.length : undefined,
    }
  }

  // Filtering
  if (toolName === 'filterResults' || toolName === 'filter_results') {
    return {
      action: 'FILTER',
      filterCriteria: inputObj?.criteria as Record<string, unknown> | undefined,
      resultCount: Array.isArray(outputObj?.filtered) ? outputObj.filtered.length : undefined,
    }
  }

  return null
}

/**
 * Classify an agent role as a retrieval action
 */
function classifyAgentRoleAsRetrieval(
  agentRole: string,
  output?: string
): Omit<DetectedRetrievalAction, 'durationMs'> | null {
  const role = agentRole.toLowerCase()

  if (role.includes('retrieval') || role.includes('search')) {
    // Try to infer action from output
    if (output?.includes('THINK:') || output?.includes('thinking')) {
      return { action: 'THINK' }
    }
    if (output?.includes('QUERY:') || output?.includes('querying')) {
      return { action: 'QUERY', queryType: 'semantic' }
    }
    if (output?.includes('RETRIEVE:') || output?.includes('retrieving')) {
      return { action: 'RETRIEVE' }
    }
    if (output?.includes('TERMINATE') || output?.includes('done')) {
      return { action: 'TERMINATE' }
    }

    // Default to RETRIEVE if we can't classify
    return { action: 'RETRIEVE' }
  }

  return null
}

// ----- Pattern Detection -----

/**
 * Detect patterns in a set of retrieval traces
 * Returns candidate patterns sorted by quality and frequency
 */
export function detectPatterns(
  traces: RetrievalTrace[],
  options: {
    minFrequency: number
    maxSteps: number
    minQuality: number
  }
): CandidatePattern[] {
  // Group traces by action sequence (simplified fingerprint)
  const sequenceMap = new Map<string, RetrievalTrace[]>()

  for (const trace of traces) {
    if (trace.qualityScore < options.minQuality) {
      continue
    }

    // Create a fingerprint of the action sequence
    const fingerprint = trace.actions
      .slice(0, options.maxSteps)
      .map((a) => a.action)
      .join('->')

    const existing = sequenceMap.get(fingerprint) || []
    existing.push(trace)
    sequenceMap.set(fingerprint, existing)
  }

  // Convert to candidate patterns
  const candidates: CandidatePattern[] = []

  for (const [_fingerprint, matchingTraces] of sequenceMap) {
    if (matchingTraces.length < options.minFrequency) {
      continue
    }

    // Aggregate the pattern from matching traces
    const aggregatedSteps = aggregateSteps(matchingTraces, options.maxSteps)
    const avgQuality =
      matchingTraces.reduce((sum, t) => sum + t.qualityScore, 0) / matchingTraces.length

    // Calculate optional metrics
    const tracesWithClarity = matchingTraces.filter((t) => t.contradictionClarity !== undefined)
    const avgContradictionClarity =
      tracesWithClarity.length > 0
        ? tracesWithClarity.reduce((sum, t) => sum + (t.contradictionClarity || 0), 0) /
          tracesWithClarity.length
        : undefined

    const tracesWithNovelty = matchingTraces.filter((t) => t.synthesisNovelty !== undefined)
    const avgSynthesisNovelty =
      tracesWithNovelty.length > 0
        ? tracesWithNovelty.reduce((sum, t) => sum + (t.synthesisNovelty || 0), 0) /
          tracesWithNovelty.length
        : undefined

    candidates.push({
      steps: aggregatedSteps,
      frequency: matchingTraces.length,
      avgQuality,
      sourceRunIds: matchingTraces.map((t) => t.runId),
      avgContradictionClarity,
      avgSynthesisNovelty,
    })
  }

  // Sort by quality * frequency (balances both factors)
  candidates.sort((a, b) => b.avgQuality * b.frequency - a.avgQuality * a.frequency)

  return candidates
}

/**
 * Aggregate steps from multiple traces into a template
 */
function aggregateSteps(traces: RetrievalTrace[], maxSteps: number): RetrievalStep[] {
  const steps: RetrievalStep[] = []

  // Use the first trace as the base pattern
  const baseTrace = traces[0]
  const baseActions = baseTrace.actions.slice(0, maxSteps)

  for (let i = 0; i < baseActions.length; i++) {
    const baseAction = baseActions[i]

    // Aggregate duration across all traces
    const durations = traces
      .map((t) => t.actions[i]?.durationMs)
      .filter((d): d is number => d !== undefined)

    const avgDuration =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : undefined

    // For QUERY actions, try to find common query patterns
    let queryTemplate: string | undefined
    if (baseAction.action === 'QUERY') {
      const queryTemplates = traces
        .map((t) => t.actions[i]?.queryTemplate)
        .filter((q): q is string => q !== undefined)

      // Use the most common template or generalize
      queryTemplate = findCommonTemplate(queryTemplates)
    }

    steps.push({
      stepIndex: i,
      action: baseAction.action,
      queryType: baseAction.queryType,
      queryTemplate: queryTemplate || baseAction.queryTemplate,
      filterCriteria: baseAction.filterCriteria,
      expansionHops: baseAction.expansionHops,
      expansionType: baseAction.expansionType,
      avgDurationMs: avgDuration,
    })
  }

  return steps
}

/**
 * Find a common template from a set of query strings
 * Returns the most frequent one or a generalized pattern
 */
function findCommonTemplate(queries: string[]): string | undefined {
  if (queries.length === 0) {
    return undefined
  }

  // Count frequency of each query
  const frequency = new Map<string, number>()
  for (const query of queries) {
    frequency.set(query, (frequency.get(query) || 0) + 1)
  }

  // Find the most common
  let mostCommon: string | undefined
  let maxCount = 0

  for (const [query, count] of frequency) {
    if (count > maxCount) {
      mostCommon = query
      maxCount = count
    }
  }

  // If most common appears in less than 50% of cases, generalize
  if (maxCount < queries.length * 0.5) {
    return '[VARIABLE_QUERY]'
  }

  return mostCommon
}

// ----- Template Derivation -----

/**
 * Derive retrieval templates from a set of runs
 */
export async function deriveTemplates(
  request: RetrievalTemplateDerivationRequest
): Promise<RetrievalTemplate[]> {
  const {
    userId,
    workflowType,
    taskType,
    runIds,
    minQualityThreshold,
    minPatternFrequency,
    maxSteps,
  } = request

  // Extract traces from runs
  const traces: RetrievalTrace[] = []

  for (const runId of runIds) {
    const trace = await extractRetrievalTrace(userId, runId)
    if (trace && trace.qualityScore >= minQualityThreshold) {
      traces.push(trace)
    }
  }

  if (traces.length < minPatternFrequency) {
    return [] // Not enough high-quality traces
  }

  // Detect patterns
  const patterns = detectPatterns(traces, {
    minFrequency: minPatternFrequency,
    maxSteps,
    minQuality: minQualityThreshold,
  })

  if (patterns.length === 0) {
    return []
  }

  // Create templates from top patterns (up to 3)
  const templates: RetrievalTemplate[] = []

  for (let i = 0; i < Math.min(patterns.length, 3); i++) {
    const pattern = patterns[i]

    const template = await createRetrievalTemplate(userId, {
      userId,
      name: generateTemplateName(workflowType, taskType, i + 1),
      description: generateTemplateDescription(pattern),
      workflowType,
      taskType,
      steps: pattern.steps,
      avgStepCount: pattern.steps.length,
      avgOutputQuality: pattern.avgQuality,
      avgContradictionClarity: pattern.avgContradictionClarity,
      avgSynthesisNovelty: pattern.avgSynthesisNovelty,
      sourceRunIds: pattern.sourceRunIds,
      sourceRunCount: pattern.sourceRunIds.length,
      isActive: true,
      validatedByUser: false, // Requires user validation
    })

    templates.push(template)
  }

  return templates
}

/**
 * Generate a template name
 */
function generateTemplateName(
  workflowType: string,
  taskType: string | undefined,
  rank: number
): string {
  const prefix = taskType || workflowType
  return `${prefix}_retrieval_pattern_${rank}`
}

/**
 * Generate a template description from a pattern
 */
function generateTemplateDescription(pattern: CandidatePattern): string {
  const actionSummary = pattern.steps.map((s) => s.action).join(' → ')
  return `Retrieval pattern: ${actionSummary}. Derived from ${pattern.sourceRunIds.length} runs with avg quality ${pattern.avgQuality.toFixed(2)}.`
}

// ----- Template Usage Tracking -----

/**
 * Record template usage for a run
 */
export async function recordTemplateUsage(
  userId: string,
  templateId: RetrievalTemplateId,
  runId: RunId,
  result: {
    workflowType: string
    qualityScore: number
    wasSuccessful: boolean
    durationMs: number
  }
): Promise<void> {
  const db = getFirestore()
  const usageId = `usage_${uuidv4()}`

  const record: TemplateUsageRecord = {
    usageId,
    templateId,
    runId,
    workflowType: result.workflowType,
    qualityScore: result.qualityScore,
    wasSuccessful: result.wasSuccessful,
    durationMs: result.durationMs,
    usedAtMs: Date.now(),
  }

  await db.doc(`${getTemplateUsagePath(userId)}/${usageId}`).set(record)

  // Update template statistics
  await updateTemplateStats(userId, templateId, result)
}

/**
 * Update template statistics after usage
 */
async function updateTemplateStats(
  userId: string,
  templateId: RetrievalTemplateId,
  result: { qualityScore: number; wasSuccessful: boolean }
): Promise<void> {
  const db = getFirestore()
  const templateRef = db.doc(`${getTemplatesPath(userId)}/${templateId}`)

  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(templateRef)
    if (!doc.exists) {
      return
    }

    const template = doc.data() as RetrievalTemplate
    const newUsageCount = template.usageCount + 1
    const successCount = template.successRate * template.usageCount + (result.wasSuccessful ? 1 : 0)
    const newSuccessRate = successCount / newUsageCount

    // Update running average of improvement
    const currentAvgQuality = template.avgOutputQuality || 0
    const newAvgQuality =
      (currentAvgQuality * template.usageCount + result.qualityScore) / newUsageCount

    transaction.update(templateRef, {
      usageCount: newUsageCount,
      successRate: newSuccessRate,
      avgOutputQuality: newAvgQuality,
      updatedAtMs: Date.now(),
    })
  })
}

/**
 * Get template effectiveness statistics
 */
export async function getTemplateEffectiveness(
  userId: string,
  templateId: RetrievalTemplateId
): Promise<TemplateEffectiveness | null> {
  const db = getFirestore()

  // Get template
  const template = await getRetrievalTemplate(userId, templateId)
  if (!template) {
    return null
  }

  // Get recent usage records for detailed stats
  const usageSnapshot = await db
    .collection(getTemplateUsagePath(userId))
    .where('templateId', '==', templateId)
    .orderBy('usedAtMs', 'desc')
    .limit(100)
    .get()

  const usages = usageSnapshot.docs.map((doc) => doc.data() as TemplateUsageRecord)

  if (usages.length === 0) {
    return {
      templateId,
      usageCount: 0,
      successRate: 0,
      avgQualityScore: 0,
      avgQualityImprovement: 0,
      avgDurationMs: 0,
      lastUsedMs: 0,
    }
  }

  const avgQuality = usages.reduce((sum, u) => sum + u.qualityScore, 0) / usages.length
  const avgDuration = usages.reduce((sum, u) => sum + u.durationMs, 0) / usages.length

  // Calculate improvement over baseline (requires baseline data)
  // For now, use template's original avg as baseline
  const avgImprovement = avgQuality - (template.avgOutputQuality || avgQuality)

  return {
    templateId,
    usageCount: template.usageCount,
    successRate: template.successRate,
    avgQualityScore: avgQuality,
    avgQualityImprovement: avgImprovement,
    avgDurationMs: avgDuration,
    lastUsedMs: usages[0].usedAtMs,
  }
}

// ----- Template Selection -----

/**
 * Select the best template for a given context
 */
export async function selectBestTemplate(
  userId: string,
  context: {
    workflowType: string
    taskType?: string
    preferValidated?: boolean
  }
): Promise<RetrievalTemplate | null> {
  const templates = await listRetrievalTemplates(userId, {
    workflowType: context.workflowType,
    taskType: context.taskType,
    activeOnly: true,
    validatedOnly: context.preferValidated,
    limit: 10,
  })

  if (templates.length === 0) {
    // Try without task type filter
    if (context.taskType) {
      return selectBestTemplate(userId, {
        ...context,
        taskType: undefined,
      })
    }
    return null
  }

  // Score templates by (quality * successRate * log(usageCount + 1))
  // This balances quality, reliability, and experience
  let bestTemplate: RetrievalTemplate | null = null
  let bestScore = -1

  for (const template of templates) {
    const experienceFactor = Math.log(template.usageCount + 1) + 1
    const score = template.avgOutputQuality * template.successRate * experienceFactor

    if (score > bestScore) {
      bestScore = score
      bestTemplate = template
    }
  }

  return bestTemplate
}

/**
 * Get retrieval steps from a template with attenuation
 * Progressive retrieval: broad early → narrow late
 */
export function getAttenuatedSteps(
  template: RetrievalTemplate,
  options: {
    currentCycle: number
    maxCycles: number
    attenuationFactor?: number // 0-1, default 0.3
  }
): RetrievalStep[] {
  const { currentCycle, maxCycles, attenuationFactor = 0.3 } = options

  // Calculate attenuation based on cycle progress
  // Early cycles: broad retrieval (more steps)
  // Late cycles: narrow retrieval (fewer steps)
  const progress = currentCycle / maxCycles
  const stepReduction = Math.floor(template.steps.length * progress * attenuationFactor)
  const targetStepCount = Math.max(2, template.steps.length - stepReduction)

  // Keep essential steps (THINK, QUERY/RETRIEVE, TERMINATE)
  const essentialActions: RetrievalStep['action'][] = ['THINK', 'QUERY', 'RETRIEVE', 'TERMINATE']
  const essentialSteps = template.steps.filter((s) => essentialActions.includes(s.action))
  const optionalSteps = template.steps.filter((s) => !essentialActions.includes(s.action))

  // Always include essential steps, then add optional steps up to target
  if (essentialSteps.length >= targetStepCount) {
    return essentialSteps.slice(0, targetStepCount)
  }

  const remainingSlots = targetStepCount - essentialSteps.length
  const selectedOptional = optionalSteps.slice(0, remainingSlots)

  // Merge and sort by original step index
  const allSteps = [...essentialSteps, ...selectedOptional]
  allSteps.sort((a, b) => a.stepIndex - b.stepIndex)

  // Renumber step indices
  return allSteps.map((step, idx) => ({
    ...step,
    stepIndex: idx,
  }))
}

// ----- Utility Functions -----

/**
 * Log an optimization event
 */
async function logOptimizationEvent(
  userId: string,
  event: Omit<OptimizationEvent, 'eventId' | 'userId' | 'createdAtMs'>
): Promise<void> {
  const db = getFirestore()
  const eventId = `evt_${uuidv4()}`

  const fullEvent: OptimizationEvent = {
    ...event,
    eventId: asId<'optimizationEvent'>(eventId),
    userId,
    createdAtMs: Date.now(),
  }

  await db.doc(`${getOptimizationEventsPath(userId)}/${eventId}`).set(fullEvent)
}

/**
 * Periodically check for runs that could contribute to templates
 */
export async function checkRunsForTemplateDerivation(
  userId: string,
  options: {
    workflowType: string
    minRunsForDerivation?: number
    minQualityThreshold?: number
    lookbackDays?: number
  }
): Promise<{ shouldDerive: boolean; candidateRunIds: RunId[] }> {
  const db = getFirestore()
  const {
    workflowType,
    minRunsForDerivation = 10,
    minQualityThreshold = 0.7,
    lookbackDays = 30,
  } = options

  const cutoffMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000

  // Find high-quality runs without template usage
  const runsSnapshot = await db
    .collection(TelemetryPaths.runs(userId))
    .where('workflowType', '==', workflowType)
    .where('qualityScore', '>=', minQualityThreshold)
    .where('createdAtMs', '>=', cutoffMs)
    .orderBy('createdAtMs', 'desc')
    .limit(100)
    .get()

  const candidateRunIds = runsSnapshot.docs.map((doc) => doc.id as RunId)

  // Check if we have enough runs and no existing templates
  const existingTemplates = await listRetrievalTemplates(userId, {
    workflowType,
    activeOnly: true,
    limit: 1,
  })

  const shouldDerive =
    candidateRunIds.length >= minRunsForDerivation && existingTemplates.length === 0

  return {
    shouldDerive,
    candidateRunIds,
  }
}
