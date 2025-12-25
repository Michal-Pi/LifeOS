/**
 * NoteEditor Component
 *
 * High-level wrapper for TipTap editor with:
 * - Auto-save functionality
 * - Toolbar controls
 * - Save status indicator
 */

import { TipTapEditor } from './TipTapEditor'
import { useNoteEditor } from '@/hooks/useNoteEditor'
import type { Note } from '@lifeos/notes'

export interface NoteEditorProps {
  note?: Note
  placeholder?: string
  editable?: boolean
  autoSaveDelay?: number
  onSave?: (content: object, html: string) => Promise<void>
  onChange?: (content: object, html: string) => void
  className?: string
}

export function NoteEditor({
  note,
  placeholder = 'Start writing your note...',
  editable = true,
  autoSaveDelay = 2000,
  onSave,
  onChange,
  className = '',
}: NoteEditorProps) {
  const {
    content,
    isDirty,
    isSaving,
    lastSaved,
    error,
    handleContentChange,
    handleHtmlChange,
  } = useNoteEditor({
    note,
    autoSaveDelay,
    onSave,
    onChange,
  })

  return (
    <div className={`note-editor ${className}`}>
      {/* Save status indicator */}
      <div className="save-status" aria-live="polite" aria-atomic="true">
        {isSaving && <span className="saving">Saving...</span>}
        {error && <span className="error" role="alert">Save failed: {error.message}</span>}
        {!isSaving && !error && isDirty && <span className="unsaved">Unsaved changes</span>}
        {!isSaving && !error && !isDirty && lastSaved && (
          <span className="saved">Saved {formatLastSaved(lastSaved)}</span>
        )}
      </div>

      {/* Editor */}
      <TipTapEditor
        content={content}
        placeholder={placeholder}
        editable={editable}
        onChange={handleContentChange}
        onUpdate={handleHtmlChange}
        className="editor-content"
      />
    </div>
  )
}

/**
 * Format last saved time in a human-readable way
 */
function formatLastSaved(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)

  if (diffSecs < 10) {
    return 'just now'
  } else if (diffSecs < 60) {
    return `${diffSecs}s ago`
  } else if (diffMins < 60) {
    return `${diffMins}m ago`
  } else {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
}
