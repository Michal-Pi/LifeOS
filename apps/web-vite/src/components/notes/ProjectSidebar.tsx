/**
 * ProjectSidebar Component
 *
 * Sidebar for Notes page that organizes notes by projects.
 * Shows projects with linked notes and allows filtering/selection.
 */

import React, { useMemo, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import {
  groupNotesByProject,
  filterNotesByProject,
  sortNotesByModified,
  searchNotes,
  getProjectsWithNotes,
} from '@/lib/notesOrganization'
import type { Note } from '@lifeos/notes'

export interface ProjectSidebarProps {
  notes: Note[]
  selectedProjectId: string | null
  selectedNoteId: string | null
  searchQuery: string
  onProjectSelect: (projectId: string | null) => void
  onNoteSelect: (noteId: string) => void
  onCreateNote: () => void
  onSearchChange?: (query: string) => void
  searchInputRef?: React.RefObject<HTMLInputElement>
}

export function ProjectSidebar({
  notes,
  selectedProjectId,
  selectedNoteId,
  searchQuery,
  onProjectSelect,
  onNoteSelect,
  onCreateNote,
  onSearchChange,
  searchInputRef: externalSearchRef,
}: ProjectSidebarProps) {
  const { user } = useAuth()
  const { projects, loading: projectsLoading } = useTodoOperations({
    userId: user?.uid || '',
  })

  const internalSearchRef = useRef<HTMLInputElement>(null)
  const searchInputRef = externalSearchRef || internalSearchRef

  // Get projects that have linked notes
  const projectsWithNotes = useMemo(() => getProjectsWithNotes(projects, notes), [projects, notes])

  // Group notes by project
  const notesByProject = useMemo(
    () => groupNotesByProject(notes, projectsWithNotes),
    [notes, projectsWithNotes]
  )

  // Get notes for selected project
  const filteredNotes = useMemo(() => {
    let projectNotes: Note[]

    if (selectedProjectId === 'unlinked') {
      // Special case: unlinked notes
      projectNotes = notes.filter((note) => !note.projectIds || note.projectIds.length === 0)
    } else {
      projectNotes = filterNotesByProject(notes, selectedProjectId)
    }

    // Apply search if provided
    if (searchQuery.trim()) {
      projectNotes = searchNotes(projectNotes, searchQuery)
    }

    // Sort by last modified
    return sortNotesByModified(projectNotes)
  }, [notes, selectedProjectId, searchQuery])

  // Get unlinked notes count
  const unlinkedCount = useMemo(() => {
    return notesByProject.get(null)?.length || 0
  }, [notesByProject])

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getNotePreview = (note: Note): string => {
    if (note.contentHtml) {
      // Strip HTML tags and get first line
      const text = note.contentHtml.replace(/<[^>]*>/g, '').trim()
      const firstLine = text.split('\n')[0]
      return firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine
    }
    return 'Empty note'
  }

  // Highlight search query in text
  const highlightSearch = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text

    // Escape special regex characters in query
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'))
    return parts.map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={index} className="search-highlight">
          {part}
        </mark>
      ) : (
        <span key={index}>{part}</span>
      )
    )
  }

  return (
    <aside className="project-sidebar">
      <div className="sidebar-header">
        <h3>Notes</h3>
        <button className="primary-button small" onClick={onCreateNote}>
          + New
        </button>
      </div>

      <div className="sidebar-content">
        {/* Search */}
        {onSearchChange && (
          <div className="sidebar-search">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="search-input"
              title="Press ⌘K or Ctrl+K to focus"
            />
          </div>
        )}

        {/* All Notes */}
        <div className="project-section">
          <button
            type="button"
            className={`project-header ${selectedProjectId === null ? 'active' : ''}`}
            onClick={() => onProjectSelect(null)}
          >
            <span className="project-icon">📄</span>
            <span className="project-name">All Notes</span>
            <span className="note-count">{notes.length}</span>
          </button>
        </div>

        {/* Projects with Notes */}
        {projectsLoading ? (
          <div className="loading-text">Loading projects...</div>
        ) : (
          <>
            {projectsWithNotes.length > 0 && (
              <div className="projects-section">
                <div className="section-label">Projects</div>
                {projectsWithNotes.map((project) => {
                  const projectNotes = notesByProject.get(project.id) || []
                  const isSelected = selectedProjectId === project.id

                  return (
                    <div key={project.id} className="project-section">
                      <button
                        type="button"
                        className={`project-header ${isSelected ? 'active' : ''}`}
                        onClick={() => onProjectSelect(project.id)}
                      >
                        <span className="project-icon">📁</span>
                        <span className="project-name">{project.title}</span>
                        <span className="note-count">{projectNotes.length}</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Unlinked Notes */}
            {unlinkedCount > 0 && (
              <div className="project-section">
                <button
                  type="button"
                  className={`project-header ${selectedProjectId === 'unlinked' ? 'active' : ''}`}
                  onClick={() => onProjectSelect('unlinked')}
                >
                  <span className="project-icon">📋</span>
                  <span className="project-name">Unlinked</span>
                  <span className="note-count">{unlinkedCount}</span>
                </button>
              </div>
            )}
          </>
        )}

        {/* Notes List */}
        <div className="notes-list-main">
          {filteredNotes.length === 0 ? (
            <div className="empty-notes">
              {searchQuery ? (
                <div className="empty-state-content">
                  <p className="empty-state-title">No notes match your search</p>
                  <p className="empty-state-subtitle">Try a different search term</p>
                </div>
              ) : selectedProjectId === 'unlinked' ? (
                <div className="empty-state-content">
                  <p className="empty-state-title">No unlinked notes</p>
                  <p className="empty-state-subtitle">All notes are linked to projects</p>
                </div>
              ) : selectedProjectId === null ? (
                <div className="empty-state-content">
                  <p className="empty-state-title">No notes yet</p>
                  <p className="empty-state-subtitle">Create your first note to get started</p>
                  <button
                    type="button"
                    className="primary-button small"
                    onClick={onCreateNote}
                    style={{ marginTop: '1rem' }}
                  >
                    + New Note
                  </button>
                </div>
              ) : (
                <div className="empty-state-content">
                  <p className="empty-state-title">No notes in this project</p>
                  <p className="empty-state-subtitle">
                    Link notes to this project to see them here
                  </p>
                </div>
              )}
            </div>
          ) : (
            filteredNotes.map((note) => {
              const preview = getNotePreview(note)
              return (
                <button
                  key={note.noteId}
                  type="button"
                  className={`note-item ${selectedNoteId === note.noteId ? 'active' : ''}`}
                  onClick={() => onNoteSelect(note.noteId)}
                >
                  <div className="note-title">
                    {searchQuery ? highlightSearch(note.title, searchQuery) : note.title}
                  </div>
                  <div className="note-preview">
                    {searchQuery ? highlightSearch(preview, searchQuery) : preview}
                  </div>
                  <div className="note-date">{formatDate(note.updatedAtMs)}</div>
                </button>
              )
            })
          )}
        </div>
      </div>

      <style>{`
        .project-sidebar {
          width: 280px;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--card);
          border-right: 1px solid var(--border);
          overflow: hidden;
        }

        .sidebar-header {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .sidebar-header h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          color: var(--foreground);
        }

        .sidebar-content {
          flex: 1;
          overflow-y: auto;
          padding: 0.5rem 0;
        }

        .projects-section {
          padding: 0.5rem 0;
          border-bottom: 1px solid var(--border);
          margin-bottom: 0.5rem;
        }

        .section-label {
          padding: 0.5rem 1.25rem;
          font-size: 0.7rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--muted-foreground);
          font-weight: 600;
        }

        .project-section {
          margin-bottom: 0.25rem;
        }

        .project-header {
          width: 100%;
          padding: 0.625rem 1.25rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
          transition: background-color var(--motion-fast) var(--motion-ease);
        }

        .project-header:hover {
          background: var(--background-secondary);
        }

        .project-header.active {
          background: var(--accent-subtle);
          border-left: 3px solid var(--accent);
        }

        .project-icon {
          font-size: 1.125rem;
          flex-shrink: 0;
        }

        .project-name {
          flex: 1;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .note-count {
          font-size: 0.75rem;
          color: var(--muted-foreground);
          background: var(--background-secondary);
          padding: 0.125rem 0.5rem;
          border-radius: 12px;
          font-weight: 500;
        }

        .notes-list-main {
          padding: 0.5rem 0;
        }

        .notes-list {
          padding-left: 0.5rem;
        }

        .note-item {
          width: 100%;
          padding: 0.75rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          background: transparent;
          border: none;
          border-left: 3px solid transparent;
          cursor: pointer;
          text-align: left;
          transition:
            background-color var(--motion-fast) var(--motion-ease),
            border-color var(--motion-fast) var(--motion-ease);
        }

        .note-item:hover {
          background: var(--background-secondary);
        }

        .note-item.active {
          background: var(--accent-subtle);
          border-left-color: var(--accent);
        }

        .note-title {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .note-preview {
          font-size: 0.8125rem;
          color: var(--muted-foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          line-height: 1.4;
        }

        .note-date {
          font-size: 0.75rem;
          color: var(--muted-foreground);
          font-family: var(--font-mono);
        }

        .empty-notes {
          padding: 2rem 1.25rem;
          text-align: center;
        }

        .empty-state-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }

        .empty-state-title {
          margin: 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--foreground);
        }

        .empty-state-subtitle {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--muted-foreground);
        }

        .search-highlight {
          background-color: var(--accent-subtle);
          color: var(--foreground);
          padding: 0.125em 0.25em;
          border-radius: 3px;
          font-weight: 500;
        }

        .loading-text {
          padding: 1rem 1.25rem;
          text-align: center;
          color: var(--muted-foreground);
          font-size: 0.875rem;
        }

        .sidebar-search {
          padding: 0.75rem 1.25rem;
          border-bottom: 1px solid var(--border);
        }

        .search-input {
          width: 100%;
          min-height: 36px;
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--background-secondary);
          color: var(--foreground);
          font-size: 0.875rem;
          transition:
            border-color var(--motion-standard) var(--motion-ease),
            box-shadow var(--motion-standard) var(--motion-ease);
        }

        .search-input:focus-visible {
          outline: 2px solid transparent;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-subtle);
        }

        .search-input::placeholder {
          color: var(--muted-foreground);
        }
      `}</style>
    </aside>
  )
}
