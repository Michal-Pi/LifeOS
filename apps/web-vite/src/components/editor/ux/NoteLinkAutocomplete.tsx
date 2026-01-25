/**
 * NoteLinkAutocomplete Component
 *
 * Autocomplete dropdown for note links.
 * Appears when user types [[ in the editor.
 */

import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import type { Editor } from '@tiptap/react'
import type { Note } from '@lifeos/notes'
import './NoteLinkAutocomplete.css'

export interface NoteLinkAutocompleteProps {
  editor: Editor
  isOpen: boolean
  onClose: () => void
  position: { x: number; y: number }
  query: string
  availableNotes: Note[]
  onSelectNote: (noteId: string, noteTitle: string) => void
}

/**
 * Highlight matching text in a string
 */
function highlightMatch(text: string, query: string): string {
  if (!query) return text
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi')
  return text.replace(regex, '<mark>$1</mark>')
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function NoteLinkAutocomplete({
  editor,
  isOpen,
  onClose,
  position,
  query,
  availableNotes,
  onSelectNote,
}: NoteLinkAutocompleteProps) {
  void editor
  const menuRef = useRef<HTMLDivElement>(null)

  // Filter notes based on query (case-insensitive, partial match)
  const filteredNotes = useMemo(() => {
    if (!query.trim()) {
      // Show all notes if no query (limit to 10)
      return availableNotes.filter((note) => !note.archived).slice(0, 10)
    }

    const lowerQuery = query.toLowerCase()
    const matches = availableNotes
      .filter((note) => {
        if (note.archived) return false
        return note.title.toLowerCase().includes(lowerQuery)
      })
      .slice(0, 10) // Limit to top 10 matches

    // Sort by relevance (exact matches first, then by position of match)
    return matches.sort((a, b) => {
      const aTitle = a.title.toLowerCase()
      const bTitle = b.title.toLowerCase()
      const aStarts = aTitle.startsWith(lowerQuery)
      const bStarts = bTitle.startsWith(lowerQuery)

      if (aStarts && !bStarts) return -1
      if (!aStarts && bStarts) return 1

      const aIndex = aTitle.indexOf(lowerQuery)
      const bIndex = bTitle.indexOf(lowerQuery)
      return aIndex - bIndex
    })
  }, [query, availableNotes])

  // Track selected index
  const prevQueryRef = useRef(query)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Reset selectedIndex when query changes
  useLayoutEffect(() => {
    if (prevQueryRef.current !== query) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIndex(0)
      prevQueryRef.current = query
    }
  }, [query])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % filteredNotes.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filteredNotes.length) % filteredNotes.length)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        if (filteredNotes[selectedIndex]) {
          const note = filteredNotes[selectedIndex]
          onSelectNote(note.noteId, note.title)
          onClose()
        }
      } else if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, selectedIndex, filteredNotes, onClose, onSelectNote])

  // Scroll selected item into view
  useEffect(() => {
    if (menuRef.current && selectedIndex >= 0) {
      const selectedItem = menuRef.current.children[selectedIndex] as HTMLElement
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [selectedIndex])

  if (!isOpen || filteredNotes.length === 0) {
    return null
  }

  return (
    <div
      ref={menuRef}
      className="note-link-autocomplete"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {filteredNotes.map((note, index) => (
        <button
          key={note.noteId}
          type="button"
          className={`note-link-autocomplete-item ${index === selectedIndex ? 'is-selected' : ''}`}
          onClick={() => {
            onSelectNote(note.noteId, note.title)
            onClose()
          }}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span className="note-link-icon">📝</span>
          <div className="note-link-content">
            <span
              className="note-link-title"
              dangerouslySetInnerHTML={{
                __html: highlightMatch(note.title, query),
              }}
            />
            {(note.projectIds?.length > 0 || note.topicId) && (
              <span className="note-link-meta">
                {note.topicId && <span className="note-link-topic">Topic</span>}
                {note.projectIds?.length > 0 && (
                  <span className="note-link-projects">{note.projectIds.length} project(s)</span>
                )}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
