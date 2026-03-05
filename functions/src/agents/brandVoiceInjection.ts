/**
 * Phase 43 — Brand Voice Injection
 *
 * Appends brand voice guidelines to writer/synthesizer system prompts at runtime.
 * Uses simple string concatenation — no template engine.
 */

import type { BrandVoice } from '@lifeos/agents'

/**
 * Inject brand voice guidelines into a system prompt.
 * Only applies to writer and synthesizer roles.
 *
 * @param systemPrompt - The original system prompt
 * @param brandVoice - The brand voice config (optional)
 * @returns The system prompt with brand voice appended, or the original if absent
 */
export function injectBrandVoice(systemPrompt: string, brandVoice?: BrandVoice): string {
  if (!brandVoice) return systemPrompt

  const sections: string[] = ['\n\nBRAND VOICE GUIDELINES:']

  if (brandVoice.tone) {
    sections.push(`Tone: ${brandVoice.tone}`)
  }
  if (brandVoice.vocabulary && brandVoice.vocabulary.length > 0) {
    sections.push(`Vocabulary to use: ${brandVoice.vocabulary.join(', ')}`)
  }
  if (brandVoice.structure) {
    sections.push(`Structure: ${brandVoice.structure}`)
  }
  if (brandVoice.examples && brandVoice.examples.length > 0) {
    sections.push(`Reference examples:\n${brandVoice.examples.map((e) => `- ${e}`).join('\n')}`)
  }

  return systemPrompt + sections.join('\n')
}
