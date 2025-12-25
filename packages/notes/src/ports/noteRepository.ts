import type { Note, NoteId, NoteFilters, CreateNoteInput, UpdateNoteInput } from '../domain/models'

/**
 * Repository interface for Note persistence
 * Implementations: Firestore, IndexedDB
 */
export interface NoteRepository {
  /**
   * Create a new note
   */
  create(userId: string, input: CreateNoteInput): Promise<Note>

  /**
   * Update an existing note
   */
  update(userId: string, noteId: NoteId, updates: UpdateNoteInput): Promise<Note>

  /**
   * Delete a note
   */
  delete(userId: string, noteId: NoteId): Promise<void>

  /**
   * Get a single note by ID
   */
  get(userId: string, noteId: NoteId): Promise<Note | null>

  /**
   * List notes with optional filters
   */
  list(userId: string, filters?: NoteFilters): Promise<Note[]>

  /**
   * Search notes by query (full-text search on title and contentHtml)
   */
  search(userId: string, query: string): Promise<Note[]>

  /**
   * Update last accessed timestamp
   */
  updateLastAccessed(userId: string, noteId: NoteId): Promise<void>

  /**
   * Batch update multiple notes (for sync operations)
   */
  batchUpdate(userId: string, notes: Note[]): Promise<void>
}
