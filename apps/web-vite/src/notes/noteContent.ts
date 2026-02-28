/**
 * Note content helpers
 *
 * Ensures TipTap-compatible JSON and checks for empty drafts.
 */

import type { JSONContent } from '@tiptap/core'
import type { Note } from '@lifeos/notes'

const DEFAULT_NOTE_TITLE = 'Untitled'

function sanitizeNode(node: JSONContent | undefined): JSONContent | null {
  if (!node) return null

  if (node.type === 'text') {
    const text = typeof node.text === 'string' ? node.text : ''
    if (text.length === 0) {
      return null
    }
    return node
  }

  if (!node.content) {
    return node
  }

  const nextContent = node.content
    .map((child) => sanitizeNode(child))
    .filter(Boolean) as JSONContent[]

  const nextNode: JSONContent = { ...node }
  if (nextContent.length > 0) {
    nextNode.content = nextContent
  } else {
    delete nextNode.content
  }

  return nextNode
}

export function sanitizeNoteContent(content?: JSONContent): JSONContent | undefined {
  if (!content) return content
  const sanitized = sanitizeNode(content)
  if (sanitized) return sanitized
  return { type: 'doc', content: [] }
}

export function hasMeaningfulContent(content?: JSONContent): boolean {
  if (!content) return false

  if (content.type === 'text') {
    return Boolean(content.text?.trim())
  }

  if (content.type && content.type !== 'doc' && content.type !== 'paragraph') {
    return true
  }

  return Boolean(content.content?.some(hasMeaningfulContent))
}

export function stripHtml(html: string | undefined): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '').trim()
}

export function isNoteEmptyDraft(
  note: Pick<
    Note,
    'title' | 'content' | 'contentHtml' | 'attachmentIds' | 'projectIds' | 'okrIds' | 'tags'
  >,
  overrides?: { title?: string; content?: JSONContent; contentHtml?: string }
): boolean {
  const title = (overrides?.title ?? note.title ?? '').trim()
  const normalizedTitle = title.toLowerCase()
  const isUntitled = title.length === 0 || normalizedTitle === DEFAULT_NOTE_TITLE.toLowerCase()

  const content = overrides?.content ?? note.content
  const contentHtml = overrides?.contentHtml ?? note.contentHtml
  const hasBody = hasMeaningfulContent(content) || stripHtml(contentHtml).length > 0

  const hasAttachments = (note.attachmentIds?.length ?? 0) > 0
  const hasLinks = (note.projectIds?.length ?? 0) > 0 || (note.okrIds?.length ?? 0) > 0
  const hasTags = (note.tags?.length ?? 0) > 0

  return isUntitled && !hasBody && !hasAttachments && !hasLinks && !hasTags
}
