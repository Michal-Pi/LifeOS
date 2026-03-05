/**
 * Phase 48 — Coaching Context Injection
 *
 * Appends coaching context (business description, target audience,
 * past decisions, etc.) to advisor/custom role system prompts at runtime.
 */

import type { CoachingContext } from '@lifeos/agents'

/**
 * Inject coaching context into a system prompt.
 * Only applies when coaching context is present.
 *
 * @param systemPrompt - The original system prompt
 * @param coachingContext - The coaching context (optional)
 * @returns The system prompt with coaching context appended, or the original if absent
 */
export function injectCoachingContext(
  systemPrompt: string,
  coachingContext?: CoachingContext
): string {
  if (!coachingContext) return systemPrompt

  const sections: string[] = ['\n\nBUSINESS CONTEXT (from previous sessions):']

  if (coachingContext.businessDescription) {
    sections.push(`Business: ${coachingContext.businessDescription}`)
  }
  if (coachingContext.targetAudience) {
    sections.push(`Target audience: ${coachingContext.targetAudience}`)
  }
  if (coachingContext.competitorNames && coachingContext.competitorNames.length > 0) {
    sections.push(`Competitors: ${coachingContext.competitorNames.join(', ')}`)
  }
  if (coachingContext.pastDecisions && coachingContext.pastDecisions.length > 0) {
    const decisionsText = coachingContext.pastDecisions
      .map((d) => {
        const outcome = d.outcome ? ` → ${d.outcome}` : ''
        return `- [${d.date}] ${d.decision}${outcome}`
      })
      .join('\n')
    sections.push(`Past decisions:\n${decisionsText}`)
  }
  if (coachingContext.competitiveLandscape) {
    sections.push(`Competitive landscape: ${coachingContext.competitiveLandscape}`)
  }

  return systemPrompt + sections.join('\n')
}
