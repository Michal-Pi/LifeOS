/**
 * Contact AI Tools — client-side wrappers for CRM AI Cloud Functions.
 */

import { httpsCallable, getFunctions } from 'firebase/functions'

// ─── Meeting Briefing ───────────────────────────────────────────────

export interface ContactBriefing {
  contactId: string
  displayName: string
  recentContext: string
  talkingPoints: string[]
}

export interface MeetingBriefing {
  contactBriefings: ContactBriefing[]
  overallPrepNotes: string
}

interface MeetingBriefingResponse {
  tool: string
  result: MeetingBriefing
  usage?: { inputTokens: number; outputTokens: number }
}

export async function getMeetingBriefing(eventId: string): Promise<MeetingBriefing> {
  const functions = getFunctions()
  const callable = httpsCallable<{ eventId: string }, MeetingBriefingResponse>(
    functions,
    'getMeetingBriefing'
  )
  const result = await callable({ eventId })
  return result.data.result
}

// ─── Circle Suggestion ──────────────────────────────────────────────

export interface CircleSuggestion {
  suggestedCircle: number
  currentCircle: number
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
}

interface CircleSuggestionResponse {
  tool: string
  result: CircleSuggestion
  usage?: { inputTokens: number; outputTokens: number }
}

export async function suggestCirclePlacement(contactId: string): Promise<CircleSuggestion> {
  const functions = getFunctions()
  const callable = httpsCallable<{ contactId: string }, CircleSuggestionResponse>(
    functions,
    'suggestCirclePlacement'
  )
  const result = await callable({ contactId })
  return result.data.result
}
