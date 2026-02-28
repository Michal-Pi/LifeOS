/**
 * ProjectSidebar Component
 *
 * Single-column navigation for Notes:
 * - Pinned notes at top
 * - New Note, Search, Show Archived
 * - Projects (topics) -> Chapters (sections) -> Notes (sorted by last-edited)
 * - Unassigned notes at bottom
 * - Hover preview popover on note items
 * - Context menus for delete/duplicate/pin actions
 */

import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import type { Note, SectionId, TopicId } from '@lifeos/notes'
import { formatDistanceToNow } from 'date-fns'
import { useTopics } from '@/hooks/useTopics'
import { useSections } from '@/hooks/useSections'
import { usePinnedNotes } from '@/hooks/usePinnedNotes'
import { useDialog } from '@/contexts/useDialog'
import { Menu, MenuItem } from '@/components/Menu'
import { stripHtml } from '@/notes/noteContent'

export interface ProjectSidebarProps {
  notes: Note[]
  selectedTopicId: string | null
  selectedSectionId: string | null
  selectedNoteId: string | null
  searchQuery: string
  onTopicSelect: (topicId: string | null) => void
  onSectionSelect: (sectionId: string | null, topicId: string | null) => void
  onNoteSelect: (noteId: string) => void
  onNoteDelete?: (noteId: string) => Promise<void>
  onNoteDuplicate?: (noteId: string) => Promise<void>
  onCreateNote: () => void
  onSearchChange?: (query: string) => void
  searchInputRef?: React.RefObject<HTMLInputElement>
}

type MenuState = {
  type: 'project' | 'chapter' | 'note'
  id: string
  x: number
  y: number
}

type PreviewState = {
  note: Note
  rect: DOMRect
} | null

function formatRelative(ms: number): string {
  return formatDistanceToNow(new Date(ms), { addSuffix: true })
}

function sortByUpdatedDesc(a: Note, b: Note): number {
  return b.updatedAtMs - a.updatedAtMs
}

export function ProjectSidebar({
  notes,
  selectedTopicId,
  selectedSectionId,
  selectedNoteId,
  searchQuery,
  onTopicSelect,
  onSectionSelect,
  onNoteSelect,
  onNoteDelete,
  onNoteDuplicate,
  onCreateNote,
  onSearchChange,
  searchInputRef,
}: ProjectSidebarProps) {
  const { confirm } = useDialog()
  const { topics, createTopic, deleteTopic } = useTopics()
  const { sections, createSection, deleteSection } = useSections()
  const { pinnedIds, togglePin, isPinned } = usePinnedNotes()
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [showArchived, setShowArchived] = useState(false)
  const [menuState, setMenuState] = useState<MenuState | null>(null)
  const [previewNote, setPreviewNote] = useState<PreviewState>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const sidebarRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (!menuState) return
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      setMenuState(null)
    }

    window.addEventListener('mousedown', handleOutside)
    return () => window.removeEventListener('mousedown', handleOutside)
  }, [menuState])

  const filteredNotes = useMemo(() => {
    let result = showArchived ? notes : notes.filter((note) => !note.archived)
    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase()
      result = result.filter(
        (note) =>
          note.title.toLowerCase().includes(lowerQuery) ||
          note.contentHtml?.toLowerCase().includes(lowerQuery)
      )
    }
    return result
  }, [notes, searchQuery, showArchived])

  const pinnedNotes = useMemo(
    () => filteredNotes.filter((note) => pinnedIds.has(note.noteId)).sort(sortByUpdatedDesc),
    [filteredNotes, pinnedIds]
  )

  const notesBySection = useMemo(() => {
    const map = new Map<SectionId, Note[]>()
    for (const note of filteredNotes) {
      if (!note.sectionId) continue
      const current = map.get(note.sectionId) || []
      current.push(note)
      map.set(note.sectionId, current)
    }
    // Sort each section's notes by updatedAtMs desc
    for (const [key, list] of map.entries()) {
      map.set(key, list.sort(sortByUpdatedDesc))
    }
    return map
  }, [filteredNotes])

  const notesByTopic = useMemo(() => {
    const map = new Map<TopicId, Note[]>()
    for (const note of filteredNotes) {
      if (!note.topicId) continue
      const current = map.get(note.topicId) || []
      current.push(note)
      map.set(note.topicId, current)
    }
    return map
  }, [filteredNotes])

  const unassignedNotes = useMemo(
    () => filteredNotes.filter((note) => !note.topicId).sort(sortByUpdatedDesc),
    [filteredNotes]
  )

  const sortedTopics = useMemo(() => [...topics].sort((a, b) => a.order - b.order), [topics])

  const sectionsByTopic = useMemo(() => {
    const map = new Map<TopicId, typeof sections>()
    for (const section of sections) {
      const current = map.get(section.topicId) || []
      current.push(section)
      map.set(section.topicId, current)
    }
    for (const [topicId, list] of map.entries()) {
      list.sort((a, b) => a.order - b.order)
      map.set(topicId, list)
    }
    return map
  }, [sections])

  const toggleTopic = (topicId: TopicId) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev)
      if (next.has(topicId)) {
        next.delete(topicId)
      } else {
        next.add(topicId)
      }
      return next
    })
  }

  const toggleSection = (sectionId: SectionId) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  const openMenu = (type: MenuState['type'], id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    if (!sidebarRef.current) return
    const sidebarRect = sidebarRef.current.getBoundingClientRect()
    const buttonRect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const x = Math.min(buttonRect.right - sidebarRect.left + 8, sidebarRect.width - 180)
    const y = buttonRect.top - sidebarRect.top
    setMenuState({ type, id, x, y })
  }

  const duplicateProject = async (topicId: TopicId) => {
    const topic = topics.find((t) => t.topicId === topicId)
    if (!topic) return
    await createTopic({
      name: `${topic.name} Copy`,
      description: topic.description || undefined,
      order: topics.length,
      color: topic.color || undefined,
    })
  }

  const deleteProject = async (topicId: TopicId) => {
    const confirmed = await confirm({
      title: 'Delete project',
      description: 'Delete this project and its chapters?',
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
    })
    if (!confirmed) return
    await deleteTopic(topicId)
    if (selectedTopicId === topicId) {
      onTopicSelect(null)
      onSectionSelect(null, null)
    }
  }

  const duplicateChapter = async (sectionId: SectionId) => {
    const section = sections.find((s) => s.sectionId === sectionId)
    if (!section) return
    const siblings = sectionsByTopic.get(section.topicId) || []
    await createSection({
      topicId: section.topicId,
      name: `${section.name} Copy`,
      order: siblings.length,
    })
  }

  const deleteChapter = async (sectionId: SectionId) => {
    const confirmed = await confirm({
      title: 'Delete chapter',
      description: 'Delete this chapter?',
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
    })
    if (!confirmed) return
    await deleteSection(sectionId)
    if (selectedSectionId === sectionId) {
      onSectionSelect(null, null)
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    if (!onNoteDelete) return
    const confirmed = await confirm({
      title: 'Delete note',
      description: 'Delete this note?',
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
    })
    if (!confirmed) return
    await onNoteDelete(noteId)
  }

  const duplicateNote = async (noteId: string) => {
    if (!onNoteDuplicate) return
    await onNoteDuplicate(noteId)
  }

  // --- Hover preview handlers ---
  const handleNoteMouseEnter = useCallback((e: React.MouseEvent, note: Note) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    hoverTimerRef.current = setTimeout(() => {
      setPreviewNote({ note, rect })
    }, 500)
  }, [])

  const handleNoteMouseLeave = useCallback(() => {
    clearTimeout(hoverTimerRef.current)
    setPreviewNote(null)
  }, [])

  // --- Note item renderer ---
  const renderNoteItem = (note: Note) => (
    <div
      key={note.noteId}
      className={`sidebar-row note ${selectedNoteId === note.noteId ? 'active' : ''}`}
      onClick={() => onNoteSelect(note.noteId)}
      onMouseEnter={(e) => handleNoteMouseEnter(e, note)}
      onMouseLeave={handleNoteMouseLeave}
    >
      {isPinned(note.noteId) && (
        <span className="note-pin-icon" aria-label="Pinned">
          *
        </span>
      )}
      <span className="row-label">{note.title}</span>
      <button
        className="row-menu"
        type="button"
        onClick={(event) => openMenu('note', note.noteId, event)}
      >
        …
      </button>
    </div>
  )

  return (
    <aside className="notes-sidebar" ref={sidebarRef}>
      <div className="sidebar-segment">
        <button className="primary-button full-width" onClick={onCreateNote} type="button">
          + New Note
        </button>
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
        <button
          className="ghost-button full-width"
          onClick={() => setShowArchived((prev) => !prev)}
          type="button"
        >
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
      </div>

      <div className="sidebar-divider" />

      <div className="sidebar-tree">
        {/* Pinned Section */}
        {pinnedNotes.length > 0 && (
          <div className="sidebar-section sidebar-section--pinned">
            <div className="sidebar-section__header">
              <span className="sidebar-section__label">Pinned</span>
              <span className="sidebar-section__count">{pinnedNotes.length}</span>
            </div>
            {pinnedNotes.map(renderNoteItem)}
          </div>
        )}

        {/* Topic Tree */}
        {sortedTopics.map((topic) => {
          const topicNotes = notesByTopic.get(topic.topicId) || []
          const topicSections = sectionsByTopic.get(topic.topicId) || []
          const directNotes = topicNotes.filter((note) => !note.sectionId).sort(sortByUpdatedDesc)
          const hasMatches =
            topicNotes.length > 0 ||
            topicSections.some(
              (section) => (notesBySection.get(section.sectionId) || []).length > 0
            )

          if (searchQuery.trim() && !hasMatches) {
            return null
          }

          const isExpanded = expandedTopics.has(topic.topicId) || selectedTopicId === topic.topicId

          return (
            <details
              key={topic.topicId}
              className="sidebar-topic"
              open={isExpanded}
              onToggle={(e) => {
                // Sync React state with native <details> toggle
                const open = (e.currentTarget as HTMLDetailsElement).open
                setExpandedTopics((prev) => {
                  const next = new Set(prev)
                  if (open) {
                    next.add(topic.topicId)
                  } else {
                    next.delete(topic.topicId)
                  }
                  return next
                })
              }}
            >
              <summary
                className={`sidebar-topic__header ${selectedTopicId === topic.topicId && !selectedSectionId ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault()
                  onTopicSelect(topic.topicId)
                  onSectionSelect(null, topic.topicId)
                  if (!isExpanded) {
                    toggleTopic(topic.topicId)
                  }
                }}
              >
                <span className="sidebar-topic__arrow">
                  <button
                    className="chevron"
                    onClick={(event) => {
                      event.stopPropagation()
                      event.preventDefault()
                      toggleTopic(topic.topicId)
                    }}
                    type="button"
                    aria-label={isExpanded ? 'Collapse project' : 'Expand project'}
                  >
                    {isExpanded ? '▾' : '▸'}
                  </button>
                </span>
                <span className="sidebar-topic__name">{topic.name}</span>
                <span className="sidebar-topic__count">{topicNotes.length}</span>
                <span className="sidebar-topic__edited">{formatRelative(topic.updatedAtMs)}</span>
                <button
                  className="row-menu"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    event.preventDefault()
                    openMenu('project', topic.topicId, event)
                  }}
                >
                  …
                </button>
              </summary>

              {isExpanded && (
                <div className="sidebar-topic__children">
                  {topicSections.map((section) => {
                    const sectionNotes = notesBySection.get(section.sectionId) || []
                    if (searchQuery.trim() && sectionNotes.length === 0) {
                      return null
                    }
                    const isSectionExpanded =
                      expandedSections.has(section.sectionId) ||
                      selectedSectionId === section.sectionId
                    return (
                      <details
                        key={section.sectionId}
                        className="sidebar-section"
                        open={isSectionExpanded}
                        onToggle={(e) => {
                          const open = (e.currentTarget as HTMLDetailsElement).open
                          setExpandedSections((prev) => {
                            const next = new Set(prev)
                            if (open) {
                              next.add(section.sectionId)
                            } else {
                              next.delete(section.sectionId)
                            }
                            return next
                          })
                        }}
                      >
                        <summary
                          className={`sidebar-section__header ${selectedSectionId === section.sectionId ? 'active' : ''}`}
                          onClick={(e) => {
                            e.preventDefault()
                            onSectionSelect(section.sectionId, topic.topicId)
                            if (!isSectionExpanded) {
                              toggleSection(section.sectionId)
                            }
                          }}
                        >
                          <button
                            className="chevron"
                            onClick={(event) => {
                              event.stopPropagation()
                              event.preventDefault()
                              toggleSection(section.sectionId)
                            }}
                            type="button"
                            aria-label={isSectionExpanded ? 'Collapse chapter' : 'Expand chapter'}
                          >
                            {isSectionExpanded ? '▾' : '▸'}
                          </button>
                          <span className="sidebar-section__name">{section.name}</span>
                          <span className="sidebar-section__count">{sectionNotes.length}</span>
                          <button
                            className="row-menu"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              event.preventDefault()
                              openMenu('chapter', section.sectionId, event)
                            }}
                          >
                            …
                          </button>
                        </summary>
                        {isSectionExpanded && (
                          <div className="sidebar-section__notes">
                            {sectionNotes.map(renderNoteItem)}
                          </div>
                        )}
                      </details>
                    )
                  })}
                  {directNotes.length > 0 && (
                    <div className="sidebar-group">
                      <div className="sidebar-row chapter muted">General</div>
                      <div className="sidebar-section__notes">
                        {directNotes.map(renderNoteItem)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </details>
          )
        })}

        {/* Unassigned Notes — always last */}
        {unassignedNotes.length > 0 && (
          <div className="sidebar-group sidebar-group--unassigned">
            <div className="sidebar-row muted">Unassigned</div>
            <div className="sidebar-section__notes">{unassignedNotes.map(renderNoteItem)}</div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {menuState && (
        <div className="sidebar-menu" style={{ top: menuState.y, left: menuState.x }} ref={menuRef}>
          <Menu>
            {menuState.type === 'project' && (
              <>
                <MenuItem
                  onSelect={() => {
                    duplicateProject(menuState.id as TopicId)
                    setMenuState(null)
                  }}
                >
                  Duplicate project
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    deleteProject(menuState.id as TopicId)
                    setMenuState(null)
                  }}
                >
                  Delete project
                </MenuItem>
              </>
            )}
            {menuState.type === 'chapter' && (
              <>
                <MenuItem
                  onSelect={() => {
                    duplicateChapter(menuState.id as SectionId)
                    setMenuState(null)
                  }}
                >
                  Duplicate chapter
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    deleteChapter(menuState.id as SectionId)
                    setMenuState(null)
                  }}
                >
                  Delete chapter
                </MenuItem>
              </>
            )}
            {menuState.type === 'note' && (
              <>
                <MenuItem
                  onSelect={() => {
                    togglePin(menuState.id)
                    setMenuState(null)
                  }}
                >
                  {isPinned(menuState.id) ? 'Unpin note' : 'Pin note'}
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    duplicateNote(menuState.id)
                    setMenuState(null)
                  }}
                >
                  Duplicate note
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    handleDeleteNote(menuState.id)
                    setMenuState(null)
                  }}
                >
                  Delete note
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      )}

      {/* Hover Preview Popover */}
      {previewNote && (
        <div
          className="note-preview"
          style={{
            top: previewNote.rect.top,
            left: previewNote.rect.right + 8,
          }}
        >
          <p className="note-preview__text">
            {stripHtml(previewNote.note.contentHtml).slice(0, 200)}
          </p>
          {(previewNote.note.tags?.length ?? 0) > 0 && (
            <div className="note-preview__tags">
              {previewNote.note.tags.map((tag) => (
                <span key={tag} className="note-preview__tag">
                  {tag}
                </span>
              ))}
            </div>
          )}
          <p className="note-preview__date">
            Edited {formatRelative(previewNote.note.updatedAtMs)}
          </p>
        </div>
      )}

      <style>{`
        .notes-sidebar {
          width: 280px;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--card);
          border-right: 1px solid var(--border);
          overflow: hidden;
          position: relative;
        }

        .sidebar-segment {
          padding: 1rem 1rem 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }

        .full-width {
          width: 100%;
          justify-content: center;
        }

        .sidebar-search .search-input {
          width: 100%;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--background-secondary);
          color: var(--foreground);
          padding: 0.5rem 0.75rem;
          font-size: 0.85rem;
        }

        .sidebar-divider {
          border-top: 1px solid var(--border);
        }

        .sidebar-tree {
          flex: 1;
          overflow-y: auto;
          padding: 0.75rem 0.5rem 1rem;
        }

        /* --- Pinned Section --- */

        .sidebar-section--pinned {
          border-bottom: 1px solid var(--border);
          padding-bottom: var(--space-2);
          margin-bottom: var(--space-2);
        }

        .sidebar-section--pinned .sidebar-section__header {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-1) var(--space-3);
        }

        .sidebar-section--pinned .sidebar-section__label {
          font-size: var(--text-xs);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--accent);
        }

        .sidebar-section--pinned .sidebar-section__count {
          font-size: var(--text-xs);
          font-family: var(--font-mono);
          color: var(--text-tertiary);
        }

        /* --- Topic (details/summary) --- */

        .sidebar-topic {
          margin-bottom: 0.15rem;
        }

        .sidebar-topic__header {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          cursor: pointer;
          font-size: var(--text-sm);
          font-weight: 600;
          list-style: none;
          border-radius: 10px;
          transition: background var(--motion-fast) var(--motion-ease);
        }

        .sidebar-topic__header::-webkit-details-marker { display: none; }

        .sidebar-topic__header:hover {
          background: var(--background-tertiary);
        }

        .sidebar-topic__header.active {
          background: var(--accent-subtle);
          color: var(--foreground);
        }

        .sidebar-topic__arrow {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .sidebar-topic__name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .sidebar-topic__count {
          font-size: var(--text-xs);
          font-family: var(--font-mono);
          color: var(--text-tertiary);
          margin-left: auto;
        }

        .sidebar-topic__edited {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          white-space: nowrap;
        }

        .sidebar-topic__children {
          padding-left: var(--space-3);
        }

        /* --- Section (details/summary) --- */

        .sidebar-section {
          margin-bottom: 0.1rem;
        }

        .sidebar-section__header {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-1) var(--space-3);
          cursor: pointer;
          font-size: var(--text-sm);
          color: var(--text-secondary);
          list-style: none;
          border-radius: 10px;
          transition: background var(--motion-fast) var(--motion-ease);
        }

        .sidebar-section__header::-webkit-details-marker { display: none; }

        .sidebar-section__header:hover {
          background: var(--background-secondary);
        }

        .sidebar-section__header.active {
          background: var(--accent-subtle);
          color: var(--foreground);
        }

        .sidebar-section__name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .sidebar-section__count {
          font-size: var(--text-xs);
          font-family: var(--font-mono);
          color: var(--text-tertiary);
          margin-left: auto;
        }

        .sidebar-section__notes {
          padding-left: var(--space-3);
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          margin-bottom: 0.4rem;
        }

        /* --- Shared row styles --- */

        .sidebar-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .sidebar-group--unassigned {
          margin-top: var(--space-2);
          padding-top: var(--space-2);
          border-top: 1px solid var(--border);
        }

        .sidebar-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.4rem 0.6rem;
          border-radius: 10px;
          cursor: pointer;
          position: relative;
        }

        .sidebar-row:hover {
          background: var(--background-secondary);
        }

        .sidebar-row.active {
          background: var(--accent-subtle);
          color: var(--foreground);
        }

        .sidebar-row.chapter {
          padding-left: 1.4rem;
        }

        .sidebar-row.note {
          padding-left: 2.6rem;
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .sidebar-row.note.active {
          color: var(--foreground);
        }

        .sidebar-row.muted {
          cursor: default;
          color: var(--text-secondary);
        }

        .note-pin-icon {
          font-size: 0.7rem;
          color: var(--accent);
          flex-shrink: 0;
        }

        .chevron {
          width: 18px;
          height: 18px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          padding: 0;
        }

        .row-label {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .row-menu {
          border: none;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          opacity: 0;
          transition: opacity var(--motion-fast) var(--motion-ease);
          font-size: 1rem;
          padding: 0;
        }

        .sidebar-row:hover .row-menu,
        .sidebar-topic__header:hover .row-menu,
        .sidebar-section__header:hover .row-menu {
          opacity: 1;
        }

        .sidebar-children {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .sidebar-children.notes {
          margin-bottom: 0.4rem;
        }

        .sidebar-menu {
          position: absolute;
          z-index: 20;
        }

        /* --- Hover Preview Popover --- */

        .note-preview {
          position: fixed;
          z-index: 100;
          width: 260px;
          max-height: 160px;
          padding: var(--space-3);
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-lg);
          pointer-events: none;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .note-preview__text {
          font-size: var(--text-sm);
          color: var(--text-secondary);
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin: 0;
        }

        .note-preview__tags {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-1);
        }

        .note-preview__tag {
          font-size: var(--text-xs);
          padding: 1px 6px;
          background: var(--accent-subtle);
          color: var(--accent);
          border-radius: var(--radius-full);
        }

        .note-preview__date {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          margin: 0;
        }
      `}</style>
    </aside>
  )
}
