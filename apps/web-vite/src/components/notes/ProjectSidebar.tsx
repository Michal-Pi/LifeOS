/**
 * ProjectSidebar Component
 *
 * Single-column navigation for Notes:
 * - New Note, Search, Show Archived
 * - Projects (topics) -> Chapters (sections) -> Notes
 * - Hover menus for delete/duplicate actions
 */

import { useMemo, useRef, useState, useEffect } from 'react'
import type { Note, SectionId, TopicId } from '@lifeos/notes'
import { useTopics } from '@/hooks/useTopics'
import { useSections } from '@/hooks/useSections'
import { useDialog } from '@/contexts/useDialog'
import { Menu, MenuItem } from '@/components/Menu'

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
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [showArchived, setShowArchived] = useState(false)
  const [menuState, setMenuState] = useState<MenuState | null>(null)
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

  const notesBySection = useMemo(() => {
    const map = new Map<SectionId, Note[]>()
    for (const note of filteredNotes) {
      if (!note.sectionId) continue
      const current = map.get(note.sectionId) || []
      current.push(note)
      map.set(note.sectionId, current)
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
    () => filteredNotes.filter((note) => !note.topicId),
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

  const deleteNote = async (noteId: string) => {
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
        {sortedTopics.map((topic) => {
          const topicNotes = notesByTopic.get(topic.topicId) || []
          const topicSections = sectionsByTopic.get(topic.topicId) || []
          const directNotes = topicNotes.filter((note) => !note.sectionId)
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
            <div key={topic.topicId} className="sidebar-group">
              <div
                className={`sidebar-row ${selectedTopicId === topic.topicId && !selectedSectionId ? 'active' : ''}`}
                onClick={() => {
                  onTopicSelect(topic.topicId)
                  onSectionSelect(null, topic.topicId)
                  if (!isExpanded) {
                    toggleTopic(topic.topicId)
                  }
                }}
              >
                <button
                  className="chevron"
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleTopic(topic.topicId)
                  }}
                  type="button"
                  aria-label={isExpanded ? 'Collapse project' : 'Expand project'}
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
                <span className="row-label">{topic.name}</span>
                <button
                  className="row-menu"
                  type="button"
                  onClick={(event) => openMenu('project', topic.topicId, event)}
                >
                  …
                </button>
              </div>

              {isExpanded && (
                <div className="sidebar-children">
                  {topicSections.map((section) => {
                    const sectionNotes = notesBySection.get(section.sectionId) || []
                    if (searchQuery.trim() && sectionNotes.length === 0) {
                      return null
                    }
                    const isSectionExpanded =
                      expandedSections.has(section.sectionId) ||
                      selectedSectionId === section.sectionId
                    return (
                      <div key={section.sectionId} className="sidebar-group">
                        <div
                          className={`sidebar-row chapter ${selectedSectionId === section.sectionId ? 'active' : ''}`}
                          onClick={() => onSectionSelect(section.sectionId, topic.topicId)}
                        >
                          <button
                            className="chevron"
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleSection(section.sectionId)
                            }}
                            type="button"
                            aria-label={isSectionExpanded ? 'Collapse chapter' : 'Expand chapter'}
                          >
                            {isSectionExpanded ? '▾' : '▸'}
                          </button>
                          <span className="row-label">{section.name}</span>
                          <button
                            className="row-menu"
                            type="button"
                            onClick={(event) => openMenu('chapter', section.sectionId, event)}
                          >
                            …
                          </button>
                        </div>
                        {isSectionExpanded && (
                          <div className="sidebar-children notes">
                            {sectionNotes.map((note) => (
                              <div
                                key={note.noteId}
                                className={`sidebar-row note ${selectedNoteId === note.noteId ? 'active' : ''}`}
                                onClick={() => onNoteSelect(note.noteId)}
                              >
                                <span className="row-label">{note.title}</span>
                                <button
                                  className="row-menu"
                                  type="button"
                                  onClick={(event) => openMenu('note', note.noteId, event)}
                                >
                                  …
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {directNotes.length > 0 && (
                    <div className="sidebar-group">
                      <div className="sidebar-row chapter muted">General</div>
                      <div className="sidebar-children notes">
                        {directNotes.map((note) => (
                          <div
                            key={note.noteId}
                            className={`sidebar-row note ${selectedNoteId === note.noteId ? 'active' : ''}`}
                            onClick={() => onNoteSelect(note.noteId)}
                          >
                            <span className="row-label">{note.title}</span>
                            <button
                              className="row-menu"
                              type="button"
                              onClick={(event) => openMenu('note', note.noteId, event)}
                            >
                              …
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {unassignedNotes.length > 0 && (
          <div className="sidebar-group">
            <div className="sidebar-row muted">Unassigned</div>
            <div className="sidebar-children notes">
              {unassignedNotes.map((note) => (
                <div
                  key={note.noteId}
                  className={`sidebar-row note ${selectedNoteId === note.noteId ? 'active' : ''}`}
                  onClick={() => onNoteSelect(note.noteId)}
                >
                  <span className="row-label">{note.title}</span>
                  <button
                    className="row-menu"
                    type="button"
                    onClick={(event) => openMenu('note', note.noteId, event)}
                  >
                    …
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
                    duplicateNote(menuState.id)
                    setMenuState(null)
                  }}
                >
                  Duplicate note
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    deleteNote(menuState.id)
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

        .sidebar-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
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
        }

        .sidebar-row:hover .row-menu {
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
      `}</style>
    </aside>
  )
}
