import type { NoteId, TopicId } from './models'

/**
 * Node in the note graph representing a single note
 */
export interface NoteGraphNode {
  noteId: NoteId
  title: string
  topicId: TopicId | null
  projectIds: string[]
  tags: string[]
  linkCount: number // Number of outgoing links
  backlinkCount: number // Number of incoming links
}

/**
 * Edge type in the note graph
 */
export type NoteGraphEdgeType =
  | 'explicit_link' // Explicit note-to-note link
  | 'mention' // Note mentioned in content
  | 'shared_project' // Notes sharing a project
  | 'shared_tag' // Notes sharing a tag
  | 'paragraph_tag' // Paragraph-level tag linking

/**
 * Edge in the note graph representing a relationship between notes
 */
export interface NoteGraphEdge {
  fromNoteId: NoteId
  toNoteId: NoteId
  edgeType: NoteGraphEdgeType
}

/**
 * Complete note graph structure
 */
export interface NoteGraph {
  nodes: NoteGraphNode[]
  edges: NoteGraphEdge[]
}

/**
 * Filters for building a note graph
 */
export interface GraphFilters {
  projectIds?: string[] // Filter by projects
  topicId?: TopicId // Filter by topic
  tags?: string[] // Filter by tags
  dateRange?: {
    startMs?: number
    endMs?: number
  }
  includeOrphans?: boolean // Include notes with no connections
}
