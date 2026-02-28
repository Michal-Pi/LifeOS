const MAX_CONTEXT_BYTES = 100 * 1024

export const normalizeResearchQuestions = (questions: string[]) =>
  questions.map((question) => question.trim()).filter(Boolean)

export const assertValidResearchContext = (context?: Record<string, unknown>) => {
  if (context === undefined) return
  try {
    const serialized = JSON.stringify(context)
    if (typeof serialized !== 'string') {
      throw new Error('Context serialization failed')
    }
    const size = new TextEncoder().encode(serialized).length
    if (size > MAX_CONTEXT_BYTES) {
      throw new Error('Context size exceeds limit')
    }
  } catch {
    throw new Error('Research request context must be JSON-serializable and under 100KB')
  }
}
