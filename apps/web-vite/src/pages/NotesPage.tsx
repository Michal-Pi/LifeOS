/**
 * NotesPage Component
 *
 * Notion-like interface for the Notes feature with:
 * - Project-organized sidebar
 * - Full-width document editor
 * - Rich content editing with TipTap
 * - Search functionality
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { NoteEditor } from '@/components/editor'
import { ProjectSidebar } from '@/components/notes/ProjectSidebar'
import { NoteTitleEditor } from '@/components/notes/NoteTitleEditor'
import { SyncStatusBanner } from '@/components/notes/NoteSyncStatus'
import { ExportMenu } from '@/components/notes/ExportMenu'
import { TemplateSelector } from '@/components/notes/TemplateSelector'
import { useNoteOperations } from '@/hooks/useNoteOperations'
import { useNoteSync } from '@/hooks/useNoteSync'
import { getTemplateContent } from '@/lib/noteTemplates'
import type { AttachmentId } from '@lifeos/notes'
import type { JSONContent } from '@tiptap/core'

export function NotesPage() {
  const {
    notes,
    currentNote,
    createNote,
    setCurrentNote,
    saveNoteContent,
    updateNote,
    updateProjectLinks,
    updateOKRLinks,
    updateAttachments,
  } = useNoteOperations()

  const { isOnline, lastSyncMs, stats, triggerSync } = useNoteSync()

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showTemplateSelector, setShowTemplateSelector] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Set current note when selectedNoteId changes
  useEffect(() => {
    if (selectedNoteId) {
      const note = notes.find((n) => n.noteId === selectedNoteId)
      if (note) {
        setCurrentNote(note)
      }
    }
  }, [selectedNoteId, notes, setCurrentNote])

  const handleCreateNote = useCallback(() => {
    setShowTemplateSelector(true)
  }, [])

  const handleTemplateSelect = async (templateId: string) => {
    try {
      const content = getTemplateContent(templateId)
      const newNote = await createNote({
        title: 'Untitled Note',
        content,
        topicId: null,
        sectionId: null,
      })
      setCurrentNote(newNote)
      setSelectedNoteId(newNote.noteId)
      setShowTemplateSelector(false)
    } catch (error) {
      console.error('Failed to create note:', error)
    }
  }

  const handleTemplateCancelCreate = () => {
    setShowTemplateSelector(false)
  }

  const handleSelectNote = (noteId: string) => {
    setSelectedNoteId(noteId)
  }

  const handleProjectSelect = (projectId: string | null) => {
    setSelectedProjectId(projectId)
    // Keep note selected if it's still in the filtered list
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

  const handleProjectsChange = async (projectIds: string[]) => {
    if (!currentNote) return

    try {
      await updateProjectLinks(currentNote.noteId, projectIds)
    } catch (error) {
      console.error('Failed to update project links:', error)
      throw error
    }
  }

  const handleOKRsChange = async (okrIds: string[]) => {
    if (!currentNote) return

    try {
      await updateOKRLinks(currentNote.noteId, okrIds)
    } catch (error) {
      console.error('Failed to update OKR links:', error)
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

  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      if (!currentNote) return

      try {
        await updateNote(currentNote.noteId, { title: newTitle })
      } catch (error) {
        console.error('Failed to update note title:', error)
      }
    },
    [currentNote, updateNote]
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modKey = isMac ? e.metaKey : e.ctrlKey

      // Cmd/Ctrl + N: New note
      if (modKey && e.key === 'n' && !e.shiftKey) {
        e.preventDefault()
        handleCreateNote()
        return
      }

      // Cmd/Ctrl + K: Focus search
      if (modKey && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleCreateNote])

  const pendingCount =
    (stats?.notes.pending || 0) + (stats?.topics.pending || 0) + (stats?.sections.pending || 0)
  const failedCount =
    (stats?.notes.failed || 0) + (stats?.topics.failed || 0) + (stats?.sections.failed || 0)

  return (
    <div className="notes-page">
      {/* Sync Status Banner */}
      <SyncStatusBanner
        isOnline={isOnline}
        pendingCount={pendingCount}
        failedCount={failedCount}
        lastSyncMs={lastSyncMs}
        onRetryAll={() => triggerSync()}
        className="sync-banner"
      />

      <div className="notes-layout">
        {/* Project Sidebar */}
        <ProjectSidebar
          notes={notes}
          selectedProjectId={selectedProjectId}
          selectedNoteId={selectedNoteId}
          searchQuery={searchQuery}
          onProjectSelect={handleProjectSelect}
          onNoteSelect={handleSelectNote}
          onCreateNote={handleCreateNote}
          onSearchChange={setSearchQuery}
          searchInputRef={searchInputRef}
        />

        {/* Full-Width Editor */}
        <div className="notes-editor-container">
          {currentNote ? (
            <>
              <div className="editor-header">
                <div className="editor-header-content">
                  <NoteTitleEditor
                    title={currentNote.title}
                    onSave={handleTitleChange}
                    placeholder="Untitled"
                  />
                  <div className="editor-actions">
                    <ExportMenu note={currentNote} />
                  </div>
                </div>
              </div>
              <div className="editor-wrapper">
                <NoteEditor
                  note={currentNote}
                  onSave={handleSaveNote}
                  onProjectsChange={handleProjectsChange}
                  onOKRsChange={handleOKRsChange}
                  onAttachmentsChange={handleAttachmentsChange}
                  placeholder="Start writing your note..."
                  autoSaveDelay={2000}
                  showProjectLinker={false}
                  showOKRLinker={true}
                  showAttachments={true}
                />
              </div>
            </>
          ) : (
            <div className="editor-placeholder">
              <div className="placeholder-content">
                {notes.length === 0 ? (
                  <>
                    <div className="placeholder-icon">📝</div>
                    <h2>Welcome to Notes</h2>
                    <p>Create your first note to start capturing ideas, research, and knowledge.</p>
                    <button className="primary-button" onClick={handleCreateNote}>
                      + Create Your First Note
                    </button>
                  </>
                ) : (
                  <>
                    <div className="placeholder-icon">📄</div>
                    <h2>Select a note to start writing</h2>
                    <p>Choose a note from the sidebar or create a new one to begin.</p>
                    <button className="primary-button" onClick={handleCreateNote}>
                      + New Note
                    </button>
                    <p className="placeholder-hint">Press ⌘N or Ctrl+N to create a new note</p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Template Selector Modal */}
      <TemplateSelector
        isOpen={showTemplateSelector}
        onSelect={handleTemplateSelect}
        onCancel={handleTemplateCancelCreate}
      />

      <style>{`
        .notes-page {
          height: 100vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--background);
        }

        .sync-banner {
          flex-shrink: 0;
        }

        .notes-layout {
          flex: 1;
          display: grid;
          grid-template-columns: 280px 1fr;
          overflow: hidden;
        }

        .notes-editor-container {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--background);
        }

        .editor-header {
          flex-shrink: 0;
          padding: 2rem 3rem 1rem;
          border-bottom: 1px solid var(--border);
          background: var(--card);
        }

        .editor-header-content {
          max-width: 900px;
          margin: 0 auto;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
        }

        .editor-header-content > :first-child {
          flex: 1;
          min-width: 0;
        }

        .editor-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .editor-wrapper {
          flex: 1;
          overflow-y: visible;
          padding: 2rem 3rem;
          background: var(--card);
          min-height: 100%;
        }

        .editor-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          background: var(--card);
        }

        .placeholder-content {
          text-align: center;
          max-width: 500px;
          padding: 4rem 2rem;
        }

        .placeholder-icon {
          font-size: 4rem;
          margin-bottom: 1.5rem;
          opacity: 0.5;
        }

        .placeholder-content h2 {
          margin: 0 0 0.75rem 0;
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--foreground);
        }

        .placeholder-content p {
          margin: 0 0 1.5rem 0;
          color: var(--muted-foreground);
          font-size: 0.875rem;
          line-height: 1.6;
        }

        .placeholder-hint {
          margin-top: 1rem !important;
          font-size: 0.8125rem !important;
          color: var(--muted-foreground) !important;
          font-family: var(--font-mono) !important;
        }

        .primary-button {
          padding: 0.625rem 1.25rem;
          min-height: 40px;
          background: var(--accent);
          color: var(--accent-foreground);
          border: 1px solid var(--accent);
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 600;
          white-space: nowrap;
          transition:
            box-shadow var(--motion-standard) var(--motion-ease),
            opacity var(--motion-standard) var(--motion-ease);
        }

        .primary-button:hover:not(:disabled) {
          box-shadow: 0 0 0 3px var(--accent-subtle);
        }

        .primary-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .primary-button.small {
          padding: 0.5rem 1rem;
          min-height: 32px;
          font-size: 0.8125rem;
        }
      `}</style>
    </div>
  )
}
