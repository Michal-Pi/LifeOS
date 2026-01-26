import { httpsCallable } from 'firebase/functions'
import { newId } from '@lifeos/core'
import { getFunctionsClient } from '@/lib/firebase'
import type {
  ConversationContext,
  ConversationTurn,
  Requirement,
  Assumption,
  RequirementCategory,
  RequirementPriority,
  AssumptionCategory,
} from '@lifeos/agents'

type ExtractionPayload = {
  requirements: Array<{
    text: string
    category: RequirementCategory
    priority: RequirementPriority
    confidence: number
  }>
  assumptions: Array<{
    text: string
    category: AssumptionCategory
    confidence: number
  }>
  decisions: string[]
}

const buildExtractionPrompt = (turn: ConversationTurn): string => {
  return `
Analyze this conversation turn and extract structured information.
USER MESSAGE: ${turn.userMessage}
PM RESPONSE: ${turn.pmResponse}
Extract:
1. NEW REQUIREMENTS (functional, non-functional, constraints, goals)
2. NEW ASSUMPTIONS (technical, business, user, timeline, resource)
3. DECISIONS MADE
Return JSON:
{
  "requirements": [{"text": "...", "category": "...", "priority": "...", "confidence": 0-100}],
  "assumptions": [{"text": "...", "category": "...", "confidence": 0-100}],
  "decisions": ["..."]
}
`.trim()
}

const parseExtractionPayload = (raw: unknown): ExtractionPayload | null => {
  if (!raw) return null
  try {
    if (typeof raw === 'string') {
      return JSON.parse(raw) as ExtractionPayload
    }
    return raw as ExtractionPayload
  } catch {
    return null
  }
}

export async function extractContextFromTurn(
  turn: ConversationTurn,
  _previousContext: ConversationContext,
  options?: {
    executePrompt?: (prompt: string) => Promise<string>
  }
): Promise<{
  requirements: Requirement[]
  assumptions: Assumption[]
  decisions: string[]
}> {
  const prompt = buildExtractionPrompt(turn)
  let payload: ExtractionPayload | null = null

  try {
    if (options?.executePrompt) {
      const output = await options.executePrompt(prompt)
      payload = parseExtractionPayload(output)
    } else {
      const functions = getFunctionsClient()
      const extract = httpsCallable(functions, 'extractProjectManagerContext')
      const response = await extract({ prompt })
      payload = parseExtractionPayload(response.data)
    }
  } catch (error) {
    console.error('Context extraction failed, skipping:', error)
  }

  const requirements =
    payload?.requirements?.map((entry) => ({
      requirementId: newId('pmRequirement'),
      text: entry.text,
      category: entry.category,
      priority: entry.priority,
      source: 'inferred',
      confidence: entry.confidence,
      extractedAtTurn: turn.turnNumber,
    })) ?? []

  const assumptions =
    payload?.assumptions?.map((entry) => ({
      assumptionId: newId('pmAssumption'),
      text: entry.text,
      category: entry.category,
      source: 'inferred',
      confidence: entry.confidence,
      validated: false,
      extractedAtTurn: turn.turnNumber,
    })) ?? []

  const decisions = payload?.decisions ?? []

  return { requirements, assumptions, decisions }
}
