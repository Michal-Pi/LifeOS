import { httpsCallable } from 'firebase/functions'
import { getFunctionsClient } from '@/lib/firebase'
import type { ConversationContext } from '@lifeos/agents'

const MAX_TURNS = 15
const MAX_SIZE = 50000

const buildSummaryPrompt = (turns: ConversationContext['fullHistory']): string => {
  return `
Summarize this conversation history concisely:
${turns
  .map((turn) => `Turn ${turn.turnNumber}:\nUser: ${turn.userMessage}\nPM: ${turn.pmResponse}`)
  .join('\n---\n')}
Provide concise summary (max 500 words) covering:
1. Main goals and objectives
2. Key requirements identified
3. Important assumptions made
4. Decisions reached
5. Open questions or concerns
`.trim()
}

export async function summarizeContext(
  context: ConversationContext,
  maxTurnsToKeep: number = 10,
  options?: {
    executePrompt?: (prompt: string) => Promise<string>
  }
): Promise<string> {
  if (context.turnCount <= maxTurnsToKeep) {
    return ''
  }

  const turnsToSummarize = context.fullHistory.slice(0, -maxTurnsToKeep)
  const prompt = buildSummaryPrompt(turnsToSummarize)

  try {
    if (options?.executePrompt) {
      return await options.executePrompt(prompt)
    }
    const functions = getFunctionsClient()
    const summarize = httpsCallable(functions, 'summarizeProjectManagerContext')
    const response = await summarize({ prompt })
    if (typeof response.data === 'string') {
      return response.data
    }
    return (response.data as { summary?: string })?.summary ?? ''
  } catch (error) {
    console.error('Context summarization failed, skipping:', error)
  }

  return ''
}

export function shouldSummarize(context: ConversationContext): boolean {
  const totalSize = context.fullHistory.reduce(
    (sum, turn) => sum + turn.userMessage.length + turn.pmResponse.length,
    0
  )

  return context.turnCount > MAX_TURNS || totalSize > MAX_SIZE
}
