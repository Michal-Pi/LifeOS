import type { DeepResearchRequest, DeepResearchResult, DeepResearchSource } from '@lifeos/agents'

const formatContextKey = (key: string): string => {
  const withSpaces = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  return withSpaces.replace(/\b\w/g, (char) => char.toUpperCase())
}

const formatContextValue = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return '[Unserializable context]'
  }
}

export const buildResearchPrompt = (request: DeepResearchRequest): string => {
  const contextEntries = request.context ? Object.entries(request.context) : []
  const contextLines = contextEntries.map(
    ([key, value]) => `- ${formatContextKey(key)}: ${formatContextValue(value)}`
  )

  const questionsBlock = request.questions
    .map(
      (question, index) =>
        `${index + 1}. ${question}\n   Please provide:\n   - Key findings\n   - Practical examples\n   - Actionable recommendations`
    )
    .join('\n\n')

  return [
    `RESEARCH REQUEST: ${request.topic}`,
    '',
    'CONTEXT:',
    contextLines.length > 0 ? contextLines.join('\n') : '- No additional context provided',
    '',
    'QUESTIONS TO RESEARCH:',
    '',
    questionsBlock,
    '',
    'INSTRUCTIONS:',
    '- Provide detailed, actionable answers',
    '- Include specific examples and code snippets where relevant',
    '- Cite sources when possible',
    '- Focus on practical implementation advice',
    '',
    'Please structure your response with clear headings for each question.',
  ].join('\n')
}

const QUESTION_KEYWORD_STOPWORDS = new Set([
  'what',
  'which',
  'when',
  'where',
  'why',
  'how',
  'does',
  'do',
  'is',
  'are',
  'can',
  'should',
  'could',
  'would',
  'will',
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'these',
  'those',
  'into',
  'about',
  'over',
  'under',
  'than',
  'then',
  'also',
])

const extractKeywords = (question: string): string[] => {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !QUESTION_KEYWORD_STOPWORDS.has(word))
}

const hasQuestionHeading = (content: string, index: number): boolean => {
  const number = index + 1
  const headingPattern = new RegExp(
    `(^|\\n)\\s*(?:#{1,6}\\s*)?(?:question\\s*)?${number}[\\).:-]`,
    'i'
  )
  return headingPattern.test(content)
}

export const validateResearchCompleteness = (
  request: DeepResearchRequest,
  content: string
): { isComplete: boolean; missingQuestions: string[] } => {
  if (request.status === 'completed') {
    return { isComplete: true, missingQuestions: [] }
  }

  const normalizedContent = content.toLowerCase()
  const missingQuestions = request.questions.filter((question, index) => {
    if (hasQuestionHeading(content, index)) {
      return false
    }

    const keywords = extractKeywords(question)
    if (keywords.length === 0) {
      return false
    }

    const requiredMatches = Math.min(2, keywords.length)
    const matches = keywords.filter((word) => normalizedContent.includes(word)).length
    return matches < requiredMatches
  })

  return {
    isComplete: missingQuestions.length === 0,
    missingQuestions,
  }
}

export const createResearchResult = (params: {
  source: DeepResearchSource
  model: string
  content: string
  uploadedBy: string
  uploadedAtMs?: number
}): DeepResearchResult => {
  return {
    source: params.source,
    model: params.model,
    content: params.content,
    uploadedAtMs: params.uploadedAtMs ?? Date.now(),
    uploadedBy: params.uploadedBy,
  }
}

export const synthesizeResearchFindings = (request: DeepResearchRequest): string => {
  const results = request.results ?? []
  if (results.length === 0) {
    throw new Error('No research results to synthesize')
  }
  if (results.length === 1) {
    return results[0].content
  }

  const summaryHeader = `SYNTHESIZED FINDINGS: ${request.topic}`
  const combined = results
    .map(
      (result, index) =>
        `SOURCE ${index + 1}: ${result.source} (${result.model})\n${result.content.trim()}`
    )
    .join('\n\n---\n\n')

  return `${summaryHeader}\n\n${combined}`
}
