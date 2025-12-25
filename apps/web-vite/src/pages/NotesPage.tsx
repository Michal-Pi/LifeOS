/**
 * NotesPage Component
 *
 * Main interface for the Notes feature with:
 * - List of notes
 * - Note editor
 * - Topic/section organization (coming in future iterations)
 */

import { useState } from 'react'
import { NoteEditor } from '@/components/editor'
import { useNoteOperations } from '@/hooks/useNoteOperations'
import type { Note } from '@lifeos/notes'
import type { JSONContent } from '@tiptap/core'

export function NotesPage() {
  const { notes, currentNote, isLoading, createNote, setCurrentNote, saveNoteContent } =
    useNoteOperations()

  const [showEditor, setShowEditor] = useState(false)

  const handleCreateNote = async () => {
    try {
      const newNote = await createNote({
        title: 'Untitled Note',
        content: { type: 'doc', content: [] },
      })
      setCurrentNote(newNote)
      setShowEditor(true)
    } catch (error) {
      console.error('Failed to create note:', error)
    }
  }

  const handleSelectNote = (note: Note) => {
    setCurrentNote(note)
    setShowEditor(true)
  }

  const handleSaveNote = async (content: JSONContent, html: string) => {
    if (!currentNote) return

    try {
      await saveNoteContent(currentNote.noteId, content, html)
    } catch (error) {
      console.error('Failed to save note:', error)
      throw error
    }
  }

  return (
    <div className="notes-page">
      <div className="notes-header">
        <h1>Notes</h1>
        <button onClick={handleCreateNote} className="btn-primary" disabled={isLoading}>
          + New Note
        </button>
      </div>

      <div className="notes-content">
        {/* Notes List */}
        <div className="notes-list">
          {isLoading && <p>Loading notes...</p>}
          {!isLoading && notes.length === 0 && (
            <p className="empty-state">No notes yet. Create your first note to get started!</p>
          )}
          {notes.map((note) => (
            <div
              key={note.noteId}
              className={`note-item ${currentNote?.noteId === note.noteId ? 'active' : ''}`}
              onClick={() => handleSelectNote(note)}
            >
              <h3>{note.title}</h3>
              <p className="note-preview">{note.contentHtml?.substring(0, 100)}...</p>
              <span className="note-date">
                {new Date(note.updatedAtMs).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>

        {/* Editor */}
        <div className="notes-editor">
          {showEditor && currentNote ? (
            <NoteEditor
              note={currentNote}
              onSave={handleSaveNote}
              placeholder="Start writing your note..."
              autoSaveDelay={2000}
            />
          ) : (
            <div className="editor-placeholder">
              <p>Select a note or create a new one to start writing</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .notes-page {
          height: 100%;
          display: flex;
          flex-direction: column;
          padding: 20px;
        }

        .notes-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .notes-header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }

        .btn-primary {
          padding: 10px 16px;
          background: var(--primary);
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        }

        .btn-primary:hover:not(:disabled) {
          opacity: 0.9;
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .notes-content {
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: 20px;
          flex: 1;
          overflow: hidden;
        }

        .notes-list {
          border-right: 1px solid var(--border);
          padding-right: 20px;
          overflow-y: auto;
        }

        .empty-state {
          color: var(--muted-foreground);
          text-align: center;
          padding: 40px 20px;
        }

        .note-item {
          padding: 12px;
          border-radius: 6px;
          cursor: pointer;
          margin-bottom: 8px;
          border: 1px solid transparent;
        }

        .note-item:hover {
          background: var(--muted);
        }

        .note-item.active {
          background: var(--muted);
          border-color: var(--primary);
        }

        .note-item h3 {
          margin: 0 0 8px 0;
          font-size: 16px;
          font-weight: 500;
        }

        .note-preview {
          margin: 0 0 8px 0;
          font-size: 14px;
          color: var(--muted-foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .note-date {
          font-size: 12px;
          color: var(--muted-foreground);
        }

        .notes-editor {
          overflow-y: auto;
        }

        .editor-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--muted-foreground);
        }
      `}</style>
    </div>
  )
}
