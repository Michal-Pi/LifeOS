/**
 * NoteTitleEditor Component
 *
 * Notion-style inline title editor for notes.
 * Editable H1 that auto-saves on blur.
 */

import { useState, useEffect, useRef } from 'react'

export interface NoteTitleEditorProps {
  title: string
  onSave: (title: string) => void
  placeholder?: string
  className?: string
}

export function NoteTitleEditor({
  title,
  onSave,
  placeholder = 'Untitled',
  className = '',
}: NoteTitleEditorProps) {
  const [localTitle, setLocalTitle] = useState(title)
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Update local title when prop changes
  useEffect(() => {
    setLocalTitle(title)
  }, [title])

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleFocus = () => {
    setIsEditing(true)
  }

  const handleBlur = () => {
    setIsEditing(false)
    const trimmedTitle = localTitle.trim()
    if (trimmedTitle !== title) {
      onSave(trimmedTitle || placeholder)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalTitle(e.target.value)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      inputRef.current?.blur()
    }
    if (e.key === 'Escape') {
      setLocalTitle(title)
      inputRef.current?.blur()
    }
  }

  return (
    <div className={`note-title-editor ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={localTitle}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="title-input"
        aria-label="Note title"
      />
      <style>{`
        .note-title-editor {
          width: 100%;
          margin-bottom: 0.5rem;
        }

        .title-input {
          width: 100%;
          border: none;
          background: transparent;
          font-size: 2.5rem;
          font-weight: 700;
          color: var(--foreground);
          line-height: 1.2;
          letter-spacing: -0.02em;
          padding: 0;
          margin: 0;
          outline: none;
          resize: none;
          font-family: inherit;
        }

        .title-input::placeholder {
          color: var(--muted-foreground);
          opacity: 0.5;
        }

        .title-input:focus {
          outline: none;
        }
      `}</style>
    </div>
  )
}
