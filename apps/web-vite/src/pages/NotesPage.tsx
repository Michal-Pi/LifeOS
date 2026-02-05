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
import { useNavigate } from 'react-router-dom'
import { NoteEditor } from '@/components/editor'
import { ProjectSidebar } from '@/components/notes/ProjectSidebar'
import { NoteTitleEditor } from '@/components/notes/NoteTitleEditor'
import { SyncStatusBanner } from '@/components/notes/NoteSyncStatus'
import { ExportMenu } from '@/components/notes/ExportMenu'
import { ProjectLinker } from '@/components/notes/ProjectLinker'
import { OKRLinker } from '@/components/notes/OKRLinker'
import { ImportModal } from '@/components/notes/ImportModal'
import { AIToolsDropdown } from '@/components/notes/AIToolsDropdown'
import { useNoteOperations } from '@/hooks/useNoteOperations'
import { useTopics } from '@/hooks/useTopics'
import { useNoteSync } from '@/hooks/useNoteSync'
import type { AttachmentId } from '@lifeos/notes'
import type { JSONContent } from '@tiptap/core'
import { useNoteMetadataCache } from '@/hooks/useNoteMetadataCache'

export function NotesPage() {
  // Initialize cache hook (refreshes cache on mount and user changes)
  useNoteMetadataCache()
  const navigate = useNavigate()
  const {
    notes,
    currentNote,
    createNote,
    setCurrentNote,
    saveNoteContent,
    updateNote,
    deleteNote,
    listNotes,
    updateProjectLinks,
    updateOKRLinks,
    updateAttachments,
    updateTags,
  } = useNoteOperations()

  const { isOnline, lastSyncMs, stats, triggerSync } = useNoteSync()

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showProjectLinker, setShowProjectLinker] = useState(false)
  const [showOKRLinker, setShowOKRLinker] = useState(false)
  const [showOverflowMenu, setShowOverflowMenu] = useState(false)
  const { topics } = useTopics()
  const [showImportModal, setShowImportModal] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (lastSyncMs) {
      listNotes().catch((error) => {
        console.error('Failed to refresh notes after sync:', error)
      })
    }
  }, [lastSyncMs, listNotes])

  // Set current note when selectedNoteId changes
  useEffect(() => {
    if (selectedNoteId) {
      const note = notes.find((n) => n.noteId === selectedNoteId)
      if (note) {
        setCurrentNote(note)
      }
    }
  }, [selectedNoteId, notes, setCurrentNote])

  const handleCreateNote = useCallback(async () => {
    try {
      const newNote = await createNote({
        title: 'Untitled Note',
        content: undefined,
        topicId: selectedTopicId || null,
        sectionId: selectedSectionId || null,
      })
      setCurrentNote(newNote)
      setSelectedNoteId(newNote.noteId)
    } catch (error) {
      console.error('Failed to create note:', error)
    }
  }, [createNote, selectedTopicId, selectedSectionId, setCurrentNote])

  const handleSelectNote = (noteId: string) => {
    const note = notes.find((n) => n.noteId === noteId)
    setSelectedNoteId(noteId)
    if (note) {
      setSelectedTopicId(note.topicId || null)
      setSelectedSectionId(note.sectionId || null)
    }
  }

  const handleTopicSelect = (topicId: string | null) => {
    setSelectedTopicId(topicId)
    setSelectedSectionId(null)
  }

  const handleSectionSelect = (sectionId: string | null, topicId: string | null) => {
    setSelectedTopicId(topicId)
    setSelectedSectionId(sectionId)
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

  const handleTagsChange = async (tags: string[]) => {
    if (!currentNote) return

    try {
      await updateTags(currentNote.noteId, tags)
    } catch (error) {
      console.error('Failed to update tags:', error)
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

  const handleArchiveToggle = useCallback(async () => {
    if (!currentNote) return
    try {
      await updateNote(currentNote.noteId, { archived: !currentNote.archived })
    } catch (error) {
      console.error('Failed to update archive status:', error)
    }
  }, [currentNote, updateNote])

  const handleImportAsNew = useCallback(
    async (content: JSONContent, title: string, tags?: string[]) => {
      const newNote = await createNote({
        title,
        content,
        topicId: currentNote?.topicId ?? null,
        sectionId: currentNote?.sectionId ?? null,
        tags: tags || [],
      })
      setSelectedNoteId(newNote.noteId)
      setCurrentNote(newNote)
    },
    [createNote, currentNote, setCurrentNote]
  )

  const handleImportAppend = useCallback(
    async (content: JSONContent) => {
      if (!currentNote) return
      // Empty HTML - the editor will regenerate proper HTML on next save
      await saveNoteContent(currentNote.noteId, content, '')
    },
    [currentNote, saveNoteContent]
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modKey = isMac ? e.metaKey : e.ctrlKey

      // Cmd/Ctrl + N: New note
      if (modKey && e.key === 'n' && !e.shiftKey) {
        e.preventDefault()
        void handleCreateNote()
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

  // Close overflow menu on outside click
  useEffect(() => {
    if (!showOverflowMenu) return
    const handleClick = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showOverflowMenu])

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
          selectedTopicId={selectedTopicId}
          selectedSectionId={selectedSectionId}
          selectedNoteId={selectedNoteId}
          searchQuery={searchQuery}
          onTopicSelect={handleTopicSelect}
          onSectionSelect={handleSectionSelect}
          onNoteSelect={handleSelectNote}
          onNoteDelete={deleteNote}
          onNoteDuplicate={async (noteId) => {
            const source = notes.find((note) => note.noteId === noteId)
            if (!source) return
            const duplicated = await createNote({
              title: `${source.title} Copy`,
              content: source.content,
              topicId: source.topicId,
              sectionId: source.sectionId,
              projectIds: source.projectIds || [],
              okrIds: source.okrIds || [],
              tags: source.tags || [],
              attachmentIds: source.attachmentIds || [],
              archived: source.archived,
            })
            setSelectedNoteId(duplicated.noteId)
            setSelectedTopicId(duplicated.topicId || null)
            setSelectedSectionId(duplicated.sectionId || null)
            setCurrentNote(duplicated)
          }}
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
                    <div className="editor-actions-row">
                      <AIToolsDropdown
                        note={currentNote}
                        availableNotes={notes}
                        availableTopics={topics.map((t) => ({ topicId: t.topicId, name: t.name }))}
                        onTagsChange={handleTagsChange}
                      />
                      <button
                        className="ghost-button notes-header-button"
                        onClick={() => navigate('/notes/graph')}
                        type="button"
                      >
                        Graph View
                      </button>
                      <div className="editor-overflow-wrap" ref={overflowRef}>
                        <button
                          className="ghost-button notes-header-button editor-overflow-trigger"
                          onClick={() => setShowOverflowMenu((prev) => !prev)}
                          type="button"
                          aria-label="More actions"
                          aria-expanded={showOverflowMenu}
                        >
                          ···
                        </button>
                        {showOverflowMenu && (
                          <div className="editor-overflow-menu">
                            <ExportMenu note={currentNote} className="notes-header-export" />
                            <button
                              className="editor-overflow-item"
                              onClick={() => {
                                setShowImportModal(true)
                                setShowOverflowMenu(false)
                              }}
                              type="button"
                            >
                              Import
                            </button>
                            <button
                              className="editor-overflow-item"
                              onClick={() => {
                                void handleArchiveToggle()
                                setShowOverflowMenu(false)
                              }}
                              type="button"
                            >
                              {currentNote.archived ? 'Unarchive' : 'Archive'}
                            </button>
                            <button
                              className="editor-overflow-item"
                              onClick={() => {
                                setShowProjectLinker((prev) => !prev)
                                setShowOverflowMenu(false)
                              }}
                              type="button"
                            >
                              Link project
                            </button>
                            <button
                              className="editor-overflow-item"
                              onClick={() => {
                                setShowOKRLinker((prev) => !prev)
                                setShowOverflowMenu(false)
                              }}
                              type="button"
                            >
                              Link OKRs
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="editor-status" id="note-status-anchor" />
                  </div>
                </div>
                {showProjectLinker && (
                  <div className="editor-linker-panel">
                    <ProjectLinker
                      linkedProjectIds={currentNote.projectIds || []}
                      onProjectsChange={handleProjectsChange}
                    />
                  </div>
                )}
                {showOKRLinker && (
                  <div className="editor-linker-panel">
                    <OKRLinker
                      selectedOKRIds={currentNote.okrIds || []}
                      onChange={handleOKRsChange}
                    />
                  </div>
                )}
              </div>
              <div className="editor-wrapper">
                <NoteEditor
                  note={currentNote}
                  onSave={handleSaveNote}
                  onProjectsChange={handleProjectsChange}
                  onOKRsChange={handleOKRsChange}
                  onAttachmentsChange={handleAttachmentsChange}
                  onTagsChange={handleTagsChange}
                  placeholder="Start writing your note..."
                  autoSaveDelay={2000}
                  showProjectLinker={false}
                  showOKRLinker={false}
                  showAttachments={false}
                  showTags={false}
                  statusContainerId="note-status-anchor"
                  availableNotes={notes}
                  onNoteClick={(noteId) => {
                    const note = notes.find((n) => n.noteId === noteId)
                    if (note) {
                      setCurrentNote(note)
                      setSelectedNoteId(noteId)
                    }
                  }}
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

      <style>{`
        .notes-page {
          height: calc(100vh - var(--nav-height) - 20px);
          display: flex;
          flex-direction: column;
          gap: 0;
          overflow: hidden;
          background: var(--background);
          background-image: var(--background-texture);
          background-size: auto;
          background-position: top center;
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
          min-height: 0;
        }

        .editor-header {
          flex-shrink: 0;
          padding: 2rem 3rem 1rem;
          border-bottom: 1px solid var(--border);
          background: var(--card);
        }

        .editor-header-content {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          width: 100%;
        }

        .editor-header-content > :first-child {
          flex: 1;
          min-width: 0;
        }

        .editor-actions {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.25rem;
          flex-shrink: 0;
        }

        .editor-actions-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .editor-overflow-wrap {
          position: relative;
        }

        .editor-overflow-trigger {
          font-size: 1.1rem;
          letter-spacing: 0.15em;
          line-height: 1;
          padding: 0.45rem 0.6rem !important;
        }

        .editor-overflow-menu {
          position: absolute;
          top: calc(100% + 4px);
          right: 0;
          z-index: 50;
          min-width: 160px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 8px 24px var(--shadow-soft);
          padding: 0.35rem;
          display: flex;
          flex-direction: column;
        }

        .editor-overflow-item {
          display: block;
          width: 100%;
          text-align: left;
          padding: 0.5rem 0.75rem;
          font-size: 0.8rem;
          color: var(--foreground);
          background: none;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: background var(--motion-fast) var(--motion-ease);
        }

        .editor-overflow-item:hover {
          background: var(--background-secondary);
        }

        /* Style ExportMenu inside overflow to match items */
        .editor-overflow-menu .notes-header-export .export-button {
          display: block;
          width: 100%;
          text-align: left;
          padding: 0.5rem 0.75rem;
          font-size: 0.8rem;
          min-height: unset;
          border-radius: 6px;
          border: none;
          background: none;
          color: var(--foreground);
          letter-spacing: normal;
        }

        .editor-overflow-menu .notes-header-export .export-button:hover {
          background: var(--background-secondary);
        }

        .editor-status {
          min-height: 0.9rem;
          font-size: 0.7rem;
          color: var(--text-secondary);
          line-height: 1;
        }

        .notes-header-button,
        .notes-header-export .export-button {
          min-height: 32px;
          padding: 0.45rem 0.85rem;
          font-size: 0.8rem;
          border-radius: 8px;
          letter-spacing: 0.04em;
          background: transparent;
          border-color: var(--border);
          color: var(--foreground);
        }

        .notes-header-button:hover,
        .notes-header-export .export-button:hover {
          background: var(--background-tertiary);
          border-color: var(--border-strong);
        }

        .editor-wrapper {
          flex: 1;
          overflow: hidden;
          padding: 2rem 3rem;
          background: var(--card);
          min-height: 0;
          display: flex;
          position: relative;
        }

        .editor-linker-panel {
          margin-top: 1rem;
          padding: 1rem 1.25rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--background-secondary);
          box-shadow: 0 8px 20px var(--shadow-soft);
          max-width: 720px;
          width: 100%;
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

      {/* Import Modal */}
      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportNew={handleImportAsNew}
        onAppendToCurrent={handleImportAppend}
        currentNoteExists={!!currentNote}
        currentNoteContent={currentNote?.content as JSONContent | undefined}
      />
    </div>
  )
}
