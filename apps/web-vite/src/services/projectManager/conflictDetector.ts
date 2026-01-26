import { httpsCallable } from 'firebase/functions'
import { newId } from '@lifeos/core'
import { getFunctionsClient } from '@/lib/firebase'
import type { Conflict, ConversationContext, Requirement } from '@lifeos/agents'

type ContradictionPayload = Array<{
  req1: number
  req2: number
  explanation: string
}>

const buildContradictionPrompt = (requirements: Requirement[]): string => {
  return `
Analyze these requirements for contradictions:
${requirements.map((req, index) => `${index + 1}. ${req.text}`).join('\n')}
Identify pairs that contradict each other.
Return JSON: [{"req1": index, "req2": index, "explanation": "..."}]
`.trim()
}

const detectImpossibleConstraints = (requirements: Requirement[], turn: number): Conflict[] => {
  const conflicts: Conflict[] = []
  for (const requirement of requirements) {
    if (requirement.category !== 'constraint') continue
    const text = requirement.text.toLowerCase()
    if (text.includes('instant') || text.includes('real-time') || text.includes('zero cost')) {
      conflicts.push({
        conflictId: newId('pmConflict'),
        type: 'impossible-constraint',
        severity: 'medium',
        description: `Constraint may be unrealistic: "${requirement.text}"`,
        involvedItems: [requirement.requirementId],
        detectedAtTurn: turn,
        resolved: false,
      })
    }
  }
  return conflicts
}

const detectPriorityConflicts = (requirements: Requirement[], turn: number): Conflict[] => {
  const mustHaves = requirements.filter((req) => req.priority === 'must-have')
  if (mustHaves.length < 6) return []
  return [
    {
      conflictId: newId('pmConflict'),
      type: 'priority-conflict',
      severity: 'low',
      description: 'Many must-have requirements may indicate conflicting priorities.',
      involvedItems: mustHaves.map((req) => req.requirementId),
      detectedAtTurn: turn,
      resolved: false,
    },
  ]
}

const parseContradictions = (raw: unknown): ContradictionPayload => {
  if (!raw) return []
  try {
    if (typeof raw === 'string') {
      return JSON.parse(raw) as ContradictionPayload
    }
    return raw as ContradictionPayload
  } catch {
    return []
  }
}

const findContradictoryRequirements = async (
  requirements: Requirement[],
  turn: number,
  options?: {
    executePrompt?: (prompt: string) => Promise<string>
  }
): Promise<Conflict[]> => {
  if (requirements.length < 2) return []
  const prompt = buildContradictionPrompt(requirements)

  try {
    let output: unknown
    if (options?.executePrompt) {
      output = await options.executePrompt(prompt)
    } else {
      const functions = getFunctionsClient()
      const analyze = httpsCallable(functions, 'detectProjectManagerConflicts')
      const response = await analyze({ prompt })
      output = response.data
    }

    const contradictions = parseContradictions(output)
    return contradictions.map((item) => {
      const first = requirements[item.req1 - 1]
      const second = requirements[item.req2 - 1]
      return {
        conflictId: newId('pmConflict'),
        type: 'contradictory-requirements',
        severity: 'high',
        description: `Requirements conflict: ${item.explanation}`,
        involvedItems: [first?.requirementId, second?.requirementId].filter(
          (value): value is Requirement['requirementId'] => Boolean(value)
        ),
        detectedAtTurn: turn,
        resolved: false,
      }
    })
  } catch (error) {
    console.error('Conflict detection failed, skipping AI contradictions:', error)
    return []
  }
}

export async function detectConflicts(
  context: ConversationContext,
  options?: {
    executePrompt?: (prompt: string) => Promise<string>
  }
): Promise<Conflict[]> {
  const conflicts: Conflict[] = []

  try {
    const contradictions = await findContradictoryRequirements(
      context.requirements,
      context.turnCount,
      options
    )
    conflicts.push(...contradictions)
  } catch (error) {
    console.error('AI contradiction detection failed:', error)
  }

  conflicts.push(...detectImpossibleConstraints(context.requirements, context.turnCount))
  conflicts.push(...detectPriorityConflicts(context.requirements, context.turnCount))

  return conflicts
}
