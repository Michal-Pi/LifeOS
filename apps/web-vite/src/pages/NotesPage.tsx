/**
 * NotesPage Component
 *
 * Main interface for the Notes feature with:
 * - Hierarchical sidebar (Topics/Sections)
 * - List of notes (filtered by topic/section)
 * - Note editor with auto-save
 * - Search functionality
 */

import { useState, useMemo } from 'react'
import { NoteEditor } from '@/components/editor'
import { TopicSidebar } from '@/components/notes/TopicSidebar'
import { useNoteOperations } from '@/hooks/useNoteOperations'
import type { Note, TopicId, SectionId, AttachmentId } from '@lifeos/notes'
import type { JSONContent } from '@tiptap/core'

export function NotesPage() {
  const {
    notes,
    currentNote,
    isLoading,
    createNote,
    setCurrentNote,
    saveNoteContent,
    updateProjectLinks,
    updateAttachments,
  } = useNoteOperations()

  const [showEditor, setShowEditor] = useState(false)
  const [selectedTopicId, setSelectedTopicId] = useState<TopicId | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState<SectionId | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Filter notes based on selected topic/section and search query
  const filteredNotes = useMemo(() => {
    let filtered = notes

    // Filter by topic/section
    if (selectedSectionId) {
      filtered = filtered.filter((note) => note.sectionId === selectedSectionId)
    } else if (selectedTopicId) {
      filtered = filtered.filter((note) => note.topicId === selectedTopicId)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (note) =>
          note.title.toLowerCase().includes(query) ||
          note.contentHtml?.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [notes, selectedTopicId, selectedSectionId, searchQuery])

  const handleCreateNote = async () => {
    try {
      const newNote = await createNote({
        title: 'Untitled Note',
        content: { type: 'doc', content: [] },
        topicId: selectedTopicId,
        sectionId: selectedSectionId,
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

  const handleTopicSelect = (topicId: TopicId | null) => {
    setSelectedTopicId(topicId)
    setSelectedSectionId(null)
  }

  const handleSectionSelect = (sectionId: SectionId | null, topicId: TopicId | null) => {
    setSelectedSectionId(sectionId)
    setSelectedTopicId(topicId)
  }

  const handleProjectsChange = async (projectIds: string[]) => {
    if (!currentNote) return

    try {
      await updateProjectLinks(currentNote.noteId, projectIds)
    } catch (error) {
      console.error('Failed to update project links:', error)
      throw error
    }
  }

  const handleAttachmentsChange = async (attachmentIds: AttachmentId[]) => {
    if (!currentNote) return

    try {
      await updateAttachments(currentNote.noteId, attachmentIds)
    } catch (error) {
      console.error('Failed to update attachments:', error)
      throw error
    }
  }

  return (
    <div className="notes-page">
      <div className="notes-header">
        <h1>Notes</h1>
        <div className="header-actions">
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <button onClick={handleCreateNote} className="btn-primary" disabled={isLoading}>
            + New Note
          </button>
        </div>
      </div>

      <div className="notes-content">
        {/* Sidebar */}
        <TopicSidebar
          selectedTopicId={selectedTopicId}
          selectedSectionId={selectedSectionId}
          onTopicSelect={handleTopicSelect}
          onSectionSelect={handleSectionSelect}
        />

        {/* Notes List */}
        <div className="notes-list">
          {isLoading && <p className="loading">Loading notes...</p>}
          {!isLoading && filteredNotes.length === 0 && !searchQuery && (
            <p className="empty-state">
              {selectedTopicId || selectedSectionId
                ? 'No notes in this category yet.'
                : 'No notes yet. Create your first note to get started!'}
            </p>
          )}
          {!isLoading && filteredNotes.length === 0 && searchQuery && (
            <p className="empty-state">No notes found matching "{searchQuery}"</p>
          )}
          {filteredNotes.map((note) => (
            <div
              key={note.noteId}
              className={`note-item ${currentNote?.noteId === note.noteId ? 'active' : ''}`}
              onClick={() => handleSelectNote(note)}
            >
              <h3>{note.title}</h3>
              <p className="note-preview">{note.contentHtml?.substring(0, 100)}...</p>
              <span className="note-date">{new Date(note.updatedAtMs).toLocaleDateString()}</span>
            </div>
          ))}
        </div>

        {/* Editor */}
        <div className="notes-editor">
          {showEditor && currentNote ? (
            <NoteEditor
              note={currentNote}
              onSave={handleSaveNote}
              onProjectsChange={handleProjectsChange}
              onAttachmentsChange={handleAttachmentsChange}
              placeholder="Start writing your note..."
              autoSaveDelay={2000}
              showProjectLinker={true}
              showAttachments={true}
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

        .header-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .search-input {
          padding: 8px 12px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--background);
          color: var(--foreground);
          font-size: 14px;
          width: 250px;
        }

        .search-input:focus {
          outline: none;
          border-color: var(--primary);
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
          white-space: nowrap;
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
          grid-template-columns: 250px 300px 1fr;
          gap: 0;
          flex: 1;
          overflow: hidden;
        }

        .notes-list {
          border-right: 1px solid var(--border);
          padding: 0 20px;
          overflow-y: auto;
        }

        .loading,
        .empty-state {
          color: var(--muted-foreground);
          text-align: center;
          padding: 40px 20px;
          font-size: 14px;
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
          padding-left: 20px;
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
