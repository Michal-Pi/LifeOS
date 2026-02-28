import { newId } from '@lifeos/core'
import type {
  ConversationContext,
  ConversationContextId,
  ConversationTurn,
  DecisionRecord,
} from '../domain/projectManager'
import type { RunId, WorkflowId } from '../domain/models'
import type { ProjectManagerRepository } from '../ports/projectManagerRepository'

type ExtractorResult = {
  requirements: ConversationContext['requirements']
  assumptions: ConversationContext['assumptions']
  decisions: string[]
}

type Extractor = (
  turn: ConversationTurn,
  previousContext: ConversationContext
) => Promise<ExtractorResult>

type Summarizer = (context: ConversationContext, maxTurnsToKeep?: number) => Promise<string>

type ShouldSummarize = (context: ConversationContext) => boolean

export function createProjectManagerUsecases(
  repository: ProjectManagerRepository,
  tools: {
    extractContextFromTurn: Extractor
    summarizeContext: Summarizer
    shouldSummarize: ShouldSummarize
  }
) {
  return {
    async startConversation(userId: string, workflowId?: WorkflowId, runId?: RunId) {
      const existing = await repository.getActiveContext(userId, workflowId)
      if (existing) return existing
      return repository.createContext(userId, workflowId, runId)
    },

    async addTurn(
      userId: string,
      contextId: ConversationContextId,
      userMessage: string,
      pmResponse: string
    ) {
      const context = await repository.getContext(userId, contextId)
      if (!context) throw new Error('Context not found')

      const turn: ConversationTurn = {
        turnId: newId('pmTurn'),
        turnNumber: context.turnCount + 1,
        userMessage,
        pmResponse,
        timestampMs: Date.now(),
      }

      const extracted = await tools.extractContextFromTurn(turn, context)

      await repository.addTurn(userId, contextId, turn)
      for (const requirement of extracted.requirements) {
        await repository.addRequirement(userId, contextId, requirement)
      }
      for (const assumption of extracted.assumptions) {
        await repository.addAssumption(userId, contextId, assumption)
      }
      for (const decision of extracted.decisions) {
        const record: DecisionRecord = {
          decisionId: newId('pmDecision'),
          question: decision,
          status: 'selected',
          decidedAtTurn: turn.turnNumber,
          decidedAtMs: Date.now(),
        }
        await repository.addDecision(userId, contextId, record)
      }

      const updated = await repository.getContext(userId, contextId)
      if (updated && tools.shouldSummarize(updated)) {
        const summary = await tools.summarizeContext(updated)
        await repository.updateContext(userId, contextId, { summary })
      }

      return repository.getContext(userId, contextId)
    },

    async getRelevantContext(userId: string, contextId: ConversationContextId): Promise<string> {
      const context = await repository.getContext(userId, contextId)
      if (!context) return ''

      const openConflicts = context.conflicts.filter((conflict) => !conflict.resolved)
      return `
CONVERSATION CONTEXT:
${context.summary ? `SUMMARY:\n${context.summary}\n\n` : ''}
REQUIREMENTS (${context.requirements.length}):
${context.requirements
  .map(
    (requirement) =>
      `- [${requirement.priority}] ${requirement.text} (${requirement.confidence}% confidence)`
  )
  .join('\n')}
ASSUMPTIONS (${context.assumptions.length}):
${context.assumptions
  .map((assumption) => `- ${assumption.text} ${assumption.validated ? '✓' : '(unvalidated)'}`)
  .join('\n')}
DECISIONS (${context.decisions.length}):
${context.decisions
  .map((decision) => `- ${decision.question} → ${decision.selectedOption ?? 'pending'}`)
  .join('\n')}
CONFLICTS (${openConflicts.length}):
${openConflicts.map((conflict) => `- [${conflict.severity}] ${conflict.description}`).join('\n')}
`.trim()
    },
  }
}
