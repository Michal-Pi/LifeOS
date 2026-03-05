/**
 * Phase 45 — Smart Search Router
 *
 * Classifies query type using keyword heuristics and returns
 * the optimal search strategy (which search tools to use and in what priority).
 */

export type QueryType = 'factual' | 'conceptual' | 'academic' | 'comparative' | 'general'

const FACTUAL_PATTERNS = [
  /^what (?:is|are|was|were)\b/i,
  /^when (?:did|was|were|is)\b/i,
  /^how many\b/i,
  /^who (?:is|are|was|were)\b/i,
  /^where (?:is|are|was|were)\b/i,
  /\b\d{4}\b/, // contains a year
  /\b\d+%\b/, // contains a percentage
]

const ACADEMIC_KEYWORDS = [
  'study',
  'studies',
  'research',
  'paper',
  'peer-reviewed',
  'meta-analysis',
  'evidence',
  'journal',
  'publication',
  'systematic review',
  'randomized',
  'clinical trial',
]

const CONCEPTUAL_PATTERNS = [
  /^why\b/i,
  /^how does\b/i,
  /^how do\b/i,
  /^explain\b/i,
  /\bwhat causes\b/i,
  /\brelationship between\b/i,
  /\bhow.*work/i,
  /\bunderstand\b/i,
]

const COMPARATIVE_KEYWORDS = [
  'compare',
  'comparison',
  ' vs ',
  ' vs. ',
  'versus',
  'difference between',
  'differences between',
  'better than',
  'which is better',
  'pros and cons',
  'advantages',
]

/**
 * Classify a search query into a QueryType using keyword heuristics.
 * No LLM call needed — fast, deterministic classification.
 */
export function classifyQueryType(query: string): QueryType {
  const lower = query.toLowerCase()

  // Check comparative first (most specific patterns)
  if (COMPARATIVE_KEYWORDS.some((kw) => lower.includes(kw))) {
    return 'comparative'
  }

  // Check academic
  if (ACADEMIC_KEYWORDS.some((kw) => lower.includes(kw))) {
    return 'academic'
  }

  // Check factual (regex patterns)
  if (FACTUAL_PATTERNS.some((pattern) => pattern.test(query))) {
    return 'factual'
  }

  // Check conceptual
  if (CONCEPTUAL_PATTERNS.some((pattern) => pattern.test(query))) {
    return 'conceptual'
  }

  return 'general'
}

export interface SearchStrategy {
  useSERP: boolean
  useScholar: boolean
  useSemantic: boolean
  priority: 'serp' | 'scholar' | 'semantic'
}

/**
 * Get the optimal search strategy for a given query type.
 */
export function getSearchStrategy(queryType: QueryType): SearchStrategy {
  switch (queryType) {
    case 'factual':
      return { useSERP: true, useScholar: false, useSemantic: false, priority: 'serp' }
    case 'academic':
      return { useSERP: true, useScholar: true, useSemantic: false, priority: 'scholar' }
    case 'conceptual':
      return { useSERP: true, useScholar: false, useSemantic: true, priority: 'semantic' }
    case 'comparative':
      return { useSERP: true, useScholar: false, useSemantic: true, priority: 'serp' }
    case 'general':
      return { useSERP: true, useScholar: true, useSemantic: true, priority: 'serp' }
  }
}
