/**
 * Trajectory & Efficiency Evaluation
 *
 * Evaluates how efficiently an agent reached its goal.
 * Tracks patterns like loops, backtracks, and wasted steps.
 */

import { getFirestore } from 'firebase-admin/firestore'
import type {
  TrajectoryEval,
  TrajectoryEvalId,
  TrajectoryPattern,
  TrajectoryPatternId,
  TrajectoryPatternType,
  DerivedTestCase,
  DerivedTestCaseId,
  RegressionTestResult,
  StepTelemetry,
} from '@lifeos/agents'
import type { RunId } from '@lifeos/agents'
import { randomUUID, createHash } from 'crypto'
import { getTelemetryByRunId } from '../telemetry/runTelemetry.js'

// ----- Collection Paths -----

const EVALUATION_COLLECTION = 'evaluation'
const TRAJECTORY_EVALS_SUBCOLLECTION = 'trajectoryEvals'
const TRAJECTORY_PATTERNS_SUBCOLLECTION = 'trajectoryPatterns'
const TEST_CASES_SUBCOLLECTION = 'testCases'
const REGRESSION_RESULTS_SUBCOLLECTION = 'regressionResults'

function getTrajectoryEvalsPath(userId: string): string {
  return `users/${userId}/${EVALUATION_COLLECTION}/${TRAJECTORY_EVALS_SUBCOLLECTION}`
}

function getTrajectoryPatternsPath(userId: string): string {
  return `users/${userId}/${EVALUATION_COLLECTION}/${TRAJECTORY_PATTERNS_SUBCOLLECTION}`
}

function getTestCasesPath(userId: string): string {
  return `users/${userId}/${EVALUATION_COLLECTION}/${TEST_CASES_SUBCOLLECTION}`
}

function getRegressionResultsPath(userId: string): string {
  return `users/${userId}/${EVALUATION_COLLECTION}/${REGRESSION_RESULTS_SUBCOLLECTION}`
}

// ----- Pattern Detection -----

/**
 * Detect loops in step sequence
 */
function detectLoops(steps: StepTelemetry[]): number {
  if (steps.length < 3) return 0

  let loopCount = 0
  const agentSequence = steps.map((s) => s.agentId)

  // Detect repeated subsequences
  for (let windowSize = 2; windowSize <= Math.floor(steps.length / 2); windowSize++) {
    for (let i = 0; i <= steps.length - windowSize * 2; i++) {
      const pattern = agentSequence.slice(i, i + windowSize).join(',')
      const nextPattern = agentSequence.slice(i + windowSize, i + windowSize * 2).join(',')
      if (pattern === nextPattern) {
        loopCount++
      }
    }
  }

  return loopCount
}

/**
 * Detect backtracking (returning to previous state)
 */
function detectBacktracks(steps: StepTelemetry[]): number {
  let backtrackCount = 0

  for (let i = 2; i < steps.length; i++) {
    // Simple heuristic: if we return to an agent we already visited
    // after visiting a different agent, it might be a backtrack
    const current = steps[i].agentId
    const previous = steps[i - 1].agentId
    const beforePrevious = steps[i - 2].agentId

    if (current === beforePrevious && current !== previous) {
      backtrackCount++
    }
  }

  return backtrackCount
}

/**
 * Detect redundant steps (steps with no apparent progress)
 */
function detectRedundantSteps(steps: StepTelemetry[]): number {
  let redundantCount = 0

  // Heuristic: steps that produced very little output or had no tool calls
  // might be redundant
  for (const step of steps) {
    if (step.outputLength < 50 && step.toolCallCount === 0) {
      redundantCount++
    }
  }

  return redundantCount
}

/**
 * Compute convergence score
 */
function computeConvergenceScore(actualSteps: number, optimalSteps?: number): number {
  if (!optimalSteps || optimalSteps <= 0) {
    // If we don't have optimal, use heuristic: less than 5 steps is good
    return actualSteps <= 5 ? 1 : Math.max(0, 1 - (actualSteps - 5) / 10)
  }

  return Math.min(1, optimalSteps / actualSteps)
}

/**
 * Detect trajectory patterns
 */
function detectPatterns(
  steps: StepTelemetry[],
  loopCount: number,
  backtrackCount: number,
  redundantSteps: number,
  success: boolean
): TrajectoryPatternType[] {
  const patterns: TrajectoryPatternType[] = []

  if (loopCount > 0) patterns.push('loop')
  if (backtrackCount > 0) patterns.push('backtrack')
  if (redundantSteps > steps.length * 0.3) patterns.push('redundant')

  // Check for optimal trajectory (no issues, success, short path)
  if (
    loopCount === 0 &&
    backtrackCount === 0 &&
    redundantSteps === 0 &&
    success &&
    steps.length <= 5
  ) {
    patterns.push('optimal')
  }

  // Check for inefficient trajectory
  if (steps.length > 10 || loopCount + backtrackCount + redundantSteps > steps.length * 0.4) {
    patterns.push('inefficient')
  }

  // Check for dead ends (failure without resolution attempts)
  if (!success && steps.length > 0) {
    const lastSteps = steps.slice(-3)
    const hasRetries = lastSteps.some((s) => s.toolCallCount > 0)
    if (!hasRetries) {
      patterns.push('dead_end')
    }
  }

  return patterns
}

// ----- Trajectory Evaluation -----

/**
 * Evaluate trajectory for a run
 */
export async function evaluateTrajectory(
  userId: string,
  runId: RunId,
  qualityScore: number,
  success: boolean,
  optimalSteps?: number
): Promise<TrajectoryEval> {
  const db = getFirestore()
  const evalId = randomUUID() as TrajectoryEvalId

  // Get telemetry for the run
  const telemetry = await getTelemetryByRunId(userId, runId)

  if (!telemetry) {
    throw new Error(`Telemetry not found for run ${runId}`)
  }

  const steps = telemetry.steps
  const totalSteps = steps.length

  // Detect patterns
  const loopCount = detectLoops(steps)
  const backtrackCount = detectBacktracks(steps)
  const redundantSteps = detectRedundantSteps(steps)

  // Count tool retries
  const toolRetryCount = steps.reduce((sum, step) => {
    // Heuristic: if same tool is called multiple times in same step, it's a retry
    return sum + Math.max(0, step.toolCallCount - 1)
  }, 0)

  // Compute efficiency metrics
  const convergenceScore = computeConvergenceScore(totalSteps, optimalSteps)
  const tokensPerStep = telemetry.totalTokens / Math.max(1, totalSteps)
  const costPerStep = telemetry.estimatedCost / Math.max(1, totalSteps)
  const tokenEfficiency = (qualityScore / Math.max(1, telemetry.totalTokens)) * 1000 // Per 1000 tokens
  const costEfficiency = qualityScore / Math.max(0.001, telemetry.estimatedCost)

  // Time metrics
  const stepLatencies = steps.map((s) => s.durationMs)
  const avgStepLatencyMs =
    stepLatencies.length > 0 ? stepLatencies.reduce((a, b) => a + b, 0) / stepLatencies.length : 0
  const longestStepMs = Math.max(0, ...stepLatencies)
  const longestStepIndex = stepLatencies.indexOf(longestStepMs)

  // Parallelization (would need workflow topology info to calculate properly)
  const parallelizationRatio = 0 // Placeholder - would need graph info

  // Detect patterns
  const patternsDetected = detectPatterns(steps, loopCount, backtrackCount, redundantSteps, success)

  const trajectoryEval: TrajectoryEval = {
    evalId,
    runId,
    userId,
    workflowType: telemetry.workflowType,
    totalSteps,
    optimalSteps,
    convergenceScore,
    redundantSteps,
    backtrackCount,
    toolRetryCount,
    loopCount,
    tokensPerStep,
    costPerStep,
    tokenEfficiency,
    costEfficiency,
    avgStepLatencyMs,
    longestStepMs,
    longestStepIndex,
    parallelizationRatio,
    qualityScore,
    success,
    patternsDetected,
    createdAtMs: Date.now(),
  }

  await db.doc(`${getTrajectoryEvalsPath(userId)}/${evalId}`).set(trajectoryEval)

  return trajectoryEval
}

/**
 * Get trajectory eval for a run
 */
export async function getTrajectoryEvalByRun(
  userId: string,
  runId: RunId
): Promise<TrajectoryEval | null> {
  const db = getFirestore()
  const snapshot = await db
    .collection(getTrajectoryEvalsPath(userId))
    .where('runId', '==', runId)
    .limit(1)
    .get()

  if (snapshot.empty) return null
  return snapshot.docs[0].data() as TrajectoryEval
}

/**
 * List trajectory evals with filters
 */
export async function listTrajectoryEvals(
  userId: string,
  filters?: {
    workflowType?: string
    patternType?: TrajectoryPatternType
    minConvergence?: number
    maxConvergence?: number
    startAfterMs?: number
  },
  limit: number = 100
): Promise<TrajectoryEval[]> {
  const db = getFirestore()
  let query: FirebaseFirestore.Query = db.collection(getTrajectoryEvalsPath(userId))

  if (filters?.workflowType) {
    query = query.where('workflowType', '==', filters.workflowType)
  }

  if (filters?.startAfterMs) {
    query = query.where('createdAtMs', '>=', filters.startAfterMs)
  }

  query = query.orderBy('createdAtMs', 'desc').limit(limit)

  const snapshot = await query.get()
  let evals = snapshot.docs.map((doc) => doc.data() as TrajectoryEval)

  // Post-filter for array contains and numeric ranges
  if (filters?.patternType) {
    evals = evals.filter((e) => e.patternsDetected.includes(filters.patternType!))
  }

  if (filters?.minConvergence !== undefined) {
    evals = evals.filter((e) => e.convergenceScore >= filters.minConvergence!)
  }

  if (filters?.maxConvergence !== undefined) {
    evals = evals.filter((e) => e.convergenceScore <= filters.maxConvergence!)
  }

  return evals
}

/**
 * Get trajectory statistics
 */
export async function getTrajectoryStats(
  userId: string,
  workflowType: string,
  windowDays: number = 30
): Promise<{
  totalRuns: number
  avgConvergence: number
  avgSteps: number
  avgRedundantSteps: number
  avgLoops: number
  avgBacktracks: number
  patternDistribution: Record<TrajectoryPatternType, number>
  avgTokenEfficiency: number
  avgCostEfficiency: number
}> {
  const windowStartMs = Date.now() - windowDays * 24 * 60 * 60 * 1000
  const evals = await listTrajectoryEvals(
    userId,
    { workflowType, startAfterMs: windowStartMs },
    1000
  )

  if (evals.length === 0) {
    return {
      totalRuns: 0,
      avgConvergence: 0,
      avgSteps: 0,
      avgRedundantSteps: 0,
      avgLoops: 0,
      avgBacktracks: 0,
      patternDistribution: {} as Record<TrajectoryPatternType, number>,
      avgTokenEfficiency: 0,
      avgCostEfficiency: 0,
    }
  }

  const patternDistribution: Record<TrajectoryPatternType, number> = {
    loop: 0,
    backtrack: 0,
    dead_end: 0,
    optimal: 0,
    inefficient: 0,
    redundant: 0,
  }

  let totalConvergence = 0
  let totalSteps = 0
  let totalRedundant = 0
  let totalLoops = 0
  let totalBacktracks = 0
  let totalTokenEfficiency = 0
  let totalCostEfficiency = 0

  for (const evalResult of evals) {
    totalConvergence += evalResult.convergenceScore
    totalSteps += evalResult.totalSteps
    totalRedundant += evalResult.redundantSteps
    totalLoops += evalResult.loopCount
    totalBacktracks += evalResult.backtrackCount
    totalTokenEfficiency += evalResult.tokenEfficiency
    totalCostEfficiency += evalResult.costEfficiency

    for (const pattern of evalResult.patternsDetected) {
      patternDistribution[pattern]++
    }
  }

  return {
    totalRuns: evals.length,
    avgConvergence: totalConvergence / evals.length,
    avgSteps: totalSteps / evals.length,
    avgRedundantSteps: totalRedundant / evals.length,
    avgLoops: totalLoops / evals.length,
    avgBacktracks: totalBacktracks / evals.length,
    patternDistribution,
    avgTokenEfficiency: totalTokenEfficiency / evals.length,
    avgCostEfficiency: totalCostEfficiency / evals.length,
  }
}

// ----- Pattern Analysis -----

/**
 * Analyze and record trajectory patterns
 */
export async function analyzeTrajectoryPatterns(
  userId: string,
  workflowType: string,
  windowDays: number = 30
): Promise<TrajectoryPattern[]> {
  const db = getFirestore()
  const windowStartMs = Date.now() - windowDays * 24 * 60 * 60 * 1000
  const windowEndMs = Date.now()

  const evals = await listTrajectoryEvals(
    userId,
    { workflowType, startAfterMs: windowStartMs },
    1000
  )

  // Group by pattern type
  const patternGroups = new Map<TrajectoryPatternType, TrajectoryEval[]>()

  for (const evalResult of evals) {
    for (const pattern of evalResult.patternsDetected) {
      if (!patternGroups.has(pattern)) {
        patternGroups.set(pattern, [])
      }
      patternGroups.get(pattern)!.push(evalResult)
    }
  }

  const patterns: TrajectoryPattern[] = []

  for (const [patternType, patternEvals] of patternGroups) {
    const patternId = randomUUID() as TrajectoryPatternId

    // Calculate impact on quality
    const qualityScores = patternEvals.map((e) => e.qualityScore)
    const allQualityScores = evals.map((e) => e.qualityScore)

    const patternAvgQuality = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
    const overallAvgQuality = allQualityScores.reduce((a, b) => a + b, 0) / allQualityScores.length
    const impactOnQuality = patternAvgQuality - overallAvgQuality

    // Calculate extra steps
    const patternSteps = patternEvals.map((e) => e.totalSteps)
    const allSteps = evals.map((e) => e.totalSteps)
    const avgExtraSteps =
      patternSteps.reduce((a, b) => a + b, 0) / patternSteps.length -
      allSteps.reduce((a, b) => a + b, 0) / allSteps.length

    // Generate recommendations
    const recommendations = generatePatternRecommendations(patternType)

    const pattern: TrajectoryPattern = {
      patternId,
      userId,
      workflowType,
      patternType,
      description: getPatternDescription(patternType),
      signature: `${patternType}:${workflowType}`,
      frequency: patternEvals.length,
      avgImpactOnQuality: impactOnQuality,
      avgExtraSteps,
      exampleRunIds: patternEvals.slice(0, 5).map((e) => e.runId),
      exampleCount: Math.min(5, patternEvals.length),
      recommendations,
      windowStartMs,
      windowEndMs,
      computedAtMs: Date.now(),
    }

    await db.doc(`${getTrajectoryPatternsPath(userId)}/${patternId}`).set(pattern)
    patterns.push(pattern)
  }

  return patterns
}

function getPatternDescription(patternType: TrajectoryPatternType): string {
  switch (patternType) {
    case 'loop':
      return 'Agent entered a loop, repeating the same sequence of steps'
    case 'backtrack':
      return 'Agent backtracked to a previous state'
    case 'dead_end':
      return 'Agent reached a dead end without resolution attempts'
    case 'optimal':
      return 'Agent took an optimal path to the solution'
    case 'inefficient':
      return 'Agent took significantly more steps than necessary'
    case 'redundant':
      return 'Agent had multiple steps that produced no progress'
    default:
      return 'Unknown pattern'
  }
}

function generatePatternRecommendations(patternType: TrajectoryPatternType): string[] {
  switch (patternType) {
    case 'loop':
      return [
        'Add loop detection and breaking logic to the workflow',
        'Review router conditions for circular dependencies',
        'Consider adding a maximum iteration limit',
      ]
    case 'backtrack':
      return [
        'Improve initial routing decisions to avoid backtracks',
        'Add checkpointing to resume from good states',
        'Review if backtracking indicates unclear requirements',
      ]
    case 'dead_end':
      return [
        'Add fallback options when primary paths fail',
        'Improve error handling and recovery',
        'Consider adding alternative tool options',
      ]
    case 'inefficient':
      return [
        'Optimize the workflow graph structure',
        'Consider parallelizing independent steps',
        'Review if intermediate steps can be eliminated',
      ]
    case 'redundant':
      return [
        'Review steps that produce minimal output',
        'Consider combining related steps',
        'Add early termination for empty results',
      ]
    case 'optimal':
      return [
        'This pattern is desirable - no changes needed',
        'Consider using this as a reference for other workflows',
      ]
    default:
      return []
  }
}

// ----- Test Case Derivation -----

/**
 * Derive a test case from a successful run
 */
export async function deriveTestCase(
  userId: string,
  runId: RunId,
  input: string,
  expectedOutput: string,
  description?: string,
  tags?: string[]
): Promise<DerivedTestCase> {
  const db = getFirestore()
  const testCaseId = randomUUID() as DerivedTestCaseId

  // Get telemetry for the run (trajectory eval is optional context)
  const telemetry = await getTelemetryByRunId(userId, runId)
  // Note: trajectoryEval could be used for more context in future
  const _trajectoryEval = await getTrajectoryEvalByRun(userId, runId)

  if (!telemetry) {
    throw new Error(`Telemetry not found for run ${runId}`)
  }

  // Extract expected tool calls from telemetry
  const expectedToolCalls = telemetry.steps
    .filter((s) => s.toolCallCount > 0)
    .flatMap((s) => s.toolCallIds || [])

  const testCase: DerivedTestCase = {
    testCaseId,
    sourceRunId: runId,
    userId,
    workflowType: telemetry.workflowType,
    input,
    expectedOutput,
    expectedOutputHash: hashContent(expectedOutput),
    expectedSteps: telemetry.stepCount,
    expectedToolCalls,
    minQualityScore: telemetry.qualityScore || 0.7,
    maxSteps: Math.ceil(telemetry.stepCount * 1.5), // Allow 50% more steps
    maxCost: telemetry.estimatedCost * 2, // Allow 2x cost
    maxDurationMs: telemetry.durationMs * 2,
    derivedFromLabel: false, // Would be set to true if from human-labeled run
    sourceQualityScore: telemetry.qualityScore || 0,
    description,
    tags,
    passCount: 0,
    failCount: 0,
    isActive: true,
    isGolden: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
  }

  await db.doc(`${getTestCasesPath(userId)}/${testCaseId}`).set(testCase)

  return testCase
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

/**
 * Get a test case by ID
 */
export async function getTestCase(
  userId: string,
  testCaseId: DerivedTestCaseId
): Promise<DerivedTestCase | null> {
  const db = getFirestore()
  const doc = await db.doc(`${getTestCasesPath(userId)}/${testCaseId}`).get()

  if (!doc.exists) return null
  return doc.data() as DerivedTestCase
}

/**
 * List test cases
 */
export async function listTestCases(
  userId: string,
  filters?: {
    workflowType?: string
    isActive?: boolean
    isGolden?: boolean
    tag?: string
  },
  limit: number = 100
): Promise<DerivedTestCase[]> {
  const db = getFirestore()
  let query: FirebaseFirestore.Query = db.collection(getTestCasesPath(userId))

  if (filters?.workflowType) {
    query = query.where('workflowType', '==', filters.workflowType)
  }

  if (filters?.isActive !== undefined) {
    query = query.where('isActive', '==', filters.isActive)
  }

  if (filters?.isGolden !== undefined) {
    query = query.where('isGolden', '==', filters.isGolden)
  }

  query = query.orderBy('createdAtMs', 'desc').limit(limit)

  const snapshot = await query.get()
  let testCases = snapshot.docs.map((doc) => doc.data() as DerivedTestCase)

  // Post-filter for array contains
  if (filters?.tag) {
    testCases = testCases.filter((tc) => tc.tags?.includes(filters.tag!))
  }

  return testCases
}

/**
 * Update test case
 */
export async function updateTestCase(
  userId: string,
  testCaseId: DerivedTestCaseId,
  updates: Partial<Omit<DerivedTestCase, 'testCaseId' | 'sourceRunId' | 'userId' | 'createdAtMs'>>
): Promise<DerivedTestCase> {
  const db = getFirestore()
  const testCase = await getTestCase(userId, testCaseId)

  if (!testCase) {
    throw new Error(`Test case ${testCaseId} not found`)
  }

  const updated = {
    ...testCase,
    ...updates,
    updatedAtMs: Date.now(),
  }

  await db.doc(`${getTestCasesPath(userId)}/${testCaseId}`).set(updated)

  return updated
}

/**
 * Mark test case as golden (high-priority regression test)
 */
export async function markTestCaseAsGolden(
  userId: string,
  testCaseId: DerivedTestCaseId
): Promise<DerivedTestCase> {
  return updateTestCase(userId, testCaseId, { isGolden: true })
}

// ----- Regression Testing -----

/**
 * Record a regression test result
 */
export async function recordRegressionResult(
  userId: string,
  testCaseId: DerivedTestCaseId,
  runId: RunId,
  result: Omit<RegressionTestResult, 'testCaseId' | 'runId' | 'userId'>
): Promise<RegressionTestResult> {
  const db = getFirestore()
  const resultId = randomUUID()

  const regressionResult: RegressionTestResult = {
    testCaseId,
    runId,
    userId,
    ...result,
  }

  await db.doc(`${getRegressionResultsPath(userId)}/${resultId}`).set(regressionResult)

  // Update test case pass/fail counts
  const testCase = await getTestCase(userId, testCaseId)
  if (testCase) {
    await updateTestCase(userId, testCaseId, {
      passCount: testCase.passCount + (result.passed ? 1 : 0),
      failCount: testCase.failCount + (result.passed ? 0 : 1),
      lastUsedMs: Date.now(),
      lastPassMs: result.passed ? Date.now() : testCase.lastPassMs,
      lastFailMs: result.passed ? testCase.lastFailMs : Date.now(),
    })
  }

  return regressionResult
}

/**
 * Get regression results for a test case
 */
export async function getRegressionResultsByTestCase(
  userId: string,
  testCaseId: DerivedTestCaseId,
  limit: number = 20
): Promise<RegressionTestResult[]> {
  const db = getFirestore()
  const snapshot = await db
    .collection(getRegressionResultsPath(userId))
    .where('testCaseId', '==', testCaseId)
    .orderBy('executedAtMs', 'desc')
    .limit(limit)
    .get()

  return snapshot.docs.map((doc) => doc.data() as RegressionTestResult)
}

/**
 * Evaluate a run against a test case
 */
export async function evaluateAgainstTestCase(
  userId: string,
  testCaseId: DerivedTestCaseId,
  runId: RunId,
  actualOutput: string,
  workflowVersion: string
): Promise<RegressionTestResult> {
  const testCase = await getTestCase(userId, testCaseId)

  if (!testCase) {
    throw new Error(`Test case ${testCaseId} not found`)
  }

  const telemetry = await getTelemetryByRunId(userId, runId)

  if (!telemetry) {
    throw new Error(`Telemetry not found for run ${runId}`)
  }

  // Compare quality
  const qualityScore = telemetry.qualityScore || 0
  const qualityPassed = qualityScore >= testCase.minQualityScore

  // Compare steps
  const stepCount = telemetry.stepCount
  const stepsPassed = stepCount <= testCase.maxSteps

  // Compare cost
  const cost = telemetry.estimatedCost
  const costPassed = cost <= testCase.maxCost

  // Compare duration
  const durationMs = telemetry.durationMs
  const durationPassed = testCase.maxDurationMs ? durationMs <= testCase.maxDurationMs : true

  // Compare output (simple semantic similarity via hash for now)
  const actualHash = hashContent(actualOutput)
  const outputMatched = actualHash === testCase.expectedOutputHash
  const outputSimilarity = outputMatched ? 1.0 : 0.5 // Would use proper similarity in production

  // Compare tool calls
  const actualToolCalls = telemetry.steps.flatMap((s) => s.toolCallIds || [])
  const expectedToolCalls = testCase.expectedToolCalls || []
  const missingTools = expectedToolCalls.filter((t) => !actualToolCalls.includes(t))
  const extraTools = actualToolCalls.filter((t) => !expectedToolCalls.includes(t))
  const toolCallsMatched = missingTools.length === 0

  // Overall pass/fail
  const failureReasons: string[] = []
  if (!qualityPassed)
    failureReasons.push(
      `Quality score ${qualityScore.toFixed(2)} below threshold ${testCase.minQualityScore}`
    )
  if (!stepsPassed) failureReasons.push(`Step count ${stepCount} exceeds max ${testCase.maxSteps}`)
  if (!costPassed)
    failureReasons.push(`Cost $${cost.toFixed(4)} exceeds max $${testCase.maxCost.toFixed(4)}`)
  if (!durationPassed)
    failureReasons.push(`Duration ${durationMs}ms exceeds max ${testCase.maxDurationMs}ms`)
  if (!outputMatched && testCase.expectedOutput)
    failureReasons.push('Output does not match expected')
  if (!toolCallsMatched) failureReasons.push(`Missing tools: ${missingTools.join(', ')}`)

  const passed = failureReasons.length === 0

  return recordRegressionResult(userId, testCaseId, runId, {
    passed,
    failureReasons: failureReasons.length > 0 ? failureReasons : undefined,
    qualityScore,
    qualityPassed,
    stepCount,
    stepsPassed,
    cost,
    costPassed,
    durationMs,
    durationPassed,
    outputSimilarity,
    outputMatched,
    toolCallsMatched,
    missingTools: missingTools.length > 0 ? missingTools : undefined,
    extraTools: extraTools.length > 0 ? extraTools : undefined,
    workflowVersion,
    executedAtMs: Date.now(),
  })
}
