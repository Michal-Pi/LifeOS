/**
 * Oracle Phase Summarizer
 *
 * Generates ~2K token summaries at the end of each phase.
 * These summaries serve as cross-phase context — subsequent phases
 * receive prior phase summaries instead of raw state to manage token budgets.
 *
 * Each summary includes:
 * - Executive bullets (5-10)
 * - Top 15 claim IDs with one-line summaries
 * - Key assumptions with sensitivity ratings
 * - Unresolved tensions
 */

import type {
  OraclePhase,
  OraclePhaseSummary,
  OracleGateResult,
  OracleClaim,
  OracleAssumption,
  TrendObject,
  UncertaintyObject,
} from '@lifeos/agents'

/**
 * Build the system prompt for the phase summarizer LLM call.
 * Optionally includes gate result context for richer summaries.
 */
export function buildPhaseSummarizerPrompt(
  phase: OraclePhase,
  gateResult?: OracleGateResult,
): string {
  const gateContext = gateResult
    ? `\n\nThe preceding quality gate ${gateResult.passed ? 'PASSED' : 'FAILED'} with average score ${gateResult.averageScore}.` +
      `\nGate feedback: ${gateResult.feedback}` +
      `\nIncorporate this quality assessment into your summary.`
    : ''

  return `You are an Oracle Phase Summarizer. Produce a concise summary of the ${phase} phase output.

Your summary must fit within ~2,000 tokens and include:

1. **executive** (array of 5-10 bullet strings): Key findings and decisions from this phase.
2. **keyClaims** (array of max 15 objects): The most important claims. Each: { "id": "CLM-xxx", "summary": "<one line>", "confidence": <0-1> }
3. **keyAssumptions** (array): Critical assumptions. Each: { "id": "ASM-xxx", "statement": "<one line>", "sensitivity": "high|medium|low" }
4. **unresolvedTensions** (array of strings): Open questions, contradictions, or gaps that subsequent phases should address.

Respond with JSON ONLY matching this exact schema.${gateContext}`
}

/**
 * Parse phase summary from LLM output.
 */
export function parsePhaseSummary(
  phase: OraclePhase,
  llmOutput: string,
): OraclePhaseSummary | null {
  try {
    const jsonMatch = llmOutput.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])

    return {
      phase,
      executive: Array.isArray(parsed.executive) ? parsed.executive.slice(0, 10) : [],
      keyClaims: Array.isArray(parsed.keyClaims)
        ? parsed.keyClaims.slice(0, 15).map((c: { id?: string; summary?: string; confidence?: number }) => ({
            id: c.id ?? '',
            summary: c.summary ?? '',
            confidence: typeof c.confidence === 'number' ? c.confidence : 0.5,
          }))
        : [],
      keyAssumptions: Array.isArray(parsed.keyAssumptions)
        ? parsed.keyAssumptions.map((a: { id?: string; statement?: string; sensitivity?: string }) => ({
            id: a.id ?? '',
            statement: a.statement ?? '',
            sensitivity: a.sensitivity ?? 'medium',
          }))
        : [],
      unresolvedTensions: Array.isArray(parsed.unresolvedTensions)
        ? parsed.unresolvedTensions
        : [],
      tokenCount: llmOutput.length / 4, // Rough estimate
    }
  } catch {
    return null
  }
}

/**
 * Build a non-LLM fallback summary from raw state when LLM call fails or
 * is skipped for budget reasons.
 */
export function buildFallbackSummary(
  phase: OraclePhase,
  claims: OracleClaim[],
  assumptions: OracleAssumption[],
  trends?: TrendObject[],
  uncertainties?: UncertaintyObject[],
): OraclePhaseSummary {
  // For trend_scanning phase, use trends/uncertainties if available
  if (phase === 'trend_scanning' && trends && trends.length > 0) {
    const executive = [
      `Phase trend_scanning identified ${trends.length} trends and ${uncertainties?.length ?? 0} critical uncertainties.`,
      `STEEP+V coverage: ${new Set(trends.map((t) => t.steepCategory)).size} of 6 categories represented.`,
      `${trends.filter((t) => t.impactScore >= 0.7).length} high-impact trends identified.`,
    ]

    const keyClaims = trends.slice(0, 15).map((t) => ({
      id: t.id,
      summary: t.statement.slice(0, 120),
      confidence: 1 - t.uncertaintyScore,
    }))

    const keyAssumptions = (uncertainties ?? []).slice(0, 10).map((u) => ({
      id: u.id,
      statement: `${u.variable}: ${u.states.join(' vs ')}`.slice(0, 120),
      sensitivity: 'high' as const,
    }))

    // Synthetic tensions from Phase 2 data
    const unresolvedTensions: string[] = []
    const lowCoverage = ['social', 'technological', 'economic', 'environmental', 'political', 'values']
      .filter((cat) => !trends.some((t) => t.steepCategory === cat))
    if (lowCoverage.length > 0) unresolvedTensions.push(`Missing STEEP+V coverage: ${lowCoverage.join(', ')}`)
    if ((uncertainties?.length ?? 0) > 8) unresolvedTensions.push('High uncertainty density may indicate insufficient evidence')

    return { phase, executive, keyClaims, keyAssumptions, unresolvedTensions, tokenCount: 0 }
  }

  // Default fallback for other phases (decomposition, etc.)
  const topClaims = [...claims]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 15)
    .map((c) => ({
      id: c.id,
      summary: c.text.slice(0, 120),
      confidence: c.confidence,
    }))

  const keyAssumptions = assumptions
    .filter((a) => a.sensitivity === 'high')
    .slice(0, 10)
    .map((a) => ({
      id: a.id,
      statement: a.statement.slice(0, 120),
      sensitivity: a.sensitivity,
    }))

  // Synthetic tensions
  const unresolvedTensions: string[] = []
  const lowConfidence = claims.filter((c) => c.confidence < 0.5)
  if (lowConfidence.length > 0) unresolvedTensions.push(`${lowConfidence.length} low-confidence claims need investigation`)
  const highSensitivity = assumptions.filter((a) => a.sensitivity === 'high')
  if (highSensitivity.length > 3) unresolvedTensions.push(`${highSensitivity.length} high-sensitivity assumptions untested`)

  return {
    phase,
    executive: [
      `Phase ${phase} produced ${claims.length} claims and ${assumptions.length} assumptions.`,
      `${topClaims.filter((c) => c.confidence >= 0.7).length} high-confidence claims.`,
      `${keyAssumptions.length} high-sensitivity assumptions require monitoring.`,
    ],
    keyClaims: topClaims,
    keyAssumptions: keyAssumptions,
    unresolvedTensions,
    tokenCount: 0,
  }
}

/**
 * Format prior phase summaries as context for subsequent phases.
 * Returns a compact markdown string.
 */
export function formatPhaseSummariesForContext(
  summaries: OraclePhaseSummary[],
): string {
  if (summaries.length === 0) return ''

  const sections = summaries.map((s) => {
    const bullets = s.executive.map((b) => `  - ${b}`).join('\n')
    const claims = s.keyClaims
      .slice(0, 10)
      .map((c) => `  - ${c.id}: ${c.summary} (conf: ${c.confidence})`)
      .join('\n')
    const tensions = s.unresolvedTensions.length > 0
      ? `\n  Unresolved: ${s.unresolvedTensions.join('; ')}`
      : ''

    return `### ${s.phase}\n${bullets}\n  Key claims:\n${claims}${tensions}`
  })

  return `## Prior Phase Context\n${sections.join('\n\n')}`
}
