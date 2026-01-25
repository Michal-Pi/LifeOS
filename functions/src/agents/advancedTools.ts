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
import { assertValidResearchContext, normalizeResearchQuestions } from './deepResearchValidation.js'
import type { ToolDefinition, ToolExecutionContext } from './toolExecutor.js'

const generateId = () => randomUUID()

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
      query = query.where('topicId', '==', topicId) as any
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
 * Web Search Tool: Perform real web search using Google Custom Search API
 * Requires GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables
 */
export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description:
    'Search the web for information using Google Custom Search. Returns top search results with titles, snippets, and URLs.',
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
    },
    required: ['query'],
  },
  execute: async (params) => {
    const query = params.query as string
    const maxResults = Math.min((params.maxResults as number) || 5, 10)

    // Check if API credentials are configured
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY
    const engineId = process.env.GOOGLE_SEARCH_ENGINE_ID

    if (!apiKey || !engineId) {
      // Return placeholder if not configured
      return {
        query,
        results: [
          {
            title: 'Web search not configured',
            snippet:
              'To enable real web search, set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables in Firebase Functions.',
            url: 'https://developers.google.com/custom-search/v1/overview',
          },
        ],
        note: `Would search for "${query}" and return top ${maxResults} results. Configure Google Custom Search API to enable this feature.`,
      }
    }

    try {
      // Call Google Custom Search API
      const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${engineId}&q=${encodeURIComponent(
        query
      )}&num=${maxResults}`

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Google Search API error: ${response.statusText}`)
      }

      const data = (await response.json()) as {
        items?: Array<{
          title: string
          snippet: string
          link: string
          displayLink?: string
        }>
      }

      const results = (data.items || []).map((item) => ({
        title: item.title,
        snippet: item.snippet,
        url: item.link,
        displayUrl: item.displayLink,
      }))

      return {
        query,
        count: results.length,
        results,
        note:
          results.length === 0
            ? `No results found for "${query}"`
            : `Found ${results.length} results for "${query}"`,
      }
    } catch (error) {
      throw new Error(`Web search failed: ${(error as Error).message}`)
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
      workspaceId: context.workspaceId,
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
      .collection(`users/${context.userId}/workspaces/${context.workspaceId}/deepResearchRequests`)
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
  webSearchTool,
]
