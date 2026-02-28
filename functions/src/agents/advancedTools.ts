/**
 * Advanced Built-in Tools for AI Agents (Phase 5D)
 *
 * This module provides advanced server-side tools that enable agents to:
 * - Read and create calendar events
 * - Read and create notes
 * - Perform real web searches
 *
 * All tools are scoped to the authenticated user's data for security.
 */

import { randomUUID } from 'crypto'
import { getFirestore } from 'firebase-admin/firestore'
import { searchDriveFiles, downloadDriveFile } from '../google/driveApi.js'
import { listGmailMessages, readGmailMessage } from '../google/gmailApi.js'
import { assertValidResearchContext, normalizeResearchQuestions } from './deepResearchValidation.js'
import type { ToolDefinition, ToolExecutionContext } from './toolExecutor.js'

const generateId = () => randomUUID()

/**
 * Resolve the user's first connected Google account ID.
 * Cached per userId to avoid redundant Firestore reads within the same function invocation.
 */
const googleAccountCache = new Map<string, string>()

async function resolveGoogleAccountId(userId: string): Promise<string> {
  const cached = googleAccountCache.get(userId)
  if (cached) return cached

  const db = getFirestore()
  const snapshot = await db
    .collection(`users/${userId}/privateIntegrations/google/googleAccounts`)
    .limit(1)
    .get()

  if (snapshot.empty) {
    throw new Error('No Google account connected. Please connect your Google account in Settings.')
  }

  const accountId = snapshot.docs[0].id
  googleAccountCache.set(userId, accountId)
  return accountId
}

/**
 * Calendar Tool: List upcoming events
 */
export const listCalendarEventsTool: ToolDefinition = {
  name: 'list_calendar_events',
  description: 'List upcoming calendar events for the user. Returns events sorted by start time.',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of events to return (default: 10, max: 50)',
      },
      startMs: {
        type: 'number',
        description: 'Filter events starting after this timestamp (default: now)',
      },
      endMs: {
        type: 'number',
        description: 'Filter events ending before this timestamp (optional)',
      },
    },
  },
  execute: async (params, context: ToolExecutionContext) => {
    const limit = Math.min((params.limit as number) || 10, 50)
    const startMs = (params.startMs as number) || Date.now()
    const endMs = params.endMs as number | undefined

    const db = getFirestore()
    const eventsRef = db.collection(`users/${context.userId}/events`)

    let query = eventsRef.where('startMs', '>=', startMs).orderBy('startMs', 'asc').limit(limit)

    if (endMs) {
      query = query.where('startMs', '<=', endMs)
    }

    const snapshot = await query.get()

    const events = snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        eventId: doc.id,
        title: data.title,
        startMs: data.startMs,
        endMs: data.endMs,
        allDay: data.allDay || false,
        location: data.location,
        description: data.description,
        timezone: data.timezone,
      }
    })

    return {
      count: events.length,
      events,
      note:
        events.length === 0
          ? 'No events found in the specified time range'
          : `Found ${events.length} upcoming events`,
    }
  },
}

/**
 * Calendar Tool: Create a new event
 */
export const createCalendarEventTool: ToolDefinition = {
  name: 'create_calendar_event',
  description:
    'Create a new calendar event for the user. The event will be saved to their local calendar.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Event title (required)',
      },
      startMs: {
        type: 'number',
        description: 'Event start time in milliseconds since epoch (required)',
      },
      endMs: {
        type: 'number',
        description: 'Event end time in milliseconds since epoch (required)',
      },
      allDay: {
        type: 'boolean',
        description: 'Whether this is an all-day event (default: false)',
      },
      location: {
        type: 'string',
        description: 'Event location (optional)',
      },
      description: {
        type: 'string',
        description: 'Event description (optional)',
      },
      timezone: {
        type: 'string',
        description: 'Timezone for the event (default: UTC)',
      },
    },
    required: ['title', 'startMs', 'endMs'],
  },
  execute: async (params, context: ToolExecutionContext) => {
    const title = params.title as string
    const startMs = params.startMs as number
    const endMs = params.endMs as number
    const allDay = (params.allDay as boolean) || false
    const location = params.location as string | undefined
    const description = params.description as string | undefined
    const timezone = (params.timezone as string) || 'UTC'

    // Validate times
    if (endMs <= startMs) {
      throw new Error('Event end time must be after start time')
    }

    const db = getFirestore()
    const eventId = `event:${generateId()}`

    const event = {
      eventId,
      userId: context.userId,
      title,
      startMs,
      endMs,
      allDay,
      location: location || '',
      description: description || '',
      timezone,
      calendarId: 'local',
      providerRef: {
        provider: 'local',
        accountId: context.userId,
        providerEventId: eventId,
        providerCalendarId: 'local',
      },
      writebackState: 'synced' as const,
      syncState: 'synced' as const,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      version: 1,
    }

    await db.collection(`users/${context.userId}/events`).doc(eventId).set(event)

    return {
      success: true,
      eventId,
      title,
      startMs,
      endMs,
      message: `Created event "${title}" successfully`,
    }
  },
}

/**
 * Notes Tool: List recent notes
 */
export const listNotesTool: ToolDefinition = {
  name: 'list_notes',
  description:
    'List recent notes for the user. Returns notes sorted by last updated time (most recent first).',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of notes to return (default: 10, max: 50)',
      },
      topicId: {
        type: 'string',
        description: 'Filter notes by topic/folder ID (optional)',
      },
      searchQuery: {
        type: 'string',
        description: 'Search query to filter notes by title (optional)',
      },
    },
  },
  execute: async (params, context: ToolExecutionContext) => {
    const limit = Math.min((params.limit as number) || 10, 50)
    const topicId = params.topicId as string | undefined
    const searchQuery = params.searchQuery as string | undefined

    const db = getFirestore()
    let query = db
      .collection(`users/${context.userId}/notes`)
      .orderBy('updatedAtMs', 'desc')
      .limit(limit)

    if (topicId) {
      query = query.where('topicId', '==', topicId)
    }

    const snapshot = await query.get()

    let notes = snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        noteId: doc.id,
        title: data.title,
        topicId: data.topicId,
        tags: data.tags || [],
        updatedAtMs: data.updatedAtMs,
        createdAtMs: data.createdAtMs,
        // Include a snippet of content if available
        contentPreview: data.contentHtml?.substring(0, 200) || '',
      }
    })

    // Filter by search query if provided (client-side filtering since contentHtml might not be indexed)
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase()
      notes = notes.filter((note) => note.title.toLowerCase().includes(lowerQuery))
    }

    return {
      count: notes.length,
      notes,
      note:
        notes.length === 0 ? 'No notes found matching the criteria' : `Found ${notes.length} notes`,
    }
  },
}

/**
 * Notes Tool: Create a new note
 */
export const createNoteTool: ToolDefinition = {
  name: 'create_note',
  description:
    'Create a new note for the user. The note will be saved with basic ProseMirror JSON structure.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Note title (required)',
      },
      content: {
        type: 'string',
        description: 'Note content as plain text (will be converted to ProseMirror JSON structure)',
      },
      topicId: {
        type: 'string',
        description: 'Topic/folder ID to organize the note (optional)',
      },
      tags: {
        type: 'array',
        description: 'Array of tags for the note (optional)',
      },
    },
    required: ['title'],
  },
  execute: async (params, context: ToolExecutionContext) => {
    const title = params.title as string
    const contentText = (params.content as string) || ''
    const topicId = (params.topicId as string) || null
    const tags = (params.tags as string[]) || []

    const db = getFirestore()
    const noteId = `note:${generateId()}`

    // Create basic ProseMirror JSON structure
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: contentText
            ? [
                {
                  type: 'text',
                  text: contentText,
                },
              ]
            : [],
        },
      ],
    }

    const note = {
      noteId,
      userId: context.userId,
      title,
      content,
      contentHtml: `<p>${contentText}</p>`, // Simple HTML conversion
      topicId,
      sectionId: null,
      projectIds: [],
      okrIds: [],
      tags,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      lastAccessedAtMs: Date.now(),
      syncState: 'synced' as const,
      version: 1,
      attachmentIds: [],
    }

    await db.collection(`users/${context.userId}/notes`).doc(noteId).set(note)

    return {
      success: true,
      noteId,
      title,
      message: `Created note "${title}" successfully`,
    }
  },
}

/**
 * Notes Tool: Read a specific note by ID
 */
export const readNoteTool: ToolDefinition = {
  name: 'read_note',
  description: 'Read the full content of a specific note by its ID.',
  parameters: {
    type: 'object',
    properties: {
      noteId: {
        type: 'string',
        description: 'The ID of the note to read (required)',
      },
    },
    required: ['noteId'],
  },
  execute: async (params, context: ToolExecutionContext) => {
    const noteId = params.noteId as string

    const db = getFirestore()
    const noteDoc = await db.collection(`users/${context.userId}/notes`).doc(noteId).get()

    if (!noteDoc.exists) {
      throw new Error(`Note with ID "${noteId}" not found`)
    }

    const data = noteDoc.data()!

    return {
      noteId: noteDoc.id,
      title: data.title,
      content: data.content,
      contentHtml: data.contentHtml,
      topicId: data.topicId,
      tags: data.tags || [],
      projectIds: data.projectIds || [],
      createdAtMs: data.createdAtMs,
      updatedAtMs: data.updatedAtMs,
    }
  },
}

/**
 * Notes Tool: Analyze note content and identify key paragraphs/ideas
 */
export const analyzeNoteParagraphsTool: ToolDefinition = {
  name: 'analyze_note_paragraphs',
  description:
    'Analyze a note and identify key paragraphs, ideas, or sections that could be tagged or linked to other notes/topics. Returns structured data about each identified paragraph.',
  parameters: {
    type: 'object',
    properties: {
      noteId: {
        type: 'string',
        description: 'The ID of the note to analyze (required)',
      },
      minParagraphLength: {
        type: 'number',
        description: 'Minimum character length for a paragraph to be considered (default: 50)',
      },
    },
    required: ['noteId'],
  },
  execute: async (params, context: ToolExecutionContext) => {
    const noteId = params.noteId as string
    const minLength = (params.minParagraphLength as number) || 50

    const db = getFirestore()
    const noteDoc = await db.collection(`users/${context.userId}/notes`).doc(noteId).get()

    if (!noteDoc.exists) {
      throw new Error(`Note with ID "${noteId}" not found`)
    }

    const data = noteDoc.data()!
    const content = data.content as { type: string; content?: unknown[] }

    // Extract paragraphs from ProseMirror JSON
    const extractParagraphs = (
      node: unknown,
      path: string[] = []
    ): Array<{
      path: string
      text: string
      type: string
      position: number
    }> => {
      const paragraphs: Array<{ path: string; text: string; type: string; position: number }> = []
      let position = 0

      if (typeof node === 'object' && node !== null) {
        const nodeObj = node as Record<string, unknown>
        const nodeType = nodeObj.type as string

        if (nodeType === 'paragraph' || nodeType === 'heading') {
          const text = extractText(nodeObj)
          if (text.length >= minLength) {
            paragraphs.push({
              path: path.join('.'),
              text,
              type: nodeType,
              position,
            })
            position++
          }
        }

        if (nodeObj.content && Array.isArray(nodeObj.content)) {
          nodeObj.content.forEach((child, index) => {
            const childParagraphs = extractParagraphs(child, [...path, index.toString()])
            paragraphs.push(...childParagraphs)
          })
        }
      }

      return paragraphs
    }

    const extractText = (node: Record<string, unknown>): string => {
      if (node.type === 'text' && typeof node.text === 'string') {
        return node.text
      }
      if (node.content && Array.isArray(node.content)) {
        return node.content.map((child) => extractText(child as Record<string, unknown>)).join(' ')
      }
      return ''
    }

    const paragraphs = extractParagraphs(content, [])

    return {
      noteId,
      title: data.title,
      paragraphCount: paragraphs.length,
      paragraphs: paragraphs.map((p) => ({
        path: p.path,
        text: p.text.substring(0, 200) + (p.text.length > 200 ? '...' : ''), // Preview
        fullText: p.text,
        type: p.type,
        position: p.position,
      })),
      message: `Identified ${paragraphs.length} key paragraphs/ideas in note "${data.title}"`,
    }
  },
}

/**
 * Notes Tool: Tag a paragraph with a note or topic
 */
export const tagParagraphTool: ToolDefinition = {
  name: 'tag_paragraph_with_note',
  description:
    'Tag a specific paragraph in a note with another note or topic. This creates a relationship in the knowledge graph.',
  parameters: {
    type: 'object',
    properties: {
      noteId: {
        type: 'string',
        description: 'The ID of the note containing the paragraph to tag (required)',
      },
      paragraphPath: {
        type: 'string',
        description:
          'The path to the paragraph (e.g., "0.1" for second paragraph in first section) (required)',
      },
      targetNoteId: {
        type: 'string',
        description:
          'The ID of the note to tag this paragraph with (optional, if tagging with note)',
      },
      targetTopicId: {
        type: 'string',
        description:
          'The ID of the topic to tag this paragraph with (optional, if tagging with topic)',
      },
    },
    required: ['noteId', 'paragraphPath'],
  },
  execute: async (params, context: ToolExecutionContext) => {
    const noteId = params.noteId as string
    const paragraphPath = params.paragraphPath as string
    const targetNoteId = params.targetNoteId as string | undefined
    const targetTopicId = params.targetTopicId as string | undefined

    if (!targetNoteId && !targetTopicId) {
      throw new Error('Either targetNoteId or targetTopicId must be provided')
    }

    const db = getFirestore()
    const noteDoc = await db.collection(`users/${context.userId}/notes`).doc(noteId).get()

    if (!noteDoc.exists) {
      throw new Error(`Note with ID "${noteId}" not found`)
    }

    const data = noteDoc.data()!
    const paragraphLinks =
      (data.paragraphLinks as Record<
        string,
        {
          noteIds?: string[]
          topicIds?: string[]
        }
      >) || {}

    // Initialize paragraph links if not exists
    if (!paragraphLinks[paragraphPath]) {
      paragraphLinks[paragraphPath] = {}
    }

    // Add the tag
    if (targetNoteId) {
      if (!paragraphLinks[paragraphPath].noteIds) {
        paragraphLinks[paragraphPath].noteIds = []
      }
      if (!paragraphLinks[paragraphPath].noteIds!.includes(targetNoteId)) {
        paragraphLinks[paragraphPath].noteIds!.push(targetNoteId)
      }
    }

    if (targetTopicId) {
      if (!paragraphLinks[paragraphPath].topicIds) {
        paragraphLinks[paragraphPath].topicIds = []
      }
      if (!paragraphLinks[paragraphPath].topicIds!.includes(targetTopicId)) {
        paragraphLinks[paragraphPath].topicIds!.push(targetTopicId)
      }
    }

    // Update the note
    await db.collection(`users/${context.userId}/notes`).doc(noteId).update({
      paragraphLinks,
      updatedAtMs: Date.now(),
    })

    // Also update linkedNoteIds if tagging with a note
    if (targetNoteId) {
      const linkedNoteIds = (data.linkedNoteIds as string[]) || []
      if (!linkedNoteIds.includes(targetNoteId)) {
        await db
          .collection(`users/${context.userId}/notes`)
          .doc(noteId)
          .update({
            linkedNoteIds: [...linkedNoteIds, targetNoteId],
          })
      }
    }

    return {
      success: true,
      noteId,
      paragraphPath,
      targetNoteId,
      targetTopicId,
      message: `Tagged paragraph at path "${paragraphPath}" successfully`,
    }
  },
}

/**
 * Deep Research Tool: Create a research delegation request
 */
export const createDeepResearchRequestTool: ToolDefinition = {
  name: 'create_deep_research_request',
  description: 'Create a research request for external delegation and queue it for user review.',
  parameters: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Research topic (required)',
      },
      questions: {
        type: 'array',
        description: 'List of research questions (required)',
        items: {
          type: 'string',
          description: 'Research question',
        },
      },
      context: {
        type: 'object',
        description: 'Optional context to help guide external research',
      },
      priority: {
        type: 'string',
        description: 'Priority: low, medium, high, critical (default: medium)',
      },
      estimatedTime: {
        type: 'string',
        description: 'Estimated time for research (optional)',
      },
    },
    required: ['topic', 'questions'],
  },
  execute: async (params, context: ToolExecutionContext) => {
    const topic = typeof params.topic === 'string' ? params.topic.trim() : ''
    const questions = Array.isArray(params.questions)
      ? normalizeResearchQuestions(params.questions.map((question) => String(question)))
      : []
    const priorityInput = typeof params.priority === 'string' ? params.priority : 'medium'
    const priority = ['low', 'medium', 'high', 'critical'].includes(priorityInput)
      ? (priorityInput as 'low' | 'medium' | 'high' | 'critical')
      : 'medium'
    const estimatedTime =
      typeof params.estimatedTime === 'string' && params.estimatedTime.trim()
        ? params.estimatedTime.trim()
        : undefined
    const extraContext =
      params.context && typeof params.context === 'object'
        ? (params.context as Record<string, unknown>)
        : undefined

    if (!topic) {
      throw new Error('Research topic is required')
    }
    if (questions.length === 0) {
      throw new Error('At least one research question is required')
    }
    assertValidResearchContext(extraContext)

    const db = getFirestore()
    const requestId = `research:${generateId()}`

    const request = {
      requestId,
      workflowId: context.workflowId,
      runId: context.runId,
      userId: context.userId,
      topic,
      questions,
      context: extraContext,
      priority,
      estimatedTime,
      createdBy: context.agentId,
      createdAtMs: Date.now(),
      status: 'pending',
      results: [],
    }

    await db
      .collection(`users/${context.userId}/workflows/${context.workflowId}/deepResearchRequests`)
      .doc(requestId)
      .set(request)

    return {
      requestId,
      topic,
      questions,
      priority,
      estimatedTime,
      status: 'pending',
      message: 'Deep research request created and queued for user delegation.',
    }
  },
}

/**
 * Serper Search Tool: Fast SERP results with rich structured data
 * Uses Serper API (https://serper.dev)
 * Requires SERPER_API_KEY environment variable
 */
export const serpSearchTool: ToolDefinition = {
  name: 'serp_search',
  description:
    'Fast web search via Serper. Returns SERP results with titles, snippets, URLs, and optionally People Also Ask and Knowledge Graph data. Supports web search and news search. Supports locale via gl (country) and hl (language) parameters.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (required)',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5, max: 10)',
      },
      searchType: {
        type: 'string',
        description:
          'Type of search: "search" for web results, "news" for news results (default: "search")',
      },
      gl: {
        type: 'string',
        description: 'Country code for localized results (e.g. "us", "uk", "de"). Default: "us"',
      },
      hl: {
        type: 'string',
        description: 'Language code for results (e.g. "en", "es", "de"). Default: "en"',
      },
    },
    required: ['query'],
  },
  execute: async (params, context) => {
    const query = params.query as string
    const maxResults = Math.min((params.maxResults as number) || 5, 10)
    const searchType = (params.searchType as string) || 'search'
    const gl = params.gl as string | undefined
    const hl = params.hl as string | undefined

    const apiKey = context?.searchToolKeys?.serper || process.env.SERPER_API_KEY

    if (!apiKey) {
      return {
        query,
        results: [],
        note: 'Serper API key not configured. Set SERPER_API_KEY in Firebase Functions secrets.',
      }
    }

    try {
      const endpoint =
        searchType === 'news'
          ? 'https://google.serper.dev/news'
          : 'https://google.serper.dev/search'

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: query,
          num: maxResults,
          ...(gl ? { gl } : {}),
          ...(hl ? { hl } : {}),
        }),
      })

      if (!response.ok) {
        throw new Error(`Serper API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as {
        organic?: Array<{
          title: string
          snippet: string
          link: string
          position: number
          date?: string
        }>
        news?: Array<{
          title: string
          snippet: string
          link: string
          date?: string
          source?: string
        }>
        peopleAlsoAsk?: Array<{
          question: string
          snippet: string
        }>
        knowledgeGraph?: {
          title?: string
          type?: string
          description?: string
        }
      }

      const results =
        searchType === 'news'
          ? (data.news || []).map((item) => ({
              title: item.title,
              snippet: item.snippet,
              url: item.link,
              date: item.date,
              source: item.source,
            }))
          : (data.organic || []).map((item) => ({
              title: item.title,
              snippet: item.snippet,
              url: item.link,
              position: item.position,
            }))

      return {
        query,
        searchType,
        count: results.length,
        results,
        peopleAlsoAsk: data.peopleAlsoAsk?.slice(0, 3),
        knowledgeGraph: data.knowledgeGraph,
        note:
          results.length === 0
            ? `No results found for "${query}"`
            : `Found ${results.length} results for "${query}"`,
      }
    } catch (error) {
      throw new Error(`Serper search failed: ${(error as Error).message}`)
    }
  },
}

/**
 * Jina Reader Tool: Free URL-to-clean-markdown extraction
 * Uses Jina Reader API (https://jina.ai/reader)
 * No API key required for basic usage; optional JINA_API_KEY for higher rate limits
 */
export const readUrlTool: ToolDefinition = {
  name: 'read_url',
  description:
    'Read any URL and extract its content as clean markdown. Uses Jina Reader for reliable extraction. Good for reading articles, blog posts, documentation, and other web pages. Supports CSS selector targeting, link/image summaries, and multiple return formats.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The full URL to read (required)',
      },
      targetSelector: {
        type: 'string',
        description:
          'CSS selector to focus on specific page content (e.g. "article", "#main-content"). Optional.',
      },
      withLinksSummary: {
        type: 'boolean',
        description: 'Include a summary of all links on the page (default: false)',
      },
      withImagesSummary: {
        type: 'boolean',
        description: 'Include a summary of all images on the page (default: false)',
      },
      returnFormat: {
        type: 'string',
        description: 'Return format: "text" (default), "html", or "screenshot"',
      },
    },
    required: ['url'],
  },
  execute: async (params, context) => {
    const url = params.url as string
    const targetSelector = params.targetSelector as string | undefined
    const withLinksSummary = params.withLinksSummary as boolean | undefined
    const withImagesSummary = params.withImagesSummary as boolean | undefined
    const returnFormat = params.returnFormat as string | undefined

    if (!url || !url.startsWith('http')) {
      throw new Error('A valid URL starting with http:// or https:// is required')
    }

    try {
      const headers: Record<string, string> = {
        Accept: returnFormat === 'html' ? 'text/html' : 'text/plain',
      }
      if (targetSelector) headers['X-Target-Selector'] = targetSelector
      if (withLinksSummary) headers['X-With-Links-Summary'] = 'true'
      if (withImagesSummary) headers['X-With-Images-Summary'] = 'true'
      if (returnFormat) headers['X-Return-Format'] = returnFormat

      const jinaKey = context?.searchToolKeys?.jina || process.env.JINA_API_KEY
      if (jinaKey) {
        headers['Authorization'] = `Bearer ${jinaKey}`
      }

      const response = await fetch(`https://r.jina.ai/${url}`, { headers })

      if (!response.ok) {
        throw new Error(`Jina Reader error: ${response.status} ${response.statusText}`)
      }

      const content = await response.text()

      // Extract title from the first markdown heading if present
      const titleMatch = content.match(/^#\s+(.+)$/m)
      const title = titleMatch?.[1] || url

      // Truncate very long content to avoid token bloat
      const maxLength = 15000
      const truncated = content.length > maxLength
      const trimmedContent = truncated
        ? content.substring(0, maxLength) + '\n\n[... content truncated]'
        : content

      return {
        url,
        title,
        content: trimmedContent,
        wordCount: content.split(/\s+/).length,
        truncated,
        note: `Successfully extracted content from "${title}" (${content.split(/\s+/).length} words)`,
      }
    } catch (error) {
      throw new Error(`URL reading failed: ${(error as Error).message}`)
    }
  },
}

/**
 * Firecrawl Scrape Tool: Robust scraping for JS-heavy or blocked sites
 * Uses Firecrawl API (https://firecrawl.dev)
 * Requires FIRECRAWL_API_KEY environment variable
 */
export const scrapeUrlTool: ToolDefinition = {
  name: 'scrape_url',
  description:
    'Scrape a web page and extract content as markdown, HTML, links, or screenshot. Handles JavaScript-rendered pages and sites that block simple fetching. Use this as a fallback when read_url fails. Supports multiple output formats.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The full URL to scrape (required)',
      },
      formats: {
        type: 'array',
        items: { type: 'string', description: 'Format type' },
        description:
          'Output formats: "markdown" (default), "html", "links", "screenshot". Can request multiple.',
      },
    },
    required: ['url'],
  },
  execute: async (params, context) => {
    const url = params.url as string
    const formats = params.formats as string[] | undefined

    if (!url || !url.startsWith('http')) {
      throw new Error('A valid URL starting with http:// or https:// is required')
    }

    const apiKey = context?.searchToolKeys?.firecrawl || process.env.FIRECRAWL_API_KEY

    if (!apiKey) {
      return {
        url,
        content: '',
        note: 'Firecrawl API key not configured. Set FIRECRAWL_API_KEY in Firebase Functions secrets.',
      }
    }

    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: formats && formats.length > 0 ? formats : ['markdown'],
        }),
      })

      if (!response.ok) {
        throw new Error(`Firecrawl API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as {
        success: boolean
        data?: {
          markdown?: string
          html?: string
          links?: string[]
          screenshot?: string
          metadata?: {
            title?: string
            description?: string
            sourceURL?: string
          }
        }
      }

      if (!data.success || !data.data) {
        throw new Error('Firecrawl scraping failed - no content returned')
      }

      const content = data.data.markdown || ''
      const title = data.data.metadata?.title || url

      // Truncate very long content
      const maxLength = 15000
      const truncated = content.length > maxLength
      const trimmedContent = truncated
        ? content.substring(0, maxLength) + '\n\n[... content truncated]'
        : content

      return {
        url,
        title,
        content: trimmedContent,
        wordCount: content.split(/\s+/).length,
        truncated,
        metadata: data.data.metadata,
        ...(data.data.html ? { html: data.data.html.substring(0, 15000) } : {}),
        ...(data.data.links ? { links: data.data.links } : {}),
        ...(data.data.screenshot ? { screenshot: data.data.screenshot } : {}),
        note: `Successfully scraped "${title}" (${content.split(/\s+/).length} words)`,
      }
    } catch (error) {
      throw new Error(`Firecrawl scraping failed: ${(error as Error).message}`)
    }
  },
}

/**
 * Exa Semantic Search Tool: Neural/semantic search for conceptual discovery
 * Uses Exa API (https://exa.ai)
 * Requires EXA_API_KEY environment variable
 */
export const semanticSearchTool: ToolDefinition = {
  name: 'semantic_search',
  description:
    'Neural/semantic search that finds conceptually related content, not just keyword matches. Good for discovering research, articles, and resources related to a concept or idea. Use this alongside serp_search for comprehensive research. Supports category filtering, date ranges, domain inclusion/exclusion, highlights, and AI summaries.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query describing the concept or topic (required)',
      },
      numResults: {
        type: 'number',
        description: 'Number of results to return (default: 5, max: 10)',
      },
      useAutoprompt: {
        type: 'boolean',
        description: 'Let Exa optimize the query for better results (default: true)',
      },
      category: {
        type: 'string',
        description:
          'Filter by category: "company", "research paper", "news", "github", "tweet", "movie", "song", "personal site", "pdf". Optional.',
      },
      searchType: {
        type: 'string',
        description:
          'Search type: "keyword" for traditional, "neural" for semantic (default), or "auto" to let Exa decide',
      },
      startPublishedDate: {
        type: 'string',
        description:
          'Filter results published after this date (ISO format, e.g. "2024-01-01T00:00:00.000Z"). Optional.',
      },
      endPublishedDate: {
        type: 'string',
        description: 'Filter results published before this date (ISO format). Optional.',
      },
      includeDomains: {
        type: 'array',
        items: { type: 'string', description: 'Domain name' },
        description: 'Only include results from these domains. Optional.',
      },
      excludeDomains: {
        type: 'array',
        items: { type: 'string', description: 'Domain name' },
        description: 'Exclude results from these domains. Optional.',
      },
      includeHighlights: {
        type: 'boolean',
        description: 'Include highlighted snippets in results (default: false)',
      },
      includeSummary: {
        type: 'boolean',
        description: 'Include AI-generated summary per result (default: false)',
      },
    },
    required: ['query'],
  },
  execute: async (params, context) => {
    const query = params.query as string
    const numResults = Math.min((params.numResults as number) || 5, 10)
    const useAutoprompt = params.useAutoprompt !== false
    const category = params.category as string | undefined
    const searchType = params.searchType as string | undefined
    const startPublishedDate = params.startPublishedDate as string | undefined
    const endPublishedDate = params.endPublishedDate as string | undefined
    const includeDomains = params.includeDomains as string[] | undefined
    const excludeDomains = params.excludeDomains as string[] | undefined
    const includeHighlights = params.includeHighlights as boolean | undefined
    const includeSummary = params.includeSummary as boolean | undefined

    const apiKey = context?.searchToolKeys?.exa || process.env.EXA_API_KEY

    if (!apiKey) {
      return {
        query,
        results: [],
        note: 'Exa API key not configured. Set EXA_API_KEY in Firebase Functions secrets.',
      }
    }

    try {
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          numResults,
          useAutoprompt,
          ...(searchType ? { type: searchType } : {}),
          ...(category ? { category } : {}),
          ...(startPublishedDate ? { startPublishedDate } : {}),
          ...(endPublishedDate ? { endPublishedDate } : {}),
          ...(includeDomains?.length ? { includeDomains } : {}),
          ...(excludeDomains?.length ? { excludeDomains } : {}),
          contents: {
            text: { maxCharacters: 500 },
            ...(includeHighlights ? { highlights: { numSentences: 3 } } : {}),
            ...(includeSummary ? { summary: true } : {}),
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`Exa API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as {
        results: Array<{
          title: string
          url: string
          text?: string
          score: number
          publishedDate?: string
          author?: string
          highlights?: string[]
          summary?: string
        }>
        autopromptString?: string
      }

      const results = (data.results || []).map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.text || '',
        score: item.score,
        publishedDate: item.publishedDate,
        author: item.author,
        ...(item.highlights?.length ? { highlights: item.highlights } : {}),
        ...(item.summary ? { summary: item.summary } : {}),
      }))

      return {
        query,
        optimizedQuery: data.autopromptString,
        count: results.length,
        results,
        note:
          results.length === 0
            ? `No semantic results found for "${query}"`
            : `Found ${results.length} semantically related results for "${query}"`,
      }
    } catch (error) {
      throw new Error(`Exa semantic search failed: ${(error as Error).message}`)
    }
  },
}

/**
 * Search Images Tool: Search for images via Serper
 * Uses Serper Images API (https://serper.dev)
 */
export const searchImagesTool: ToolDefinition = {
  name: 'search_images',
  description:
    'Search for images by query. Returns image URLs, dimensions, source info, and thumbnails. Useful for finding reference images, visual content, and media.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Image search query (required)' },
      maxResults: { type: 'number', description: 'Maximum results (default: 5, max: 10)' },
      gl: { type: 'string', description: 'Country code (e.g. "us")' },
      hl: { type: 'string', description: 'Language code (e.g. "en")' },
    },
    required: ['query'],
  },
  execute: async (params, context) => {
    const query = params.query as string
    const maxResults = Math.min((params.maxResults as number) || 5, 10)
    const gl = params.gl as string | undefined
    const hl = params.hl as string | undefined
    const apiKey = context?.searchToolKeys?.serper || process.env.SERPER_API_KEY
    if (!apiKey) return { query, images: [], note: 'Serper API key not configured.' }
    try {
      const response = await fetch('https://google.serper.dev/images', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: query,
          num: maxResults,
          ...(gl ? { gl } : {}),
          ...(hl ? { hl } : {}),
        }),
      })
      if (!response.ok) throw new Error(`Serper Images API error: ${response.status}`)
      const data = (await response.json()) as {
        images?: Array<{
          title: string
          imageUrl: string
          imageWidth: number
          imageHeight: number
          thumbnailUrl: string
          source: string
          domain: string
          link: string
        }>
      }
      const images = (data.images || []).slice(0, maxResults).map((img) => ({
        title: img.title,
        imageUrl: img.imageUrl,
        width: img.imageWidth,
        height: img.imageHeight,
        thumbnailUrl: img.thumbnailUrl,
        source: img.source,
        domain: img.domain,
        link: img.link,
      }))
      return {
        query,
        count: images.length,
        images,
        note: `Found ${images.length} images for "${query}"`,
      }
    } catch (error) {
      throw new Error(`Image search failed: ${(error as Error).message}`)
    }
  },
}

/**
 * Search Videos Tool: Search for videos via Serper
 * Uses Serper Videos API (https://serper.dev)
 */
export const searchVideosTool: ToolDefinition = {
  name: 'search_videos',
  description:
    'Search for videos on YouTube and other platforms. Returns video titles, links, snippets, channel info, duration, and view counts.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Video search query (required)' },
      maxResults: { type: 'number', description: 'Maximum results (default: 5, max: 10)' },
      gl: { type: 'string', description: 'Country code (e.g. "us")' },
      hl: { type: 'string', description: 'Language code (e.g. "en")' },
    },
    required: ['query'],
  },
  execute: async (params, context) => {
    const query = params.query as string
    const maxResults = Math.min((params.maxResults as number) || 5, 10)
    const gl = params.gl as string | undefined
    const hl = params.hl as string | undefined
    const apiKey = context?.searchToolKeys?.serper || process.env.SERPER_API_KEY
    if (!apiKey) return { query, videos: [], note: 'Serper API key not configured.' }
    try {
      const response = await fetch('https://google.serper.dev/videos', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: query,
          num: maxResults,
          ...(gl ? { gl } : {}),
          ...(hl ? { hl } : {}),
        }),
      })
      if (!response.ok) throw new Error(`Serper Videos API error: ${response.status}`)
      const data = (await response.json()) as {
        videos?: Array<{
          title: string
          link: string
          snippet: string
          channel?: string
          date?: string
          duration?: string
          views?: number
        }>
      }
      const videos = (data.videos || []).slice(0, maxResults).map((v) => ({
        title: v.title,
        link: v.link,
        snippet: v.snippet,
        channel: v.channel,
        date: v.date,
        duration: v.duration,
        views: v.views,
      }))
      return {
        query,
        count: videos.length,
        videos,
        note: `Found ${videos.length} videos for "${query}"`,
      }
    } catch (error) {
      throw new Error(`Video search failed: ${(error as Error).message}`)
    }
  },
}

/**
 * Search Scholar Tool: Search academic papers via Serper
 * Uses Serper Scholar API (https://serper.dev)
 */
export const searchScholarTool: ToolDefinition = {
  name: 'search_scholar',
  description:
    'Search academic papers on Google Scholar. Returns paper titles, links, abstracts, publication info, and citation counts. Ideal for research and literature reviews.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Academic search query (required)' },
      maxResults: { type: 'number', description: 'Maximum results (default: 5, max: 10)' },
      yearFrom: { type: 'number', description: 'Filter papers published from this year' },
      yearTo: { type: 'number', description: 'Filter papers published up to this year' },
    },
    required: ['query'],
  },
  execute: async (params, context) => {
    const query = params.query as string
    const maxResults = Math.min((params.maxResults as number) || 5, 10)
    const yearFrom = params.yearFrom as number | undefined
    const yearTo = params.yearTo as number | undefined
    const apiKey = context?.searchToolKeys?.serper || process.env.SERPER_API_KEY
    if (!apiKey) return { query, papers: [], note: 'Serper API key not configured.' }
    try {
      const response = await fetch('https://google.serper.dev/scholar', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: query,
          num: maxResults,
          ...(yearFrom ? { yearFrom } : {}),
          ...(yearTo ? { yearTo } : {}),
        }),
      })
      if (!response.ok) throw new Error(`Serper Scholar API error: ${response.status}`)
      const data = (await response.json()) as {
        organic?: Array<{
          title: string
          link: string
          snippet: string
          publicationInfo?: { summary?: string }
          citedBy?: { total?: number; link?: string }
          year?: string
        }>
      }
      const papers = (data.organic || []).slice(0, maxResults).map((p) => ({
        title: p.title,
        link: p.link,
        snippet: p.snippet,
        publicationInfo: p.publicationInfo?.summary,
        citedBy: p.citedBy?.total,
        year: p.year,
      }))
      return {
        query,
        count: papers.length,
        papers,
        note: `Found ${papers.length} academic papers for "${query}"`,
      }
    } catch (error) {
      throw new Error(`Scholar search failed: ${(error as Error).message}`)
    }
  },
}

/**
 * Search Places Tool: Search local businesses and places via Serper
 * Uses Serper Places API (https://serper.dev)
 */
export const searchPlacesTool: ToolDefinition = {
  name: 'search_places',
  description:
    'Search for local businesses and places. Returns names, addresses, ratings, reviews, phone numbers, hours, and categories.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Place search query, e.g. "best pizza in San Francisco" (required)',
      },
      location: {
        type: 'string',
        description: 'Location context, e.g. "San Francisco, CA". Optional.',
      },
      maxResults: { type: 'number', description: 'Maximum results (default: 5, max: 10)' },
      gl: { type: 'string', description: 'Country code (e.g. "us")' },
    },
    required: ['query'],
  },
  execute: async (params, context) => {
    const query = params.query as string
    const maxResults = Math.min((params.maxResults as number) || 5, 10)
    const location = params.location as string | undefined
    const gl = params.gl as string | undefined
    const apiKey = context?.searchToolKeys?.serper || process.env.SERPER_API_KEY
    if (!apiKey) return { query, places: [], note: 'Serper API key not configured.' }
    try {
      const response = await fetch('https://google.serper.dev/places', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: query,
          num: maxResults,
          ...(location ? { location } : {}),
          ...(gl ? { gl } : {}),
        }),
      })
      if (!response.ok) throw new Error(`Serper Places API error: ${response.status}`)
      const data = (await response.json()) as {
        places?: Array<{
          title: string
          address: string
          rating?: number
          ratingCount?: number
          phone?: string
          hours?: string
          category?: string
          cid?: string
        }>
      }
      const places = (data.places || []).slice(0, maxResults).map((p) => ({
        title: p.title,
        address: p.address,
        rating: p.rating,
        reviews: p.ratingCount,
        phone: p.phone,
        hours: p.hours,
        category: p.category,
      }))
      return {
        query,
        count: places.length,
        places,
        note: `Found ${places.length} places for "${query}"`,
      }
    } catch (error) {
      throw new Error(`Places search failed: ${(error as Error).message}`)
    }
  },
}

/**
 * Find Similar Tool: Find web pages similar to a given URL
 * Uses Exa findSimilar API (https://exa.ai)
 */
export const findSimilarTool: ToolDefinition = {
  name: 'find_similar',
  description:
    'Find web pages similar to a given URL. Uses Exa neural search to discover competitors, related articles, or similar resources. Great for competitive analysis.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to find similar pages for (required)' },
      numResults: {
        type: 'number',
        description: 'Number of similar results (default: 5, max: 10)',
      },
      includeDomains: {
        type: 'array',
        items: { type: 'string', description: 'Domain name' },
        description: 'Only include results from these domains',
      },
      excludeDomains: {
        type: 'array',
        items: { type: 'string', description: 'Domain name' },
        description: 'Exclude results from these domains',
      },
      category: {
        type: 'string',
        description: 'Filter by category (same as semantic_search categories)',
      },
    },
    required: ['url'],
  },
  execute: async (params, context) => {
    const url = params.url as string
    const numResults = Math.min((params.numResults as number) || 5, 10)
    const includeDomains = params.includeDomains as string[] | undefined
    const excludeDomains = params.excludeDomains as string[] | undefined
    const category = params.category as string | undefined
    const apiKey = context?.searchToolKeys?.exa || process.env.EXA_API_KEY
    if (!apiKey) return { url, results: [], note: 'Exa API key not configured.' }
    try {
      const response = await fetch('https://api.exa.ai/findSimilar', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          numResults,
          ...(includeDomains?.length ? { includeDomains } : {}),
          ...(excludeDomains?.length ? { excludeDomains } : {}),
          ...(category ? { category } : {}),
          contents: { text: { maxCharacters: 500 } },
        }),
      })
      if (!response.ok) throw new Error(`Exa findSimilar API error: ${response.status}`)
      const data = (await response.json()) as {
        results: Array<{
          title: string
          url: string
          text?: string
          score: number
          publishedDate?: string
          author?: string
        }>
      }
      const results = (data.results || []).map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.text || '',
        score: item.score,
        publishedDate: item.publishedDate,
        author: item.author,
      }))
      return {
        url,
        count: results.length,
        results,
        note: `Found ${results.length} pages similar to "${url}"`,
      }
    } catch (error) {
      throw new Error(`Find similar failed: ${(error as Error).message}`)
    }
  },
}

/**
 * Extract Structured Data Tool: Extract structured data from web pages
 * Uses Firecrawl Extract API (https://firecrawl.dev)
 */
export const extractStructuredDataTool: ToolDefinition = {
  name: 'extract_structured_data',
  description:
    'Extract structured data from web pages using natural language prompts. Can extract specific information like prices, names, dates, contact info, etc. into structured JSON.',
  parameters: {
    type: 'object',
    properties: {
      urls: {
        type: 'array',
        items: { type: 'string', description: 'URL to extract from' },
        description: 'URLs to extract data from (required, max 5)',
      },
      prompt: {
        type: 'string',
        description: 'Natural language description of what data to extract (required)',
      },
      schema: {
        type: 'object',
        description: 'Optional JSON Schema for the expected output structure',
      },
    },
    required: ['urls', 'prompt'],
  },
  execute: async (params, context) => {
    const urls = (params.urls as string[]).slice(0, 5)
    const prompt = params.prompt as string
    const schema = params.schema as Record<string, unknown> | undefined
    const apiKey = context?.searchToolKeys?.firecrawl || process.env.FIRECRAWL_API_KEY
    if (!apiKey) return { urls, extractedData: null, note: 'Firecrawl API key not configured.' }
    try {
      const response = await fetch('https://api.firecrawl.dev/v1/extract', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls,
          prompt,
          ...(schema ? { schema } : {}),
        }),
      })
      if (!response.ok) throw new Error(`Firecrawl Extract API error: ${response.status}`)
      const data = (await response.json()) as {
        success: boolean
        data?: Record<string, unknown>
      }
      if (!data.success) throw new Error('Extraction failed')
      return {
        urls,
        extractedData: data.data,
        note: `Successfully extracted data from ${urls.length} URL(s)`,
      }
    } catch (error) {
      throw new Error(`Structured extraction failed: ${(error as Error).message}`)
    }
  },
}

/**
 * Crawl Website Tool: Crawl an entire website and extract content
 * Uses Firecrawl Crawl API (https://firecrawl.dev)
 */
export const crawlWebsiteTool: ToolDefinition = {
  name: 'crawl_website',
  description:
    'Crawl an entire website and extract content from multiple pages. Returns markdown content from each crawled page. Good for indexing entire sites or sections.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Starting URL to crawl (required)' },
      maxPages: { type: 'number', description: 'Maximum pages to crawl (default: 10, max: 50)' },
      includePaths: {
        type: 'array',
        items: { type: 'string', description: 'Path pattern' },
        description: 'Only crawl paths matching these patterns (e.g. ["/blog/*"])',
      },
      excludePaths: {
        type: 'array',
        items: { type: 'string', description: 'Path pattern' },
        description: 'Skip paths matching these patterns',
      },
    },
    required: ['url'],
  },
  execute: async (params, context) => {
    const url = params.url as string
    const maxPages = Math.min((params.maxPages as number) || 10, 50)
    const includePaths = params.includePaths as string[] | undefined
    const excludePaths = params.excludePaths as string[] | undefined
    const apiKey = context?.searchToolKeys?.firecrawl || process.env.FIRECRAWL_API_KEY
    if (!apiKey) return { url, pages: [], note: 'Firecrawl API key not configured.' }
    try {
      // Start crawl job
      const startResponse = await fetch('https://api.firecrawl.dev/v1/crawl', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          limit: maxPages,
          scrapeOptions: { formats: ['markdown'] },
          ...(includePaths?.length ? { includePaths } : {}),
          ...(excludePaths?.length ? { excludePaths } : {}),
        }),
      })
      if (!startResponse.ok) throw new Error(`Firecrawl Crawl API error: ${startResponse.status}`)
      const startData = (await startResponse.json()) as {
        success: boolean
        id?: string
      }
      if (!startData.success || !startData.id) throw new Error('Failed to start crawl')
      const crawlId = startData.id

      // Poll for completion (max 60s)
      const pollInterval = 3000
      const maxWait = 60000
      let elapsed = 0
      type CrawlResult = {
        status: string
        data?: Array<{
          metadata?: { title?: string; sourceURL?: string }
          markdown?: string
        }>
      }
      let result: CrawlResult | null = null

      while (elapsed < maxWait) {
        await new Promise((r) => setTimeout(r, pollInterval))
        elapsed += pollInterval
        const pollResponse = await fetch(`https://api.firecrawl.dev/v1/crawl/${crawlId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!pollResponse.ok) continue
        result = (await pollResponse.json()) as CrawlResult
        if (result?.status === 'completed') break
      }

      const pages = (result?.data || []).map(
        (page: { metadata?: { title?: string; sourceURL?: string }; markdown?: string }) => ({
          title: page.metadata?.title || page.metadata?.sourceURL || 'Untitled',
          url: page.metadata?.sourceURL || '',
          content: (page.markdown || '').substring(0, 5000),
        })
      )
      return {
        url,
        crawlId,
        pagesFound: pages.length,
        pages: pages.slice(0, maxPages),
        timedOut: elapsed >= maxWait,
        note: `Crawled ${pages.length} pages from "${url}"${elapsed >= maxWait ? ' (timed out, partial results)' : ''}`,
      }
    } catch (error) {
      throw new Error(`Website crawl failed: ${(error as Error).message}`)
    }
  },
}

/**
 * Map Website Tool: Get all URLs from a website without scraping
 * Uses Firecrawl Map API (https://firecrawl.dev)
 */
export const mapWebsiteTool: ToolDefinition = {
  name: 'map_website',
  description:
    'Get all URLs from a website without scraping content. Fast way to discover site structure and find specific pages before crawling or scraping them.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Website URL to map (required)' },
      search: { type: 'string', description: 'Optional search term to filter URLs' },
      limit: { type: 'number', description: 'Maximum URLs to return (default: 50, max: 200)' },
    },
    required: ['url'],
  },
  execute: async (params, context) => {
    const url = params.url as string
    const search = params.search as string | undefined
    const limit = Math.min((params.limit as number) || 50, 200)
    const apiKey = context?.searchToolKeys?.firecrawl || process.env.FIRECRAWL_API_KEY
    if (!apiKey) return { url, urls: [], note: 'Firecrawl API key not configured.' }
    try {
      const response = await fetch('https://api.firecrawl.dev/v1/map', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          ...(search ? { search } : {}),
          limit,
        }),
      })
      if (!response.ok) throw new Error(`Firecrawl Map API error: ${response.status}`)
      const data = (await response.json()) as { success: boolean; links?: string[] }
      if (!data.success) throw new Error('Mapping failed')
      const urls = (data.links || []).slice(0, limit)
      return {
        url,
        count: urls.length,
        urls,
        note: `Found ${urls.length} URLs on "${url}"`,
      }
    } catch (error) {
      throw new Error(`Website mapping failed: ${(error as Error).message}`)
    }
  },
}

/**
 * Search Web Tool: Full web search with content extraction via Jina
 * Uses Jina Search API (https://jina.ai)
 */
export const searchWebTool: ToolDefinition = {
  name: 'search_web',
  description:
    'Search the web and get full content extraction for each result. Returns rich results with titles, URLs, descriptions, and extracted page content. Uses Jina Search for comprehensive web search.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (required)' },
      site: {
        type: 'string',
        description: 'Limit search to a specific domain (e.g. "reddit.com"). Optional.',
      },
      maxResults: { type: 'number', description: 'Maximum results (default: 5, max: 10)' },
      withLinksSummary: {
        type: 'boolean',
        description: 'Include links from each result page (default: false)',
      },
    },
    required: ['query'],
  },
  execute: async (params, context) => {
    const query = params.query as string
    const site = params.site as string | undefined
    const maxResults = Math.min((params.maxResults as number) || 5, 10)
    const withLinksSummary = params.withLinksSummary as boolean | undefined
    const fullQuery = site ? `site:${site} ${query}` : query
    const headers: Record<string, string> = { Accept: 'application/json' }
    const jinaKey = context?.searchToolKeys?.jina || process.env.JINA_API_KEY
    if (jinaKey) headers['Authorization'] = `Bearer ${jinaKey}`
    if (withLinksSummary) headers['X-With-Links-Summary'] = 'true'
    try {
      const response = await fetch(`https://s.jina.ai/${encodeURIComponent(fullQuery)}`, {
        headers,
      })
      if (!response.ok) throw new Error(`Jina Search error: ${response.status}`)
      const data = (await response.json()) as {
        data?: Array<{
          title: string
          url: string
          description: string
          content: string
        }>
      }
      const results = (data.data || []).slice(0, maxResults).map((item) => ({
        title: item.title,
        url: item.url,
        description: item.description,
        content: (item.content || '').substring(0, 3000),
      }))
      return {
        query: fullQuery,
        count: results.length,
        results,
        note: `Found ${results.length} web results for "${query}"`,
      }
    } catch (error) {
      throw new Error(`Web search failed: ${(error as Error).message}`)
    }
  },
}

/**
 * PDF Parse Tool: Extract text from PDF attachments
 */
export const parsePdfTool: ToolDefinition = {
  name: 'parse_pdf',
  description:
    'Parse a PDF file and extract its text content. Accepts a base64-encoded PDF string (e.g. from download_google_drive_file) or a Firebase Storage URL.',
  parameters: {
    type: 'object',
    properties: {
      base64: {
        type: 'string',
        description: 'Base64-encoded PDF content (from download_google_drive_file)',
      },
      storageUrl: {
        type: 'string',
        description: 'Firebase Storage URL of the PDF (alternative to base64)',
      },
    },
  },
  execute: async (params) => {
    const base64 = params.base64 as string | undefined
    const storageUrl = params.storageUrl as string | undefined

    if (!base64 && !storageUrl) {
      throw new Error('Either base64 or storageUrl must be provided')
    }

    let pdfBuffer: Buffer

    if (base64) {
      pdfBuffer = Buffer.from(base64, 'base64')
    } else {
      const response = await fetch(storageUrl!)
      if (!response.ok) {
        throw new Error(`Failed to download PDF from storage: ${response.status}`)
      }
      pdfBuffer = Buffer.from(await response.arrayBuffer())
    }

    // pdf-parse v2 uses a class-based API
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) })
    const textResult = await parser.getText()
    const infoResult = await parser.getInfo()
    await parser.destroy()

    const maxChars = 500000
    const truncated = textResult.text.length > maxChars
    const text = truncated ? textResult.text.substring(0, maxChars) : textResult.text

    const wordCount = text.split(/\s+/).length

    return {
      text,
      pages: textResult.total,
      title: infoResult.info?.Title ?? null,
      author: infoResult.info?.Author ?? null,
      wordCount,
      truncated,
      message: `Extracted ${textResult.total} pages (${wordCount} words)${truncated ? ' [truncated]' : ''}`,
    }
  },
}

/**
 * Create Topic Tool: Create a new topic/folder
 */
export const createTopicTool: ToolDefinition = {
  name: 'create_topic',
  description: 'Create a new topic (folder) to organize notes and content.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Topic name (required)',
      },
      description: {
        type: 'string',
        description: 'Topic description (optional)',
      },
      color: {
        type: 'string',
        description: 'Topic color hex code (optional, e.g. "#4A90D9")',
      },
      icon: {
        type: 'string',
        description: 'Topic icon name (optional)',
      },
      parentTopicId: {
        type: 'string',
        description: 'Parent topic ID for nesting (optional)',
      },
    },
    required: ['name'],
  },
  execute: async (params, context: ToolExecutionContext) => {
    const name = params.name as string
    const description = (params.description as string) || ''
    const color = (params.color as string) || null
    const icon = (params.icon as string) || null
    const parentTopicId = (params.parentTopicId as string) || null

    const db = getFirestore()
    const topicId = `topic:${generateId()}`

    const topic = {
      topicId,
      userId: context.userId,
      name,
      description,
      color,
      icon,
      parentTopicId,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      syncState: 'synced' as const,
      version: 1,
    }

    await db.collection(`users/${context.userId}/topics`).doc(topicId).set(topic)

    return {
      topicId,
      name,
      message: `Created topic "${name}" successfully`,
    }
  },
}

/**
 * Create Todo Tool: Create a new task/todo
 */
export const createTodoTool: ToolDefinition = {
  name: 'create_todo',
  description:
    'Create a new todo/task for the user. Supports urgency levels, importance scoring, and due dates.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Task title (required)',
      },
      description: {
        type: 'string',
        description: 'Task description (optional)',
      },
      urgency: {
        type: 'string',
        description:
          'Urgency level: today, next_3_days, this_week, this_month, later (default: this_week)',
      },
      importance: {
        type: 'number',
        description: 'Importance score 1-10 (default: 5)',
      },
      dueDate: {
        type: 'string',
        description: 'Due date as ISO string (optional)',
      },
      estimatedMinutes: {
        type: 'number',
        description: 'Estimated time to complete in minutes (optional)',
      },
      status: {
        type: 'string',
        description:
          'Task status: inbox, next_action, scheduled, waiting, someday (default: next_action)',
      },
      projectId: {
        type: 'string',
        description: 'Project ID to associate with (optional)',
      },
      chapterId: {
        type: 'string',
        description: 'Chapter/area ID to associate with (optional)',
      },
    },
    required: ['title'],
  },
  execute: async (params, context: ToolExecutionContext) => {
    const title = params.title as string
    const description = (params.description as string) || ''
    const urgency = (params.urgency as string) || 'this_week'
    const importance = Math.min(Math.max((params.importance as number) || 5, 1), 10)
    const dueDate = (params.dueDate as string) || null
    const estimatedMinutes = (params.estimatedMinutes as number) || null
    const status = (params.status as string) || 'next_action'
    const projectId = (params.projectId as string) || null
    const chapterId = (params.chapterId as string) || null

    const validUrgencies = ['today', 'next_3_days', 'this_week', 'this_month', 'later']
    if (!validUrgencies.includes(urgency)) {
      throw new Error(`Invalid urgency. Must be one of: ${validUrgencies.join(', ')}`)
    }

    const validStatuses = ['inbox', 'next_action', 'scheduled', 'waiting', 'someday']
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`)
    }

    const db = getFirestore()
    const taskId = `task:${generateId()}`

    const task = {
      taskId,
      userId: context.userId,
      title,
      description,
      urgency,
      importance,
      dueDate,
      dueDateMs: dueDate ? new Date(dueDate).getTime() : null,
      estimatedMinutes,
      status,
      projectId,
      chapterId,
      completedAtMs: null,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      syncState: 'synced' as const,
      version: 1,
    }

    await db.collection(`users/${context.userId}/tasks`).doc(taskId).set(task)

    return {
      taskId,
      title,
      urgency,
      message: `Created todo "${title}" (urgency: ${urgency})`,
    }
  },
}

/**
 * List Todos Tool: Query tasks with filtering
 */
export const listTodosTool: ToolDefinition = {
  name: 'list_todos',
  description:
    'List todos/tasks for the user with filtering by status, due date, and overdue items. Returns tasks sorted by priority.',
  parameters: {
    type: 'object',
    properties: {
      statuses: {
        type: 'array',
        description:
          'Filter by statuses (default: ["inbox", "next_action", "scheduled"]). Options: inbox, next_action, scheduled, waiting, someday, done',
        items: {
          type: 'string',
          description: 'Status value',
        },
      },
      dueBefore: {
        type: 'string',
        description: 'Filter tasks due before this ISO date (optional)',
      },
      dueAfter: {
        type: 'string',
        description: 'Filter tasks due after this ISO date (optional)',
      },
      includeOverdue: {
        type: 'boolean',
        description: 'Include overdue tasks regardless of other filters (default: true)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of tasks to return (default: 20, max: 50)',
      },
    },
  },
  execute: async (params, context: ToolExecutionContext) => {
    const statuses = (params.statuses as string[]) || ['inbox', 'next_action', 'scheduled']
    const dueBefore = params.dueBefore as string | undefined
    const dueAfter = params.dueAfter as string | undefined
    const includeOverdue = params.includeOverdue !== false
    const limit = Math.min((params.limit as number) || 20, 50)

    const db = getFirestore()
    const tasksRef = db.collection(`users/${context.userId}/tasks`)

    // Firestore limits 'in' to 30 values; slice to 10 since there are only 6 valid statuses
    let query = tasksRef.where('status', 'in', statuses.slice(0, 10))

    if (dueBefore) {
      query = query.where('dueDateMs', '<=', new Date(dueBefore).getTime())
    }
    if (dueAfter) {
      query = query.where('dueDateMs', '>=', new Date(dueAfter).getTime())
    }

    const snapshot = await query.limit(limit).get()

    const now = Date.now()
    let tasks = snapshot.docs.map((doc) => {
      const data = doc.data()
      const isOverdue = data.dueDateMs && data.dueDateMs < now && data.status !== 'done'

      return {
        taskId: doc.id,
        title: data.title,
        description: data.description || '',
        urgency: data.urgency,
        importance: data.importance || 5,
        status: data.status,
        dueDate: data.dueDate,
        dueDateMs: data.dueDateMs,
        estimatedMinutes: data.estimatedMinutes,
        projectId: data.projectId,
        isOverdue,
        createdAtMs: data.createdAtMs,
      }
    })

    // Sort by priority: overdue first, then by importance desc, then by due date asc
    tasks.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1
      if (!a.isOverdue && b.isOverdue) return 1
      if (a.importance !== b.importance) return b.importance - a.importance
      if (a.dueDateMs && b.dueDateMs) return a.dueDateMs - b.dueDateMs
      if (a.dueDateMs) return -1
      if (b.dueDateMs) return 1
      return 0
    })

    // If includeOverdue and we didn't get them via the status filter, fetch separately
    if (includeOverdue && !statuses.includes('done')) {
      const overdueCount = tasks.filter((t) => t.isOverdue).length
      if (overdueCount === 0) {
        // Try fetching overdue tasks directly
        const overdueSnapshot = await tasksRef
          .where('dueDateMs', '<', now)
          .where('status', 'in', ['inbox', 'next_action', 'scheduled', 'waiting'])
          .limit(10)
          .get()

        const overdueTasks = overdueSnapshot.docs
          .filter((doc) => !tasks.some((t) => t.taskId === doc.id))
          .map((doc) => {
            const data = doc.data()
            return {
              taskId: doc.id,
              title: data.title,
              description: data.description || '',
              urgency: data.urgency,
              importance: data.importance || 5,
              status: data.status,
              dueDate: data.dueDate,
              dueDateMs: data.dueDateMs,
              estimatedMinutes: data.estimatedMinutes,
              projectId: data.projectId,
              isOverdue: true,
              createdAtMs: data.createdAtMs,
            }
          })

        tasks = [...overdueTasks, ...tasks].slice(0, limit)
      }
    }

    return {
      count: tasks.length,
      tasks,
      message:
        tasks.length === 0
          ? 'No tasks found matching the criteria'
          : `Found ${tasks.length} tasks (${tasks.filter((t) => t.isOverdue).length} overdue)`,
    }
  },
}

/**
 * Search Google Drive Tool
 */
export const searchGoogleDriveTool: ToolDefinition = {
  name: 'search_google_drive',
  description:
    "Search files in the user's Google Drive. Returns file metadata (name, type, dates, link). Use download_google_drive_file to read content.",
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (e.g. "meeting transcript", "Q4 report")',
      },
      mimeType: {
        type: 'string',
        description:
          'Filter by MIME type (optional, e.g. "application/pdf", "application/vnd.google-apps.document")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 20)',
      },
    },
    required: ['query'],
  },
  execute: async (params, context: ToolExecutionContext) => {
    const query = params.query as string
    const mimeType = params.mimeType as string | undefined
    const limit = (params.limit as number) || 20

    const accountId = await resolveGoogleAccountId(context.userId)
    const files = await searchDriveFiles(context.userId, accountId, query, { mimeType, limit })

    return {
      count: files.length,
      files: files.map((f) => ({
        fileId: f.id,
        name: f.name,
        mimeType: f.mimeType,
        createdTime: f.createdTime,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink,
      })),
      message:
        files.length === 0
          ? `No files found for "${query}"`
          : `Found ${files.length} files matching "${query}"`,
    }
  },
}

/**
 * Download Google Drive File Tool
 */
export const downloadGoogleDriveFileTool: ToolDefinition = {
  name: 'download_google_drive_file',
  description:
    'Download and read the content of a Google Drive file. For PDFs, returns base64 content (use parse_pdf to extract text). For text/docs, returns the text directly.',
  parameters: {
    type: 'object',
    properties: {
      fileId: {
        type: 'string',
        description: 'The Google Drive file ID (from search_google_drive results)',
      },
      maxSizeBytes: {
        type: 'number',
        description: 'Maximum file size in bytes (default: 5MB)',
      },
    },
    required: ['fileId'],
  },
  execute: async (params, context: ToolExecutionContext) => {
    const fileId = params.fileId as string
    const maxSizeBytes = (params.maxSizeBytes as number) || 5 * 1024 * 1024

    const accountId = await resolveGoogleAccountId(context.userId)
    const result = await downloadDriveFile(context.userId, accountId, fileId, maxSizeBytes)

    // For PDFs, the content is base64-encoded
    const isPdf = result.mimeType === 'application/pdf'

    // Truncate text content at 500K chars (PDFs are base64, not truncated here)
    const maxChars = 500000
    const truncated = !isPdf && result.content.length > maxChars
    const finalContent = truncated ? result.content.substring(0, maxChars) : result.content
    const wordCount = isPdf ? null : finalContent.split(/\s+/).length

    return {
      content: finalContent,
      mimeType: result.mimeType,
      fileName: result.fileName,
      isPdf,
      wordCount,
      truncated,
      message: isPdf
        ? `Downloaded PDF "${result.fileName}" (base64). Use parse_pdf to extract text.`
        : `Downloaded "${result.fileName}" (${wordCount} words)${truncated ? ' [truncated]' : ''}`,
    }
  },
}

/**
 * List Gmail Messages Tool
 */
export const listGmailMessagesTool: ToolDefinition = {
  name: 'list_gmail_messages',
  description:
    'List Gmail messages with metadata (subject, from, date, snippet). Uses Gmail search syntax. Does NOT include message body — use read_gmail_message for full content.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Gmail search query (e.g. "after:2026/02/01", "from:boss@company.com", "is:unread newer_than:7d")',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of messages (default: 20, max: 50)',
      },
    },
    required: ['query'],
  },
  execute: async (params, context: ToolExecutionContext) => {
    const query = params.query as string
    const maxResults = (params.maxResults as number) || 20

    const accountId = await resolveGoogleAccountId(context.userId)
    const messages = await listGmailMessages(context.userId, accountId, query, maxResults)

    return {
      count: messages.length,
      messages: messages.map((m) => ({
        messageId: m.messageId,
        subject: m.subject,
        from: m.from,
        date: m.date,
        snippet: m.snippet,
        labels: m.labelIds,
      })),
      message:
        messages.length === 0
          ? `No messages found for query "${query}"`
          : `Found ${messages.length} messages`,
    }
  },
}

/**
 * Read Gmail Message Tool
 */
export const readGmailMessageTool: ToolDefinition = {
  name: 'read_gmail_message',
  description:
    'Read the full body of a specific Gmail message. Use list_gmail_messages first to get message IDs.',
  parameters: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'The Gmail message ID (from list_gmail_messages results)',
      },
    },
    required: ['messageId'],
  },
  execute: async (params, context: ToolExecutionContext) => {
    const messageId = params.messageId as string

    const accountId = await resolveGoogleAccountId(context.userId)
    const message = await readGmailMessage(context.userId, accountId, messageId)

    return {
      messageId: message.messageId,
      subject: message.subject,
      from: message.from,
      to: message.to,
      date: message.date,
      body: message.body,
      attachmentCount: message.attachmentCount,
      message: `Read email "${message.subject}" from ${message.from}`,
    }
  },
}

/**
 * Export all advanced tools for registration
 */
export const advancedTools: ToolDefinition[] = [
  listCalendarEventsTool,
  createCalendarEventTool,
  listNotesTool,
  createNoteTool,
  readNoteTool,
  analyzeNoteParagraphsTool,
  tagParagraphTool,
  createDeepResearchRequestTool,
  serpSearchTool,
  readUrlTool,
  scrapeUrlTool,
  semanticSearchTool,
  searchImagesTool,
  searchVideosTool,
  searchScholarTool,
  searchPlacesTool,
  findSimilarTool,
  extractStructuredDataTool,
  crawlWebsiteTool,
  mapWebsiteTool,
  searchWebTool,
  parsePdfTool,
  createTopicTool,
  createTodoTool,
  listTodosTool,
  searchGoogleDriveTool,
  downloadGoogleDriveFileTool,
  listGmailMessagesTool,
  readGmailMessageTool,
]
