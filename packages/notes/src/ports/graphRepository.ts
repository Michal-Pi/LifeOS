import type { NoteGraph, GraphFilters } from '../domain/graphModels'
import type { Note, NoteId, NoteFilters } from '../domain/models'

/**
 * Repository interface for Note graph operations
 * Implementations: Firestore
 */
export interface GraphRepository {
  /**
   * Build a complete graph from notes with optional filters
   */
  buildGraph(userId: string, filters?: GraphFilters): Promise<NoteGraph>

  /**
   * Get notes connected to a specific note within N hops
   */
  getConnectedNotes(userId: string, noteId: NoteId, depth?: number): Promise<Note[]>

  /**
   * Get notes that link to the specified note (backlinks)
   */
  getBacklinks(userId: string, noteId: NoteId): Promise<Note[]>

  /**
   * Find the shortest path between two notes
   * Returns array of note IDs representing the path, or empty array if no path exists
   */
  findShortestPath(userId: string, fromNoteId: NoteId, toNoteId: NoteId): Promise<NoteId[]>

  /**
   * Find notes with no connections (orphan notes)
   */
  getOrphanNotes(userId: string, filters?: NoteFilters): Promise<Note[]>
}
