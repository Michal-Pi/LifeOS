/**
 * Paragraph Tag Menu Component
 *
 * Dropdown menu for tagging paragraphs with notes or topics.
 */

import { useState, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import type { Note, TopicId } from '@lifeos/notes'
import './ParagraphTagMenu.css'

export interface ParagraphTagMenuProps {
  editor: Editor
  isOpen: boolean
  onClose: () => void
  position: { x: number; y: number }
  availableNotes: Note[]
  availableTopics: Array<{ topicId: TopicId; name: string }>
  onTagSelect: (tagType: 'note' | 'topic', id: string) => void
}

export function ParagraphTagMenu({
  editor,
  isOpen,
  onClose,
  position,
  availableNotes,
  availableTopics,
  onTagSelect,
}: ParagraphTagMenuProps) {
  void editor
  const menuRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'notes' | 'topics'>('notes')

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const filteredNotes = availableNotes.filter((note) =>
    note.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredTopics = availableTopics.filter((topic) =>
    topic.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleTagClick = (tagType: 'note' | 'topic', id: string) => {
    onTagSelect(tagType, id)
    onClose()
  }

  return (
    <div
      ref={menuRef}
      className="paragraph-tag-menu"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="paragraph-tag-menu__header">
        <div className="paragraph-tag-menu__tabs">
          <button
            type="button"
            className={`paragraph-tag-menu__tab ${activeTab === 'notes' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('notes')}
          >
            Notes
          </button>
          <button
            type="button"
            className={`paragraph-tag-menu__tab ${activeTab === 'topics' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('topics')}
          >
            Topics
          </button>
        </div>
        <input
          type="text"
          className="paragraph-tag-menu__search"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div className="paragraph-tag-menu__content">
        {activeTab === 'notes' ? (
          <div className="paragraph-tag-menu__list">
            {filteredNotes.length === 0 ? (
              <div className="paragraph-tag-menu__empty">No notes found</div>
            ) : (
              filteredNotes.slice(0, 10).map((note) => (
                <button
                  key={note.noteId}
                  type="button"
                  className="paragraph-tag-menu__item"
                  onClick={() => handleTagClick('note', note.noteId)}
                >
                  <span className="paragraph-tag-menu__item-icon">📝</span>
                  <span className="paragraph-tag-menu__item-label">{note.title}</span>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="paragraph-tag-menu__list">
            {filteredTopics.length === 0 ? (
              <div className="paragraph-tag-menu__empty">No topics found</div>
            ) : (
              filteredTopics.slice(0, 10).map((topic) => (
                <button
                  key={topic.topicId}
                  type="button"
                  className="paragraph-tag-menu__item"
                  onClick={() => handleTagClick('topic', topic.topicId)}
                >
                  <span className="paragraph-tag-menu__item-icon">📁</span>
                  <span className="paragraph-tag-menu__item-label">{topic.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
