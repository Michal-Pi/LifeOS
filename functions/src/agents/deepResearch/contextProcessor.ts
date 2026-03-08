/**
 * Context Processor
 *
 * Extracts and formats user-provided context (attached notes, uploaded files)
 * for injection into workflow prompts and KG seeding.
 *
 * No LLM calls — pure string processing. Claim extraction from context
 * is handled by the existing extractClaimsFromSourceBatch pipeline.
 */

import { createHash } from 'crypto'
import type { SourceRecord } from '@lifeos/agents'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('ContextProcessor')

const MAX_CONTEXT_CHARS = 12_000
const MAX_ITEM_CHARS = 4_000

// ----- Types -----

interface AttachedNoteContext {
  noteId: string
  title: string
  content: string
}

interface UploadedFileContext {
  name: string
  type: 'json' | 'markdown' | string
  content: string | Record<string, unknown>
}

export interface ProcessedUserContext {
  /** Formatted text block for prompt injection (capped at MAX_CONTEXT_CHARS) */
  formattedText: string
  /** Whether any user context was provided */
  hasContext: boolean
  /** Number of notes included */
  noteCount: number
  /** Number of files included */
  fileCount: number
  /** Total character count before truncation */
  rawCharCount: number
}

export interface ContextSourceRecords {
  sources: SourceRecord[]
  contentMap: Record<string, string>
}

// ----- Helpers -----

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '\n[...truncated]'
}

function getUploadedFileText(file: UploadedFileContext): string {
  if (typeof file.content === 'string') return file.content
  return JSON.stringify(file.content, null, 2)
}

function getAttachedNotes(val: unknown): AttachedNoteContext[] {
  if (!Array.isArray(val)) return []
  return val.filter((item): item is AttachedNoteContext =>
    typeof item?.noteId === 'string'
    && typeof item?.title === 'string'
    && typeof item?.content === 'string'
  )
}

function getUploadedFiles(val: unknown): UploadedFileContext[] {
  if (!Array.isArray(val)) return []
  return val.filter((item): item is UploadedFileContext => {
    const content = item?.content
    return typeof item?.name === 'string'
      && typeof item?.type === 'string'
      && (typeof content === 'string' || (!!content && typeof content === 'object'))
  })
}

// ----- Main Exports -----

/**
 * Extract and format user context from run context record.
 * Returns a formatted text block suitable for prompt injection.
 */
export function extractUserContext(
  context: Record<string, unknown>
): ProcessedUserContext {
  const notes = getAttachedNotes(context.attachedNotes)
  const files = getUploadedFiles(context.uploadedFiles)

  if (notes.length === 0 && files.length === 0) {
    return { formattedText: '', hasContext: false, noteCount: 0, fileCount: 0, rawCharCount: 0 }
  }

  const sections: string[] = []
  let rawCharCount = 0

  for (const note of notes) {
    const text = stripHtml(note.content)
    rawCharCount += text.length
    sections.push(`--- Note: "${note.title}" ---\n${truncate(text, MAX_ITEM_CHARS)}`)
  }

  for (const file of files) {
    const text = getUploadedFileText(file)
    rawCharCount += text.length
    sections.push(`--- File: ${file.name} (${file.type}) ---\n${truncate(text, MAX_ITEM_CHARS)}`)
  }

  const body = sections.join('\n\n')
  const formatted = truncate(
    `USER-PROVIDED CONTEXT (the user attached the following materials — treat as high-relevance starting points):\n\n${body}`,
    MAX_CONTEXT_CHARS
  )

  log.info('Extracted user context', { noteCount: notes.length, fileCount: files.length, rawCharCount })

  return {
    formattedText: formatted,
    hasContext: true,
    noteCount: notes.length,
    fileCount: files.length,
    rawCharCount,
  }
}

/**
 * Build synthetic SourceRecord objects from user context.
 * Used by deep research to run claim extraction on context items.
 */
export function buildContextSourceRecords(
  context: Record<string, unknown>
): ContextSourceRecords {
  const notes = getAttachedNotes(context.attachedNotes)
  const files = getUploadedFiles(context.uploadedFiles)

  const sources: SourceRecord[] = []
  const contentMap: Record<string, string> = {}

  for (const note of notes) {
    const text = stripHtml(note.content)
    if (text.length < 20) continue // skip trivially short notes

    const sourceId = `user_note:${note.noteId}`
    const hash = createHash('sha256').update(text).digest('hex')

    sources.push({
      sourceId,
      url: `note://${note.noteId}`,
      title: note.title,
      domain: 'user_context',
      fetchedAtMs: Date.now(),
      fetchMethod: 'read_url',
      contentLength: text.length,
      contentHash: hash,
      sourceType: 'web', // closest match in the existing union
      relevanceScore: 1.0,
      sourceQualityScore: 0.7,
    })

    contentMap[sourceId] = truncate(text, MAX_ITEM_CHARS)
  }

  for (const file of files) {
    const text = getUploadedFileText(file)
    if (text.length < 20) continue

    const sourceId = `user_file:${file.name}`
    const hash = createHash('sha256').update(text).digest('hex')

    sources.push({
      sourceId,
      url: `file://${file.name}`,
      title: file.name,
      domain: 'user_context',
      fetchedAtMs: Date.now(),
      fetchMethod: 'read_url',
      contentLength: text.length,
      contentHash: hash,
      sourceType: 'web',
      relevanceScore: 1.0,
      sourceQualityScore: 0.7,
    })

    contentMap[sourceId] = truncate(text, MAX_ITEM_CHARS)
  }

  log.info('Built context source records', { sourceCount: sources.length })

  return { sources, contentMap }
}
