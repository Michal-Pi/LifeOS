/**
 * Note Templates
 *
 * Provides predefined templates for different types of notes:
 * - Quick note (blank)
 * - Meeting notes
 * - Learning notes
 * - Project notes
 * - Daily notes
 */

import type { JSONContent } from '@tiptap/core'

export interface NoteTemplate {
  id: string
  name: string
  description: string
  icon: string
  content: JSONContent
}

/**
 * Quick Note Template
 * A blank note for quick capture
 */
const quickNoteTemplate: NoteTemplate = {
  id: 'quick',
  name: 'Quick Note',
  description: 'Start with a blank slate',
  icon: '📝',
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [],
      },
    ],
  },
}

/**
 * Meeting Notes Template
 * Structured template for meeting notes
 */
const meetingNotesTemplate: NoteTemplate = {
  id: 'meeting',
  name: 'Meeting Notes',
  description: 'Capture meeting agenda, notes, and action items',
  icon: '👥',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Meeting Overview' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Date: ', marks: [{ type: 'bold' }] },
          { type: 'text', text: new Date().toLocaleDateString() },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Attendees: ', marks: [{ type: 'bold' }] },
          { type: 'text', text: '' },
        ],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Agenda' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Discussion Notes' }],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Action Items' }],
      },
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Next Steps' }],
      },
      {
        type: 'paragraph',
        content: [],
      },
    ],
  },
}

/**
 * Learning Notes Template
 * Template for learning and course notes
 */
const learningNotesTemplate: NoteTemplate = {
  id: 'learning',
  name: 'Learning Notes',
  description: 'Structured notes for courses, tutorials, and learning',
  icon: '🎓',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Learning Overview' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Topic: ', marks: [{ type: 'bold' }] },
          { type: 'text', text: '' },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Source: ', marks: [{ type: 'bold' }] },
          { type: 'text', text: '' },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Date: ', marks: [{ type: 'bold' }] },
          { type: 'text', text: new Date().toLocaleDateString() },
        ],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Key Concepts' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Detailed Notes' }],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Examples & Code Snippets' }],
      },
      {
        type: 'codeBlock',
        attrs: { language: null },
        content: [{ type: 'text', text: '' }],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Questions & Follow-up' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Summary' }],
      },
      {
        type: 'paragraph',
        content: [],
      },
    ],
  },
}

/**
 * Project Notes Template
 * Template for project planning and tracking
 */
const projectNotesTemplate: NoteTemplate = {
  id: 'project',
  name: 'Project Notes',
  description: 'Plan and track project details',
  icon: '📋',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Project Overview' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Project Name: ', marks: [{ type: 'bold' }] },
          { type: 'text', text: '' },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Status: ', marks: [{ type: 'bold' }] },
          { type: 'text', text: '' },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Start Date: ', marks: [{ type: 'bold' }] },
          { type: 'text', text: new Date().toLocaleDateString() },
        ],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Goals & Objectives' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Key Milestones' }],
      },
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Resources & Links' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Notes & Updates' }],
      },
      {
        type: 'paragraph',
        content: [],
      },
    ],
  },
}

/**
 * Daily Notes Template
 * Template for daily journal entries
 */
const dailyNotesTemplate: NoteTemplate = {
  id: 'daily',
  name: 'Daily Notes',
  description: 'Daily journal and reflection',
  icon: '📆',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: `Daily Notes - ${new Date().toLocaleDateString()}` }],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Top Priorities Today' }],
      },
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
          },
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
          },
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Notes & Thoughts' }],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Wins & Accomplishments' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Challenges & Learnings' }],
      },
      {
        type: 'paragraph',
        content: [],
      },
    ],
  },
}

/**
 * All available templates
 */
export const noteTemplates: NoteTemplate[] = [
  quickNoteTemplate,
  meetingNotesTemplate,
  learningNotesTemplate,
  projectNotesTemplate,
  dailyNotesTemplate,
]

/**
 * Get template by ID
 */
export function getTemplateById(id: string): NoteTemplate | undefined {
  return noteTemplates.find((template) => template.id === id)
}

/**
 * Get template content by ID
 */
export function getTemplateContent(id: string): JSONContent {
  const template = getTemplateById(id)
  return template ? JSON.parse(JSON.stringify(template.content)) : quickNoteTemplate.content
}
