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
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { stripHtml } from '@/notes/noteContent'
import type { AttachmentId } from '@lifeos/notes'
import type { JSONContent } from '@tiptap/core'
import { useNoteMetadataCache } from '@/hooks/useNoteMetadataCache'
import '@/styles/pages/NotesPage.css'

export function NotesPage() {
  // Initialize cache hook (refreshes cache on mount and user changes)
  useNoteMetadataCache()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
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

  // Handle ?noteId= query param from external navigation (e.g. workflow "View" toast)
  const noteIdParam = searchParams.get('noteId')
  useEffect(() => {
    if (!noteIdParam) return
    // Refresh from IndexedDB so newly-created notes appear, then select
    listNotes()
      .then((refreshed) => {
        const target = refreshed.find((n) => n.noteId === noteIdParam)
        if (target) {
          setSelectedNoteId(noteIdParam)
          setCurrentNote(target)
        }
      })
      .catch((error) => {
        console.error('Failed to load note from query param:', error)
      })
    // Clear the param so it doesn't re-trigger on every render
    setSearchParams({}, { replace: true })
  }, [noteIdParam]) // eslint-disable-line react-hooks/exhaustive-deps

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
      // Refresh note list so sidebar shows new note
      await listNotes()
    },
    [createNote, currentNote, setCurrentNote, listNotes]
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

  const wordCount = currentNote?.contentHtml
    ? stripHtml(currentNote.contentHtml).split(/\s+/).filter(Boolean).length
    : 0

  const currentTopicName = currentNote?.topicId
    ? (topics.find((t) => t.topicId === currentNote.topicId)?.name ?? null)
    : null

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
                  {(currentTopicName || (currentNote.tags?.length ?? 0) > 0) && (
                    <div className="note-meta-bar">
                      {currentTopicName && (
                        <span className="note-meta-bar__project">{currentTopicName}</span>
                      )}
                      {currentNote.tags?.map((tag) => (
                        <span key={tag} className="note-meta-bar__tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
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
                                setShowProjectLinker(true)
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
                    <span className="editor-word-count">{wordCount} words</span>
                    <div className="editor-status" id="note-status-anchor" />
                  </div>
                </div>
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

      {/* Import Modal */}
      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportNew={handleImportAsNew}
        onAppendToCurrent={handleImportAppend}
        currentNoteExists={!!currentNote}
        currentNoteContent={currentNote?.content as JSONContent | undefined}
      />

      {/* Project Linker Modal */}
      {currentNote && (
        <ProjectLinker
          isOpen={showProjectLinker}
          onClose={() => setShowProjectLinker(false)}
          linkedProjectIds={currentNote.projectIds || []}
          onProjectsChange={handleProjectsChange}
        />
      )}
    </div>
  )
}
