/**
 * Phase 47 — Knowledge Graph Suggestions
 *
 * Suggests note connections based on content similarity using a fast model.
 * Returns suggested connections with reason and confidence strength.
 */

export interface NoteSummary {
  noteId: string
  title: string
  contentPreview: string
}

export interface ConnectionSuggestion {
  targetNoteId: string
  reason: string
  strength: number // 0-1
}

/**
 * Compute a simple keyword overlap score between two text strings.
 * Returns a score from 0-1 based on the ratio of shared significant words.
 */
export function computeKeywordOverlap(textA: string, textB: string): number {
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'shall',
    'can',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'about',
    'like',
    'through',
    'after',
    'over',
    'between',
    'out',
    'against',
    'during',
    'without',
    'before',
    'under',
    'around',
    'among',
    'and',
    'but',
    'or',
    'nor',
    'not',
    'so',
    'yet',
    'both',
    'either',
    'neither',
    'each',
    'every',
    'all',
    'any',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'only',
    'own',
    'same',
    'than',
    'too',
    'very',
    'just',
    'because',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
    'i',
    'me',
    'my',
    'we',
    'our',
    'you',
    'your',
    'he',
    'she',
    'they',
    'them',
    'their',
  ])

  const tokenize = (text: string): Set<string> => {
    return new Set(
      text
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2 && !stopWords.has(w))
    )
  }

  const wordsA = tokenize(textA)
  const wordsB = tokenize(textB)

  if (wordsA.size === 0 || wordsB.size === 0) return 0

  let overlap = 0
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++
  }

  const minSize = Math.min(wordsA.size, wordsB.size)
  return minSize > 0 ? overlap / minSize : 0
}

/**
 * Generate connection suggestions for a note based on keyword overlap
 * with other notes. Excludes already-connected notes.
 *
 * @param noteId - The current note's ID
 * @param noteContent - The current note's content
 * @param allNotes - All candidate notes to compare against
 * @param existingConnections - Note IDs already connected to this note
 * @param minStrength - Minimum overlap strength to include (default 0.15)
 * @param maxSuggestions - Maximum suggestions to return (default 5)
 */
export function suggestNoteConnections(
  noteId: string,
  noteContent: string,
  allNotes: NoteSummary[],
  existingConnections: string[],
  minStrength: number = 0.15,
  maxSuggestions: number = 5
): ConnectionSuggestion[] {
  const connected = new Set(existingConnections)
  connected.add(noteId) // Exclude self

  const suggestions: ConnectionSuggestion[] = []

  for (const candidate of allNotes) {
    if (connected.has(candidate.noteId)) continue

    const strength = computeKeywordOverlap(noteContent, candidate.contentPreview)
    if (strength >= minStrength) {
      suggestions.push({
        targetNoteId: candidate.noteId,
        reason: `Shared concepts with "${candidate.title}"`,
        strength: Math.min(strength, 1),
      })
    }
  }

  // Sort by strength descending, limit
  return suggestions.sort((a, b) => b.strength - a.strength).slice(0, maxSuggestions)
}
