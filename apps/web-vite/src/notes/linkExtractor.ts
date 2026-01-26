/**
 * Link Extraction Service
 *
 * Extracts note references from ProseMirror content for building note graphs.
 */

import type { JSONContent } from '@tiptap/core'
import type { Note, NoteId, TopicId } from '@lifeos/notes'
import type { NoteMetadata } from '@/adapters/notes/noteMetadataCache'

/**
 * Extract note links from ProseMirror content
 * Looks for link marks with note:// protocol
 * Note: Wiki-style [[Note Title]] links are handled by extractNoteMentions
 */
export function extractNoteLinks(content: JSONContent): NoteId[] {
  const noteIds: NoteId[] = []

  if (!content) {
    return noteIds
  }

  // Recursively traverse the content tree
  const traverse = (node: JSONContent) => {
    // Check for link marks with note:// protocol
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === 'link' && mark.attrs?.href) {
          const href = mark.attrs.href as string
          if (href.startsWith('note://')) {
            const noteId = href.replace('note://', '') as NoteId
            if (noteId && !noteIds.includes(noteId)) {
              noteIds.push(noteId)
            }
          }
        }
      }
    }

    // Recursively process children
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        traverse(child)
      }
    }
  }

  traverse(content)
  return noteIds
}

/**
 * Extract note mentions from content by matching note titles
 * Accepts either full Note[] or NoteMetadata[] for flexibility
 */
export function extractNoteMentions(
  content: JSONContent,
  allNotesOrMetadata: Note[] | NoteMetadata[]
): NoteId[] {
  const mentionedIds: NoteId[] = []

  if (!content || !allNotesOrMetadata || allNotesOrMetadata.length === 0) {
    return mentionedIds
  }

  // Extract all text content
  const extractText = (node: JSONContent): string => {
    if (node.type === 'text' && node.text) {
      return node.text
    }
    if (node.content && Array.isArray(node.content)) {
      return node.content.map(extractText).join(' ')
    }
    return ''
  }

  const fullText = extractText(content).toLowerCase()

  // Extract wiki-style links first ([[Note Title]])
  const wikiLinkMatches = new Set<string>()
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g
  let match
  while ((match = wikiLinkRegex.exec(fullText)) !== null) {
    const matchedTitle = match[1].trim()
    if (matchedTitle) {
      wikiLinkMatches.add(matchedTitle.toLowerCase())
    }
  }

  // Match note titles in the text
  // Handle both Note[] and NoteMetadata[] types
  for (const noteOrMetadata of allNotesOrMetadata) {
    // Check if it's a full Note or just metadata
    const title = 'title' in noteOrMetadata ? noteOrMetadata.title : (noteOrMetadata as Note).title
    const noteId =
      'noteId' in noteOrMetadata ? noteOrMetadata.noteId : (noteOrMetadata as Note).noteId
    const archived =
      'archived' in noteOrMetadata ? noteOrMetadata.archived : (noteOrMetadata as Note).archived

    // Skip archived notes
    if (archived) continue

    const titleLower = title.toLowerCase()

    // Check for wiki-style links first (exact match)
    if (wikiLinkMatches.has(titleLower)) {
      if (!mentionedIds.includes(noteId)) {
        mentionedIds.push(noteId)
      }
      continue
    }

    // Check for direct title mentions (whole word match, case-insensitive)
    // Only match if title is at least 4 characters to avoid false positives
    // Use word boundaries to prevent partial matches
    if (title.length >= 4) {
      const titlePattern = new RegExp(`\\b${escapeRegex(title)}\\b`, 'i')
      if (titlePattern.test(fullText)) {
        // Avoid matching if it's already in a wiki link
        if (!wikiLinkMatches.has(titleLower) && !mentionedIds.includes(noteId)) {
          mentionedIds.push(noteId)
        }
      }
    }
  }

  return mentionedIds
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extract paragraph-level tags from ProseMirror content
 * Returns paragraph links as a map of paragraph paths to tag arrays
 */
export function extractParagraphLinks(content: JSONContent): Record<
  string,
  {
    noteIds: NoteId[]
    topicIds: TopicId[]
  }
> {
  const paragraphLinks: Record<
    string,
    {
      noteIds: NoteId[]
      topicIds: TopicId[]
    }
  > = {}

  if (!content) {
    return paragraphLinks
  }

  // Traverse content tree to find paragraphs/headings with tags
  const traverse = (node: JSONContent, path: string[] = []): void => {
    const nodeType = node.type

    // Check if this is a paragraph or heading with tags
    if ((nodeType === 'paragraph' || nodeType === 'heading') && node.attrs) {
      const attrs = node.attrs as Record<string, unknown>
      const noteId = attrs.paragraphTagNoteId as string | undefined
      const topicId = attrs.paragraphTagTopicId as string | undefined

      if (noteId || topicId) {
        const pathStr = path.join('.')
        if (!paragraphLinks[pathStr]) {
          paragraphLinks[pathStr] = { noteIds: [], topicIds: [] }
        }
        if (noteId) {
          paragraphLinks[pathStr].noteIds.push(noteId as NoteId)
        }
        if (topicId) {
          paragraphLinks[pathStr].topicIds.push(topicId as TopicId)
        }
      }
    }

    // Recursively process children
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach((child, index) => {
        traverse(child, [...path, index.toString()])
      })
    }
  }

  traverse(content, [])
  return paragraphLinks
}

/**
 * Update note links by extracting both explicit links, mentions, and paragraph tags
 * Accepts either full Note[] or NoteMetadata[] for flexibility
 */
export function updateNoteLinks(
  note: Note,
  allNotesOrMetadata: Note[] | NoteMetadata[]
): {
  linkedNoteIds: NoteId[]
  mentionedNoteIds: NoteId[]
  paragraphLinks: Record<string, { noteIds: NoteId[]; topicIds: TopicId[] }>
} {
  const content = note.content as JSONContent

  // Extract explicit links
  const linkedNoteIds = extractNoteLinks(content)

  // Extract mentions (works with both Note[] and NoteMetadata[])
  const mentionedNoteIds = extractNoteMentions(content, allNotesOrMetadata)

  // Extract paragraph-level tags
  const paragraphLinks = extractParagraphLinks(content)

  // Build set of valid note IDs (works with both types)
  const validNoteIds = new Set(
    allNotesOrMetadata.map((n) => ('noteId' in n ? n.noteId : (n as Note).noteId))
  )

  // Filter out invalid IDs and self-references
  const linked = linkedNoteIds.filter((id) => id && validNoteIds.has(id) && id !== note.noteId)
  const mentioned = mentionedNoteIds.filter(
    (id) => id && validNoteIds.has(id) && id !== note.noteId
  )

  // Clean paragraph links - remove invalid IDs and self-references
  const cleanedParagraphLinks: Record<string, { noteIds: NoteId[]; topicIds: TopicId[] }> = {}
  for (const [path, tags] of Object.entries(paragraphLinks)) {
    const cleanedNoteIds = tags.noteIds.filter(
      (id) => id && validNoteIds.has(id) && id !== note.noteId
    )
    const cleanedTopicIds = tags.topicIds.filter((id) => id) // Topics don't need validation here

    if (cleanedNoteIds.length > 0 || cleanedTopicIds.length > 0) {
      cleanedParagraphLinks[path] = {
        noteIds: Array.from(new Set(cleanedNoteIds)),
        topicIds: Array.from(new Set(cleanedTopicIds)),
      }
    }
  }

  // Remove duplicates
  const uniqueLinked = Array.from(new Set(linked))
  const uniqueMentioned = Array.from(new Set(mentioned))

  return {
    linkedNoteIds: uniqueLinked,
    mentionedNoteIds: uniqueMentioned,
    paragraphLinks: cleanedParagraphLinks,
  }
}
